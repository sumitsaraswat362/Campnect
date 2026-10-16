// @ts-nocheck
import { query, queryAll, queryOne } from './index.js'
import { hardenDatabaseSecurity } from './security.js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

const COLLEGES = [
  {
    id: uuidv4(),
    name: 'GLA University, Mathura',
    short_name: 'GLA Mathura',
    domains: '["gla.ac.in"]',
    country: 'IN',
    city: 'Mathura, Uttar Pradesh',
    about: 'GLA University is a top private university in Mathura, Uttar Pradesh, India.',
    website: 'https://gla.ac.in',
    logo_url: '/gla-logo.png',
  },
  {
    id: uuidv4(),
    name: 'GLA University, Noida',
    short_name: 'GLA Noida',
    domains: '["gla.ac.in"]',
    country: 'IN',
    city: 'Noida, Uttar Pradesh',
    about: 'GLA University Noida campus — part of the GLA University system.',
    website: 'https://gla.ac.in',
    logo_url: '/gla-logo.png',
  },
  {
    id: 'lnmiit-jaipur',
    name: 'The LNM Institute of Information Technology (LNMIIT), Jaipur',
    short_name: 'LNMIIT',
    domains: '["lnmiit.ac.in"]',
    country: 'IN',
    city: 'Jaipur, Rajasthan',
    about: 'The LNM Institute of Information Technology is a premier technology institute in Jaipur, Rajasthan.',
    website: 'https://lnmiit.ac.in',
    logo_url: '/lnmiit-logo.png',
  },
  {
    id: 'integral-university-lucknow',
    name: 'Integral University',
    short_name: 'Integral',
    domains: '["student.iul.ac.in"]',
    country: 'IN',
    city: 'Lucknow, Uttar Pradesh',
    about: 'Integral University is a multidisciplinary university in Lucknow, Uttar Pradesh, India.',
    website: 'https://iul.ac.in',
    logo_url: '/integral-university-logo.png',
  },
  {
    id: 'dbs-global-dehradun',
    name: 'DBS Global University',
    short_name: 'DBS',
    domains: '["dgu.ac.in"]',
    country: 'IN',
    city: 'Dehradun, Uttrakhand',
    about: 'DBS Global University is a multidisciplinary university in Dehradun.',
    website: 'https://www.dgu.ac.in',
    logo_url: '/dbs-global-university-logo.svg',
  },
  {
    id: 'gl-bajaj-mathura',
    name: 'GL Bajaj',
    short_name: 'GL Bajaj',
    domains: '["glbajajgroup.org"]',
    country: 'IN',
    city: 'Mathura, Uttar Pradesh',
    about: 'GL Bajaj campus in Mathura, Uttar Pradesh.',
    website: 'https://glbajajgroup.org',
    logo_url: '/gl-bajaj-logo.png',
  },
  {
    id: 'gl-bajaj-greater-noida',
    name: 'GL Bajaj',
    short_name: 'GL Bajaj',
    domains: '["glbajajgroup.org"]',
    country: 'IN',
    city: 'Greater Noida, Uttar Pradesh',
    about: 'GL Bajaj campus in Greater Noida, Uttar Pradesh.',
    website: 'https://glbajajgroup.org',
    logo_url: '/gl-bajaj-logo.png',
  },
  {
    id: 'lpu-phagwara',
    name: 'Lovely Professional University',
    short_name: 'LPU',
    domains: '["lpu.in"]',
    country: 'IN',
    city: 'Phagwara, Punjab',
    about: 'Lovely Professional University is a private university in Phagwara, Punjab.',
    website: 'https://www.lpu.in',
    logo_url: '/lpu-logo.png',
  },
  {
    id: 'galgotias-greater-noida',
    name: 'Galgotias University',
    short_name: 'Galgotias',
    domains: '["galgotiasuniversity.ac.in"]',
    country: 'IN',
    city: 'Greater Noida, Uttar Pradesh',
    about: 'Galgotias University is a private university in Greater Noida, Uttar Pradesh.',
    website: 'https://www.galgotiasuniversity.edu.in',
    logo_url: '/galgotias-logo.png',
  },
  {
    id: 'bsacet-mathura',
    name: 'BSA College of Engineering & Technology',
    short_name: 'BSA CET',
    domains: '["bsacet.org"]',
    country: 'IN',
    city: 'Mathura, Uttar Pradesh',
    about: 'BSA College of Engineering & Technology is an engineering and professional studies college in Mathura, Uttar Pradesh, India.',
    website: 'https://bsacet.org',
    logo_url: '/bsacet-logo.png',
  },
  {
    id: 'mit-wpu-pune',
    name: 'MIT World Peace University',
    short_name: 'MIT-WPU',
    domains: '["mit.edu.in"]',
    country: 'IN',
    city: 'Pune, Maharashtra',
    about: 'MIT World Peace University is a multidisciplinary university in Pune, Maharashtra.',
    website: 'https://mitwpu.edu.in',
    logo_url: '/mit-wpu-logo.png',
  },
  {
    id: 'shoolini-university-bajhol',
    name: 'Shoolini University',
    short_name: 'Shoolini',
    domains: '["shooliniuniversity.com"]',
    country: 'IN',
    city: 'Bajhol, Himachal Pradesh',
    about: 'Shoolini University is a multidisciplinary university in Bajhol, Himachal Pradesh.',
    website: 'https://shooliniuniversity.com',
    logo_url: '/shoolini-university-logo.png',
  },
  {
    id: 'chitkara-university-rajpura',
    name: 'Chitkara University',
    short_name: 'Chitkara',
    domains: '["chitkara.edu.in"]',
    country: 'IN',
    city: 'Rajpura, Punjab',
    about: 'Chitkara University is a multidisciplinary university in Rajpura, Punjab.',
    website: 'https://www.chitkara.edu.in',
    logo_url: '/chitkara-university-logo.png',
  },
  {
    id: 'thapar-institute-patiala',
    name: 'Thapar Institute of Engineering & Technology (TIET)',
    short_name: 'Thapar',
    domains: '["thapar.edu"]',
    country: 'IN',
    city: 'Patiala, Punjab',
    about: 'Thapar Institute of Engineering & Technology is a multidisciplinary university in Patiala, Punjab.',
    website: 'https://www.thapar.edu',
    logo_url: '/thapar-institute-logo.png',
  },
  {
    id: 'cic-delhi-university',
    name: 'Cluster Innovation Centre (CIC), University of Delhi',
    short_name: 'CIC',
    domains: '["cic.du.ac.in"]',
    country: 'IN',
    city: 'New Delhi',
    about: 'Cluster Innovation Centre is an interdisciplinary centre of the University of Delhi in New Delhi.',
    website: 'https://cic.du.ac.in',
    logo_url: '/cic-delhi-university-logo.png',
  },
  {
    id: 'kiit-bhubaneswar',
    name: 'Kalinga Institute of Industrial Technology (KIIT)',
    short_name: 'KIIT',
    domains: '["student.kiit.ac.in"]',
    country: 'IN',
    city: 'Bhubaneswar, Odisha',
    about: 'Kalinga Institute of Industrial Technology is a multidisciplinary university in Bhubaneswar, Odisha.',
    website: 'https://kiit.ac.in',
    logo_url: '/kiit-logo.svg',
  },
  {
    id: 'mnnit-allahabad-prayagraj',
    name: 'Motilal Nehru National Institute of Technology Allahabad',
    short_name: 'MNNIT Allahabad',
    domains: '["mnnit.ac.in"]',
    country: 'IN',
    city: 'Prayagraj, Uttar Pradesh',
    about: 'Motilal Nehru National Institute of Technology Allahabad is a national institute of technology in Prayagraj, Uttar Pradesh.',
    website: 'https://www.mnnit.ac.in',
    logo_url: '/mnnit-logo.svg',
  },
]

