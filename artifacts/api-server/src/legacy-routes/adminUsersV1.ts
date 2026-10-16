// @ts-nocheck
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, withTransaction } from '../legacy-db/index.js'
import type { DbExecutor } from '../legacy-db/index.js'
import { requireAdminPermission } from '../legacy-middleware/auth.js'
import {
  adminFailure,
  adminSuccess,
  recordAdminAudit,
  recordModerationAction,
} from '../legacy-services/adminSecurity.js'
import {
  createUserWarningInTransaction,
  normalizeWarningInput,
  UserWarningValidationError,
} from '../legacy-services/userWarnings.js'

export const adminUsersV1Router = Router()
export const adminUserNotesV1Router = Router()

const MAX_PAGE_SIZE = 100
const OWNER_MUTATION_PERMISSION = 'users.manage'

function pageParams(req: any) {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(String(req.query.limit || req.query.pageSize || '20'), 10) || 20))
  return { page, limit, offset: (page - 1) * limit }
}

function booleanQuery(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return undefined
}

function textBody(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength)
}

function internalError(res: any, req: any, error: any) {
  console.error('[admin user management]', req.method, req.originalUrl, error?.message || error)
  return adminFailure(res, req, 500, 'ADMIN_INTERNAL_ERROR', 'The admin request could not be completed.')
}

const USER_SUMMARY_SELECT = `
  SELECT
    u.id, u.email, u.phone, u.student_id, u.username, u.full_name, u.avatar_url, u.cover_url, u.bio,
    u.skills, u.relationship_status,
    u.college_id, u.college_name, u.department, u.course, u.year, u.semester,
    u.account_type, u.is_email_verified, u.is_college_verified, u.verification_status,
    u.is_admin, u.admin_role, u.is_online, u.is_private,
    COALESCE(u.is_suspended, 0) AS is_suspended,
    COALESCE(u.is_banned, 0) AS is_banned,
    COALESCE(u.is_shadowbanned, 0) AS is_shadowbanned,
    COALESCE(u.is_deactivated, 0) AS is_deactivated,
    u.deactivated_at, u.deactivation_reason, u.ban_reason,
    u.suspension_reason, u.suspension_ends_at, COALESCE(u.warnings_count, 0) AS warnings_count,
    u.last_seen, u.created_at, u.updated_at,
    COALESCE(u.followers_count, 0) AS followers_count,
    COALESCE(u.following_count, 0) AS following_count,
    COALESCE(u.posts_count, 0) AS posts_count,
    (SELECT COUNT(*)::int FROM comments c WHERE c.user_id = u.id) AS comments_count,
    (SELECT COUNT(*)::int FROM community_members cm WHERE cm.user_id = u.id) AS groups_count,
    (SELECT COUNT(*)::int FROM event_attendees ea WHERE ea.user_id = u.id) AS events_count,
    (SELECT COUNT(*)::int FROM reports r
      WHERE (r.entity_type = 'user' AND r.entity_id = u.id)
         OR (r.entity_type = 'post' AND EXISTS (
           SELECT 1 FROM posts rp WHERE rp.id = r.entity_id AND rp.user_id = u.id
         ))
     ) AS reports_count,
    (SELECT COUNT(*)::int FROM user_warnings w
      WHERE w.user_id = u.id AND w.removed_at IS NULL
        AND (w.expires_at IS NULL OR w.expires_at > NOW())) AS active_warnings_count,
    (SELECT COUNT(*)::int FROM user_restrictions ur
      WHERE ur.user_id = u.id AND ur.removed_at IS NULL
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())) AS active_restrictions_count,
    COALESCE((SELECT score FROM user_trust_scores uts WHERE uts.user_id = u.id), 50) AS trust_score
`

async function getUserSummary(executor: Pick<DbExecutor, 'one'>, userId: string) {
  return executor.one<any>(`${USER_SUMMARY_SELECT} FROM users u WHERE u.id = $1`, [userId])
}

