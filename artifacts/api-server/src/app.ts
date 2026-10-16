// @ts-nocheck
import express, { type Express, type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import { existsSync } from "fs";
import crypto from "crypto";
import { logger } from "./lib/logger.js";

// Workspace health/readiness route
import healthRouter, { databaseReadinessMiddleware } from "./routes/health.js";

// Legacy routes (ported from original server)
import { authRouter }            from "./legacy-routes/auth.js";
import { adminAuthRouter }       from "./legacy-routes/adminAuth.js";
import { usersRouter }           from "./legacy-routes/users.js";
import { postsRouter, commentModerationRouter } from "./legacy-routes/posts.js";
import { storiesRouter }         from "./legacy-routes/stories.js";
import { chatRouter }            from "./legacy-routes/chat.js";
import { searchRouter }          from "./legacy-routes/search.js";
import { notificationsRouter }   from "./legacy-routes/notifications.js";
import { collegesRouter }        from "./legacy-routes/colleges.js";
import { communitiesRouter }     from "./legacy-routes/communities.js";
import { eventsRouter }          from "./legacy-routes/events.js";
import { glimpsesRouter }        from "./legacy-routes/glimpses.js";
import { adminRouter }           from "./legacy-routes/admin.js";
import { adminV1Router }         from "./legacy-routes/adminV1.js";
import { adminPlatformV1Router } from "./legacy-routes/adminPlatformV1.js";
import { requireAdminPanelService } from "./legacy-middleware/auth.js";
import { highlightsRouter }      from "./legacy-routes/highlights.js";
import { recommendRouter }       from "./legacy-routes/recommend.js";
import { reportingRouter }       from "./legacy-routes/reporting.js";
import { mediaRouter }           from "./legacy-routes/media.js";
import { clipsRouter }           from "./legacy-routes/clips.js";
import { getMaintenanceState, maintenanceGuard } from "./legacy-services/maintenance.js";
import { getAppUpdateState } from "./legacy-services/appUpdate.js";
import { db } from "./legacy-db/index.js";
import { isMediaPolicyError } from "./legacy-services/mediaLimits.js";
import { mediaUploadLimitError } from "./legacy-middleware/upload.js";

const app: Express = express();

// Replit sits behind one proxy hop. Permit an explicit bounded hop count for
// deployments with a known additional proxy, never a blanket trust of client
// supplied X-Forwarded-* headers.
const configuredTrustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || "1", 10);
app.set("trust proxy", Number.isInteger(configuredTrustProxyHops) && configuredTrustProxyHops >= 0 && configuredTrustProxyHops <= 2
  ? configuredTrustProxyHops
  : 1);

// ─── Structured logging ────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// ─── CORS with admin-origin allowlist ────────────────────────────────────────
const adminOrigins = new Set(
  String(process.env.ADMIN_PANEL_ORIGIN || "")
    .split(",")
    .map((v) => v.trim().replace(/\/+$/, ""))
    .filter(Boolean)
);

const isPrivilegedAdminRequest = (req: Request) => {
  const pathname = req.originalUrl.split("?", 1)[0];
  return (
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/api/admin-auth" ||
    pathname.startsWith("/api/admin-auth/") ||
    pathname === "/api/v1/admin" ||
    pathname.startsWith("/api/v1/admin/")
  );
};

app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;
    const privileged = isPrivilegedAdminRequest(req as Request);
    callback(null, {
      origin: privileged
        ? origin && adminOrigins.has(origin.replace(/\/+$/, ""))
          ? origin
          : false
        : "*",
      credentials: false,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
      optionsSuccessStatus: 204,
      maxAge: 600,
    });
  })
);

// ─── Request ID ────────────────────────────────────────────────────────────────
app.use((req: any, _res, next) => {
  req.requestId = crypto.randomUUID();
  next();
});

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Gate database-backed routes before rate limiting. During startup, browser
// retries should receive one cheap, retryable 503 rather than consuming the
// shared API limiter and preventing the database bootstrap from completing.
app.use("/api", databaseReadinessMiddleware);

