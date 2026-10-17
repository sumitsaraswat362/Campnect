import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat, realpath } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../artifacts/campnect/dist/public");
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".ico": "image/x-icon", ".mp4": "video/mp4", ".webm": "video/webm",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
  ".woff": "font/woff", ".woff2": "font/woff2", ".pdf": "application/pdf",
};

export function createDemoServer(root = publicDir) {
  return createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // Demo data stays in the browser: no external API, Supabase or Socket.IO.
    res.setHeader("Content-Security-Policy", "connect-src 'self' blob: data:; object-src 'none'; base-uri 'self'");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, "http://demo.local").pathname);
      if (/^\/(api|uploads|socket\.io)(\/|$)/.test(pathname)) {
        res.writeHead(404, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: "No backend is served in Campnect Demo Mode." }));
        return;
      }
      let file = resolve(root, `.${pathname}`);
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      let info = await stat(file).catch(() => null);
      if (info?.isDirectory()) {
        file = resolve(file, "index.html");
        info = await stat(file).catch(() => null);
      }
      if (!info?.isFile()) {
        // Only navigation routes fall back. Missing assets must remain 404s.
        if ((extname(pathname) && !pathname.startsWith("/app/")) || pathname.startsWith("/assets/") || pathname.startsWith("/demo/")) {
          res.writeHead(404).end();
          return;
        }
        file = resolve(root, "index.html");
        info = await stat(file);
      }
      const actual = await realpath(file);
      if (!actual.startsWith((await realpath(root)) + sep)) {
        res.writeHead(403).end();
        return;
      }
      const headers = {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": file.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
        "Accept-Ranges": "bytes",
      };
      let start = 0, end = info.size - 1, status = 200;
      if (req.headers.range && info.size > 0) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (match && (match[1] || match[2])) {
          start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
          end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
        } else start = info.size;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
          res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
          return;
        }
        status = 206;
        headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
      }
      headers["Content-Length"] = info.size === 0 ? 0 : end - start + 1;
      res.writeHead(status, headers);
      if (req.method === "HEAD" || info.size === 0) res.end();
      else createReadStream(file, { start, end }).on("error", () => res.destroy()).pipe(res);
    } catch (error) {
      const status = error instanceof URIError ? 400 : 500;
      console.error("Demo static request failed:", error.message);
      if (!res.headersSent) res.writeHead(status);
      res.end();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");
  await stat(resolve(publicDir, "index.html"));
  const server = createDemoServer();
  server.listen(port, "0.0.0.0", () => console.log(`Campnect Demo listening on 0.0.0.0:${port} (static frontend only; no database or API)`));
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
}