// Bump this whenever inline ALTER/index/hardening or bootstrap-data logic below
// changes without touching schema.sql or recommendation-schema.sql, so the
// fingerprint below still detects the change and re-applies it once.
const SCHEMA_LOGIC_VERSION = 'v5'

function computeSchemaFingerprint(): string {
  const schemaSql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
  let recSql = ''
  try {
    recSql = readFileSync(join(__dirname, 'recommendation-schema.sql'), 'utf-8')
  } catch {
    // Optional file — absence is part of the fingerprint too.
  }
  return createHash('sha256')
    .update(schemaSql)
    .update('\u0000')
    .update(recSql)
    .update('\u0000')
    .update(SCHEMA_LOGIC_VERSION)
    .digest('hex')
}

/**
 * Autoscale can start multiple independent server instances (cold starts on
 * scale-up, and restarts after scale-down) — each one previously re-ran the
 * *entire* schema.sql + inline ALTER/index statements + hardenDatabaseSecurity
 * (which itself loops over every public table) on every single process start.
 * That produced large repeated bursts of DDL/RLS statements with no benefit,
 * since the statements are idempotent and 99% of the time nothing changed.
 *
 * Concurrency note: this app's DATABASE_URL points at Supabase's transaction
 * pooler (PgBouncer transaction mode), where PgBouncer is free to hand
 * different autocommitted statements from the same client to different
 * backend server connections. That makes session/connection-scoped
 * primitives (e.g. `pg_advisory_lock`, or holding one client across many
 * separate statements) unreliable here — a lock acquired on one backend can
 * end up "unlocked" from a different backend, or never actually released.
 * So the guard below uses a single atomic `UPDATE ... WHERE ... RETURNING`
 * as the claim step. Row-level locking during that one statement is enough
 * for Postgres to guarantee only one caller wins the race, and it needs no
 * session affinity at all — safe under transaction pooling. A staleness
 * window lets a later restart reclaim and retry after a crashed attempt.
 */