function buildUserFilters(req: any) {
  const filters: string[] = []
  const values: any[] = []
  const add = (sql: string, value?: any) => {
    if (value === undefined) {
      filters.push(sql)
      return
    }
    values.push(value)
    filters.push(sql.replace(/\$VALUE/g, `$${values.length}`))
  }

  const search = textBody(req.query.search ?? req.query.q, 200).toLowerCase()
  if (search) {
    values.push(`%${search}%`)
    const placeholder = `$${values.length}`
    filters.push(`(
      LOWER(u.username) LIKE ${placeholder}
      OR LOWER(u.full_name) LIKE ${placeholder}
      OR LOWER(u.email) LIKE ${placeholder}
      OR LOWER(COALESCE(u.student_id, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(u.phone, '')) LIKE ${placeholder}
      OR LOWER(CAST(u.id AS TEXT)) LIKE ${placeholder}
    )`)
  }

  const verified = booleanQuery(req.query.verified)
  if (verified !== undefined) add(`COALESCE(u.is_college_verified, 0) = $VALUE::int`, verified ? 1 : 0)
  const unverified = booleanQuery(req.query.unverified)
  if (unverified !== undefined) add(`COALESCE(u.is_college_verified, 0) = $VALUE::int`, unverified ? 0 : 1)
  const banned = booleanQuery(req.query.banned)
  if (banned !== undefined) add(`COALESCE(u.is_banned, 0) = $VALUE::int`, banned ? 1 : 0)
  const suspended = booleanQuery(req.query.suspended)
  if (suspended !== undefined) add(`COALESCE(u.is_suspended, 0) = $VALUE::int`, suspended ? 1 : 0)
  const online = booleanQuery(req.query.online)
  if (online !== undefined) add(`COALESCE(u.is_online, 0) = $VALUE::int`, online ? 1 : 0)
  const shadowbanned = booleanQuery(req.query.shadowbanned)
  if (shadowbanned !== undefined) add(`COALESCE(u.is_shadowbanned, 0) = $VALUE::int`, shadowbanned ? 1 : 0)
  const restricted = booleanQuery(req.query.restricted)
  if (restricted !== undefined) add(
    restricted
      ? `EXISTS (SELECT 1 FROM user_restrictions ur WHERE ur.user_id = u.id AND ur.removed_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > NOW()))`
      : `NOT EXISTS (SELECT 1 FROM user_restrictions ur WHERE ur.user_id = u.id AND ur.removed_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > NOW()))`,
  )
  const privateProfile = booleanQuery(req.query.private)
  if (privateProfile !== undefined) add(`COALESCE(u.is_private, 0) = $VALUE::int`, privateProfile ? 1 : 0)
  const moderator = booleanQuery(req.query.moderator)
  if (moderator !== undefined) add(
    moderator
      ? `LOWER(COALESCE(u.account_type, '')) = 'moderator'`
      : `LOWER(COALESCE(u.account_type, '')) <> 'moderator'`,
  )
  const inactive = booleanQuery(req.query.inactive)
  if (inactive !== undefined) add(
    inactive
      ? `(u.last_seen IS NULL OR u.last_seen < NOW() - INTERVAL '30 days')`
      : `u.last_seen >= NOW() - INTERVAL '30 days'`,
  )
  const recentlyJoined = booleanQuery(req.query.recently_joined ?? req.query.recent)
  if (recentlyJoined !== undefined) add(
    recentlyJoined
      ? `u.created_at >= NOW() - INTERVAL '30 days'`
      : `u.created_at < NOW() - INTERVAL '30 days'`,
  )
  const creator = booleanQuery(req.query.creator)
  if (creator !== undefined) add(`COALESCE(u.posts_count, 0) ${creator ? '>' : '='} 0`)
  const student = booleanQuery(req.query.student)
  if (student !== undefined) add(
    student
      ? `(u.college_id IS NOT NULL AND COALESCE(u.account_type, '') <> 'alumni')`
      : `(u.college_id IS NULL OR COALESCE(u.account_type, '') = 'alumni')`,
  )
  const founder = booleanQuery(req.query.founder)
  if (founder !== undefined) add(
    founder
      ? `LOWER(COALESCE(u.account_type, '')) = 'founder'`
      : `LOWER(COALESCE(u.account_type, '')) <> 'founder'`,
  )

  // Preserve the existing versioned status filters.
  const status = textBody(req.query.status, 50).toLowerCase()
  if (status === 'suspended') filters.push('COALESCE(u.is_suspended, 0) = 1')
  if (status === 'banned') filters.push('COALESCE(u.is_banned, 0) = 1')
  if (status === 'pending_verification' || status === 'pending') filters.push(`u.verification_status = 'pending'`)
  if (status === 'deactivated') filters.push('COALESCE(u.is_deactivated, 0) = 1')

  return { where: filters.length ? `WHERE ${filters.join(' AND ')}` : '', values }
}

const SORTS: Record<string, string> = {
  newest: 'u.created_at DESC, u.id ASC',
  oldest: 'u.created_at ASC, u.id ASC',
  last_active: 'u.last_seen DESC NULLS LAST, u.id ASC',
  followers: 'COALESCE(u.followers_count, 0) DESC, u.id ASC',
  reports: 'reports_count DESC, u.id ASC',
  joined: 'u.created_at DESC, u.id ASC',
  alphabetical: 'LOWER(u.full_name) ASC, LOWER(u.username) ASC, u.id ASC',
}

