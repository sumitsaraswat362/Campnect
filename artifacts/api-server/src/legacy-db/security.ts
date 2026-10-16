// @ts-nocheck
import { query, queryAll, queryOne } from './index.js'

const PUBLIC_API_ROLES = ['anon', 'authenticated'] as const

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`
}

async function existingPublicRoles() {
  const roles = await queryAll<{ rolname: string }>(
    `SELECT rolname
     FROM pg_roles
     WHERE rolname = ANY($1::text[])`,
    [PUBLIC_API_ROLES],
  )
  return roles
}

/**
 * The application uses the server-side postgres connection as its trusted
 * data-access layer. Supabase/PostgREST roles must not be able to read the
 * public schema directly.
 *
 * RLS is intentionally enabled without public policies: this is a deny-by-
 * default boundary for anon/authenticated roles. The server connection is the
 * table owner and therefore continues to work for the application.
 */
export async function hardenDatabaseSecurity() {
  const publicRoles = await existingPublicRoles()
  const deniedGrantees = ['PUBLIC', ...publicRoles.map(({ rolname }) => quoteIdentifier(rolname))].join(', ')

  await query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${deniedGrantees}`)
  await query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${deniedGrantees}`)
  await query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${deniedGrantees}`)
  await query(`REVOKE ALL ON SCHEMA public FROM ${deniedGrantees}`)
  await query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${deniedGrantees}`)
  await query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${deniedGrantees}`)
  await query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM ${deniedGrantees}`)

  const tables = await queryAll<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  )

  for (const { table_name } of tables) {
    await query(`ALTER TABLE public.${quoteIdentifier(table_name)} ENABLE ROW LEVEL SECURITY`)
  }

  const publicPrivilegeChecks = publicRoles.length > 0
    ? publicRoles
      .map(({ rolname }) => `has_table_privilege('${rolname.replace(/'/g, "''")}', format('public.%I', t.table_name), 'SELECT')`)
      .join(' OR ')
    : 'FALSE'
  const insecureTables = await queryAll<{ table_name: string }>(
    `SELECT t.table_name
     FROM information_schema.tables t
     JOIN pg_class c ON c.relname = t.table_name
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE t.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND (NOT c.relrowsecurity OR ${publicPrivilegeChecks})
     ORDER BY t.table_name`,
  )

  if (insecureTables.length > 0) {
    throw new Error(
      `Database security hardening failed for public tables: ${insecureTables.map(({ table_name }) => table_name).join(', ')}`,
    )
  }

  const currentUser = await queryOne<{ current_user: string }>('SELECT CURRENT_USER AS current_user')
  console.log(
    `[security] Database hardened: ${tables.length} public table(s), public API roles denied, RLS enabled (${currentUser?.current_user || 'unknown'} app role).`,
  )
}