export async function initSchemaIfNeeded() {
  const fingerprint = computeSchemaFingerprint()

  await query(`
    CREATE TABLE IF NOT EXISTS schema_init_state (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      fingerprint TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'applied',
      claimed_at TIMESTAMPTZ,
      applied_at TIMESTAMPTZ,
      CHECK (id = 1)
    )
  `)
  // Self-heal an older/partial version of this table (e.g. one created by an
  // earlier revision of this guard) instead of requiring a manual fixup.
  await query(`ALTER TABLE schema_init_state ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'applied'`)
  await query(`ALTER TABLE schema_init_state ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ`)
  await query(
    `INSERT INTO schema_init_state (id, fingerprint, status) VALUES (1, '', 'applied') ON CONFLICT (id) DO NOTHING`,
  )

  const claim = await queryOne<{ id: number }>(
    `UPDATE schema_init_state
     SET fingerprint = $1, status = 'pending', claimed_at = NOW()
     WHERE id = 1
       AND (fingerprint IS DISTINCT FROM $1 OR status <> 'applied')
       AND (status <> 'pending' OR claimed_at IS NULL OR claimed_at < NOW() - INTERVAL '5 minutes')
     RETURNING id`,
    [fingerprint],
  )

  if (!claim) {
    console.log('[schema] Already applied for this fingerprint (or another instance is currently applying it) — skipping DDL and hardening for this instance.')
    return
  }

  console.log('[schema] This instance claimed schema initialization — applying schema and security hardening.')
  try {
    await initSchema()
    await query(
      `UPDATE schema_init_state SET status = 'applied', applied_at = NOW() WHERE id = 1 AND fingerprint = $1`,
      [fingerprint],
    )
    console.log('[schema] Schema and hardening applied and recorded.')
  } catch (error: any) {
    // Leave status as 'pending' so it becomes reclaimable (after the
    // staleness window) instead of permanently blocking future starts.
    console.error('[schema] Schema initialization failed; a later start will retry.', error?.message)
    throw error
  }
}

