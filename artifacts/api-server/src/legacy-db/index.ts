// @ts-nocheck
import pkg from 'pg'
const { Pool } = pkg
import type { PoolClient, QueryResult } from 'pg'

// ─── Guard: DATABASE_URL must be set ──────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('')
  console.error('❌  DATABASE_URL is not set.')
  console.error('    Add your Supabase transaction-pooler connection string as a')
  console.error('    Replit Secret named DATABASE_URL, then restart the workflow.')
  console.error('')
  process.exit(1)
}

// ─── Pool (Supabase transaction-pooler / PgBouncer compatible) ────────────────
// - ssl required for Supabase pooler
// - no named prepared statements (stateless per-query)
export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
  console.error('❌  Unexpected DB pool error:', err.message)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Execute a query and return the full pg QueryResult */
export async function query(text: string, params?: any[]) {
  return pool.query(text, params)
}

/** Return the first row or null */
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const r = await pool.query(text, params)
  return (r.rows[0] as T) ?? null
}

/** Return all rows */
export async function queryAll<T = any>(text: string, params?: any[]): Promise<T[]> {
  const r = await pool.query(text, params)
  return r.rows as T[]
}

/** Execute a mutation and return { rowCount } */
export async function execute(text: string, params?: any[]): Promise<{ rowCount: number }> {
  const r = await pool.query(text, params)
  return { rowCount: r.rowCount ?? 0 }
}

export type DbExecutor = {
  query: (text: string, params?: any[]) => Promise<QueryResult>
  one: <T = any>(text: string, params?: any[]) => Promise<T | null>
  all: <T = any>(text: string, params?: any[]) => Promise<T[]>
  run: (text: string, params?: any[]) => Promise<{ rowCount: number }>
  toPos: typeof toPos
  safeJson: typeof safeJson
}

function executorFor(client: PoolClient): DbExecutor {
  const txQuery = (text: string, params?: any[]) => client.query(text, params)
  const txOne = async <T = any>(text: string, params?: any[]): Promise<T | null> => {
    const result = await txQuery(text, params)
    return (result.rows[0] as T) ?? null
  }
  const txAll = async <T = any>(text: string, params?: any[]): Promise<T[]> => {
    const result = await txQuery(text, params)
    return result.rows as T[]
  }
  const txRun = async (text: string, params?: any[]) => {
    const result = await txQuery(text, params)
    return { rowCount: result.rowCount ?? 0 }
  }
  return { query: txQuery, one: txOne, all: txAll, run: txRun, toPos, safeJson }
}

/**
 * Run related database writes atomically on one connection.
 *
 * This is especially important for media: the asset row and the post/story/
 * message row must commit together, otherwise a failed request can leave
 * durable bytes with no durable reference (or a reference to missing bytes).
 */
export async function withTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(executorFor(client))
    await client.query('COMMIT')
    return result
  } catch (error) {
    try { await client.query('ROLLBACK') } catch (rollbackError: any) {
      console.error('❌ Database rollback failed:', rollbackError.message)
    }
    throw error
  } finally {
    client.release()
  }
}

/**
 * Convert SQLite-style ? placeholders to Postgres $N positional params.
 * Use for dynamically-built queries where counting $N by hand is error-prone.
 */
export function toPos(sql: string, params: any[]): [string, any[]] {
  let i = 0
  return [sql.replace(/\?/g, () => `$${++i}`), params]
}

// ─── Safe JSON parser (handles both TEXT strings and JSONB objects) ────────────
export function safeJson(v: any, fallback: any = null) {
  if (v === null || v === undefined) return fallback
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return fallback } }
  return v
}

// ─── Compatibility shim — mirrors the old synchronous db interface ─────────────
// Routes import `db` and call db.one / db.all / db.run / db.toPos
export const db = { query, one: queryOne, all: queryAll, run: execute, toPos, safeJson, pool, withTransaction }