// ─── Rate limiting (matching original per-route limits) ───────────────────────
// Campus Wi-Fi and mobile carriers frequently place many students behind one
// public IP. Authentication limits must therefore be scoped to the account
// being used, not shared by every student on that network.
function authIdentityKey(req: any) {
  const value = typeof req.body?.email === "string"
    ? req.body.email
    : typeof req.body?.identifier === "string"
      ? req.body.identifier
      : "";
  const normalized = value.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return `email:${normalized}`;
  const username = normalized.startsWith("@") ? normalized.slice(1) : normalized;
  if (/^[a-z0-9_.]{3,30}$/.test(username)) return `username:${username}`;
  // Auth endpoints require an email or username. Keep malformed requests in
  // one small shared bucket without returning to a shared campus-IP policy.
  return "missing-auth-identity";
}

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/healthz",
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authIdentityKey,
  message: { error: "Too many auth requests, please try again later." },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authIdentityKey,
  message: { error: "Too many login attempts, please try again later." },
});
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authIdentityKey,
  message: { error: "Too many signup attempts, please try again later." },
});
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authIdentityKey,
  message: { error: "Too many OTP requests, please slow down." },
});
const passwordRecoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authIdentityKey,
  message: { error: "Too many password recovery requests, please try again later." },
});
const jpegDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many image download requests, please try again later." },
});

