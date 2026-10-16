// @ts-nocheck
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { db, withTransaction } from '../legacy-db/index.js'
import { requireAdminPanel, requireAdminPermission } from '../legacy-middleware/auth.js'
import {
  adminFailure,
  adminSuccess,
  permissionsForRole,
  recordAdminAudit,
  recordModerationAction,
} from '../legacy-services/adminSecurity.js'
import { recordEnforcement } from '../legacy-services/enforcement.js'
import { createUserWarning, UserWarningValidationError } from '../legacy-services/userWarnings.js'
import { mediaAssetId } from '../legacy-services/media.js'
import { readStoredMedia } from '../legacy-services/supabaseStorage.js'
import { emitUserNotification } from '../legacy-socket/io.js'
import { getMaintenanceState, setMaintenanceState } from '../legacy-services/maintenance.js'
import { DEFAULT_PLAY_STORE_URL, getAppUpdateState, setAppUpdateState } from '../legacy-services/appUpdate.js'

export const adminPlatformV1Router = Router()
adminPlatformV1Router.use(requireAdminPanel)

const MAX_PAGE_SIZE = 100
const REPORT_CATEGORIES = new Set([
  'spam', 'scam', 'harassment', 'violence', 'adult_content', 'fake_account',
  'impersonation', 'self_harm', 'drugs', 'weapons', 'copyright', 'hate_speech',
  'misinformation', 'other',
])
const APPEAL_STATUSES = new Set(['pending', 'assigned', 'under_review', 'need_more_information', 'approved', 'rejected', 'expired'])
const CONTENT_TYPES = new Set(['post', 'comment', 'group', 'event', 'media'])
const RESTRICTIONS = new Set(['messaging', 'posting', 'comments', 'events', 'groups', 'read_only'])
const SHADOWBAN_KEYS = new Set(['feed_visibility', 'search_visibility', 'discover_visibility', 'group_visibility', 'comment_visibility', 'event_visibility'])
const ADMIN_ROLES = new Set([
  'owner', 'super_admin', 'trust_safety_lead', 'moderator', 'verification_team',
  'verification_reviewer', 'support_agent', 'support', 'community_manager',
  'analytics', 'read_only', 'analyst',
])
const ADMIN_STATUSES = new Set(['invited', 'active', 'disabled', 'deleted'])

function pageParams(req: any) {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(String(req.query.limit || req.query.pageSize || '20'), 10) || 20))
  return { page, limit, offset: (page - 1) * limit }
}

function text(value: unknown, max = 2000) {
  return String(value ?? '').trim().slice(0, max)
}