async function listUsers(req: any, res: any) {
  try {
    const { page, limit, offset } = pageParams(req)
    const { where, values } = buildUserFilters(req)
    const sort = textBody(req.query.sort, 40).toLowerCase() || 'newest'
    const orderBy = SORTS[sort] || SORTS.newest
    const items = await db.all<any>(
      `${USER_SUMMARY_SELECT}
       FROM users u ${where}
       ORDER BY ${orderBy}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    )
    const total = await db.one<any>(
      `SELECT COUNT(*)::int AS count FROM users u ${where}`,
      values,
    )
    return adminSuccess(res, req, items, {
      page,
      limit,
      total: Number(total?.count || 0),
      sort: SORTS[sort] ? sort : 'newest',
    })
  } catch (error) {
    return internalError(res, req, error)
  }
}

async function getUser360(req: any, res: any) {
  try {
    const userId = String(req.params.id)
    const user = await getUserSummary(db, userId)
    if (!user) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')

    const [
      verification,
      posts,
      comments,
      groups,
      events,
      reports,
      notes,
      moderationHistory,
      sessions,
      auditHistory,
      warnings,
      restrictions,
      appeals,
      loginHistory,
      trustScore,
      likesGiven,
      likesReceived,
      messagesCount,
    ] = await Promise.all([
      db.one<any>(
        `SELECT id, user_id, college_id, ocr_name, status, review_notes, submitted_at, reviewed_at,
           reviewer_id, (id_photo_url IS NOT NULL) AS has_id_photo,
           (selfie_url IS NOT NULL) AS has_selfie
         FROM college_verifications WHERE user_id = $1`,
        [userId],
      ),
      db.all<any>(
        `SELECT id, type, content, media, visibility, moderation_status, likes_count, comments_count, shares_count, created_at
         FROM posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [userId],
      ),
      db.all<any>(
        `SELECT id, post_id, parent_id, content, likes_count, created_at
         FROM comments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [userId],
      ),
      db.all<any>(
        `SELECT c.id, c.name, c.slug, c.description, cm.role, cm.joined_at
         FROM community_members cm JOIN communities c ON c.id = cm.community_id
         WHERE cm.user_id = $1 ORDER BY cm.joined_at DESC`,
        [userId],
      ),
      db.all<any>(
        `SELECT e.id, e.title, e.type, e.starts_at, e.ends_at, e.location, ea.status, ea.created_at AS joined_at
         FROM event_attendees ea JOIN events e ON e.id = ea.event_id
         WHERE ea.user_id = $1 ORDER BY ea.created_at DESC`,
        [userId],
      ),
      db.all<any>(
        `SELECT r.id, r.entity_type, r.entity_id, r.reason, r.description, r.status,
           r.reviewed_by, r.created_at, reporter.id AS reporter_id,
           reporter.username AS reporter_username, reporter.full_name AS reporter_name
         FROM reports r JOIN users reporter ON reporter.id = r.reporter_id
         LEFT JOIN posts reported_post ON reported_post.id = r.entity_id AND r.entity_type = 'post'
         WHERE (r.entity_type = 'user' AND r.entity_id = $1)
            OR (r.entity_type = 'post' AND reported_post.user_id = $1)
            OR (r.entity_type = 'comment' AND EXISTS (
              SELECT 1 FROM comments reported_comment
              WHERE reported_comment.id = r.entity_id AND reported_comment.user_id = $1
            ))
         ORDER BY r.created_at DESC LIMIT 100`,
        [userId],
      ),
      db.all<any>(
        `SELECT id, admin_id, body, created_at, updated_at
         FROM admin_user_notes WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      ),
      db.all<any>(
        `SELECT id, admin_id, action, target_type, target_id, reason,
           before_summary, after_summary, metadata, request_id, created_at
         FROM moderation_actions
         WHERE (target_type = 'user' AND target_id = $1)
            OR (target_type = 'post' AND target_id IN (SELECT id FROM posts WHERE user_id = $1))
         ORDER BY created_at DESC LIMIT 100`,
        [userId],
      ),
      db.all<any>(
        `SELECT id, device_info, ip_address, created_at, expires_at
         FROM refresh_tokens
         WHERE user_id = $1 AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [userId],
      ),
      db.all<any>(
        `SELECT id, admin_id, action, resource_type, resource_id, reason,
           before_summary, after_summary, request_id, created_at
         FROM admin_audit_logs
         WHERE resource_type = 'user' AND resource_id = $1
         ORDER BY created_at DESC LIMIT 100`,
        [userId],
      ),
       db.all<any>(
         `SELECT id, level, category, reason, evidence, linked_report_id, issued_by,
            expires_at, removed_at, removed_by, removal_reason, created_at
          FROM user_warnings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
         [userId],
       ),
       db.all<any>(
         `SELECT id, restriction_type, reason, issued_by, expires_at, removed_at, removed_by, created_at
          FROM user_restrictions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
         [userId],
       ),
       db.all<any>(
         `SELECT id, case_id, moderation_action_id, status, evidence, moderator_notes, decision,
            assigned_to, submitted_at, decided_at, created_at, updated_at
          FROM appeals WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 100`,
         [userId],
       ),
       db.all<any>(
         `SELECT id, identifier, success, device_info, ip_address, platform, country, city,
            failure_reason, created_at
          FROM auth_login_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
         [userId],
       ),
       db.one<any>(
         `SELECT score, factors, calculated_at, updated_by FROM user_trust_scores WHERE user_id = $1`,
         [userId],
       ),
       db.one<any>('SELECT COUNT(*)::int AS count FROM post_likes WHERE user_id = $1', [userId]),
       db.one<any>(`SELECT COALESCE(SUM(likes_count), 0)::int AS count FROM posts WHERE user_id = $1`, [userId]),
       db.one<any>('SELECT COUNT(*)::int AS count FROM messages WHERE sender_id = $1', [userId]),
    ])

    return adminSuccess(res, req, {
      user,
      verification,
      statistics: {
        followers: Number(user.followers_count || 0),
        following: Number(user.following_count || 0),
        posts: Number(user.posts_count || 0),
        comments: comments.length,
        groups: groups.length,
        events: events.length,
        reports: reports.length,
        messages: Number(messagesCount?.count || 0),
        likes_given: Number(likesGiven?.count || 0),
        likes_received: Number(likesReceived?.count || 0),
      },
      posts,
      comments,
      groups,
      events,
      reports,
      admin_notes: notes,
      moderation_history: moderationHistory,
      sessions,
      audit_history: auditHistory,
      warnings,
      restrictions,
      appeals,
      devices: sessions.map((session: any) => ({ id: session.id, device_info: session.device_info, ip_address: session.ip_address })),
      login_history: loginHistory,
      trust_score: trustScore || { score: 50, factors: '{}', calculated_at: null },
    })
  } catch (error) {
    return internalError(res, req, error)
  }
}

