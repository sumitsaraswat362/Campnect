import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

export function databaseIsReady(): boolean {
  return typeof (globalThis as any).__dbReady === "function"
    ? Boolean((globalThis as any).__dbReady())
    : true;
}

export function databaseReadinessMiddleware(
  req: Request,
  res: Response,
  next: () => void,
): void {
  // Let CORS preflight requests and the readiness endpoint through while the
  // database bootstrap is still running. Every other API route depends on the
  // initialized schema and must fail consistently as a temporary condition.
  if (req.method === "OPTIONS" || req.path === "/healthz" || databaseIsReady()) {
    next();
    return;
  }

  res
    .status(503)
    .set("Retry-After", "5")
    .set("Cache-Control", "no-store")
    .json({
      success: false,
      error: "Service temporarily unavailable. Please try again shortly.",
      code: "DATABASE_INITIALIZING",
      retryable: true,
    });
}

router.get("/healthz", (_req: Request, res: Response): void => {
  // Reflect the live database initialization state so readiness probes work
  const dbReady = databaseIsReady();

  if (!dbReady) {
    res.status(503).json({
      status: "starting",
      db: "initializing",
      // Never expose database connection/schema details through a public
      // health endpoint. The full initialization error is kept in server logs.
      retryable: true,
    });
    return;
  }

  res.json({ status: "ok", db: "ready" });
});

export default router;
