// @ts-nocheck
// Global maintenance-mode toggle. Every client (browser and the Android APK,
// which always talks to the live backend regardless of when it was built)
// reads this from the database, so flipping it in the Admin Panel takes
// effect immediately for everyone with no app rebuild or republish.
import { db, queryOne } from '../legacy-db/index.js'

interface MaintenanceState {
  enabled: boolean
  message: string
  updatedAt: string
}

let cached: MaintenanceState | null = null
let cachedAt = 0
const CACHE_TTL_MS = 3000

async function loadFromDb(): Promise<MaintenanceState> {
  const row = await queryOne<any>(
    `SELECT enabled, message, updated_at FROM maintenance_state WHERE id = 1`,
  )
  return {
    enabled: Boolean(row?.enabled),
    message: String(row?.message || ''),
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : new Date(0).toISOString(),
  }
}

export async function getMaintenanceState(forceRefresh = false): Promise<MaintenanceState> {
  const now = Date.now()
  if (!forceRefresh && cached && now - cachedAt < CACHE_TTL_MS) return cached
  try {
    cached = await loadFromDb()
    cachedAt = now
  } catch {
    // If the DB isn't reachable, fail open on the *read* side (don't lock
    // everyone out because of a transient DB hiccup) but keep serving the
    // last known value if we have one.
    if (!cached) cached = { enabled: false, message: '', updatedAt: new Date(0).toISOString() }
  }
  return cached
}

export async function setMaintenanceState(input: { enabled: boolean; message: string; updatedBy: string | null }): Promise<MaintenanceState> {
  await db.run(
    `UPDATE maintenance_state SET enabled = $1, message = $2, updated_at = NOW(), updated_by = $3 WHERE id = 1`,
    [Boolean(input.enabled), String(input.message || '').slice(0, 2000), input.updatedBy],
  )
  cached = null
  return getMaintenanceState(true)
}

// Absolute paths that must keep working even while maintenance is enabled:
// the status check itself, health probes, and every Admin Panel route (so an
// admin can always turn maintenance back off).
const BYPASS_PREFIXES = ['/api/maintenance', '/api/healthz', '/api/admin', '/api/v1/admin']

export async function maintenanceGuard(req: any, res: any, next: () => void) {
  if (req.method === 'OPTIONS') return next()
  if (BYPASS_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`) || req.path.startsWith(`${prefix}-`))) {
    return next()
  }
  try {
    const state = await getMaintenanceState()
    if (!state.enabled) return next()
    return res.status(503).set('Retry-After', '30').set('Cache-Control', 'no-store').json({
      success: false,
      error: 'The app is temporarily down for maintenance.',
      code: 'MAINTENANCE_MODE',
      message: state.message,
      retryable: true,
    })
  } catch {
    // Never let a maintenance-check failure itself take the app down.
    return next()
  }
}