const REASON_REQUIRED = new Set(['suspend', 'ban', 'warn', 'restore', 'deactivate', 'delete', 'broadcast'])
const MODERATION_ACTIONS = new Set(['suspend', 'unsuspend', 'ban', 'unban', 'verify', 'unverify', 'warn', 'restore', 'deactivate', 'delete'])

async function mutateUser(tx: DbExecutor, req: any, userId: string, action: string, reason: string) {
  const before = await tx.one<any>(
    `SELECT id, is_suspended, is_banned, is_college_verified, verification_status,
       is_deactivated, is_shadowbanned, warnings_count, suspension_reason, ban_reason,
       deactivated_at FROM users WHERE id = $1 FOR UPDATE`,
    [userId],
  )
  if (!before) return null

  let after: any
  let handledByWarningService = false
  switch (action) {
    case 'suspend':
      after = await tx.one<any>(
        `UPDATE users SET is_suspended = 1, suspension_reason = $1,
           warnings_count = COALESCE(warnings_count, 0) + 1, updated_at = NOW()
         WHERE id = $2
         RETURNING is_suspended, is_banned, is_college_verified, verification_status,
           is_deactivated, is_shadowbanned, warnings_count, suspension_reason, ban_reason,
           deactivated_at`,
        [reason, userId],
      )
      break
    case 'unsuspend':
      after = await tx.one<any>(
        `UPDATE users SET is_suspended = 0, suspension_reason = '', updated_at = NOW()
         WHERE id = $1
         RETURNING is_suspended, is_banned, is_college_verified, verification_status,
           is_deactivated, is_shadowbanned, warnings_count, suspension_reason, ban_reason,
           deactivated_at`,
        [userId],
      )
      break
    case 'ban':
      after = await tx.one<any>(
        `UPDATE users SET is_banned = 1, ban_reason = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING is_suspended, is_banned, is_college_verified, verification_status,
           is_deactivated, is_shadowbanned, warnings_count, suspension_reason, ban_reason,
           deactivated_at`,
        [reason, userId],
      )
      break
    case 'unban':
      after = await tx.one<any>(
        `UPDATE users SET is_banned = 0, ban_reason = '', updated_at = NOW()
         WHERE id = $1
         RETURNING is_suspended, is_banned, is_college_verified, verification_status,
           is_deactivated, is_shadowbanned, warnings_count, suspension_reason, ban_reason,
           deactivated_at`,
        [userId],
      )
      break
    case 'warn':
      await createUserWarningInTransaction(req, tx, userId, normalizeWarningInput({ ...req.body, reason }))
      handledByWarningService = true
      break
    case 'restore':
      after = await tx.one<any>(
        `UPDATE users SET is_deactivated = 0, deactivated_at = NULL, deactivation_reason = '',
           is_suspended = 0, suspension_reason = '', suspension_ends_at = NULL,
           is_banned = 0, ban_reason = '', ban_ends_at = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING is_suspended, is_banned, is_college_verified, verification_status,
           is_deactivated, is_shadowbanned, warnings_count, suspension_reason, ban_reason,
           deactivated_at`,
        [userId],
      )
      break
    case 'verify':
      await tx.run(
        `UPDATE college_verifications
         SET status = 'approved', reviewed_at = NOW(), reviewer_id = $1, review_notes = $2
         WHERE user_id = $3`,
        [req.admin!.adminId, reason, userId],
      )
      after = await tx.one<any>(
        `UPDATE users SET is_college_verified = 1, verification_status = 'approved', updated_at = NOW()
         WHERE id = $1
         RETURNING is_suspended, is_banned, is_college_verified, verification_status,
           is_deactivated, is_shadowbanned, warnings_count, suspension_reason, ban_reason,
           deactivated_at`,
        [userId],
      )
      break
    case 'unverify':
      await tx.run(
        `UPDATE college_verifications
         SET status = 'rejected', reviewed_at = NOW(), reviewer_id = $1, review_notes = $2
         WHERE user_id = $3`,
        [req.admin!.adminId, reason, userId],
      )
      after = await tx.one<any>(
        `UPDATE users SET is_college_verified = 0, verification_status = 'rejected', updated_at = NOW()
         WHERE id = $1
         RETURNING is_suspended, is_banned, is_college_verified, verification_status,
           is_deactivated, is_shadowbanned, warnings_count, suspension_reason, ban_reason,
           deactivated_at`,
        [userId],
      )
      break
    case 'logout-all':
      await tx.run('DELETE FROM refresh_tokens WHERE user_id = $1', [userId])
      after = await tx.one<any>(
        `UPDATE users SET is_online = 0, last_seen = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING is_suspended, is_banned, is_college_verified, verification_status,
           is_deactivated, is_shadowbanned, warnings_count, suspension_reason, ban_reason,
           deactivated_at`,
        [userId],
      )
      break
    case 'deactivate':
    case 'delete':
      await tx.run('DELETE FROM refresh_tokens WHERE user_id = $1', [userId])
      after = await tx.one<any>(
        `UPDATE users SET is_deactivated = 1, deactivated_at = NOW(),
           deactivation_reason = $1, is_online = 0, updated_at = NOW()
         WHERE id = $2
         RETURNING is_suspended, is_banned, is_college_verified, verification_status,
           is_deactivated, is_shadowbanned, warnings_count, suspension_reason, ban_reason,
           deactivated_at`,
        [reason, userId],
      )
      break
    default:
      throw new Error(`Unsupported user action: ${action}`)
  }

  if (handledByWarningService) return getUserSummary(tx, userId)

  await recordAdminAudit(req, {
    action: `user.${action}`,
    resourceType: 'user',
    resourceId: userId,
    reason,
    before,
    after,
  }, tx)
  if (MODERATION_ACTIONS.has(action)) {
    await recordModerationAction(req, {
      action: `user.${action}`,
      targetType: 'user',
      targetId: userId,
      reason,
      before,
      after,
    }, tx)
  }
  const historyAction: Record<string, string> = {
    suspend: 'Suspension',
    unsuspend: 'Suspension Removed',
    ban: 'Ban',
    unban: 'Ban Removed',
    verify: 'Verification Restored',
    unverify: 'Verification Revoked',
    warn: 'Warning',
    restore: 'Account Restored',
    deactivate: 'Account Deactivated',
    delete: 'Account Deactivated',
    'logout-all': 'Force Logout',
  }
  if (historyAction[action]) {
    await tx.run(
      `INSERT INTO enforcement_history
       (id, user_id, action_type, previous_status, new_status, reason, moderator_id, is_active, is_removed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        uuidv4(),
        userId,
        historyAction[action],
        JSON.stringify(before),
        JSON.stringify(after || {}),
        reason,
        req.admin?.adminId || null,
        ['suspend', 'ban', 'deactivate', 'delete'].includes(action) ? 1 : 0,
        ['unsuspend', 'unban', 'verify', 'restore', 'logout-all'].includes(action) ? 1 : 0,
      ],
    )
  }
  return getUserSummary(tx, userId)
}

function actionHandler(action: string) {
  return async (req: any, res: any) => {
    const reason = textBody(req.body?.reason, 2000)
    if (REASON_REQUIRED.has(action) && !reason) {
      return adminFailure(res, req, 400, 'MODERATION_REASON_REQUIRED', 'A reason is required for this action.')
    }
    try {
      const user = await withTransaction(async (tx) => mutateUser(tx, req, String(req.params.id), action, reason))
      if (!user) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
      return adminSuccess(res, req, { user, action })
    } catch (error) {
      if (error instanceof UserWarningValidationError) {
        return adminFailure(res, req, 400, error.code, error.message)
      }
      return internalError(res, req, error)
    }
  }
}

// User listing/detail are deliberately registered before the older partial
// handlers in adminV1.ts. The old endpoints remain as compatibility code for
// capabilities that are not part of this Phase 2 contract.
adminUsersV1Router.get('/', requireAdminPermission('users.read'), listUsers)
adminUsersV1Router.get('/:id', requireAdminPermission('users.read'), getUser360)

adminUsersV1Router.patch('/:id/username', requireAdminPermission(OWNER_MUTATION_PERMISSION), async (req, res) => {
  const username = textBody(req.body?.username, 30).toLowerCase()
  const reason = textBody(req.body?.reason, 2_000)
  if (!/^[a-z0-9_.]{5,30}$/.test(username) || username === 'ceo') {
    return adminFailure(res, req, 400, 'USERNAME_INVALID', 'Username must be 5–30 lowercase letters, numbers, underscores, or periods.')
  }
  if (!reason) {
    return adminFailure(res, req, 400, 'USERNAME_CHANGE_REASON_REQUIRED', 'A reason is required to change a username.')
  }

  try {
    const result = await withTransaction(async (tx) => {
      const before = await tx.one<any>('SELECT id, username FROM users WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!before) return null
      if (before.username.toLowerCase() === username) {
        return { unchanged: true, user: before }
      }

      const taken = await tx.one<any>('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2', [username, req.params.id])
      if (taken) return { taken: true }

      const after = await tx.one<any>(
        'UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, updated_at',
        [username, req.params.id],
      )
      await tx.run(
        "INSERT INTO notifications (id, user_id, type, entity_type, content) VALUES ($1,$2,'system','account',$3)",
        [uuidv4(), req.params.id, 'Your username was updated by Campnect Support.'],
      )
      await recordAdminAudit(req, {
        action: 'user.username.update',
        resourceType: 'user',
        resourceId: req.params.id,
        reason,
        before,
        after,
      }, tx)
      return { user: after }
    })

    if (!result) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    if (result.taken) return adminFailure(res, req, 409, 'USERNAME_TAKEN', 'That username is already in use.')
    if (result.unchanged) return adminFailure(res, req, 400, 'USERNAME_UNCHANGED', 'The user already has that username.')
    return adminSuccess(res, req, result)
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminUsersV1Router.delete('/:id/permanent', requireAdminPermission(OWNER_MUTATION_PERMISSION), async (req, res) => {
  const confirmationUsername = textBody(req.body?.confirmation_username, 30).toLowerCase()
  const reason = textBody(req.body?.reason, 2_000)
  if (!confirmationUsername) {
    return adminFailure(res, req, 400, 'PERMANENT_DELETE_CONFIRMATION_REQUIRED', 'Type the account username to confirm permanent deletion.')
  }
  if (!reason) {
    return adminFailure(res, req, 400, 'PERMANENT_DELETE_REASON_REQUIRED', 'An audit reason is required for permanent deletion.')
  }

  try {
    const result = await withTransaction(async (tx) => {
      const user = await tx.one<any>(
        'SELECT id, username, email, full_name, is_admin, created_at FROM users WHERE id = $1 FOR UPDATE',
        [req.params.id],
      )
      if (!user) return { missing: true }
      if (user.username.toLowerCase() !== confirmationUsername) return { confirmationMismatch: true }

      // This history deliberately uses ON DELETE RESTRICT. Clear it within the
      // same transaction so the user row can be deleted; the separate admin
      // audit entry below remains as the compliance record of this action.
      await tx.run('DELETE FROM enforcement_history WHERE user_id = $1', [user.id])
      await tx.run('DELETE FROM admin_user_notes WHERE user_id = $1', [user.id])
      await tx.run('DELETE FROM users WHERE id = $1', [user.id])
      await recordAdminAudit(req, {
        action: 'user.permanently_delete',
        resourceType: 'user',
        resourceId: user.id,
        reason,
        before: {
          username: user.username,
          email: user.email,
          full_name: user.full_name,
          is_admin: user.is_admin,
          created_at: user.created_at,
        },
        after: { permanently_deleted: true },
      }, tx)
      return { deleted: true }
    })
    if (result.missing) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    if (result.confirmationMismatch) {
      return adminFailure(res, req, 400, 'PERMANENT_DELETE_CONFIRMATION_MISMATCH', 'The typed username does not match this account.')
    }
    return adminSuccess(res, req, { deleted: true })
  } catch (error) {
    return internalError(res, req, error)
  }
})

for (const action of ['suspend', 'unsuspend', 'ban', 'unban', 'warn', 'verify', 'unverify', 'logout-all', 'deactivate']) {
  adminUsersV1Router.post(
    `/:id/${action}`,
    requireAdminPermission(OWNER_MUTATION_PERMISSION),
    actionHandler(action),
  )
}
adminUsersV1Router.delete(
  '/:id',
  requireAdminPermission(OWNER_MUTATION_PERMISSION),
  actionHandler('delete'),
)

adminUsersV1Router.get('/:id/reports', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const user = await db.one<any>('SELECT id FROM users WHERE id = $1', [req.params.id])
    if (!user) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    const { page, limit, offset } = pageParams(req)
    const requestedStatus = textBody(req.query.status, 30).toLowerCase() || 'all'
    const statusClause = requestedStatus === 'open'
      ? `AND r.status IN ('pending', 'reviewed')`
      : ['resolved', 'dismissed', 'pending', 'reviewed'].includes(requestedStatus)
        ? `AND r.status = $2`
        : ''
    const params: any[] = [req.params.id]
    if (statusClause.includes('$2')) params.push(requestedStatus)
    const limitPosition = params.length + 1
    const offsetPosition = params.length + 2
    const items = await db.all<any>(
      `SELECT r.id, r.entity_type, r.entity_id, r.reason, r.description, r.status,
         r.reviewed_by, r.created_at, reporter.id AS reporter_id,
         reporter.username AS reporter_username, reporter.full_name AS reporter_name
       FROM reports r JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN posts reported_post ON reported_post.id = r.entity_id AND r.entity_type = 'post'
       WHERE (
         (r.entity_type = 'user' AND r.entity_id = $1)
         OR (r.entity_type = 'post' AND reported_post.user_id = $1)
         OR (r.entity_type = 'comment' AND EXISTS (
           SELECT 1 FROM comments reported_comment
           WHERE reported_comment.id = r.entity_id AND reported_comment.user_id = $1
         ))
       ) ${statusClause}
       ORDER BY r.created_at DESC
       LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      [...params, limit, offset],
    )
    const total = await db.one<any>(
      `SELECT COUNT(*)::int AS count
       FROM reports r
       LEFT JOIN posts reported_post ON reported_post.id = r.entity_id AND r.entity_type = 'post'
       WHERE (
         (r.entity_type = 'user' AND r.entity_id = $1)
         OR (r.entity_type = 'post' AND reported_post.user_id = $1)
         OR (r.entity_type = 'comment' AND EXISTS (
           SELECT 1 FROM comments reported_comment
           WHERE reported_comment.id = r.entity_id AND reported_comment.user_id = $1
         ))
       ) ${statusClause}`,
      params,
    )
    return adminSuccess(res, req, items, {
      page,
      limit,
      total: Number(total?.count || 0),
      status: requestedStatus,
    })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminUsersV1Router.get('/:id/sessions', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const user = await db.one<any>('SELECT id FROM users WHERE id = $1', [req.params.id])
    if (!user) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    const sessions = await db.all<any>(
      `SELECT id, device_info, ip_address, created_at, expires_at
       FROM refresh_tokens WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.params.id],
    )
    return adminSuccess(res, req, sessions)
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminUsersV1Router.delete('/:id/sessions/:sessionId', requireAdminPermission(OWNER_MUTATION_PERMISSION), async (req, res) => {
  try {
    const session = await db.one<any>(
      `SELECT id, user_id FROM refresh_tokens WHERE id = $1 AND user_id = $2`,
      [req.params.sessionId, req.params.id],
    )
    if (!session) return adminFailure(res, req, 404, 'USER_SESSION_NOT_FOUND', 'User session not found.')
    await withTransaction(async (tx) => {
      await tx.run('DELETE FROM refresh_tokens WHERE id = $1 AND user_id = $2', [req.params.sessionId, req.params.id])
      await recordAdminAudit(req, {
        action: 'user.session.logout',
        resourceType: 'user_session',
        resourceId: req.params.sessionId,
        reason: textBody(req.body?.reason, 2000),
        before: { status: 'active' },
        after: { status: 'revoked' },
      }, tx)
    })
    return adminSuccess(res, req, { session_id: req.params.sessionId, revoked: true })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminUsersV1Router.get('/:id/notes', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const user = await db.one<any>('SELECT id FROM users WHERE id = $1', [req.params.id])
    if (!user) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    const notes = await db.all<any>(
      `SELECT id, user_id, admin_id, body, created_at, updated_at
       FROM admin_user_notes WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.params.id],
    )
    return adminSuccess(res, req, notes)
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminUsersV1Router.post('/:id/notes', requireAdminPermission(OWNER_MUTATION_PERMISSION), async (req, res) => {
  const body = textBody(req.body?.body ?? req.body?.note, 10000)
  if (!body) return adminFailure(res, req, 400, 'NOTE_BODY_REQUIRED', 'Note body is required.')
  try {
    const note = await withTransaction(async (tx) => {
      const user = await tx.one<any>('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!user) return null
      const id = uuidv4()
      const created = await tx.one<any>(
        `INSERT INTO admin_user_notes (id, user_id, admin_id, body)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, admin_id, body, created_at, updated_at`,
        [id, req.params.id, req.admin!.adminId, body],
      )
      await recordAdminAudit(req, {
        action: 'user.note.create',
        resourceType: 'user',
        resourceId: req.params.id,
        after: { action: 'created' },
      }, tx)
      return created
    })
    if (!note) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    return adminSuccess(res, req, note)
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminUsersV1Router.get('/:id/timeline', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const user = await db.one<any>('SELECT id FROM users WHERE id = $1', [req.params.id])
    if (!user) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    const { page, limit, offset } = pageParams(req)
    const timelineSql = `
      SELECT * FROM (
        SELECT 'account.created' AS event_type, u.created_at AS occurred_at, u.id AS entity_id,
          u.id AS actor_id, 'Account created' AS summary
        FROM users u WHERE u.id = $1
        UNION ALL
        SELECT 'login' AS event_type, rt.created_at AS occurred_at, rt.id AS entity_id,
          NULL AS actor_id, 'Session created' AS summary
        FROM refresh_tokens rt WHERE rt.user_id = $1
        UNION ALL
        SELECT 'post.created', p.created_at, p.id, p.user_id, 'Post created'
        FROM posts p WHERE p.user_id = $1
        UNION ALL
        SELECT 'comment.created', c.created_at, c.id, c.user_id, 'Comment created'
        FROM comments c WHERE c.user_id = $1
        UNION ALL
        SELECT 'group.joined', cm.joined_at, cm.community_id, cm.user_id, 'Joined group'
        FROM community_members cm WHERE cm.user_id = $1
        UNION ALL
        SELECT 'event.joined', ea.created_at, ea.event_id, ea.user_id, 'Joined event'
        FROM event_attendees ea WHERE ea.user_id = $1
        UNION ALL
        SELECT 'verification.submitted', cv.submitted_at, cv.id, cv.user_id, 'Verification submitted'
        FROM college_verifications cv WHERE cv.user_id = $1
        UNION ALL
        SELECT 'verification.reviewed', cv.reviewed_at, cv.id, cv.reviewer_id, 'Verification reviewed'
        FROM college_verifications cv WHERE cv.user_id = $1 AND cv.reviewed_at IS NOT NULL
        UNION ALL
        SELECT 'report.received', r.created_at, r.id, r.reporter_id, 'Report received'
        FROM reports r
        WHERE (r.entity_type = 'user' AND r.entity_id = $1)
           OR (r.entity_type = 'post' AND EXISTS (
             SELECT 1 FROM posts rp WHERE rp.id = r.entity_id AND rp.user_id = $1
           ))
           OR (r.entity_type = 'comment' AND EXISTS (
             SELECT 1 FROM comments rc WHERE rc.id = r.entity_id AND rc.user_id = $1
           ))
        UNION ALL
        SELECT 'admin.action', ma.created_at, ma.id, ma.admin_id, ma.action
        FROM moderation_actions ma
        WHERE (ma.target_type = 'user' AND ma.target_id = $1)
           OR (ma.target_type = 'post' AND EXISTS (
             SELECT 1 FROM posts mp WHERE mp.id = ma.target_id AND mp.user_id = $1
           ))
      ) timeline
      ORDER BY occurred_at DESC NULLS LAST
      LIMIT $2 OFFSET $3
    `
    const [items, total] = await Promise.all([
      db.all<any>(timelineSql, [req.params.id, limit, offset]),
      db.one<any>(
        `SELECT (
          1
          + (SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1)
          + (SELECT COUNT(*) FROM posts WHERE user_id = $1)
          + (SELECT COUNT(*) FROM comments WHERE user_id = $1)
          + (SELECT COUNT(*) FROM community_members WHERE user_id = $1)
          + (SELECT COUNT(*) FROM event_attendees WHERE user_id = $1)
          + (SELECT COUNT(*) FROM college_verifications WHERE user_id = $1)
          + (SELECT COUNT(*) FROM reports r WHERE
              (r.entity_type = 'user' AND r.entity_id = $1)
              OR (r.entity_type = 'post' AND EXISTS (
                SELECT 1 FROM posts p WHERE p.id = r.entity_id AND p.user_id = $1
              ))
              OR (r.entity_type = 'comment' AND EXISTS (
                SELECT 1 FROM comments c WHERE c.id = r.entity_id AND c.user_id = $1
              )))
          + (SELECT COUNT(*) FROM moderation_actions ma WHERE
              (ma.target_type = 'user' AND ma.target_id = $1)
              OR (ma.target_type = 'post' AND EXISTS (
                SELECT 1 FROM posts p WHERE p.id = ma.target_id AND p.user_id = $1
              )))
          + (SELECT COUNT(*) FROM college_verifications WHERE user_id = $1 AND reviewed_at IS NOT NULL)
        )::int AS count`,
        [req.params.id],
      ),
    ])
    return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0) })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminUsersV1Router.post('/bulk', requireAdminPermission(OWNER_MUTATION_PERMISSION), async (req, res) => {
  const action = textBody(req.body?.action, 40).toLowerCase()
  const ids = Array.from(new Set(
    (Array.isArray(req.body?.user_ids) ? req.body.user_ids : Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map((id: unknown) => textBody(id, 200))
      .filter(Boolean),
  )).slice(0, MAX_PAGE_SIZE)
  const supported = new Set(['ban', 'suspend', 'warn', 'verify', 'delete', 'restore', 'broadcast', 'logout'])
  if (!supported.has(action)) {
    return adminFailure(res, req, 400, 'BULK_ACTION_INVALID', 'Bulk action must be ban, suspend, warn, verify, delete, restore, broadcast, or logout.')
  }
  if (!ids.length) return adminFailure(res, req, 400, 'USER_IDS_REQUIRED', 'At least one user id is required.')
  const mappedAction = action === 'logout' ? 'logout-all' : action
  const reason = textBody(req.body?.reason, 2000)
  if (action === 'broadcast' && !textBody(req.body?.message ?? req.body?.body, 10000)) {
    return adminFailure(res, req, 400, 'BROADCAST_MESSAGE_REQUIRED', 'A broadcast message is required.')
  }
  if (REASON_REQUIRED.has(mappedAction) && !reason) {
    return adminFailure(res, req, 400, 'MODERATION_REASON_REQUIRED', 'A reason is required for this bulk action.')
  }
  try {
    const result = await withTransaction(async (tx) => {
      const updated: any[] = []
      const notFound: string[] = []
      for (const id of ids) {
        if (action === 'broadcast') {
          const target = await tx.one<any>('SELECT id FROM users WHERE id = $1 FOR UPDATE', [id])
          if (!target) {
            notFound.push(id)
            continue
          }
          await tx.run(
            `INSERT INTO notifications (id, user_id, type, entity_type, content, extra_data)
             VALUES ($1,$2,'admin_broadcast','admin_bulk',$3,$4)`,
            [uuidv4(), id, textBody(req.body?.message ?? req.body?.body, 10000), JSON.stringify({ title: textBody(req.body?.title, 200), reason })],
          )
          await recordAdminAudit(req, {
            action: 'user.broadcast',
            resourceType: 'user',
            resourceId: id,
            reason,
            after: { notified: true },
          }, tx)
          updated.push({ id, notified: true })
        } else {
          const user = await mutateUser(tx, req, id, mappedAction, reason)
          if (user) updated.push(user)
          else notFound.push(id)
        }
      }
      return { updated, not_found: notFound }
    })
    return adminSuccess(res, req, {
      action,
      requested: ids.length,
      updated: result.updated,
      not_found: result.not_found,
    })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminUserNotesV1Router.patch('/:id', requireAdminPermission(OWNER_MUTATION_PERMISSION), async (req, res) => {
  const body = textBody(req.body?.body ?? req.body?.note, 10000)
  if (!body) return adminFailure(res, req, 400, 'NOTE_BODY_REQUIRED', 'Note body is required.')
  try {
    const note = await withTransaction(async (tx) => {
      const before = await tx.one<any>(
        'SELECT id, user_id, body FROM admin_user_notes WHERE id = $1 FOR UPDATE',
        [req.params.id],
      )
      if (!before) return null
      const updated = await tx.one<any>(
        `UPDATE admin_user_notes SET body = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, user_id, admin_id, body, created_at, updated_at`,
        [body, req.params.id],
      )
      await recordAdminAudit(req, {
        action: 'user.note.update',
        resourceType: 'user',
        resourceId: before.user_id,
        before: { action: 'updated' },
        after: { action: 'updated' },
      }, tx)
      return updated
    })
    if (!note) return adminFailure(res, req, 404, 'NOTE_NOT_FOUND', 'Admin note not found.')
    return adminSuccess(res, req, note)
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminUserNotesV1Router.delete('/:id', requireAdminPermission(OWNER_MUTATION_PERMISSION), async (req, res) => {
  try {
    const deleted = await withTransaction(async (tx) => {
      const before = await tx.one<any>(
        'SELECT id, user_id FROM admin_user_notes WHERE id = $1 FOR UPDATE',
        [req.params.id],
      )
      if (!before) return null
      await tx.run('DELETE FROM admin_user_notes WHERE id = $1', [req.params.id])
      await recordAdminAudit(req, {
        action: 'user.note.delete',
        resourceType: 'user',
        resourceId: before.user_id,
        before: { action: 'present' },
        after: { action: 'deleted' },
      }, tx)
      return before
    })
    if (!deleted) return adminFailure(res, req, 404, 'NOTE_NOT_FOUND', 'Admin note not found.')
    return adminSuccess(res, req, { note_id: req.params.id, deleted: true })
  } catch (error) {
    return internalError(res, req, error)
  }
})