app.use("/api", generalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/signup", signupLimiter);
app.use("/api/auth/verify-email", otpLimiter);
app.use("/api/auth/verify-login", otpLimiter);
app.use("/api/auth/resend-otp", otpLimiter);
app.use("/api/auth/forgot-password", passwordRecoveryLimiter);
app.use("/api/auth/reset-password", passwordRecoveryLimiter);
app.use("/api/admin-auth/login", loginLimiter);
app.use("/api/v1/admin/auth/login", loginLimiter);
app.use("/api/media/:id/download.jpg", jpegDownloadLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
// The HTTP server intentionally starts before schema bootstrap. Gate all
// database-backed routes so startup cannot look like invalid credentials or a
// permanent auth failure while the readiness endpoint is still initializing.
app.use("/api", healthRouter);

// Public maintenance-status check. Every client (web + the Android APK, which
// always talks to this live backend) polls this so an admin flip takes
// effect immediately without any app rebuild or republish. Must stay
// reachable even while maintenance is enabled and before auth.
app.get("/api/maintenance", async (_req, res) => {
  const state = await getMaintenanceState();
  res.set("Cache-Control", "no-store").json({
    success: true,
    enabled: state.enabled,
    message: state.message,
    updatedAt: state.updatedAt,
  });
});
// App release notices must remain readable before sign-in and while a force
// update or maintenance screen is on top of the normal client UI.
app.get("/api/app-update", async (_req, res) => {
  const state = await getAppUpdateState();
  res.set("Cache-Control", "no-store").json({ success: true, ...state });
});
app.use(maintenanceGuard);

app.use("/api/auth", authRouter);

// Admin auth is served at BOTH paths (legacy + v1 prefix)
// Every Admin endpoint must be reached through the standalone Admin Panel
// server, which injects this server-only service secret. The operator's own
// bearer session and role checks continue within the admin routers.
app.use("/api/admin-auth", requireAdminPanelService);
app.use("/api/v1/admin/auth", requireAdminPanelService);
app.use("/api/admin", requireAdminPanelService);
app.use("/api/v1/admin", requireAdminPanelService);
app.use("/api/admin-auth",    adminAuthRouter);
app.use("/api/v1/admin/auth", adminAuthRouter);

app.use("/api/users",         usersRouter);
app.use("/api/posts",         postsRouter);
app.use("/api/comments",      commentModerationRouter);
app.use("/api/stories",       storiesRouter);
app.use("/api/chat",          chatRouter);
app.use("/api/search",        searchRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/colleges",      collegesRouter);
app.use("/api/communities",   communitiesRouter);
app.use("/api/events",        eventsRouter);
app.use("/api/glimpses",      glimpsesRouter);
app.use("/api/highlights",    highlightsRouter);
app.use("/api/rec",           recommendRouter);
app.use("/api/media",         mediaRouter);
app.use("/api/clips",         clipsRouter);
app.use("/api/admin",         adminRouter);
app.use("/api/v1/admin",      adminV1Router);
app.use("/api/v1/admin",      adminPlatformV1Router);
app.use("/api/reports",       reportingRouter);

// ─── Production frontend ─────────────────────────────────────────────────────
// The autoscale deployment runs this API as the single HTTP process. Serve the
// Campnect Vite bundle from the same origin so the web app, REST API, protected
// media, and Socket.IO all share one production URL.
// The API build copies the frontend into its own dist directory so the
// published service has one self-contained runtime bundle. Keeping this
// relative to the server entrypoint also avoids relying on sibling artifact
// paths that may not be present in the deployment image.
const webDist = new URL("./public/", import.meta.url);
const webIndex = new URL("index.html", webDist);

if (existsSync(webIndex)) {
  // Public post links intentionally have a compact, stable URL so they can be
  // shared outside Campnect. Render Open Graph tags on the server because social
  // crawlers do not run the single-page app. Only posts safe for unauthenticated
  // discovery are exposed here; private, college, friends-only, restricted, and
  // moderated content never receives metadata.
  app.get("/p/:id", async (req, res, next) => {
    const postId = String(req.params.id || "");
    if (!postId || postId.length > 100) return next();

    try {
      const post = await db.one<any>(`
        SELECT p.id, p.content, p.type, u.full_name
        FROM posts p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
        WHERE p.id = $1
          AND p.visibility = 'public'
          AND p.type <> 'glimpse'
          AND p.moderation_status = 'approved'
          AND COALESCE(p.discovery_restricted, 0) = 0
          AND COALESCE(u.is_private, 0) = 0
          AND COALESCE(u.is_banned, 0) = 0
          AND COALESCE(u.is_deactivated, 0) = 0
          AND COALESCE(u.is_admin, 0) = 0
          AND COALESCE(usc.feed_visibility, COALESCE(u.is_shadowbanned, 0)) = 0
      `, [postId]);
      if (!post) return res.status(404).send("Post not found");

      const escapeHtml = (value: unknown) => String(value ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      const canonicalUrl = `https://campnect.perinol.com/p/${encodeURIComponent(post.id)}`;
      const author = String(post.full_name || "A campus member").trim();
      const text = String(post.content || "").replace(/\s+/g, " ").trim();
      const title = `${author} on Campnect`;
      const description = text ? text.slice(0, 200) : `${author} shared a post with the campus community.`;
      const redirectPath = `/app/post/${encodeURIComponent(post.id)}`;

      res.setHeader("Cache-Control", "public, max-age=300");
      return res.type("html").send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Campnect">
<meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonicalUrl}"><meta property="og:image" content="https://campnect.perinol.com/campnect-logo.png">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="https://campnect.perinol.com/campnect-logo.png">
<script>window.location.replace(${JSON.stringify(redirectPath)});</script>
</head><body><p>Opening post… <a href="${redirectPath}">Continue to Campnect</a></p></body></html>`);
    } catch (error) {
      return next(error);
    }
  });

  app.use(express.static(webDist.pathname, {
    index: "index.html",
    maxAge: "1h",
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));

  // React Router owns non-API browser routes. Avoid returning the SPA for
  // missing API, upload, or Socket.IO resources.
  app.use((req, res, next) => {
    if (
      req.method !== "GET" ||
      req.path.startsWith("/api") ||
      req.path.startsWith("/uploads") ||
      req.path.startsWith("/socket.io")
    ) {
      return next();
    }
    res.sendFile(webIndex.pathname);
  });
} else {
  logger.warn({ webDist }, "Campnect frontend bundle not found; serving API only");
}

// Multer stops oversized multipart uploads before a route handler runs. Return
// a useful JSON response instead of Express's default HTML error page so the
// web app and Android WebView can show the limit to the user.
app.use((error: any, req: Request, res: any, next: any) => {
  if (res.headersSent) return next(error);
  if (isMediaPolicyError(error)) {
    return res.status(error.status).json({
      success: false,
      error: error.message,
      code: error.code,
    });
  }
  if (error?.code === "LIMIT_FILE_SIZE") {
    const pathname = String(req.originalUrl || req.url || "").split("?", 1)[0];
    const imageOnly = /^\/api\/(?:users\/me\/(?:avatar|cover|verify-college)|auth\/college-verify|events(?:\/[^/]+)?\/?|chat\/groups(?:\/[^/]+)?|communities\/[^/]+)$/.test(pathname);
    const videoOnly = pathname === "/api/posts/video-preview" || /^\/api\/clips(?:\/|$)/.test(pathname);
    const policyError = mediaUploadLimitError(error, imageOnly, videoOnly);
    if (policyError) {
      return res.status(policyError.status).json({
        success: false,
        error: policyError.message,
        code: policyError.code,
      });
    }
  }
  return next(error);
});

export default app;
