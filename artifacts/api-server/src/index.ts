// @ts-nocheck
import { createServer } from "http";
import { logger } from "./lib/logger.js";
import app from "./app.js";
import { initSocket } from "./legacy-socket/index.js";
import { initSchemaIfNeeded, seedDatabase } from "./legacy-db/seed.js";
import { migrateLegacyUploads } from "./legacy-services/legacyMedia.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ─── Database state (used by health route) ────────────────────────────────────
let databaseReady = false;
let databaseInitError: string | null = null;

// Expose to health route
(globalThis as any).__dbReady = () => databaseReady;
(globalThis as any).__dbError = () => databaseInitError;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function initializeDatabase() {
  let attempt = 0;
  while (!databaseReady) {
    attempt += 1;
    logger.info(`Initializing database schema (attempt ${attempt})...`);
    try {
      await initSchemaIfNeeded();
      await seedDatabase();
      try {
        await migrateLegacyUploads();
      } catch {
        // Legacy upload migration is best-effort — no uploads dir is fine
      }
      databaseReady = true;
      databaseInitError = null;
      logger.info("Database initialization complete.");
    } catch (err: any) {
      databaseInitError = err?.message || String(err);
      logger.error({ err: databaseInitError }, "Database initialization failed");
      // Retry with exponential backoff — keeps the HTTP server alive so health
      // probes succeed during transient provisioning delays
      const delay = Math.min(60_000, 5_000 * 2 ** Math.min(attempt - 1, 4));
      logger.info(`Retrying database initialization in ${Math.round(delay / 1000)}s...`);
      await sleep(delay);
    }
  }
}

async function startServer() {
  // ─── HTTP server + Socket.io (starts BEFORE DB so health probes work) ────────
  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "Server listening");
  });

  // ─── Database init in background with retry/backoff ───────────────────────────
  initializeDatabase().catch((err) => {
    logger.error({ err }, "Unrecoverable database error");
    process.exit(1);
  });

  // ─── Periodic trending computation (every 30 min) ─────────────────────────────
  try {
    const { computeTrendingScores } = await import(
      "./legacy-services/recommender.js"
    );
    const runTrending = async () => {
      if (!databaseReady) return;
      try {
        await (computeTrendingScores as any)();
      } catch {}
    };
    setTimeout(runTrending, 5_000);
    setInterval(runTrending, 30 * 60 * 1_000);
  } catch {}
}

startServer().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
