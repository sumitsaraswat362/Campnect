// @ts-nocheck
import { db, queryOne } from '../legacy-db/index.js'

export const DEFAULT_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.campnect.app'

interface AppUpdateState {
  enabled: boolean
  mode: 'soft' | 'force'
  title: string
  message: string
  storeUrl: string
  minimumVersionCode: number
  updatedAt: string
}

let cached: AppUpdateState | null = null
let cachedAt = 0
const CACHE_TTL_MS = 3000

async function loadFromDb(): Promise<AppUpdateState> {
  const row = await queryOne<any>(`
    SELECT enabled, mode, title, message, play_store_url, minimum_version_code, updated_at
    FROM app_update_state
    WHERE id = 1
  `)
  return {
    enabled: Boolean(row?.enabled),
    mode: row?.mode === 'force' ? 'force' : 'soft',
    title: String(row?.title || 'A new version of Campnect is ready'),
    message: String(row?.message || 'Update now for the latest features and improvements.'),
    storeUrl: String(row?.play_store_url || DEFAULT_PLAY_STORE_URL),
    minimumVersionCode: Math.max(1, Number(row?.minimum_version_code) || 14),
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : new Date(0).toISOString(),
  }
}

export async function getAppUpdateState(forceRefresh = false): Promise<AppUpdateState> {
  const now = Date.now()
  if (!forceRefresh && cached && now - cachedAt < CACHE_TTL_MS) return cached
  try {
    cached = await loadFromDb()
    cachedAt = now
  } catch {
    if (!cached) {
      cached = {
        enabled: false,
        mode: 'soft',
        title: 'A new version of Campnect is ready',
        message: 'Update now for the latest features and improvements.',
        storeUrl: DEFAULT_PLAY_STORE_URL,
        minimumVersionCode: 14,
        updatedAt: new Date(0).toISOString(),
      }
    }
  }
  return cached
}

export async function setAppUpdateState(input: Omit<AppUpdateState, 'updatedAt'> & { updatedBy: string | null }) {
  await db.run(`
    UPDATE app_update_state
    SET enabled = $1, mode = $2, title = $3, message = $4, play_store_url = $5, minimum_version_code = $6, updated_at = NOW(), updated_by = $7
    WHERE id = 1
  `, [
    Boolean(input.enabled),
    input.mode === 'force' ? 'force' : 'soft',
    String(input.title || '').slice(0, 160),
    String(input.message || '').slice(0, 1000),
    String(input.storeUrl || DEFAULT_PLAY_STORE_URL).slice(0, 1000),
    Math.max(0, Math.floor(Number(input.minimumVersionCode) || 0)),
    input.updatedBy,
  ])
  cached = null
  return getAppUpdateState(true)
}