export async function initSchema() {
  // Main schema
  const schemaPath = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
  for (const stmt of schemaPath.split(';').map(s => s.trim()).filter(Boolean)) {
    await query(stmt)
  }
  // Only migrate the old rich audit table when its complete legacy schema is
  // present. New installs have a separate minimal rate table and must never
  // receive ALTERs or rich-column SELECTs against it.
  const legacyDecisionColumns = [
    'id', 'user_id', 'post_id', 'parent_id', 'target_comment_id', 'operation',
    'request_stage', 'content_hash', 'decision', 'category', 'severity', 'source',
    'confidence', 'targeted', 'intent', 'reason', 'requires_confirmation',
    'requires_human_review', 'confirmation_nonce_hash', 'confirmation_expires_at',
    'confirmation_used_at', 'restriction_id', 'appeal_status', 'created_at',
  ]
  const presentLegacyDecisionColumns = await queryAll<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'comment_moderation_attempts'
       AND column_name = ANY($1::text[])`,
    [legacyDecisionColumns],
  )
  if (legacyDecisionColumns.every((column) => presentLegacyDecisionColumns.some((row) => row.column_name === column))) {
    await query(
      `INSERT INTO comment_moderation_decisions
        (id,user_id,post_id,parent_id,target_comment_id,operation,request_stage,content_hash,
         decision,category,severity,source,confidence,targeted,intent,reason,
         requires_confirmation,requires_human_review,confirmation_nonce_hash,
         confirmation_expires_at,confirmation_used_at,restriction_id,appeal_status,created_at)
       SELECT id,user_id,post_id,parent_id,target_comment_id,operation,request_stage,content_hash,
         decision,category,severity,source,confidence,targeted,intent,reason,
         requires_confirmation,requires_human_review,confirmation_nonce_hash,
         confirmation_expires_at,confirmation_used_at,restriction_id,appeal_status,created_at
       FROM comment_moderation_attempts
       WHERE post_id <> ''
       ON CONFLICT (id) DO NOTHING`,
    )
  }
  // Keep existing deployments compatible with moderation/search fields added
  // after the original schema was created.
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended SMALLINT DEFAULT 0`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned SMALLINT DEFAULT 0`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS student_id TEXT`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_role TEXT NOT NULL DEFAULT 'student'`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS institute_post TEXT DEFAULT ''`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT DEFAULT ''`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deactivated SMALLINT DEFAULT 0`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivation_reason TEXT DEFAULT ''`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT DEFAULT ''`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_ends_at TIMESTAMPTZ`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS warnings_count INTEGER DEFAULT 0`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_shadowbanned SMALLINT DEFAULT 0`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_ends_at TIMESTAMPTZ`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status TEXT NOT NULL DEFAULT 'hidden'`)
  await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS event_id TEXT`)
  await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved'`)
  await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS discovery_restricted SMALLINT NOT NULL DEFAULT 0`)
  await query(`CREATE INDEX IF NOT EXISTS idx_posts_event ON posts(event_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_posts_moderation ON posts(type, moderation_status, discovery_restricted, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_glimpse_creator_visibility ON posts(type, user_id, visibility, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_posts_feed_cursor ON posts(created_at DESC, id DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS glimpse_daily_limits (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_key DATE NOT NULL,
    published_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, day_key)
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_glimpse_daily_limits_day ON glimpse_daily_limits(day_key)`)
  await query(`CREATE TABLE IF NOT EXISTS close_mates (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    close_mate_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, close_mate_id)
  )`)
  await query(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL DEFAULT 'system',
    resource_id TEXT,
    reason TEXT DEFAULT '',
    before_summary TEXT DEFAULT '{}',
    after_summary TEXT DEFAULT '{}',
    request_id TEXT,
    ip_address TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_logs(admin_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_resource ON admin_audit_logs(resource_type, resource_id, created_at DESC)`)
  const adminSessionColumns = await queryAll<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'admin_sessions'`,
  )
  const requiredAdminSessionColumns = ['admin_username', 'token_hash', 'expires_at', 'revoked_at', 'ip_address', 'user_agent', 'created_at']
  if (
    adminSessionColumns.length > 0
    && !requiredAdminSessionColumns.every((column) => adminSessionColumns.some((row) => row.column_name === column))
  ) {
    await query('DROP TABLE IF EXISTS admin_sessions')
  }
  await query(`CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    admin_username TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    ip_address TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_username ON admin_sessions(admin_username, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_active ON admin_sessions(admin_username, revoked_at, expires_at)`)
  await query(`CREATE TABLE IF NOT EXISTS admin_security_events (
    id TEXT PRIMARY KEY,
    admin_id TEXT,
    event_type TEXT NOT NULL,
    email TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_security_events_created ON admin_security_events(created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_security_events_email ON admin_security_events(email, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS moderation_actions (
    id TEXT PRIMARY KEY,
    admin_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT DEFAULT '',
    before_summary TEXT DEFAULT '{}',
    after_summary TEXT DEFAULT '{}',
    metadata TEXT DEFAULT '{}',
    request_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_moderation_actions_target ON moderation_actions(target_type, target_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_moderation_actions_admin ON moderation_actions(admin_id, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS enforcement_history (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action_type TEXT NOT NULL, previous_status TEXT DEFAULT '{}', new_status TEXT DEFAULT '{}',
    reason TEXT DEFAULT '', internal_notes TEXT DEFAULT '', evidence TEXT DEFAULT '',
    moderator_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ,
    is_active SMALLINT DEFAULT 1, is_removed SMALLINT DEFAULT 0, removed_by TEXT,
    removed_at TIMESTAMPTZ, removal_reason TEXT DEFAULT '', linked_report_id TEXT,
    linked_appeal_id TEXT, audit_id TEXT
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_enforcement_history_user ON enforcement_history(user_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_enforcement_history_filters ON enforcement_history(user_id, is_active, is_removed, action_type, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_users_student_id ON users(student_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_users_status ON users(is_suspended, is_banned, is_deactivated)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email))`)
  await query(`CREATE INDEX IF NOT EXISTS idx_users_full_name_lower ON users(LOWER(full_name))`)
  await query(`CREATE INDEX IF NOT EXISTS idx_reports_entity ON reports(entity_type, entity_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS admin_user_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_user_notes_user ON admin_user_notes(user_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_user_notes_admin ON admin_user_notes(admin_id, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS user_warnings (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level TEXT NOT NULL DEFAULT 'medium', category TEXT NOT NULL DEFAULT 'policy',
    reason TEXT NOT NULL, evidence TEXT DEFAULT '', linked_report_id TEXT,
    issued_by TEXT NOT NULL, expires_at TIMESTAMPTZ, removed_at TIMESTAMPTZ,
    removed_by TEXT, removal_reason TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_user_warnings_user ON user_warnings(user_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_user_warnings_active ON user_warnings(user_id, removed_at, expires_at)`)
  await query(`CREATE TABLE IF NOT EXISTS user_restrictions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    restriction_type TEXT NOT NULL, reason TEXT NOT NULL, issued_by TEXT NOT NULL,
    expires_at TIMESTAMPTZ, removed_at TIMESTAMPTZ, removed_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_restrictions_active ON user_restrictions(user_id, restriction_type) WHERE removed_at IS NULL`)
  await query(`CREATE INDEX IF NOT EXISTS idx_user_restrictions_user ON user_restrictions(user_id, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS user_shadowban_controls (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    feed_visibility SMALLINT DEFAULT 1, search_visibility SMALLINT DEFAULT 1,
    discover_visibility SMALLINT DEFAULT 1, group_visibility SMALLINT DEFAULT 1,
    comment_visibility SMALLINT DEFAULT 1, event_visibility SMALLINT DEFAULT 1,
    updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE TABLE IF NOT EXISTS user_trust_scores (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    score NUMERIC(5,2) NOT NULL DEFAULT 50, factors TEXT DEFAULT '{}',
    calculated_at TIMESTAMPTZ DEFAULT NOW(), updated_by TEXT
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_user_trust_scores_score ON user_trust_scores(score DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS auth_login_history (
    id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    identifier TEXT DEFAULT '', success SMALLINT DEFAULT 1, device_info TEXT DEFAULT '',
    ip_address TEXT DEFAULT '', platform TEXT DEFAULT '', country TEXT DEFAULT '',
    city TEXT DEFAULT '', failure_reason TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_auth_login_history_user ON auth_login_history(user_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_auth_login_history_created ON auth_login_history(created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_auth_login_history_platform ON auth_login_history(platform, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS moderation_cases (
    id TEXT PRIMARY KEY, report_id TEXT, case_type TEXT NOT NULL DEFAULT 'report',
    category TEXT NOT NULL DEFAULT 'other', target_type TEXT NOT NULL, target_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', priority TEXT NOT NULL DEFAULT 'normal',
    assigned_to TEXT, escalation_level INTEGER DEFAULT 0, summary TEXT DEFAULT '',
    created_by TEXT NOT NULL, resolved_by TEXT, resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_cases_report ON moderation_cases(report_id) WHERE report_id IS NOT NULL`)
  await query(`CREATE INDEX IF NOT EXISTS idx_moderation_cases_queue ON moderation_cases(status, priority, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_moderation_cases_target ON moderation_cases(target_type, target_id, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS moderation_case_notes (
    id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES moderation_cases(id) ON DELETE CASCADE,
    admin_id TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_moderation_case_notes_case ON moderation_case_notes(case_id, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS appeals (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id TEXT REFERENCES moderation_cases(id) ON DELETE SET NULL, moderation_action_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending', evidence TEXT DEFAULT '', moderator_notes TEXT DEFAULT '',
    decision TEXT DEFAULT '', assigned_to TEXT, submitted_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_appeals_queue ON appeals(status, submitted_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id, submitted_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS appeal_history (
    id TEXT PRIMARY KEY, appeal_id TEXT NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
    from_status TEXT, to_status TEXT NOT NULL, notes TEXT DEFAULT '', admin_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`ALTER TABLE appeal_history ALTER COLUMN admin_id DROP NOT NULL`)
  await query(`CREATE INDEX IF NOT EXISTS idx_appeal_history_appeal ON appeal_history(appeal_id, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS content_moderation (
    content_type TEXT NOT NULL, content_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    is_hidden SMALLINT DEFAULT 0, is_flagged SMALLINT DEFAULT 0, age_restricted SMALLINT DEFAULT 0,
    sensitive_flag TEXT DEFAULT '', moderator_notes TEXT DEFAULT '', reason TEXT DEFAULT '',
    updated_by TEXT NOT NULL, deleted_at TIMESTAMPTZ, restored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (content_type, content_id)
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_content_moderation_queue ON content_moderation(status, updated_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_content_moderation_type ON content_moderation(content_type, updated_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS verification_events (
    id TEXT PRIMARY KEY, verification_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
    verification_type TEXT DEFAULT 'student', notes TEXT DEFAULT '', admin_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_verification_events_verification ON verification_events(verification_id, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS verification_requests (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    verification_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', documents TEXT DEFAULT '[]',
    notes TEXT DEFAULT '', reviewer_id TEXT, submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_verification_requests_queue ON verification_requests(verification_type, status, submitted_at ASC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_verification_requests_user ON verification_requests(user_id, created_at DESC)`)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_user_type ON verification_requests(user_id, verification_type)`)
  // The student upload flow predates the canonical verification queue. Mirror
  // those durable submissions so every Admin queue and timeline sees the same
  // real request without deleting the legacy source row.
  await query(`INSERT INTO verification_requests
    (id, user_id, verification_type, status, documents, notes, reviewer_id, submitted_at, reviewed_at, created_at, updated_at)
   SELECT cv.id, cv.user_id, 'student', cv.status,
     json_build_array(
       json_build_object('kind', 'id', 'url', cv.id_photo_url),
       json_build_object('kind', 'selfie', 'url', cv.selfie_url)
     )::text,
     COALESCE(cv.review_notes, ''), cv.reviewer_id, cv.submitted_at, cv.reviewed_at,
     cv.submitted_at, NOW()
   FROM college_verifications cv
   ON CONFLICT (id) DO UPDATE SET
     user_id = EXCLUDED.user_id, verification_type = EXCLUDED.verification_type,
     status = EXCLUDED.status, documents = EXCLUDED.documents, notes = EXCLUDED.notes,
     reviewer_id = EXCLUDED.reviewer_id, submitted_at = EXCLUDED.submitted_at,
     reviewed_at = EXCLUDED.reviewed_at, updated_at = NOW()`)
  await query(`CREATE TABLE IF NOT EXISTS report_assignments (
    id TEXT PRIMARY KEY, report_id TEXT NOT NULL, admin_id TEXT NOT NULL, assigned_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(), unassigned_at TIMESTAMPTZ
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_report_assignments_report ON report_assignments(report_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_report_assignments_admin ON report_assignments(admin_id, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS admin_notification_campaigns (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'announcement', audience_type TEXT NOT NULL DEFAULT 'targeted',
    title TEXT NOT NULL, body TEXT NOT NULL, target_filter TEXT DEFAULT '{}',
    delivery_type TEXT NOT NULL DEFAULT 'in_app', scheduled_at TIMESTAMPTZ, sent_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft', created_by TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_notification_campaigns_queue ON admin_notification_campaigns(status, scheduled_at)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_notification_campaigns_created ON admin_notification_campaigns(created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS admin_notification_deliveries (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES admin_notification_campaigns(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, channel TEXT NOT NULL DEFAULT 'in_app',
    status TEXT NOT NULL DEFAULT 'queued', error TEXT DEFAULT '', delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_notification_deliveries_campaign ON admin_notification_deliveries(campaign_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_notification_deliveries_user ON admin_notification_deliveries(user_id, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS admin_notification_templates (
    id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, kind TEXT NOT NULL DEFAULT 'announcement',
    title TEXT NOT NULL, body TEXT NOT NULL, created_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE TABLE IF NOT EXISTS admin_accounts (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT, display_name TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'read_only', permissions TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'invited', mfa_enabled SMALLINT DEFAULT 0, invited_by TEXT NOT NULL,
    last_seen_at TIMESTAMPTZ, disabled_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_accounts_status ON admin_accounts(status, created_at DESC)`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role TEXT`)
  await query(`UPDATE users SET admin_role = 'owner' WHERE is_admin = 1 AND NULLIF(TRIM(COALESCE(admin_role, '')), '') IS NULL`)
  // Admin identities are secret-backed and do not have users rows. Remove
  // foreign keys left by the former unified-user Admin architecture while
  // preserving every historical actor ID in the audit tables.
  await query(`ALTER TABLE admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_admin_id_fkey`)
  await query(`ALTER TABLE admin_security_events DROP CONSTRAINT IF EXISTS admin_security_events_admin_id_fkey`)
  await query(`ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_admin_id_fkey`)
  const legacyAdminTable = await queryOne<{ exists: boolean }>(
    `SELECT to_regclass('public.admin_users') IS NOT NULL AS exists`,
  )
  if (legacyAdminTable?.exists) await retireLegacyAdminIdentities()
  await query(`ALTER TABLE stories ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'normal'`)
  await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS duration NUMERIC`)
  await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS cover_url TEXT`)
  await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS trim_start NUMERIC`)
  await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS trim_end NUMERIC`)
  await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS playback_speed NUMERIC DEFAULT 1`)
  await query(`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS legacy_path TEXT`)
  // Older bootstraps deduplicated across entities and could rewrite an asset's
  // entity_id when the same bytes were uploaded again. Replace that index
  // before new uploads use the immutable entity-aware key.
  await query(`DROP INDEX IF EXISTS idx_media_assets_checksum_owner`)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_checksum_owner_entity ON media_assets(owner_id, checksum, purpose, entity_id)`)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_legacy_path ON media_assets(legacy_path) WHERE legacy_path IS NOT NULL`)
  await query(`ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS tag TEXT DEFAULT ''`)
  await query(`ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS admin_rights TEXT DEFAULT '{}'`)
  // Events were originally shipped as a small RSVP scaffold. Keep older
  // deployments compatible while adding the durable social-event surfaces.
  await query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS event_id TEXT`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Social'`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS location_type TEXT NOT NULL DEFAULT 'inside'`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS address TEXT DEFAULT ''`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS allow_waitlist SMALLINT DEFAULT 0`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS waitlist_count INTEGER DEFAULT 0`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'upcoming'`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS cancel_reason TEXT DEFAULT ''`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ`)
  await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ`)
  await query(`CREATE INDEX IF NOT EXISTS idx_events_visibility ON events(visibility, starts_at)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_events_college ON events(college_id, starts_at)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_conversations_event ON conversations(event_id) WHERE event_id IS NOT NULL`)
  await query(`CREATE TABLE IF NOT EXISTS event_hosts (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'host',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id)
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_event_hosts_user ON event_hosts(user_id, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS event_saves (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id)
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_event_saves_user ON event_saves(user_id, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS event_invitations (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE (event_id, invited_user_id)
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_event_invitations_user ON event_invitations(invited_user_id, status, created_at DESC)`)
  await query(`CREATE TABLE IF NOT EXISTS event_waitlist (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'waiting',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id)
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_event_waitlist_event ON event_waitlist(event_id, position)`)
  await query(`CREATE TABLE IF NOT EXISTS event_announcements (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_event_announcements_event ON event_announcements(event_id, created_at DESC)`)
  // Usernames are a public identity field and must remain canonical everywhere.
  // Normalize legacy rows before the case-insensitive index is created.
  await query(`UPDATE users SET username = LOWER(username) WHERE username <> LOWER(username)`)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username))`)
  // Recommendation schema
  try {
    const recSchemaPath = readFileSync(join(__dirname, 'recommendation-schema.sql'), 'utf-8')
    for (const stmt of recSchemaPath.split(';').map(s => s.trim()).filter(Boolean)) {
      await query(stmt)
    }
    console.log('✅ Recommendation schema initialized.')
  } catch (err: any) {
    console.warn('⚠️  Could not load recommendation schema:', err.message)
  }
  await hardenDatabaseSecurity()
}

export async function seedDatabase() {
  // The founder's personal account is not the separate Admin Panel identity.
  await query(`UPDATE users SET is_admin = 0, admin_role = NULL WHERE LOWER(email) = 'ceo@campnect.perinol.com'`)
  await query(`UPDATE users SET admin_role = NULL WHERE COALESCE(is_admin, 0) = 0`)
  await query(`
    UPDATE users
    SET college_id = (SELECT id FROM colleges WHERE LOWER(name) = LOWER('GLA University, Mathura') LIMIT 1),
        college_name = 'GLA University, Mathura',
        course = COALESCE(
          (SELECT source.course FROM users source WHERE LOWER(source.username) = 'cmo' AND NULLIF(TRIM(source.course), '') IS NOT NULL LIMIT 1),
          'B.Tech Computer Science'
        ),
        department = COALESCE(
          (SELECT source.department FROM users source WHERE LOWER(source.username) = 'cmo' AND NULLIF(TRIM(source.department), '') IS NOT NULL LIMIT 1),
          'B.Tech Computer Science · 4 Years'
        )
    WHERE LOWER(username) = 'ceo'
  `)
  // Remove the former placeholder Admin profile. The real Admin identity now
  // lives only in ADMIN_PANEL_USERNAME / ADMIN_PANEL_PASSWORD secrets.
  await query(`DELETE FROM users WHERE id = 'admin-0000-0000-0000-000000000001' AND LOWER(email) = 'admin@campnect.com'`)

  // ── Colleges ─────────────────────────────────────────────────────────────────
  const { rows: [{ c: collegeCount }] } = await query('SELECT COUNT(*) as c FROM colleges')
  if (Number(collegeCount) < 2) {
    console.log('Seeding database with GLA University colleges...')
    for (const c of COLLEGES) {
      await query(`
        INSERT INTO colleges (id, name, short_name, domains, country, city, about, website, logo_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING
      `, [c.id, c.name, c.short_name, c.domains, c.country, c.city, c.about, c.website, c.logo_url])
    }
    console.log('Colleges seeded.')
  } else {
    console.log('Database already seeded, skipping colleges...')
  }

  // Add later-supported colleges even when the original GLA seed already
  // populated the database. Keep this id stable so restarts remain idempotent.
  const supportedColleges = COLLEGES.filter((college) => ['lnmiit-jaipur', 'integral-university-lucknow', 'dbs-global-dehradun', 'gl-bajaj-mathura', 'gl-bajaj-greater-noida', 'lpu-phagwara', 'galgotias-greater-noida', 'bsacet-mathura', 'mit-wpu-pune', 'shoolini-university-bajhol', 'chitkara-university-rajpura', 'thapar-institute-patiala', 'cic-delhi-university', 'kiit-bhubaneswar', 'mnnit-allahabad-prayagraj'].includes(college.id))
  for (const supportedCollege of supportedColleges) {
    await query(`
      INSERT INTO colleges (id, name, short_name, domains, country, city, about, website, logo_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        short_name = EXCLUDED.short_name,
        domains = EXCLUDED.domains,
        country = EXCLUDED.country,
        city = EXCLUDED.city,
        about = EXCLUDED.about,
        website = EXCLUDED.website,
        logo_url = EXCLUDED.logo_url
    `, [supportedCollege.id, supportedCollege.name, supportedCollege.short_name, supportedCollege.domains, supportedCollege.country, supportedCollege.city, supportedCollege.about, supportedCollege.website, supportedCollege.logo_url])
  }

  // Google Play reviewers must be able to enter the credentials supplied in
  // Play Console without depending on an email OTP. The password remains a
  // server-side secret and this deterministic identity is the only account
  // eligible for the reviewer login path.
  const reviewerEmail = String(process.env.PLAY_REVIEWER_EMAIL || '').trim().toLowerCase()
  const reviewerPassword = String(process.env.PLAY_REVIEWER_PASSWORD || '')
  if (reviewerEmail && reviewerPassword) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reviewerEmail) || reviewerPassword.length < 8) {
      throw new Error('Play reviewer credentials are not configured safely.')
    }

    const college = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM colleges
       ORDER BY CASE WHEN LOWER(name) = LOWER('GLA University, Mathura') THEN 0 ELSE 1 END, name
       LIMIT 1`,
    )
    if (!college) throw new Error('A college is required before creating the Play reviewer account.')

    const existing = await queryOne<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE id = $1 OR LOWER(email) = $2 LIMIT 1',
      ['play-reviewer-account', reviewerEmail],
    )
    const passwordMatches = existing?.password_hash
      ? await bcrypt.compare(reviewerPassword, existing.password_hash)
      : false
    const passwordHash = passwordMatches
      ? existing!.password_hash
      : await bcrypt.hash(reviewerPassword, 12)

    await query(
      `INSERT INTO users
        (id, email, password_hash, username, full_name, college_id, college_name,
         user_role, is_email_verified, is_college_verified, verification_status,
         account_type, is_private, is_admin, is_suspended, is_banned, is_deactivated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'student',1,1,'approved','public',0,0,0,0,0)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         username = EXCLUDED.username,
         full_name = EXCLUDED.full_name,
         college_id = EXCLUDED.college_id,
         college_name = EXCLUDED.college_name,
         is_email_verified = 1,
         is_college_verified = 1,
         verification_status = 'approved',
         account_type = 'public',
         is_private = 0,
         is_admin = 0,
         admin_role = NULL,
         is_suspended = 0,
         is_banned = 0,
         is_deactivated = 0,
         updated_at = NOW()`,
      [
        'play-reviewer-account',
        reviewerEmail,
        passwordHash,
        'playreviewer',
        'Google Play Reviewer',
        college.id,
        college.name,
      ],
    )
    console.log('Google Play reviewer account is ready.')
  }

  // Founder and demo accounts are never seeded with hardcoded credentials.
  // Regular users register through the normal college-email and OTP flow.
  console.log('App is ready — users register via the normal sign-up flow.')
}

async function retireLegacyAdminIdentities() {
  const legacyTable = await queryOne<{ exists: boolean }>(
    `SELECT to_regclass('public.admin_users') IS NOT NULL AS exists`,
  )
  if (!legacyTable?.exists) return

  // Legacy credentials and opaque sessions must not survive the migration.
  // Audit actor IDs remain as historical strings because Admin identities no
  // longer belong to the student users table.
  await query('DROP TABLE IF EXISTS admin_users')
}