adminPlatformV1Router.get('/users/:id/enforcement-history', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const values: any[] = [req.params.id]
    const filters = ['eh.user_id = $1']
    const add = (sql: string, value: any) => { values.push(value); filters.push(sql.replace('$N', `$${values.length}`)) }
    if (req.query.active !== undefined) add('eh.is_active = $N', bool(req.query.active, false) ? 1 : 0)
    if (req.query.removed !== undefined) add('eh.is_removed = $N', bool(req.query.removed, false) ? 1 : 0)
    if (req.query.temporary !== undefined) filters.push(bool(req.query.temporary, false) ? 'eh.expires_at IS NOT NULL' : 'eh.expires_at IS NULL')
    if (req.query.action_type) add('eh.action_type = $N', text(req.query.action_type, 100))
    if (req.query.moderator) add('eh.moderator_id = $N', text(req.query.moderator, 200))
    if (req.query.from) add('eh.created_at >= $N', req.query.from)
    if (req.query.to) add('eh.created_at <= $N', req.query.to)
    const where = filters.join(' AND ')
    const items = await db.all(`SELECT eh.* FROM enforcement_history eh WHERE ${where} ORDER BY eh.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limit, offset])
    const total = await db.one<any>(`SELECT COUNT(*)::int AS count FROM enforcement_history eh WHERE ${where}`, values)
    return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0) })
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/users/:id/enforcement-summary', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const user = await db.one<any>(`SELECT id, is_banned, is_suspended, is_shadowbanned, warnings_count, is_college_verified,
      (SELECT COUNT(*)::int FROM appeals a WHERE a.user_id = u.id AND a.status NOT IN ('approved','rejected','expired')) AS open_appeals,
      (SELECT COUNT(*)::int FROM enforcement_history eh WHERE eh.user_id = u.id) AS previous_enforcement_count,
      (SELECT created_at FROM enforcement_history eh WHERE eh.user_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_enforcement
      FROM users u WHERE u.id = $1`, [req.params.id])
    if (!user) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    const [restrictions, activeWarnings, expiredWarnings, trustScore] = await Promise.all([
      db.all('SELECT * FROM user_restrictions WHERE user_id = $1 ORDER BY created_at DESC', [req.params.id]),
      db.all(`SELECT * FROM user_warnings WHERE user_id = $1 AND removed_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC`, [req.params.id]),
      db.all(`SELECT * FROM user_warnings WHERE user_id = $1 AND removed_at IS NULL AND expires_at IS NOT NULL AND expires_at <= NOW() ORDER BY created_at DESC`, [req.params.id]),
      db.one<any>('SELECT score, factors, calculated_at FROM user_trust_scores WHERE user_id = $1', [req.params.id]),
    ])
    return adminSuccess(res, req, { ...user, current_restrictions: restrictions, active_warnings: activeWarnings, expired_warnings: expiredWarnings, trust_score: trustScore || { score: 50, factors: '{}', calculated_at: null } })
  } catch (error) { return internalError(res, req, error) }
})

function parseJson(value: unknown, fallback: any = {}) {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(String(value)) } catch { return fallback }
}

function bool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function dateOrNull(value: unknown) {
  const valueText = text(value, 80)
  if (!valueText) return null
  const date = new Date(valueText)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function internalError(res: any, req: any, error: any) {
  console.error('[admin platform v1]', req.method, req.originalUrl, error?.message || error)
  return adminFailure(res, req, 500, 'ADMIN_INTERNAL_ERROR', 'The admin request could not be completed.')
}

function requireReason(req: any, res: any) {
  const reason = text(req.body?.reason, 2000)
  if (!reason) {
    adminFailure(res, req, 400, 'MODERATION_REASON_REQUIRED', 'A reason is required for this action.')
    return null
  }
  return reason
}

async function listWithCount(req: any, res: any, itemsSql: string, countSql: string, params: any[], meta: Record<string, any> = {}) {
  const { page, limit, offset } = pageParams(req)
  const [items, total] = await Promise.all([
    db.all(itemsSql, [...params, limit, offset]),
    db.one<any>(countSql, params),
  ])
  return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0), ...meta })
}

async function getContent(contentType: string, id: string, executor: Pick<typeof db, 'one'> = db) {
  if (contentType === 'post') return executor.one<any>('SELECT id, user_id, content, visibility, created_at FROM posts WHERE id = $1', [id])
  if (contentType === 'comment') return executor.one<any>('SELECT id, user_id, post_id, content, created_at FROM comments WHERE id = $1', [id])
  if (contentType === 'comment_submission') return executor.one<any>(
    `SELECT a.id, a.user_id, a.post_id, a.category, a.severity, a.decision,
            a.confidence, a.intent, a.reason, a.created_at, mc.summary AS submitted_comment_for_review
     FROM comment_moderation_decisions a
     LEFT JOIN moderation_cases mc ON mc.target_type = 'comment_submission' AND mc.target_id = a.id
     WHERE a.id = $1`,
    [id],
  )
  if (contentType === 'group') return executor.one<any>('SELECT id, created_by AS user_id, name, description, created_at FROM communities WHERE id = $1 OR slug = $1', [id])
  if (contentType === 'event') return executor.one<any>('SELECT id, organizer_id AS user_id, title, description, created_at FROM events WHERE id = $1', [id])
  if (contentType === 'media') return executor.one<any>('SELECT id, owner_id AS user_id, mime_type, original_name, created_at FROM media_assets WHERE id = $1', [id])
  return null
}

async function grantCommentResubmission(tx: any, input: {
  attempt: any
  moderatorId: string
  authorityType: 'appeal' | 'moderation_case'
  authorityId: string
  reason: string
}) {
  const actionId = uuidv4()
  const overrideId = uuidv4()
  await tx.run(
    `INSERT INTO moderation_actions
      (id,admin_id,action,target_type,target_id,reason,before_summary,after_summary,metadata)
     VALUES ($1,$2,'comment.approved_draft_resubmission','comment_submission',$3,$4,'{}','{}',$5)`,
    [
      actionId, input.moderatorId, input.attempt.id, input.reason,
      JSON.stringify({
        authority_type: input.authorityType,
        authority_id: input.authorityId,
        content_hash: input.attempt.content_hash,
        expires_in_hours: 24,
        automated: false,
      }),
    ],
  )
  await tx.run(
    `INSERT INTO comment_moderation_overrides
      (id,user_id,post_id,parent_id,target_comment_id,operation,content_hash,
       authority_type,authority_id,moderation_action_id,approved_by,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW() + INTERVAL '24 hours')`,
    [
      overrideId, input.attempt.user_id, input.attempt.post_id,
      input.attempt.parent_id || null, input.attempt.target_comment_id || null,
      input.attempt.operation, input.attempt.content_hash,
      input.authorityType, input.authorityId, actionId, input.moderatorId,
    ],
  )
  return { id: overrideId, moderationActionId: actionId }
}

// ─── Expanded user safety controls ───────────────────────────────────────────

adminPlatformV1Router.get('/users/:id/warnings', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const user = await db.one('SELECT id FROM users WHERE id = $1', [req.params.id])
    if (!user) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    const items = await db.all(
      `SELECT id, level, category, reason, evidence, linked_report_id, issued_by,
         expires_at, removed_at, removed_by, removal_reason, created_at
       FROM user_warnings WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.params.id],
    )
    return adminSuccess(res, req, items)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.post('/users/:id/warnings', requireAdminPermission('users.moderate'), async (req, res) => {
  try {
    const result = await createUserWarning(req, req.params.id, req.body)
    if (!result) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    return adminSuccess(res, req, result.warning)
  } catch (error) {
    if (error instanceof UserWarningValidationError) {
      return adminFailure(res, req, 400, error.code, error.message)
    }
    return internalError(res, req, error)
  }
})

adminPlatformV1Router.delete('/users/:id/warnings/:warningId', requireAdminPermission('users.moderate'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  try {
    const result = await withTransaction(async (tx) => {
      const before = await tx.one<any>(
        'SELECT id, user_id, level, reason, removed_at FROM user_warnings WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [req.params.warningId, req.params.id],
      )
      if (!before) return null
      const after = await tx.one<any>(
        `UPDATE user_warnings SET removed_at = NOW(), removed_by = $1, removal_reason = $2
         WHERE id = $3 RETURNING id, user_id, removed_at, removed_by, removal_reason`,
        [req.admin!.adminId, reason, req.params.warningId],
      )
      await tx.run('UPDATE users SET warnings_count = GREATEST(0, COALESCE(warnings_count, 0) - 1), updated_at = NOW() WHERE id = $1', [req.params.id])
      await recordModerationAction(req, { action: 'user.warning.remove', targetType: 'user', targetId: req.params.id, reason, before, after }, tx)
      await recordAdminAudit(req, { action: 'user.warning.remove', resourceType: 'user_warning', resourceId: req.params.warningId, reason, before, after }, tx)
      await recordEnforcement(req, tx, { userId: req.params.id, actionType: 'Warning Removed', before, after, reason, active: false, removed: true })
      return after
    })
    if (!result) return adminFailure(res, req, 404, 'WARNING_NOT_FOUND', 'Warning not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/users/:id/restrictions', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const items = await db.all(
      `SELECT id, restriction_type, reason, issued_by, expires_at, removed_at, removed_by, created_at
       FROM user_restrictions WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.params.id],
    )
    return adminSuccess(res, req, items)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.put('/users/:id/restrictions/:restrictionType', requireAdminPermission('users.moderate'), async (req, res) => {
  const restrictionType = text(req.params.restrictionType, 40).toLowerCase()
  const reason = requireReason(req, res)
  if (!reason) return
  if (!RESTRICTIONS.has(restrictionType)) return adminFailure(res, req, 400, 'RESTRICTION_INVALID', 'Unsupported restriction type.')
  try {
    const result = await withTransaction(async (tx) => {
      const user = await tx.one('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!user) return null
      const restriction = await tx.one<any>(
        `INSERT INTO user_restrictions (id, user_id, restriction_type, reason, issued_by, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id, restriction_type) WHERE removed_at IS NULL
         DO UPDATE SET reason = EXCLUDED.reason, issued_by = EXCLUDED.issued_by, expires_at = EXCLUDED.expires_at
         RETURNING id, user_id, restriction_type, reason, issued_by, expires_at, created_at`,
        [uuidv4(), req.params.id, restrictionType, reason, req.admin!.adminId, dateOrNull(req.body?.expires_at)],
      )
      await recordModerationAction(req, { action: `user.restriction.${restrictionType}`, targetType: 'user', targetId: req.params.id, reason, after: restriction }, tx)
      await recordAdminAudit(req, { action: `user.restriction.${restrictionType}`, resourceType: 'user', resourceId: req.params.id, reason, after: restriction }, tx)
      await recordEnforcement(req, tx, { userId: req.params.id, actionType: `${restrictionType === 'read_only' ? 'Read Only' : restrictionType[0].toUpperCase() + restrictionType.slice(1)} Restriction`, after: restriction, reason, expiresAt: restriction.expires_at })
      return restriction
    })
    if (!result) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.delete('/users/:id/restrictions/:restrictionType', requireAdminPermission('users.moderate'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  try {
    const result = await withTransaction(async (tx) => {
      const before = await tx.one<any>(
        'SELECT * FROM user_restrictions WHERE user_id = $1 AND restriction_type = $2 AND removed_at IS NULL FOR UPDATE',
        [req.params.id, req.params.restrictionType],
      )
      if (!before) return null
      const after = await tx.one<any>(
        `UPDATE user_restrictions SET removed_at = NOW(), removed_by = $1
         WHERE id = $2 RETURNING id, user_id, restriction_type, removed_at, removed_by`,
        [req.admin!.adminId, before.id],
      )
      await recordModerationAction(req, { action: 'user.restriction.remove', targetType: 'user', targetId: req.params.id, reason, before, after }, tx)
      await recordAdminAudit(req, { action: 'user.restriction.remove', resourceType: 'user_restriction', resourceId: before.id, reason, before, after }, tx)
      await recordEnforcement(req, tx, { userId: req.params.id, actionType: `${before.restriction_type === 'read_only' ? 'Read Only' : before.restriction_type[0].toUpperCase() + before.restriction_type.slice(1)} Restriction Removed`, before, after, reason, active: false, removed: true })
      return after
    })
    if (!result) return adminFailure(res, req, 404, 'RESTRICTION_NOT_FOUND', 'Active restriction not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.patch('/users/:id/shadowban', requireAdminPermission('users.moderate'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  const requested = req.body?.controls && typeof req.body.controls === 'object' ? req.body.controls : {}
  const controls = Object.fromEntries([...SHADOWBAN_KEYS].map((key) => [key, bool(requested[key], false)]))
  try {
    const result = await withTransaction(async (tx) => {
      const user = await tx.one('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!user) return null
      const existing = await tx.one<any>(
        'SELECT * FROM user_shadowban_controls WHERE user_id = $1 FOR UPDATE',
        [req.params.id],
      )
      const mergedControls = Object.fromEntries([...SHADOWBAN_KEYS].map((key) => [
        key,
        requested[key] === undefined ? Boolean(existing?.[key]) : Boolean(requested[key]),
      ]))
      const after = await tx.one<any>(
        `INSERT INTO user_shadowban_controls
          (user_id, feed_visibility, search_visibility, discover_visibility, group_visibility, comment_visibility, event_visibility, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id) DO UPDATE SET
           feed_visibility = EXCLUDED.feed_visibility, search_visibility = EXCLUDED.search_visibility,
           discover_visibility = EXCLUDED.discover_visibility, group_visibility = EXCLUDED.group_visibility,
           comment_visibility = EXCLUDED.comment_visibility, event_visibility = EXCLUDED.event_visibility,
           updated_by = EXCLUDED.updated_by, updated_at = NOW()
         RETURNING *`,
        [req.params.id, mergedControls.feed_visibility ? 1 : 0, mergedControls.search_visibility ? 1 : 0, mergedControls.discover_visibility ? 1 : 0, mergedControls.group_visibility ? 1 : 0, mergedControls.comment_visibility ? 1 : 0, mergedControls.event_visibility ? 1 : 0, req.admin!.adminId],
      )
      const shadowbanned = Object.values(mergedControls).some(Boolean)
      await tx.run('UPDATE users SET is_shadowbanned = $1, updated_at = NOW() WHERE id = $2', [shadowbanned ? 1 : 0, req.params.id])
      await recordModerationAction(req, { action: 'user.shadowban.controls.update', targetType: 'user', targetId: req.params.id, reason, after }, tx)
      await recordAdminAudit(req, { action: 'user.shadowban.controls.update', resourceType: 'user', resourceId: req.params.id, reason, after }, tx)
      await recordEnforcement(req, tx, { userId: req.params.id, actionType: Object.values(mergedControls).some(Boolean) ? 'Shadowban' : 'Shadowban Removed', after, reason, active: Object.values(mergedControls).some(Boolean), removed: !Object.values(mergedControls).some(Boolean) })
      return { ...after, is_shadowbanned: shadowbanned ? 1 : 0 }
    })
    if (!result) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.post('/users/:id/restore', requireAdminPermission('users.manage'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  try {
    const user = await withTransaction(async (tx) => {
      const before = await tx.one<any>('SELECT id, is_deactivated, is_suspended, is_banned FROM users WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!before) return null
      const after = await tx.one<any>(
        `UPDATE users SET is_deactivated = 0, deactivated_at = NULL, deactivation_reason = '',
           is_suspended = 0, is_banned = 0, updated_at = NOW()
         WHERE id = $1 RETURNING id, is_deactivated, is_suspended, is_banned, updated_at`,
        [req.params.id],
      )
      await recordAdminAudit(req, { action: 'user.restore', resourceType: 'user', resourceId: req.params.id, reason, before, after }, tx)
      await recordModerationAction(req, { action: 'user.restore', targetType: 'user', targetId: req.params.id, reason, before, after }, tx)
      await recordEnforcement(req, tx, { userId: req.params.id, actionType: 'Account Restored', before, after, reason, active: false, removed: true })
      return after
    })
    if (!user) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    return adminSuccess(res, req, user)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.post('/users/:id/password-reset', requireAdminPermission('users.manage'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  try {
    const result = await withTransaction(async (tx) => {
      const user = await tx.one<any>('SELECT id, email FROM users WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!user) return null
      const temporaryPassword = text(req.body?.temporary_password, 100) || `${uuidv4().replace(/-/g, '').slice(0, 16)}!aA1`
      const passwordHash = await bcrypt.hash(temporaryPassword, 12)
      await tx.run('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, req.params.id])
      await tx.run('DELETE FROM refresh_tokens WHERE user_id = $1', [req.params.id])
      await recordAdminAudit(req, { action: 'user.password_reset', resourceType: 'user', resourceId: req.params.id, reason, after: { sessions_revoked: true } }, tx)
      await recordEnforcement(req, tx, { userId: req.params.id, actionType: 'Password Reset', after: { sessions_revoked: true }, reason, active: false })
      return { user_id: user.id, email: user.email, sessions_revoked: true, temporary_password: temporaryPassword }
    })
    if (!result) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

// ─── Trust & Safety cases and appeals ────────────────────────────────────────

adminPlatformV1Router.get('/cases', requireAdminPermission('cases.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const status = text(req.query.status, 40)
    const category = text(req.query.category, 60)
    const values: any[] = []
    const filters: string[] = []
    if (status) { values.push(status); filters.push(`mc.status = $${values.length}`) }
    if (category) { values.push(category); filters.push(`mc.category = $${values.length}`) }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const items = await db.all(
      `SELECT mc.*, r.reason AS report_reason, r.description AS report_description,
         COALESCE(u.username, attempted_author.username) AS target_username,
         COALESCE(u.full_name, attempted_author.full_name) AS target_name
       FROM moderation_cases mc
       LEFT JOIN reports r ON r.id = mc.report_id
       LEFT JOIN users u ON u.id = mc.target_id AND mc.target_type = 'user'
       LEFT JOIN comment_moderation_decisions attempted ON attempted.id = mc.target_id
          AND mc.target_type = 'comment_submission'
       LEFT JOIN users attempted_author ON attempted_author.id = attempted.user_id
       ${where} ORDER BY mc.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    )
    const total = await db.one<any>(`SELECT COUNT(*)::int AS count FROM moderation_cases mc ${where}`, values)
    return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0), status: status || 'all', category: category || 'all' })
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/cases/:id', requireAdminPermission('cases.read'), async (req, res) => {
  try {
    const item = await db.one<any>('SELECT * FROM moderation_cases WHERE id = $1', [req.params.id])
    if (!item) return adminFailure(res, req, 404, 'CASE_NOT_FOUND', 'Moderation case not found.')
    const [notes, actions, reports, appeals, submissionAttempt, submissionCase] = await Promise.all([
      db.all('SELECT * FROM moderation_case_notes WHERE case_id = $1 ORDER BY created_at DESC', [req.params.id]),
      db.all('SELECT * FROM moderation_actions WHERE target_id = $1 ORDER BY created_at DESC', [item.target_id]),
      db.all('SELECT * FROM reports WHERE id = $1 OR (entity_type = $2 AND entity_id = $3) ORDER BY created_at DESC', [item.report_id || '', item.target_type, item.target_id]),
      db.all('SELECT * FROM appeals WHERE case_id = $1 ORDER BY created_at DESC', [req.params.id]),
      item.target_type === 'comment_submission'
        ? db.one<any>(
            `SELECT id,user_id,post_id,parent_id,target_comment_id,operation,
                    category,severity,decision,created_at
             FROM comment_moderation_decisions WHERE id = $1`,
            [item.target_id],
          )
        : Promise.resolve(null),
      item.target_type === 'comment_submission'
        ? db.one<any>('SELECT summary,status FROM moderation_cases WHERE id = $1', [req.params.id])
        : Promise.resolve(null),
    ])
    const submission = submissionAttempt
      ? {
          ...submissionAttempt,
          content_text: String(submissionCase?.summary || '')
            .replace(/^Comment submitted for human review:\s*/i, '')
            .slice(0, 2000),
          review_resolution: submissionCase?.status === 'resolved'
            ? 'approved'
            : submissionCase?.status === 'dismissed'
              ? 'rejected'
              : null,
        }
      : null
    return adminSuccess(res, req, { ...item, notes, actions, reports, appeals, submission })
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.patch('/cases/:id/comment-review', requireAdminPermission('cases.manage'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  const decision = text(req.body?.decision, 30).toLowerCase()
  if (!['approved', 'rejected'].includes(decision)) {
    return adminFailure(res, req, 400, 'COMMENT_REVIEW_DECISION_INVALID', 'Choose approved or rejected for this held comment.')
  }
  try {
    const result = await withTransaction(async (tx) => {
      const item = await tx.one<any>('SELECT * FROM moderation_cases WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!item) return { error: 'CASE_NOT_FOUND' as const }
      if (item.target_type !== 'comment_submission') return { error: 'CASE_NOT_COMMENT_SUBMISSION' as const }
      if (['resolved', 'dismissed'].includes(item.status)) return { error: 'CASE_ALREADY_DECIDED' as const }
      const attempt = await tx.one<any>(
        `SELECT id,user_id,post_id,parent_id,target_comment_id,operation,content_hash,
                decision,category,severity,appeal_status,restriction_id
         FROM comment_moderation_decisions
         WHERE id = $1 AND decision IN ('BLOCK','HUMAN_REVIEW')
         FOR UPDATE`,
        [item.target_id],
      )
      if (!attempt) return { error: 'COMMENT_ATTEMPT_NOT_FOUND' as const }
      const sourceAction = await tx.one<any>(
        `SELECT id FROM moderation_actions
         WHERE id = $1 AND action IN ('comment.block','comment.human_review')
           AND target_id = $2`,
        [attempt.id, attempt.target_comment_id || attempt.id],
      )
      if (!sourceAction) return { error: 'COMMENT_ACTION_NOT_CURRENT' as const }

      let override: any = null
      if (decision === 'approved') {
        override = await grantCommentResubmission(tx, {
          attempt,
          moderatorId: req.admin!.adminId,
          authorityType: 'moderation_case',
          authorityId: item.id,
          reason,
        })
        await tx.run(
          `UPDATE comment_moderation_decisions SET appeal_status = 'approved' WHERE id = $1`,
          [attempt.id],
        )
        if (attempt.restriction_id) {
          const removed = await tx.one<any>(
            `UPDATE user_restrictions SET removed_at = NOW(), removed_by = $1
             WHERE id = $2 AND user_id = $3 AND restriction_type = 'comments'
               AND removed_at IS NULL RETURNING id`,
            [req.admin!.adminId, attempt.restriction_id, attempt.user_id],
          )
          if (removed) {
            await tx.run(
              `INSERT INTO enforcement_history
                (id,user_id,action_type,reason,internal_notes,moderator_id,
                 removed_at,removed_by,removal_reason,is_removed)
               VALUES ($1,$2,'comment.temporary_restriction.review_reversal',$3,$4,$5,NOW(),$5,$6,1)`,
              [
                uuidv4(), attempt.user_id,
                'A moderator removed the temporary comments-only restriction linked to an approved held-comment review.',
                JSON.stringify({ restriction_id: removed.id, case_id: item.id, moderation_action_id: attempt.id }),
                req.admin!.adminId, reason,
              ],
            )
          }
        }
      } else {
        await tx.run(
          `UPDATE comment_moderation_decisions SET appeal_status = 'rejected' WHERE id = $1`,
          [attempt.id],
        )
      }

      const nextStatus = decision === 'approved' ? 'resolved' : 'dismissed'
      const updated = await tx.one<any>(
        `UPDATE moderation_cases
         SET status = $1, resolved_by = $2, resolved_at = NOW(), updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [nextStatus, req.admin!.adminId, item.id],
      )
      await recordAdminAudit(req, {
        action: `comment_submission.case.${decision}`,
        resourceType: 'moderation_case',
        resourceId: item.id,
        reason,
        before: item,
        after: { ...updated, decision, resubmission_required: decision === 'approved' },
      }, tx)
      await tx.run(
        `INSERT INTO notifications (id,user_id,type,entity_id,entity_type,content)
         VALUES ($1,$2,'moderation',$3,'appeal',$4)`,
        [
          uuidv4(), attempt.user_id, attempt.id,
          decision === 'approved'
            ? 'A moderator approved your appeal to resubmit this exact comment draft. It was not published automatically; please resubmit it for moderation.'
            : 'A moderator reviewed your held comment and decided it cannot be resubmitted.',
        ],
      )
      return { ...updated, decision, override_expires_in_hours: override ? 24 : null }
    })
    if (result.error === 'CASE_NOT_FOUND') return adminFailure(res, req, 404, 'CASE_NOT_FOUND', 'Moderation case not found.')
    if (result.error === 'CASE_NOT_COMMENT_SUBMISSION') return adminFailure(res, req, 400, 'CASE_NOT_COMMENT_SUBMISSION', 'This case does not contain a held comment.')
    if (result.error === 'CASE_ALREADY_DECIDED') return adminFailure(res, req, 409, 'CASE_ALREADY_DECIDED', 'This held comment case already has a final decision.')
    if (result.error === 'COMMENT_ATTEMPT_NOT_FOUND') return adminFailure(res, req, 404, 'COMMENT_ATTEMPT_NOT_FOUND', 'The held comment decision is no longer available.')
    if (result.error === 'COMMENT_ACTION_NOT_CURRENT') return adminFailure(res, req, 409, 'COMMENT_ACTION_NOT_CURRENT', 'The comment decision is no longer current.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.post('/cases', requireAdminPermission('cases.manage'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  const targetType = text(req.body?.target_type, 30)
  const targetId = text(req.body?.target_id, 200)
  const category = text(req.body?.category, 60).toLowerCase() || 'other'
  if (!targetType || !targetId) return adminFailure(res, req, 400, 'CASE_TARGET_REQUIRED', 'target_type and target_id are required.')
  if (!REPORT_CATEGORIES.has(category)) return adminFailure(res, req, 400, 'REPORT_CATEGORY_INVALID', 'Unsupported moderation category.')
  try {
    const result = await withTransaction(async (tx) => {
      const target = await getContent(targetType, targetId, tx)
      if (!target) return null
      const id = uuidv4()
      const item = await tx.one<any>(
        `INSERT INTO moderation_cases
          (id, report_id, case_type, category, target_type, target_id, priority, summary, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [id, text(req.body?.report_id, 200) || null, text(req.body?.case_type, 40) || 'manual', category, targetType, targetId, text(req.body?.priority, 20) || 'normal', reason, req.admin!.adminId],
      )
      await recordAdminAudit(req, { action: 'case.create', resourceType: 'moderation_case', resourceId: id, reason, after: item }, tx)
      return item
    })
    if (!result) return adminFailure(res, req, 404, 'CONTENT_NOT_FOUND', 'Target content not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.patch('/cases/:id', requireAdminPermission('cases.manage'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  const allowedStatuses = new Set(['open', 'assigned', 'under_review', 'resolved', 'dismissed', 'escalated'])
  const status = text(req.body?.status, 30).toLowerCase()
  const disposition = text(req.body?.disposition ?? req.body?.resolution ?? req.body?.decision, 30).toLowerCase()
  try {
    const result = await withTransaction(async (tx) => {
      const before = await tx.one<any>('SELECT * FROM moderation_cases WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!before) return null
      const isCommentSubmission = before.target_type === 'comment_submission'
      if (isCommentSubmission && ['resolved', 'dismissed'].includes(before.status)) {
        return { error: 'COMMENT_CASE_ALREADY_DECIDED' as const }
      }
      if (
        isCommentSubmission &&
        ['resolved', 'dismissed'].includes(status) &&
        !['approve', 'reject'].includes(disposition)
      ) return { error: 'COMMENT_DISPOSITION_REQUIRED' as const }
      if (
        isCommentSubmission &&
        ((disposition === 'approve' && status !== 'resolved') ||
          (disposition === 'reject' && status !== 'dismissed'))
      ) return { error: 'COMMENT_DISPOSITION_STATUS_MISMATCH' as const }

      const nextStatus = status && allowedStatuses.has(status) ? status : before.status
      let attempt: any = null
      if (isCommentSubmission && ['approve', 'reject'].includes(disposition)) {
        attempt = await tx.one<any>(
          `SELECT id,user_id,post_id,parent_id,target_comment_id,operation,content_hash,
                  decision,category,severity,appeal_status,restriction_id
           FROM comment_moderation_decisions
           WHERE id = $1
           FOR UPDATE`,
          [before.target_id],
        )
        if (!attempt) return { error: 'COMMENT_ATTEMPT_NOT_FOUND' as const }
        if (disposition === 'approve') {
          await grantCommentResubmission(tx, {
            attempt,
            moderatorId: req.admin!.adminId,
            authorityType: 'moderation_case',
            authorityId: before.id,
            reason,
          })
          await tx.run(
            `UPDATE comment_moderation_decisions SET appeal_status = 'approved'
             WHERE id = $1`,
            [attempt.id],
          )
          if (attempt.restriction_id) {
            const removed = await tx.one<any>(
              `UPDATE user_restrictions SET removed_at = NOW(), removed_by = $1
               WHERE id = $2 AND user_id = $3 AND restriction_type = 'comments'
                 AND removed_at IS NULL RETURNING id`,
              [req.admin!.adminId, attempt.restriction_id, attempt.user_id],
            )
            if (removed) {
              await tx.run(
                `INSERT INTO enforcement_history
                  (id,user_id,action_type,reason,internal_notes,moderator_id,
                   removed_at,removed_by,removal_reason,is_removed)
                 VALUES ($1,$2,'comment.temporary_restriction.appeal_reversal',$3,$4,$5,NOW(),$5,$6,1)`,
                [
                  uuidv4(), attempt.user_id,
                  'A moderator removed the temporary comments-only restriction after approving the linked review.',
                  JSON.stringify({ restriction_id: removed.id, case_id: before.id, moderation_action_id: attempt.id }),
                  req.admin!.adminId, reason,
                ],
              )
            }
          }
        } else {
          await tx.run(
            `UPDATE comment_moderation_decisions SET appeal_status = 'rejected' WHERE id = $1`,
            [attempt.id],
          )
        }
      }
      const after = await tx.one<any>(
        `UPDATE moderation_cases SET status = $1, priority = COALESCE(NULLIF($2,''), priority),
           assigned_to = COALESCE(NULLIF($3,''), assigned_to),
           escalation_level = COALESCE($4, escalation_level),
           resolved_by = CASE WHEN $1 IN ('resolved','dismissed') THEN $5 ELSE resolved_by END,
           resolved_at = CASE WHEN $1 IN ('resolved','dismissed') THEN NOW() ELSE resolved_at END,
           updated_at = NOW() WHERE id = $6 RETURNING *`,
        [nextStatus, text(req.body?.priority, 20), text(req.body?.assigned_to, 200), req.body?.escalation_level === undefined ? null : Number(req.body.escalation_level), req.admin!.adminId, req.params.id],
      )
      await recordAdminAudit(req, {
        action: isCommentSubmission ? `comment_submission.case.${disposition || 'update'}` : 'case.update',
        resourceType: 'moderation_case',
        resourceId: req.params.id,
        reason,
        before,
        after: { ...after, ...(disposition ? { disposition, draft_requires_user_resubmission: disposition === 'approve' } : {}) },
      }, tx)
      return { ...after, ...(disposition ? { disposition, draft_requires_user_resubmission: disposition === 'approve' } : {}) }
    })
    if (!result) return adminFailure(res, req, 404, 'CASE_NOT_FOUND', 'Moderation case not found.')
    if (result.error === 'COMMENT_DISPOSITION_REQUIRED') {
      return adminFailure(res, req, 400, 'COMMENT_DISPOSITION_REQUIRED', 'Choose an approve or reject disposition to resolve a held comment case.')
    }
    if (result.error === 'COMMENT_DISPOSITION_STATUS_MISMATCH') {
      return adminFailure(res, req, 400, 'COMMENT_DISPOSITION_STATUS_MISMATCH', 'Approved comment cases must be resolved and rejected cases must be dismissed.')
    }
    if (result.error === 'COMMENT_ATTEMPT_NOT_FOUND') {
      return adminFailure(res, req, 404, 'COMMENT_ATTEMPT_NOT_FOUND', 'The held comment decision is no longer available.')
    }
    if (result.error === 'COMMENT_CASE_ALREADY_DECIDED') {
      return adminFailure(res, req, 409, 'COMMENT_CASE_ALREADY_DECIDED', 'The held comment case already has a final moderator disposition.')
    }
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.post('/cases/:id/notes', requireAdminPermission('cases.manage'), async (req, res) => {
  const body = text(req.body?.body ?? req.body?.note, 10000)
  if (!body) return adminFailure(res, req, 400, 'NOTE_BODY_REQUIRED', 'Note body is required.')
  try {
    const result = await withTransaction(async (tx) => {
      const item = await tx.one('SELECT id FROM moderation_cases WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!item) return null
      const note = await tx.one<any>(
        'INSERT INTO moderation_case_notes (id, case_id, admin_id, body) VALUES ($1,$2,$3,$4) RETURNING *',
        [uuidv4(), req.params.id, req.admin!.adminId, body],
      )
      await recordAdminAudit(req, { action: 'case.note.create', resourceType: 'moderation_case', resourceId: req.params.id, after: { note_id: note.id } }, tx)
      return note
    })
    if (!result) return adminFailure(res, req, 404, 'CASE_NOT_FOUND', 'Moderation case not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/appeals', requireAdminPermission('appeals.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const status = text(req.query.status, 40)
    const params = status ? [status] : []
    const where = status ? 'WHERE a.status = $1' : ''
    const items = await db.all(
      `SELECT a.*, u.username, u.full_name, mc.category,
         COALESCE(ma.target_type, mc.target_type) AS target_type,
         COALESCE(ma.target_id, mc.target_id) AS target_id,
         p.type AS post_type, p.content AS post_content
       FROM appeals a JOIN users u ON u.id = a.user_id
       LEFT JOIN moderation_cases mc ON mc.id = a.case_id
       LEFT JOIN moderation_actions ma ON ma.id = a.moderation_action_id
       LEFT JOIN posts p ON p.id = ma.target_id AND ma.target_type = 'post'
       ${where} ORDER BY a.submitted_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    )
    const total = await db.one<any>(`SELECT COUNT(*)::int AS count FROM appeals a ${where}`, params)
    return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0), status: status || 'all' })
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/appeals/:id', requireAdminPermission('appeals.read'), async (req, res) => {
  try {
    const appeal = await db.one<any>(
      `SELECT a.*, u.username, u.full_name FROM appeals a JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
      [req.params.id],
    )
    if (!appeal) return adminFailure(res, req, 404, 'APPEAL_NOT_FOUND', 'Appeal not found.')
    const history = await db.all('SELECT * FROM appeal_history WHERE appeal_id = $1 ORDER BY created_at DESC', [req.params.id])
    return adminSuccess(res, req, { ...appeal, history })
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.patch('/appeals/:id', requireAdminPermission('appeals.manage'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  const status = text(req.body?.status, 40).toLowerCase()
  if (!APPEAL_STATUSES.has(status)) return adminFailure(res, req, 400, 'APPEAL_STATUS_INVALID', 'Unsupported appeal status.')
  const decision = text(req.body?.decision, 5000) || (
    status === 'rejected'
      ? 'We reviewed your appeal and our decision remains the same.'
      : status === 'approved'
        ? 'We reviewed your appeal and restored the affected content or account access.'
        : ''
  )
  try {
    const result = await withTransaction(async (tx) => {
      const before = await tx.one<any>('SELECT * FROM appeals WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!before) return null
      if (['approved', 'rejected', 'expired'].includes(before.status)) {
        return { error: 'APPEAL_ALREADY_DECIDED' as const }
      }
      const linkedAction = before.moderation_action_id
        ? await tx.one<any>(
          'SELECT id, action, target_type, target_id, reason FROM moderation_actions WHERE id = $1',
          [before.moderation_action_id],
        )
        : null
      let contentTarget: any = null
      let commentTarget: any = null
      const commentSubmissionAttempt = linkedAction?.action?.startsWith('comment.')
        ? await tx.one<any>(
            `SELECT id, user_id, post_id, parent_id, target_comment_id, operation, content_hash,
                    decision, category, severity, appeal_status, restriction_id
             FROM comment_moderation_decisions
             WHERE id = $1 AND user_id = $2 FOR UPDATE`,
            [linkedAction.id, before.user_id],
          )
        : null
      if (linkedAction?.target_type === 'post' && String(linkedAction.action || '').startsWith('content.')) {
        contentTarget = await tx.one<any>(
          'SELECT id, user_id FROM posts WHERE id = $1 AND user_id = $2 FOR UPDATE',
          [linkedAction.target_id, before.user_id],
        )
      }
      if (linkedAction?.target_type === 'comment' && String(linkedAction.action || '').startsWith('content.')) {
        commentTarget = await tx.one<any>(
          `SELECT c.id, c.user_id, c.post_id, c.parent_id
           FROM comments c
           WHERE c.id = $1 AND c.user_id = $2 FOR UPDATE`,
          [linkedAction.target_id, before.user_id],
        )
      }
      const latestContentAction = contentTarget
        ? await tx.one<any>(
          `SELECT id, action FROM moderation_actions
           WHERE target_type = 'post' AND target_id = $1
             AND action IN ('content.hide','content.delete','content.restore','content.unhide')
           ORDER BY created_at DESC LIMIT 1`,
          [contentTarget.id],
        )
        : null
      const latestCommentAction = commentTarget
        ? await tx.one<any>(
            `SELECT id, action FROM moderation_actions
             WHERE target_type = 'comment' AND target_id = $1
               AND action IN ('content.hide','content.delete','content.restore','content.unhide')
             ORDER BY created_at DESC LIMIT 1`,
            [commentTarget.id],
          )
        : null
      if (
        status === 'approved' &&
        contentTarget &&
        ['content.hide', 'content.delete'].includes(linkedAction.action) &&
        latestContentAction?.id !== linkedAction.id
      ) return { error: 'CONTENT_ACTION_SUPERSEDED' as const }
      if (
        status === 'approved' &&
        commentTarget &&
        ['content.hide', 'content.delete'].includes(linkedAction.action) &&
        latestCommentAction?.id !== linkedAction.id
      ) return { error: 'CONTENT_ACTION_SUPERSEDED' as const }
      if (status === 'approved' && contentTarget && ['content.hide', 'content.delete'].includes(linkedAction.action)) {
        await tx.run(
          `UPDATE posts SET moderation_status = 'approved', discovery_restricted = 0, updated_at = NOW()
           WHERE id = $1 AND user_id = $2`,
          [contentTarget.id, before.user_id],
        )
        await tx.run(
          `UPDATE content_moderation
           SET status = 'active', is_hidden = 0, deleted_at = NULL, restored_at = NOW(),
               reason = 'Restored after approved owner appeal', updated_at = NOW()
           WHERE content_type = 'post' AND content_id = $1`,
          [contentTarget.id],
        )
        await recordAdminAudit(req, {
          action: 'content.appeal.restore',
          resourceType: 'post',
          resourceId: contentTarget.id,
          reason,
          before: { moderation_action_id: linkedAction.id, action: linkedAction.action },
          after: { moderation_status: 'approved', discovery_restricted: 0 },
        }, tx)
      } else if (status === 'approved' && commentTarget && ['content.hide', 'content.delete'].includes(linkedAction.action)) {
        const currentModeration = await tx.one<any>(
          `SELECT * FROM content_moderation
           WHERE content_type = 'comment' AND content_id = $1 FOR UPDATE`,
          [commentTarget.id],
        )
        await tx.run(
          `UPDATE content_moderation
           SET status = 'active', is_hidden = 0, deleted_at = NULL,
               reason = 'Restored after approved owner appeal', updated_at = NOW(), restored_at = NOW()
           WHERE content_type = 'comment' AND content_id = $1`,
          [commentTarget.id],
        )
        if (!commentTarget.parent_id && (currentModeration?.is_hidden || ['hidden', 'deleted'].includes(currentModeration?.status))) {
          await tx.run('UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1', [commentTarget.post_id])
        }
        await recordAdminAudit(req, {
          action: 'content.appeal.restore',
          resourceType: 'comment',
          resourceId: commentTarget.id,
          reason,
          before: { moderation_action_id: linkedAction.id, action: linkedAction.action },
          after: { comment_visibility: 'active' },
        }, tx)
      } else if (status === 'approved' && commentSubmissionAttempt) {
        // A review/appeal cannot publish an intercepted draft: its original
        // composer session has ended, so approval grants a short-lived,
        // one-use resubmission allowance for this exact draft and target.
        await grantCommentResubmission(tx, {
          attempt: commentSubmissionAttempt,
          moderatorId: req.admin!.adminId,
          authorityType: 'appeal',
          authorityId: before.id,
          reason,
        })
        await tx.run(
          `UPDATE comment_moderation_decisions SET appeal_status = 'approved' WHERE id = $1 AND user_id = $2`,
          [commentSubmissionAttempt.id, before.user_id],
        )
        if (commentSubmissionAttempt.restriction_id) {
          const removedRestriction = await tx.one<any>(
            `UPDATE user_restrictions
             SET removed_at = NOW(), removed_by = $1
             WHERE id = $2 AND user_id = $3 AND restriction_type = 'comments'
               AND issued_by = 'system:comment-moderation'
               AND removed_at IS NULL
             RETURNING id, expires_at`,
            [req.admin!.adminId, commentSubmissionAttempt.restriction_id, before.user_id],
          )
          if (removedRestriction) {
            await tx.run(
              `INSERT INTO enforcement_history
                (id,user_id,action_type,reason,internal_notes,moderator_id,removed_at,removed_by,removal_reason,is_removed)
               VALUES ($1,$2,'comment.temporary_restriction.appeal_reversal',$3,$4,$5,NOW(),$5,$6,1)`,
              [
                uuidv4(), before.user_id,
                'A moderator removed the temporary comments-only restriction after approving the linked comment moderation appeal.',
                JSON.stringify({ restriction_id: removedRestriction.id, linked_moderation_action_id: commentSubmissionAttempt.id }),
                req.admin!.adminId, reason,
              ],
            )
          }
        }
        await tx.run(
          `UPDATE moderation_cases SET status = 'dismissed', resolved_by = $1,
             resolved_at = NOW(), updated_at = NOW()
           WHERE target_type = 'comment_submission' AND target_id = $2 AND status NOT IN ('resolved','dismissed')`,
          [req.admin!.adminId, commentSubmissionAttempt.id],
        )
        await recordAdminAudit(req, {
          action: 'comment_submission.appeal.resolve',
          resourceType: 'comment_submission',
          resourceId: commentSubmissionAttempt.id,
          reason,
          before: { appeal_status: commentSubmissionAttempt.appeal_status },
          after: { appeal_status: 'approved', resubmission_required: true },
        }, tx)
      } else if (status === 'rejected' && commentSubmissionAttempt) {
        await tx.run(
          `UPDATE comment_moderation_decisions SET appeal_status = 'rejected' WHERE id = $1 AND user_id = $2`,
          [commentSubmissionAttempt.id, before.user_id],
        )
      } else if (
        status === 'approved' &&
        linkedAction?.target_type === 'user' &&
        ['user.suspend', 'user.ban'].includes(linkedAction.action)
      ) {
        const latestSanctionAction = await tx.one<any>(
          `SELECT id,action FROM moderation_actions
           WHERE target_type = 'user' AND target_id = $1
             AND action IN ('user.suspend','user.ban','user.unsuspend','user.unban')
           ORDER BY created_at DESC,id DESC LIMIT 1`,
          [before.user_id],
        )
        if (latestSanctionAction?.id !== linkedAction.id) {
          return { error: 'USER_ACTION_SUPERSEDED' as const }
        }
        const account = await tx.one<any>(
          `SELECT id,is_suspended,is_banned,suspension_reason,ban_reason
           FROM users WHERE id = $1 FOR UPDATE`,
          [before.user_id],
        )
        const isSuspension = linkedAction.action === 'user.suspend'
        const isActive = isSuspension ? account?.is_suspended : account?.is_banned
        const currentReason = isSuspension ? account?.suspension_reason : account?.ban_reason
        if (
          !isActive ||
          String(currentReason || '') !== String(linkedAction.reason || '')
        ) return { error: 'USER_ACTION_NOT_CURRENT' as const }
        await tx.run(
          isSuspension
            ? `UPDATE users SET is_suspended = 0, suspension_reason = '', updated_at = NOW() WHERE id = $1`
            : `UPDATE users SET is_banned = 0, ban_reason = '', updated_at = NOW() WHERE id = $1`,
          [before.user_id],
        )
      } else if (status === 'approved' && linkedAction?.target_type === 'user') {
        return { error: 'USER_ACTION_NOT_CURRENT' as const }
      }
      const after = await tx.one<any>(
        `UPDATE appeals SET status = $1, moderator_notes = COALESCE(NULLIF($2,''), moderator_notes),
           decision = COALESCE(NULLIF($3,''), decision), assigned_to = COALESCE(NULLIF($4,''), assigned_to),
           decided_at = CASE WHEN $1 IN ('approved','rejected','expired') THEN NOW() ELSE decided_at END,
           updated_at = NOW() WHERE id = $5 RETURNING *`,
        [status, text(req.body?.moderator_notes, 5000), decision, text(req.body?.assigned_to, 200), req.params.id],
      )
      await tx.run(
        `INSERT INTO appeal_history (id, appeal_id, from_status, to_status, notes, admin_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [uuidv4(), req.params.id, before.status, status, reason, req.admin!.adminId],
      )
      await recordAdminAudit(req, { action: 'appeal.update', resourceType: 'appeal', resourceId: req.params.id, reason, before, after }, tx)
      let notification: any = null
      if (['approved', 'rejected'].includes(status)) {
        const appealEntity = contentTarget
          ? { id: contentTarget.id, type: 'post' }
          : commentTarget
            ? { id: commentTarget.id, type: 'comment' }
            : { id: req.params.id, type: 'appeal' }
        notification = {
          id: uuidv4(),
          user_id: before.user_id,
          entity_id: appealEntity.id,
          entity_type: appealEntity.type,
          content: commentSubmissionAttempt
            ? (status === 'approved'
              ? 'Your appeal was approved. The held comment was not published automatically; you may resubmit the exact draft once within 24 hours for a fresh moderation check.'
              : 'Your comment moderation appeal was not approved.')
            : commentTarget
              ? (status === 'approved'
                ? 'Your comment was restored after your appeal was approved.'
                : 'Your comment moderation appeal was not approved.')
              : contentTarget
                ? (status === 'approved' ? 'Your post was restored after your appeal was approved.' : 'Your post moderation appeal was not approved.')
                : (status === 'approved' ? 'Your account appeal was approved.' : 'Your account appeal was not approved.'),
        }
        await tx.run(
          `INSERT INTO notifications (id, user_id, type, entity_id, entity_type, content)
            VALUES ($1,$2,'moderation',$3,$4,$5)`,
          [notification.id, notification.user_id, notification.entity_id, notification.entity_type, notification.content],
        )
      }
      return { ...after, notification }
    })
    if (!result) return adminFailure(res, req, 404, 'APPEAL_NOT_FOUND', 'Appeal not found.')
    if (result.error === 'CONTENT_ACTION_SUPERSEDED') {
      return adminFailure(res, req, 409, 'CONTENT_ACTION_SUPERSEDED', 'The post has a newer moderation action and cannot be restored by this appeal.')
    }
    if (result.error === 'USER_ACTION_SUPERSEDED') {
      return adminFailure(res, req, 409, 'USER_ACTION_SUPERSEDED', 'This account sanction has been superseded by a newer moderation action.')
    }
    if (result.error === 'USER_ACTION_NOT_CURRENT') {
      return adminFailure(res, req, 409, 'USER_ACTION_NOT_CURRENT', 'The linked account sanction is no longer active or current.')
    }
    if (result.notification) {
      emitUserNotification(result.notification.user_id, {
        ...result.notification,
        type: 'moderation',
        is_read: 0,
        created_at: new Date().toISOString(),
      })
      delete result.notification
    }
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

// ─── Content moderation ──────────────────────────────────────────────────────

adminPlatformV1Router.get('/content/post/:id', requireAdminPermission('content.read'), async (req, res) => {
  try {
    const post = await db.one<any>(
      `SELECT p.id, p.user_id, p.type, p.content, p.media, p.cover_url, p.created_at,
              p.visibility, p.moderation_status
       FROM posts p WHERE p.id = $1`,
      [req.params.id],
    )
    if (!post) return adminFailure(res, req, 404, 'CONTENT_NOT_FOUND', 'Post not found.')
    const assets = await db.all<any>(
      `SELECT id, mime_type FROM media_assets
       WHERE entity_id = $1
         AND purpose IN ('post_media','post_cover','clip_media','clip_cover','glimpse','glimpse-cover')
       ORDER BY created_at ASC`,
      [post.id],
    )
    const mediaItems = new Map<string, any>()
    for (const asset of assets) mediaItems.set(asset.id, { id: asset.id, mime_type: asset.mime_type })
    const mediaValues = (() => { try { return typeof post.media === 'string' ? JSON.parse(post.media) : (post.media || []) } catch { return [] } })()
    for (const media of Array.isArray(mediaValues) ? mediaValues : []) {
      const id = mediaAssetId(typeof media === 'string' ? media : (media?.url || media?.uri || media?.src))
      if (id && !mediaItems.has(id)) {
        const asset = await db.one<any>(
          `SELECT id, mime_type FROM media_assets WHERE id = $1 AND entity_id = $2
           AND purpose IN ('post_media','clip_media','glimpse')`,
          [id, post.id],
        )
        if (asset) mediaItems.set(asset.id, { id: asset.id, mime_type: asset.mime_type })
      }
    }
    const coverId = mediaAssetId(post.cover_url)
    if (coverId && !mediaItems.has(coverId)) {
      const cover = await db.one<any>(
        `SELECT id, mime_type FROM media_assets WHERE id = $1 AND entity_id = $2
         AND purpose IN ('post_cover','clip_cover','glimpse-cover')`,
        [coverId, post.id],
      )
      if (cover) mediaItems.set(cover.id, { id: cover.id, mime_type: cover.mime_type })
    }
    const moderation = await db.one<any>(
      `SELECT status, is_hidden, reason FROM content_moderation WHERE content_type = 'post' AND content_id = $1`,
      [post.id],
    )
    return adminSuccess(res, req, {
      id: post.id,
      type: post.type,
      content: post.content,
      created_at: post.created_at,
      visibility: post.visibility,
      moderation_status: post.moderation_status,
      media: [...mediaItems.values()],
      moderation: moderation || { status: 'active', is_hidden: 0, reason: '' },
    })
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/content/post/:id/media/:assetId', requireAdminPermission('content.read'), async (req, res) => {
  try {
    const asset = await db.one<any>(
      `SELECT ma.id, ma.mime_type, ma.byte_size, ma.storage_bucket, ma.storage_path, ma.storage_status, ma.data
       FROM media_assets ma JOIN posts p ON p.id = ma.entity_id
       WHERE ma.id = $1 AND ma.entity_id = $2
         AND ma.purpose IN ('post_media','post_cover','clip_media','clip_cover','glimpse','glimpse-cover')`,
      [req.params.assetId, req.params.id],
    )
    if (!asset || (!String(asset.mime_type || '').startsWith('image/') && !String(asset.mime_type || '').startsWith('video/'))) {
      return adminFailure(res, req, 404, 'MEDIA_NOT_FOUND', 'Post media not found.')
    }
    let bytes: Buffer
    if (asset.storage_status === 'storage_ready' && asset.storage_bucket && asset.storage_path) {
      bytes = await readStoredMedia(asset.storage_bucket, asset.storage_path)
    } else {
      bytes = asset.data
    }
    const total = bytes.length
    let start = 0
    let end = total - 1
    const rangeHeader = req.headers.range
    if (rangeHeader) {
      if (!String(asset.mime_type).startsWith('video/')) {
        res.setHeader('Content-Range', `bytes */${total}`)
        return res.status(416).end()
      }
      const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim())
      if (!match || (!match[1] && !match[2])) {
        res.setHeader('Content-Range', `bytes */${total}`)
        return res.status(416).end()
      }
      if (match[1]) {
        start = Number(match[1])
        end = match[2] ? Number(match[2]) : total - 1
      } else {
        const suffix = Number(match[2])
        start = Math.max(0, total - suffix)
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= total || start > end) {
        res.setHeader('Content-Range', `bytes */${total}`)
        return res.status(416).end()
      }
      end = Math.min(end, total - 1)
      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
    }
    res.setHeader('Content-Type', asset.mime_type)
    res.setHeader('Content-Length', String(end - start + 1))
    res.setHeader('Accept-Ranges', String(asset.mime_type).startsWith('video/') ? 'bytes' : 'none')
    res.setHeader('Cache-Control', 'private, no-store')
    return res.send(bytes.subarray(start, end + 1))
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/content-moderation', requireAdminPermission('content.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const type = text(req.query.content_type, 30)
    const status = text(req.query.status, 30)
    const values: any[] = []
    const filters: string[] = []
    if (type && CONTENT_TYPES.has(type)) { values.push(type); filters.push(`cm.content_type = $${values.length}`) }
    if (status) { values.push(status); filters.push(`cm.status = $${values.length}`) }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const items = await db.all(
      `SELECT cm.*, u.username, u.full_name
        ,c.content AS comment_content
       FROM content_moderation cm
       LEFT JOIN posts p ON p.id = cm.content_id AND cm.content_type = 'post'
       LEFT JOIN comments c ON c.id = cm.content_id AND cm.content_type = 'comment'
       LEFT JOIN users u ON u.id = COALESCE(p.user_id, c.user_id, cm.updated_by)
       ${where} ORDER BY cm.updated_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    )
    const total = await db.one<any>(`SELECT COUNT(*)::int AS count FROM content_moderation cm ${where}`, values)
    return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0) })
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.patch('/content/:contentType/:id', requireAdminPermission('content.moderate'), async (req, res) => {
  const contentType = text(req.params.contentType, 30).toLowerCase()
  if (!CONTENT_TYPES.has(contentType)) return adminFailure(res, req, 400, 'CONTENT_TYPE_INVALID', 'Unsupported content type.')
  const reason = requireReason(req, res)
  if (!reason) return
  const action = text(req.body?.action, 30).toLowerCase()
  const validActions = new Set(['delete', 'restore', 'hide', 'unhide', 'flag', 'unflag', 'age_restrict', 'sensitive_flag', 'note'])
  if (!validActions.has(action)) return adminFailure(res, req, 400, 'CONTENT_ACTION_INVALID', 'Unsupported content moderation action.')
  try {
    const result = await withTransaction(async (tx) => {
      const target = await getContent(contentType, req.params.id, tx)
      if (!target) return null
      let lockedPost: any = null
      let lockedComment: any = null
      if (contentType === 'post') {
        lockedPost = await tx.one<any>('SELECT id, user_id, moderation_status, discovery_restricted FROM posts WHERE id = $1 FOR UPDATE', [req.params.id])
        if (!lockedPost) return null
      } else if (contentType === 'comment') {
        lockedComment = await tx.one<any>(
          'SELECT id, user_id, post_id, parent_id FROM comments WHERE id = $1 FOR UPDATE',
          [req.params.id],
        )
        if (!lockedComment) return null
      }
      const before = await tx.one<any>('SELECT * FROM content_moderation WHERE content_type = $1 AND content_id = $2 FOR UPDATE', [contentType, req.params.id])
      const isPostDeleted = contentType === 'post' && (
        lockedPost.moderation_status === 'deleted' || before?.status === 'deleted'
      )
      if (contentType === 'post' && action === 'hide' && isPostDeleted) {
        return { error: 'POST_ALREADY_DELETED' }
      }
      if (contentType === 'post' && action === 'unhide' && isPostDeleted) {
        return { error: 'POST_ALREADY_DELETED' }
      }
      const wasCommentHidden = Boolean(before?.is_hidden || ['hidden', 'deleted'].includes(before?.status))
      if (contentType === 'comment' && action === 'unhide' && wasCommentHidden && before?.status === 'deleted') {
        return { error: 'COMMENT_ALREADY_DELETED' }
      }
      const actionState: Record<string, any> = {
        status: action === 'delete' ? 'deleted' : action === 'hide' ? 'hidden' : action === 'restore' || action === 'unhide' ? 'active' : undefined,
        is_hidden: action === 'hide' ? 1 : action === 'delete' || action === 'restore' || action === 'unhide' ? 0 : undefined,
        is_flagged: action === 'flag' ? 1 : action === 'unflag' ? 0 : undefined,
        age_restricted: action === 'age_restrict' ? 1 : undefined,
        sensitive_flag: action === 'sensitive_flag' ? (text(req.body?.sensitive_flag, 100) || 'sensitive') : undefined,
        moderator_notes: action === 'note' ? text(req.body?.moderator_notes, 10000) : undefined,
      }
      const after = await tx.one<any>(
        `INSERT INTO content_moderation
          (content_type, content_id, status, is_hidden, is_flagged, age_restricted, sensitive_flag, moderator_notes, reason, updated_by, deleted_at, restored_at)
         VALUES ($1,$2,COALESCE($3,'active'),COALESCE($4,0),COALESCE($5,0),COALESCE($6,0),COALESCE($7,''),COALESCE($8,''),$9,$10,
            CASE WHEN $3 = 'deleted' THEN NOW() ELSE NULL END,
            CASE WHEN $3 = 'active' AND $11 IN ('restore', 'unhide') THEN NOW() ELSE NULL END)
         ON CONFLICT (content_type, content_id) DO UPDATE SET
           status = COALESCE($3, content_moderation.status),
           is_hidden = COALESCE($4, content_moderation.is_hidden),
           is_flagged = COALESCE($5, content_moderation.is_flagged),
           age_restricted = COALESCE($6, content_moderation.age_restricted),
           sensitive_flag = COALESCE($7, content_moderation.sensitive_flag),
           moderator_notes = COALESCE($8, content_moderation.moderator_notes),
           reason = $9, updated_by = $10, updated_at = NOW(),
            deleted_at = CASE WHEN $3 = 'deleted' THEN NOW() WHEN $11 IN ('restore', 'unhide') THEN NULL ELSE content_moderation.deleted_at END,
            restored_at = CASE WHEN $11 IN ('restore', 'unhide') THEN NOW() ELSE content_moderation.restored_at END
         RETURNING *`,
        [contentType, req.params.id, actionState.status ?? null, actionState.is_hidden ?? null, actionState.is_flagged ?? null, actionState.age_restricted ?? null, actionState.sensitive_flag ?? null, actionState.moderator_notes ?? null, reason, req.admin!.adminId, action],
      )
      if (contentType === 'post') {
        if (action === 'hide') {
          await tx.run(`UPDATE posts SET moderation_status = 'hidden', discovery_restricted = 1, updated_at = NOW() WHERE id = $1`, [req.params.id])
        } else if (action === 'delete') {
          await tx.run(`UPDATE posts SET moderation_status = 'deleted', discovery_restricted = 1, updated_at = NOW() WHERE id = $1`, [req.params.id])
        } else if (action === 'restore') {
          await tx.run(`UPDATE posts SET moderation_status = 'approved', discovery_restricted = 0, updated_at = NOW() WHERE id = $1`, [req.params.id])
        } else if (action === 'unhide') {
          await tx.run(`UPDATE posts SET moderation_status = 'approved', discovery_restricted = 0, updated_at = NOW() WHERE id = $1`, [req.params.id])
        }
      } else if (contentType === 'comment') {
        const hidesComment = action === 'hide' || action === 'delete'
        const restoresComment = action === 'restore' || action === 'unhide'
        if (!lockedComment.parent_id && hidesComment && !wasCommentHidden) {
          await tx.run('UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1', [lockedComment.post_id])
        } else if (!lockedComment.parent_id && restoresComment && wasCommentHidden) {
          await tx.run('UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1', [lockedComment.post_id])
        }
      }
      await recordModerationAction(req, { action: `content.${action}`, targetType: contentType, targetId: req.params.id, reason, before, after }, tx)
      await recordAdminAudit(req, { action: `content.${action}`, resourceType: contentType, resourceId: req.params.id, reason, before, after }, tx)
      if (['post', 'comment'].includes(contentType) && ['hide', 'delete', 'restore', 'unhide'].includes(action)) {
        const entityType = contentType
        const notificationId = uuidv4()
        const notificationContent = action === 'delete'
          ? contentType === 'comment' ? 'Your comment was removed by a moderator.' : 'Your post was removed by a moderator.'
          : action === 'hide'
            ? contentType === 'comment' ? 'Your comment was hidden by a moderator.' : 'Your post was hidden by a moderator.'
            : contentType === 'comment' ? 'Your comment was restored by a moderator.' : 'Your post was restored by a moderator.'
        await tx.run(
          `INSERT INTO notifications (id, user_id, type, entity_id, entity_type, content)
           VALUES ($1,$2,'moderation',$3,$4,$5)`,
          [notificationId, target.user_id, req.params.id, entityType, notificationContent],
        )
        return { ...after, notification: { id: notificationId, user_id: target.user_id, entity_id: req.params.id, entity_type: entityType, content: notificationContent } }
      }
      return after
    })
    if (!result) return adminFailure(res, req, 404, 'CONTENT_NOT_FOUND', 'Content not found.')
    if (result.error === 'POST_ALREADY_DELETED') {
      return adminFailure(res, req, 409, 'POST_ALREADY_DELETED', 'A deleted post cannot be hidden or unhidden. Restore it first.')
    }
    if (result.notification) {
      emitUserNotification(result.notification.user_id, {
        ...result.notification,
        type: 'moderation',
        is_read: 0,
        created_at: new Date().toISOString(),
      })
      delete result.notification
    }
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

// ─── Verification workflow ───────────────────────────────────────────────────

adminPlatformV1Router.get('/verification-requests', requireAdminPermission('verifications.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const type = text(req.query.type, 40)
    const status = text(req.query.status, 40) || 'pending'
    const values: any[] = [status]
    const typeClause = type ? 'AND vr.verification_type = $2' : ''
    if (type) values.push(type)
    const rows = await db.all(
      `SELECT vr.*, u.username, u.full_name, u.email, u.college_name
       FROM verification_requests vr JOIN users u ON u.id = vr.user_id
       WHERE vr.status = $1 ${typeClause}
       ORDER BY vr.submitted_at ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    )
    const items = rows.map((row: any) => {
      const documents = parseJson(row.documents, [])
      const hasId = Array.isArray(documents) && documents.some((item: any) => String(item?.kind || '').toLowerCase() === 'id')
      const hasSelfie = Array.isArray(documents) && documents.some((item: any) => String(item?.kind || '').toLowerCase() === 'selfie')
      const { documents: _documents, ...safeRow } = row
      return {
        ...safeRow,
        has_id_photo: hasId,
        has_selfie: hasSelfie,
        media: {
          id: hasId ? `/api/v1/admin/verification-requests/${row.id}/media/id` : null,
          selfie: hasSelfie ? `/api/v1/admin/verification-requests/${row.id}/media/selfie` : null,
        },
      }
    })
    const total = await db.one<any>(`SELECT COUNT(*)::int AS count FROM verification_requests vr WHERE vr.status = $1 ${typeClause}`, values)
    return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0), status })
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/verification-requests/:id/timeline', requireAdminPermission('verifications.read'), async (req, res) => {
  try {
    const request = await db.one('SELECT id FROM verification_requests WHERE id = $1', [req.params.id])
    if (!request) return adminFailure(res, req, 404, 'VERIFICATION_NOT_FOUND', 'Verification request not found.')
    const events = await db.all('SELECT * FROM verification_events WHERE verification_id = $1 ORDER BY created_at ASC', [req.params.id])
    return adminSuccess(res, req, events)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/verification-requests/:id/media/:kind', requireAdminPermission('verifications.review'), async (req, res) => {
  try {
    const kind = text(req.params.kind, 20).toLowerCase()
    if (!['id', 'selfie'].includes(kind)) return adminFailure(res, req, 400, 'MEDIA_KIND_INVALID', 'Media kind must be id or selfie.')
    const row = await db.one<any>(
      `SELECT vr.documents, cv.id_photo_url, cv.selfie_url
       FROM verification_requests vr
       LEFT JOIN college_verifications cv ON cv.id = vr.id
       WHERE vr.id = $1`,
      [req.params.id],
    )
    if (!row) return adminFailure(res, req, 404, 'VERIFICATION_NOT_FOUND', 'Verification request not found.')
    const documents = parseJson(row.documents, [])
    const document = Array.isArray(documents)
      ? documents.find((item: any) => String(item?.kind || item?.type || '').toLowerCase() === kind)
      : null
    const mediaUrl = document?.url || (kind === 'id' ? row.id_photo_url : row.selfie_url)
    const assetId = mediaAssetId(mediaUrl)
    if (!assetId) return adminFailure(res, req, 404, 'MEDIA_NOT_FOUND', 'Verification media not found.')
    const asset = await db.one<any>(
      `SELECT ma.mime_type, ma.byte_size, ma.checksum
       FROM media_assets ma
       WHERE ma.id = $1 AND ma.purpose = $2`,
      [assetId, kind === 'id' ? 'verification_id_photo' : 'verification_selfie'],
    )
    if (!asset) return adminFailure(res, req, 404, 'MEDIA_NOT_FOUND', 'Verification media not found.')
    await recordAdminAudit(req, {
      action: 'verification.media.view',
      resourceType: 'verification_request',
      resourceId: req.params.id,
      reason: kind,
    })
    const etag = `"${asset.checksum}"`
    const cacheControl = 'private, max-age=0, must-revalidate'
    // Metadata (including checksum) is fetched above without touching the
    // bytea column. A matching revalidation returns 304 here without ever
    // selecting `data`, avoiding repeat egress on the same admin re-viewing
    // a verification photo.
    if (req.headers['if-none-match'] === etag) {
      res.setHeader('Cache-Control', cacheControl)
      res.setHeader('ETag', etag)
      return res.status(304).end()
    }
    const bytes = await db.one<any>(`SELECT data FROM media_assets WHERE id = $1`, [assetId])
    res.setHeader('Content-Type', asset.mime_type || 'application/octet-stream')
    res.setHeader('Content-Length', String(asset.byte_size))
    res.setHeader('Cache-Control', cacheControl)
    res.setHeader('ETag', etag)
    return res.send(bytes?.data)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.patch('/verification-requests/:id', requireAdminPermission('verifications.review'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  const status = text(req.body?.status, 40).toLowerCase()
  if (!['approved', 'rejected', 'need_more_documents'].includes(status)) return adminFailure(res, req, 400, 'VERIFICATION_STATUS_INVALID', 'Status must be approved, rejected, or need_more_documents.')
  try {
    const result = await withTransaction(async (tx) => {
      const before = await tx.one<any>('SELECT * FROM verification_requests WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!before) return null
      const after = await tx.one<any>(
        `UPDATE verification_requests SET status = $1, notes = $2, reviewer_id = $3,
           reviewed_at = CASE WHEN $1 IN ('approved','rejected') THEN NOW() ELSE reviewed_at END, updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [status, reason, req.admin!.adminId, req.params.id],
      )
      await tx.run(
        `INSERT INTO verification_events (id, verification_id, from_status, to_status, verification_type, notes, admin_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [uuidv4(), req.params.id, before.status, status, before.verification_type, reason, req.admin!.adminId],
      )
      await tx.run(
        `UPDATE college_verifications SET status = $1, review_notes = $2, reviewer_id = $3,
           reviewed_at = CASE WHEN $1 IN ('approved','rejected') THEN NOW() ELSE NULL END
         WHERE id = $4`,
        [status, reason, req.admin!.adminId, req.params.id],
      )
      if (before.verification_type === 'student') {
        await tx.run(
          `UPDATE users SET is_college_verified = $1, verification_status = $2, updated_at = NOW() WHERE id = $3`,
          [status === 'approved' ? 1 : 0, status, before.user_id],
        )
      }
      await recordAdminAudit(req, { action: `verification.${status}`, resourceType: 'verification_request', resourceId: req.params.id, reason, before, after }, tx)
      return after
    })
    if (!result) return adminFailure(res, req, 404, 'VERIFICATION_NOT_FOUND', 'Verification request not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

// ─── Reports and search ───────────────────────────────────────────────────────

adminPlatformV1Router.get('/reports/queue', requireAdminPermission('reports.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const status = text(req.query.status, 40) || 'pending'
    const items = await db.all(
      `SELECT r.*, reporter.username AS reporter_username, reporter.full_name AS reporter_name,
         ra.admin_id AS assigned_admin, mc.id AS case_id, mc.status AS case_status
       FROM reports r JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN LATERAL (
         SELECT admin_id FROM report_assignments WHERE report_id = r.id AND unassigned_at IS NULL ORDER BY created_at DESC LIMIT 1
       ) ra ON TRUE
       LEFT JOIN moderation_cases mc ON mc.report_id = r.id
       WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
      [status, limit, offset],
    )
    const total = await db.one<any>('SELECT COUNT(*)::int AS count FROM reports WHERE status = $1', [status])
    return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0), status })
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.patch('/reports/:id/workflow', requireAdminPermission('reports.review'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  const status = text(req.body?.status, 40).toLowerCase()
  if (!['pending', 'reviewed', 'dismissed', 'resolved'].includes(status)) return adminFailure(res, req, 400, 'REPORT_STATUS_INVALID', 'Invalid report status.')
  try {
    const result = await withTransaction(async (tx) => {
      const before = await tx.one<any>('SELECT * FROM reports WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!before) return null
      const after = await tx.one<any>('UPDATE reports SET status = $1, reviewed_by = $2 WHERE id = $3 RETURNING *', [status, req.admin!.adminId, req.params.id])
      if (req.body?.assign_to) {
        await tx.run('UPDATE report_assignments SET unassigned_at = NOW() WHERE report_id = $1 AND unassigned_at IS NULL', [req.params.id])
        await tx.run('INSERT INTO report_assignments (id, report_id, admin_id, assigned_by) VALUES ($1,$2,$3,$4)', [uuidv4(), req.params.id, text(req.body.assign_to, 200), req.admin!.adminId])
      }
      if (req.body?.escalate) {
        await tx.run(
          `INSERT INTO moderation_cases (id, report_id, category, target_type, target_id, priority, summary, created_by)
           VALUES ($1,$2,$3,$4,$5,'high',$6,$7)
           ON CONFLICT (report_id) DO UPDATE SET status = 'escalated', escalation_level = moderation_cases.escalation_level + 1, updated_at = NOW()`,
          [uuidv4(), req.params.id, REPORT_CATEGORIES.has(String(before.reason).toLowerCase()) ? String(before.reason).toLowerCase() : 'other', before.entity_type, before.entity_id, reason, req.admin!.adminId],
        )
      }
      await recordAdminAudit(req, { action: `report.${status}`, resourceType: 'report', resourceId: req.params.id, reason, before, after }, tx)
      return after
    })
    if (!result) return adminFailure(res, req, 404, 'REPORT_NOT_FOUND', 'Report not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.post('/reports/:id/merge', requireAdminPermission('reports.review'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  const reportIds = Array.isArray(req.body?.report_ids) ? req.body.report_ids.map((id: unknown) => text(id, 200)).filter(Boolean).slice(0, 100) : []
  if (!reportIds.includes(req.params.id)) reportIds.unshift(req.params.id)
  if (reportIds.length < 2) return adminFailure(res, req, 400, 'REPORT_IDS_REQUIRED', 'At least two report IDs are required.')
  try {
    const result = await withTransaction(async (tx) => {
      const primary = await tx.one<any>('SELECT * FROM reports WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!primary) return null
      await tx.run('UPDATE reports SET status = $1, reviewed_by = $2 WHERE id = ANY($3::text[]) AND id <> $4', ['reviewed', req.admin!.adminId, reportIds, req.params.id])
      await recordAdminAudit(req, { action: 'report.merge', resourceType: 'report', resourceId: req.params.id, reason, after: { merged_report_ids: reportIds } }, tx)
      return { primary_report_id: req.params.id, merged_report_ids: reportIds.slice(1) }
    })
    if (!result) return adminFailure(res, req, 404, 'REPORT_NOT_FOUND', 'Report not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/search', requireAdminPermission('search.read'), async (req, res) => {
  const q = text(req.query.q ?? req.query.search, 200).toLowerCase()
  if (!q) return adminFailure(res, req, 400, 'SEARCH_QUERY_REQUIRED', 'A search query is required.')
  try {
    const like = `%${q}%`
    const [users, posts, comments, groups, events, reports, verifications, cases] = await Promise.all([
      db.all(`SELECT id, username, full_name, email, avatar_url, created_at FROM users WHERE LOWER(username) LIKE $1 OR LOWER(full_name) LIKE $1 OR LOWER(email) LIKE $1 OR LOWER(COALESCE(student_id,'')) LIKE $1 ORDER BY created_at DESC LIMIT 20`, [like]),
      db.all(`SELECT id, user_id, content, created_at FROM posts WHERE LOWER(content) LIKE $1 ORDER BY created_at DESC LIMIT 20`, [like]),
      db.all(`SELECT id, post_id, user_id, content, created_at FROM comments WHERE LOWER(content) LIKE $1 ORDER BY created_at DESC LIMIT 20`, [like]),
      db.all(`SELECT id, name, slug, description, created_at FROM communities WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1 ORDER BY created_at DESC LIMIT 20`, [like]),
      db.all(`SELECT id, title, description, organizer_id, created_at FROM events WHERE LOWER(title) LIKE $1 OR LOWER(description) LIKE $1 ORDER BY created_at DESC LIMIT 20`, [like]),
      db.all(`SELECT id, entity_type, entity_id, reason, description, status, created_at FROM reports WHERE LOWER(reason) LIKE $1 OR LOWER(description) LIKE $1 ORDER BY created_at DESC LIMIT 20`, [like]),
      db.all(`SELECT id, user_id, verification_type, status, notes, created_at FROM verification_requests WHERE LOWER(notes) LIKE $1 OR LOWER(verification_type) LIKE $1 ORDER BY created_at DESC LIMIT 20`, [like]),
      db.all(`SELECT id, target_type, target_id, category, status, summary, created_at FROM moderation_cases WHERE LOWER(category) LIKE $1 OR LOWER(summary) LIKE $1 ORDER BY created_at DESC LIMIT 20`, [like]),
    ])
    return adminSuccess(res, req, { query: q, users, posts, comments, groups, events, reports, verifications, moderation_cases: cases })
  } catch (error) { return internalError(res, req, error) }
})

// ─── Analytics and health ─────────────────────────────────────────────────────

adminPlatformV1Router.get('/analytics/overview', requireAdminPermission('analytics.read'), async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30))
    const [dau, wau, mau, registrations, growth, reports, moderation, verification, online] = await Promise.all([
      db.one<any>(`SELECT COUNT(DISTINCT user_id)::int AS count FROM auth_login_history WHERE success = 1 AND created_at >= NOW() - INTERVAL '1 day'`),
      db.one<any>(`SELECT COUNT(DISTINCT user_id)::int AS count FROM auth_login_history WHERE success = 1 AND created_at >= NOW() - INTERVAL '7 days'`),
      db.one<any>(`SELECT COUNT(DISTINCT user_id)::int AS count FROM auth_login_history WHERE success = 1 AND created_at >= NOW() - INTERVAL '30 days'`),
      db.all(`SELECT created_at::date AS date, COUNT(*)::int AS count FROM users WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day') GROUP BY created_at::date ORDER BY date ASC`, [days]),
      db.all(`SELECT created_at::date AS date, COUNT(*)::int AS count FROM users WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day') GROUP BY created_at::date ORDER BY date ASC`, [days]),
      db.all(`SELECT status, COUNT(*)::int AS count FROM reports GROUP BY status ORDER BY status`),
      db.all(`SELECT status, COUNT(*)::int AS count FROM moderation_cases GROUP BY status ORDER BY status`),
      db.all(`SELECT status, COUNT(*)::int AS count FROM verification_requests GROUP BY status ORDER BY status`),
      db.one<any>(`SELECT COUNT(*)::int AS count FROM users WHERE is_online = 1 OR last_seen >= NOW() - INTERVAL '5 minutes'`),
    ])
    const retention = await db.all(
      `SELECT cohort_date,
         COUNT(*)::int AS registered,
         COUNT(*) FILTER (WHERE returned_after_7d)::int AS returned_after_7d,
         ROUND((COUNT(*) FILTER (WHERE returned_after_7d)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) AS day_7_percent
       FROM (
         SELECT u.id, u.created_at::date AS cohort_date,
           EXISTS (
             SELECT 1 FROM auth_login_history h
             WHERE h.user_id = u.id AND h.success = 1
               AND h.created_at >= u.created_at + INTERVAL '7 days'
           ) AS returned_after_7d
         FROM users u
         WHERE u.created_at >= NOW() - ($1::int * INTERVAL '1 day')
       ) cohorts
       GROUP BY cohort_date ORDER BY cohort_date ASC`,
      [days],
    )
    return adminSuccess(res, req, {
      active_users: { dau: Number(dau?.count || 0), wau: Number(wau?.count || 0), mau: Number(mau?.count || 0), live_online: Number(online?.count || 0) },
      registrations, growth, retention, reports, moderation, verification,
      dimensions: {
        countries: await db.all(`SELECT country, COUNT(*)::int AS count FROM auth_login_history WHERE country <> '' GROUP BY country ORDER BY count DESC LIMIT 50`),
        cities: await db.all(`SELECT city, COUNT(*)::int AS count FROM auth_login_history WHERE city <> '' GROUP BY city ORDER BY count DESC LIMIT 50`),
        devices: await db.all(`SELECT device_info, COUNT(*)::int AS count FROM auth_login_history WHERE device_info <> '' GROUP BY device_info ORDER BY count DESC LIMIT 50`),
        platforms: await db.all(`SELECT platform, COUNT(*)::int AS count FROM auth_login_history WHERE platform <> '' GROUP BY platform ORDER BY count DESC LIMIT 50`),
      },
    }, { days })
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/system/health', requireAdminPermission('dashboard.read'), async (req, res) => {
  const started = Date.now()
  try {
    const dbCheck = await db.one<any>('SELECT 1 AS ok')
    const [users, pendingReports, pendingVerifications, queuedCampaigns] = await Promise.all([
      db.one<any>('SELECT COUNT(*)::int AS count FROM users'),
      db.one<any>("SELECT COUNT(*)::int AS count FROM reports WHERE status = 'pending'"),
      db.one<any>("SELECT COUNT(*)::int AS count FROM college_verifications WHERE status = 'pending'"),
      db.one<any>("SELECT COUNT(*)::int AS count FROM admin_notification_campaigns WHERE status IN ('scheduled','queued')"),
    ])
    return adminSuccess(res, req, {
      status: 'healthy',
      checked_at: new Date().toISOString(),
      latency_ms: Date.now() - started,
      dependencies: {
        database: { status: dbCheck?.ok === 1 ? 'healthy' : 'degraded' },
        storage: { status: 'database-backed' },
        redis: { status: 'not_configured' },
        realtime: { status: 'socket.io' },
        email: { status: 'connector-or-smtp' },
        push: { status: 'in_app_only' },
        queues: { status: Number(queuedCampaigns?.count || 0) ? 'queued' : 'idle' },
        workers: { status: 'in_process' },
      },
      metrics: { users: Number(users?.count || 0), pending_reports: Number(pendingReports?.count || 0), pending_verifications: Number(pendingVerifications?.count || 0), queued_campaigns: Number(queuedCampaigns?.count || 0) },
    })
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/system/maintenance', requireAdminPermission('settings.read'), async (req, res) => {
  try {
    const state = await getMaintenanceState(true)
    return adminSuccess(res, req, state)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.patch('/system/maintenance', requireAdminPermission('settings.manage'), async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled)
    const message = text(req.body?.message, 2000)
    const before = await getMaintenanceState(true)
    const after = await setMaintenanceState({ enabled, message, updatedBy: req.admin?.adminId || null })
    await recordAdminAudit(req, {
      action: enabled ? 'maintenance.enable' : 'maintenance.disable',
      resourceType: 'system',
      resourceId: 'maintenance',
      reason: text(req.body?.reason, 2000) || (enabled ? 'Enabled maintenance mode' : 'Disabled maintenance mode'),
      before, after,
    })
    return adminSuccess(res, req, after)
  } catch (error) { return internalError(res, req, error) }
})

function validPlayStoreUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'play.google.com' && url.pathname.startsWith('/store/apps/')
  } catch {
    return false
  }
}

adminPlatformV1Router.get('/system/app-update', requireAdminPermission('settings.read'), async (req, res) => {
  try {
    return adminSuccess(res, req, await getAppUpdateState(true))
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.patch('/system/app-update', requireAdminPermission('settings.manage'), async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled)
    const mode = req.body?.mode === 'force' ? 'force' : 'soft'
    const title = text(req.body?.title, 160) || 'A new version of Campnect is ready'
    const message = text(req.body?.message, 1000) || 'Update now for the latest features and improvements.'
    const storeUrl = text(req.body?.storeUrl, 1000) || DEFAULT_PLAY_STORE_URL
    const minimumVersionCodeValue = req.body?.minimumVersionCode
    const minimumVersionCode = Number(minimumVersionCodeValue)
    const hasMinimumVersionCode = minimumVersionCodeValue !== undefined && minimumVersionCodeValue !== null
    const before = await getAppUpdateState(true)
    if (!validPlayStoreUrl(storeUrl)) {
      return adminFailure(res, req, 400, 'PLAY_STORE_URL_INVALID', 'Enter a valid Google Play Store app URL.')
    }
    if (enabled && hasMinimumVersionCode && (!Number.isSafeInteger(minimumVersionCode) || minimumVersionCode < 1)) {
      return adminFailure(res, req, 400, 'MINIMUM_VERSION_CODE_INVALID', 'Enter the Android version code that users must update to.')
    }
    const after = await setAppUpdateState({
      enabled,
      mode,
      title,
      message,
      storeUrl,
      minimumVersionCode: Number.isSafeInteger(minimumVersionCode) && minimumVersionCode > 0
        ? minimumVersionCode
        : Math.max(1, before.minimumVersionCode || 14),
      updatedBy: req.admin?.adminId || null,
    })
    await recordAdminAudit(req, {
      action: enabled ? `app_update.${mode}.enable` : 'app_update.disable',
      resourceType: 'system',
      resourceId: 'app-update',
      reason: text(req.body?.reason, 2000) || (enabled ? `Enabled ${mode} app update notice` : 'Disabled app update notice'),
      before,
      after,
    })
    return adminSuccess(res, req, after)
  } catch (error) { return internalError(res, req, error) }
})

// ─── Admin notifications and governance ──────────────────────────────────────

adminPlatformV1Router.get('/notifications/campaigns', requireAdminPermission('notifications.read'), async (req, res) => {
  try {
    return listWithCount(
      req, res,
      'SELECT * FROM admin_notification_campaigns ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      'SELECT COUNT(*)::int AS count FROM admin_notification_campaigns',
      [],
    )
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.post('/notifications/campaigns', requireAdminPermission('notifications.manage'), async (req, res) => {
  const title = text(req.body?.title, 200)
  const body = text(req.body?.body, 10000)
  if (!title || !body) return adminFailure(res, req, 400, 'NOTIFICATION_CONTENT_REQUIRED', 'title and body are required.')
  try {
    const campaign = await withTransaction(async (tx) => {
      const item = await tx.one<any>(
        `INSERT INTO admin_notification_campaigns
          (id, kind, audience_type, title, body, target_filter, delivery_type, scheduled_at, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [uuidv4(), text(req.body?.kind, 30) || 'announcement', text(req.body?.audience_type, 30) || 'targeted', title, body, JSON.stringify(req.body?.target_filter || {}), text(req.body?.delivery_type, 30) || 'in_app', dateOrNull(req.body?.scheduled_at), req.body?.scheduled_at ? 'scheduled' : 'draft', req.admin!.adminId],
      )
      await recordAdminAudit(req, { action: 'notification.campaign.create', resourceType: 'notification_campaign', resourceId: item.id, after: item }, tx)
      return item
    })
    return adminSuccess(res, req, campaign)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/notifications/campaigns/:id/deliveries', requireAdminPermission('notifications.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const [items, total] = await Promise.all([
      db.all(
        `SELECT d.*, u.username, u.full_name
         FROM admin_notification_deliveries d
         JOIN users u ON u.id = d.user_id
         WHERE d.campaign_id = $1
         ORDER BY d.created_at DESC LIMIT $2 OFFSET $3`,
        [req.params.id, limit, offset],
      ),
      db.one<any>('SELECT COUNT(*)::int AS count FROM admin_notification_deliveries WHERE campaign_id = $1', [req.params.id]),
    ])
    return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0) })
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.post('/notifications/campaigns/:id/send', requireAdminPermission('notifications.manage'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  try {
    const result = await withTransaction(async (tx) => {
      const campaign = await tx.one<any>('SELECT * FROM admin_notification_campaigns WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!campaign) return null
      const filter = parseJson(campaign.target_filter, {})
      const values: any[] = []
      const conditions: string[] = []
      if (Array.isArray(filter.user_ids) && filter.user_ids.length) { values.push(filter.user_ids); conditions.push(`u.id = ANY($${values.length}::text[])`) }
      if (filter.college_id) { values.push(text(filter.college_id, 200)); conditions.push(`u.college_id = $${values.length}`) }
      if (filter.verified !== undefined) { values.push(filter.verified ? 1 : 0); conditions.push(`u.is_college_verified = $${values.length}`) }
      const users = await tx.all<any>(`SELECT u.id FROM users u ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}`, values)
      for (const user of users) {
        const deliveryId = uuidv4()
        await tx.run(
          `INSERT INTO notifications (id, user_id, type, entity_type, content, extra_data)
           VALUES ($1,$2,$3,'admin_campaign',$4,$5)`,
          [uuidv4(), user.id, campaign.kind, campaign.body, JSON.stringify({ campaign_id: campaign.id, title: campaign.title, delivery_type: campaign.delivery_type })],
        )
        await tx.run(
          `INSERT INTO admin_notification_deliveries
            (id, campaign_id, user_id, channel, status, delivered_at)
           VALUES ($1,$2,$3,$4,'delivered',NOW())`,
          [deliveryId, campaign.id, user.id, campaign.delivery_type],
        )
      }
      const after = await tx.one<any>(
        `UPDATE admin_notification_campaigns SET status = 'sent', sent_at = NOW(), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [req.params.id],
      )
      await recordAdminAudit(req, { action: 'notification.campaign.send', resourceType: 'notification_campaign', resourceId: req.params.id, reason, after: { ...after, recipients: users.length } }, tx)
      return { campaign: after, recipients: users.length }
    })
    if (!result) return adminFailure(res, req, 404, 'CAMPAIGN_NOT_FOUND', 'Notification campaign not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/notifications/templates', requireAdminPermission('notifications.read'), async (req, res) => {
  try { return adminSuccess(res, req, await db.all('SELECT * FROM admin_notification_templates ORDER BY name ASC')) }
  catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.post('/notifications/templates', requireAdminPermission('notifications.manage'), async (req, res) => {
  const name = text(req.body?.name, 100)
  const title = text(req.body?.title, 200)
  const body = text(req.body?.body, 10000)
  if (!name || !title || !body) return adminFailure(res, req, 400, 'TEMPLATE_FIELDS_REQUIRED', 'name, title, and body are required.')
  try {
    const item = await withTransaction(async (tx) => {
      const created = await tx.one<any>(
        `INSERT INTO admin_notification_templates (id, name, kind, title, body, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [uuidv4(), name, text(req.body?.kind, 30) || 'announcement', title, body, req.admin!.adminId],
      )
      await recordAdminAudit(req, { action: 'notification.template.create', resourceType: 'notification_template', resourceId: created.id, after: created }, tx)
      return created
    })
    return adminSuccess(res, req, item)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/admins', requireAdminPermission('admins.manage'), async (req, res) => {
  try { return adminSuccess(res, req, await db.all('SELECT id, username, email, display_name, role, permissions, status, mfa_enabled, invited_by, last_seen_at, disabled_at, created_at, updated_at FROM admin_accounts ORDER BY created_at DESC')) }
  catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.post('/admins/invite', requireAdminPermission('admins.manage'), async (req, res) => {
  const username = text(req.body?.username, 200).toLowerCase()
  const role = text(req.body?.role, 50).toLowerCase() || 'read_only'
  if (!username) return adminFailure(res, req, 400, 'ADMIN_USERNAME_REQUIRED', 'username is required.')
  if (!ADMIN_ROLES.has(role)) return adminFailure(res, req, 400, 'ADMIN_ROLE_INVALID', 'Unsupported Admin role.')
  try {
    const item = await withTransaction(async (tx) => {
      const created = await tx.one<any>(
        `INSERT INTO admin_accounts (id, username, email, display_name, role, permissions, invited_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, username, email, display_name, role, permissions, status, mfa_enabled, invited_by, created_at`,
        [uuidv4(), username, text(req.body?.email, 320) || null, text(req.body?.display_name, 200), role, JSON.stringify(permissionsForRole(role)), req.admin!.adminId],
      )
      await recordAdminAudit(req, { action: 'admin.invite', resourceType: 'admin_account', resourceId: created.id, after: created }, tx)
      return created
    })
    return adminSuccess(res, req, item)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.patch('/admins/:id', requireAdminPermission('admins.manage'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  try {
    const result = await withTransaction(async (tx) => {
      const before = await tx.one<any>('SELECT * FROM admin_accounts WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!before) return null
      const role = text(req.body?.role, 50).toLowerCase()
      const status = text(req.body?.status, 30).toLowerCase()
      if (role && !ADMIN_ROLES.has(role)) {
        return { error: 'ADMIN_ROLE_INVALID' as const }
      }
      if (status && !ADMIN_STATUSES.has(status)) {
        return { error: 'ADMIN_STATUS_INVALID' as const }
      }
      const after = await tx.one<any>(
        `UPDATE admin_accounts SET role = COALESCE(NULLIF($1,''), role),
           permissions = CASE WHEN $1 <> '' THEN $2 ELSE permissions END,
           status = COALESCE(NULLIF($3,''), status),
           display_name = COALESCE(NULLIF($4,''), display_name),
           disabled_at = CASE WHEN $3 = 'disabled' THEN NOW() WHEN $3 = 'active' THEN NULL ELSE disabled_at END,
           updated_at = NOW() WHERE id = $5 RETURNING id, username, email, display_name, role, permissions, status, mfa_enabled, invited_by, last_seen_at, disabled_at, created_at, updated_at`,
        [role, JSON.stringify(permissionsForRole(role || before.role)), status, text(req.body?.display_name, 200), req.params.id],
      )
      await recordAdminAudit(req, { action: 'admin.update', resourceType: 'admin_account', resourceId: req.params.id, reason, before, after }, tx)
      return after
    })
    if (result?.error === 'ADMIN_ROLE_INVALID') {
      return adminFailure(res, req, 400, 'ADMIN_ROLE_INVALID', 'Unsupported Admin role.')
    }
    if (result?.error === 'ADMIN_STATUS_INVALID') {
      return adminFailure(res, req, 400, 'ADMIN_STATUS_INVALID', 'Unsupported Admin account status.')
    }
    if (!result) return adminFailure(res, req, 404, 'ADMIN_NOT_FOUND', 'Admin account not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.delete('/admins/:id', requireAdminPermission('admins.manage'), async (req, res) => {
  const reason = requireReason(req, res)
  if (!reason) return
  try {
    const result = await withTransaction(async (tx) => {
      const before = await tx.one<any>('SELECT id, username, status FROM admin_accounts WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!before) return null
      const after = await tx.one<any>(
        `UPDATE admin_accounts SET status = 'deleted', disabled_at = NOW(), updated_at = NOW()
         WHERE id = $1 RETURNING id, username, status, disabled_at`,
        [req.params.id],
      )
      await recordAdminAudit(req, { action: 'admin.delete', resourceType: 'admin_account', resourceId: req.params.id, reason, before, after }, tx)
      return after
    })
    if (!result) return adminFailure(res, req, 404, 'ADMIN_NOT_FOUND', 'Admin account not found.')
    return adminSuccess(res, req, result)
  } catch (error) { return internalError(res, req, error) }
})

// ─── Searchable/exportable audit history ─────────────────────────────────────

adminPlatformV1Router.get('/audit/export', requireAdminPermission('audit.export'), async (req, res) => {
  try {
    const q = text(req.query.q, 200).toLowerCase()
    const values: any[] = []
    const filters: string[] = []
    if (q) {
      values.push(`%${q}%`)
      filters.push(`(LOWER(action) LIKE $${values.length} OR LOWER(resource_type) LIKE $${values.length} OR LOWER(COALESCE(reason,'')) LIKE $${values.length})`)
    }
    const after = dateOrNull(req.query.after)
    if (after) { values.push(after); filters.push(`created_at >= $${values.length}`) }
    const before = dateOrNull(req.query.before)
    if (before) { values.push(before); filters.push(`created_at <= $${values.length}`) }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const rows = await db.all(`SELECT id, admin_id, action, resource_type, resource_id, reason, before_summary, after_summary, request_id, ip_address, user_agent, created_at FROM admin_audit_logs ${where} ORDER BY created_at DESC LIMIT 5000`, values)
    await recordAdminAudit(req, { action: 'audit.export', resourceType: 'audit', reason: q || 'export' })
    res.type('text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="campnect-admin-audit.csv"')
    const header = 'id,admin_id,action,resource_type,resource_id,reason,request_id,ip_address,user_agent,created_at'
    const csv = rows.map((row: any) => [row.id, row.admin_id, row.action, row.resource_type, row.resource_id, row.reason, row.request_id, row.ip_address, row.user_agent, row.created_at].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    return res.send([header, ...csv].join('\n'))
  } catch (error) { return internalError(res, req, error) }
})

adminPlatformV1Router.get('/roles', requireAdminPermission('admins.manage'), async (req, res) => {
  return adminSuccess(res, req, Object.entries({
    owner: 'Full platform ownership',
    super_admin: 'All operational capabilities',
    trust_safety_lead: 'Trust and safety leadership',
    moderator: 'Content and user moderation',
    verification_team: 'Verification review',
    support: 'Support and report review',
    community_manager: 'Community and announcements',
    analytics: 'Analytics and read access',
    read_only: 'Read-only operational access',
  }).map(([role, description]) => ({ role, description, permissions: permissionsForRole(role) })))
})