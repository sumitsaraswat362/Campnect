// @ts-nocheck
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, withTransaction } from '../legacy-db/index.js'
import { requireAdminPanel, requireAdminPermission } from '../legacy-middleware/auth.js'
import {
  adminFailure,
  adminSuccess,
  recordAdminAudit,
  recordModerationAction,
  recordSecurityEvent,
} from '../legacy-services/adminSecurity.js'
import {
  createUserWarning,
  UserWarningValidationError,
} from '../legacy-services/userWarnings.js'
import { mediaAssetId } from '../legacy-services/media.js'
import { emitUserNotification } from '../legacy-socket/io.js'
import { adminUsersV1Router, adminUserNotesV1Router } from './adminUsersV1.js'

export const adminV1Router = Router()
adminV1Router.use(requireAdminPanel)
adminV1Router.use('/users', adminUsersV1Router)
adminV1Router.use('/notes', adminUserNotesV1Router)

const MAX_PAGE_SIZE = 100

function pageParams(req: any) {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(String(req.query.limit || '20'), 10) || 20))
  return { page, limit, offset: (page - 1) * limit }
}

function internalError(res: any, req: any, error: any) {
  console.error('[admin v1]', req.method, req.originalUrl, error?.message || error)
  return adminFailure(res, req, 500, 'ADMIN_INTERNAL_ERROR', 'The admin request could not be completed.')
}

function parseReportJson(value: unknown, fallback: unknown = []) {
  if (typeof value !== 'string') return value ?? fallback
  try { return JSON.parse(value) } catch { return fallback }
}

async function loadReportTarget(report: any) {
  const type = String(report.entity_type || '')
  let target: any = null
  if (type === 'user') {
    target = await db.one<any>(`SELECT id, username, full_name, avatar_url, cover_url, bio, college_name,
      department, course, semester, year, interests, skills, account_type, verification_status,
      is_college_verified, is_suspended, is_banned, is_deactivated, is_shadowbanned, warnings_count,
      followers_count, following_count, posts_count, created_at, updated_at
      FROM users WHERE id = $1`, [report.entity_id])
  } else if (['post', 'glimpse', 'clip'].includes(type)) {
    target = await db.one<any>(`SELECT p.*, u.username AS author_username, u.full_name AS author_name,
      u.avatar_url AS author_avatar, u.college_name AS author_college_name
      FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = $1`, [report.entity_id])
  } else if (type === 'message') {
    target = await db.one<any>(`SELECT m.*, c.type AS conversation_type, sender.username AS sender_username,
      sender.full_name AS sender_name, sender.avatar_url AS sender_avatar
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
      JOIN users sender ON sender.id = m.sender_id WHERE m.id = $1`, [report.entity_id])
  } else if (type === 'event') {
    target = await db.one<any>(`SELECT e.*, u.username AS organizer_username, u.full_name AS organizer_name,
      u.avatar_url AS organizer_avatar FROM events e JOIN users u ON u.id = e.organizer_id WHERE e.id = $1`, [report.entity_id])
  }
  if (!target) return { target: null, media: [] }

  for (const key of ['media', 'tags', 'interests', 'skills', 'poll_options']) {
    if (key in target) target[key] = parseReportJson(target[key])
  }
  const media = await db.all<any>(
    `SELECT id, purpose, mime_type, original_name, byte_size, width, height, created_at
     FROM media_assets WHERE entity_id = $1
       AND purpose NOT IN ('verification_id_photo', 'verification_selfie')
     ORDER BY created_at ASC`,
    [report.entity_id],
  )
  return { target: { ...target, report_type: type }, media }
}

async function dashboardSummary(req: any, res: any) {
  try {
    const [users, verified, pendingVerifications, posts, pendingReports, communities, activeUsers] = await Promise.all([
      db.one<any>('SELECT COUNT(*)::int AS count FROM users'),
      db.one<any>('SELECT COUNT(*)::int AS count FROM users WHERE is_college_verified = 1'),
      db.one<any>("SELECT COUNT(*)::int AS count FROM college_verifications WHERE status = 'pending'"),
      db.one<any>('SELECT COUNT(*)::int AS count FROM posts'),
      db.one<any>("SELECT COUNT(*)::int AS count FROM reports WHERE status = 'pending'"),
      db.one<any>('SELECT COUNT(*)::int AS count FROM communities'),
      db.one<any>("SELECT COUNT(*)::int AS count FROM users WHERE last_seen > NOW() - INTERVAL '7 days'"),
    ])
    return adminSuccess(res, req, {
      users: { total: Number(users?.count || 0), verified: Number(verified?.count || 0), active_7d: Number(activeUsers?.count || 0) },
      content: { posts: Number(posts?.count || 0), communities: Number(communities?.count || 0) },
      queues: { pending_verifications: Number(pendingVerifications?.count || 0), pending_reports: Number(pendingReports?.count || 0) },
      generated_at: new Date().toISOString(),
    })
  } catch (error) {
    return internalError(res, req, error)
  }
}

// Auth is mounted separately at /api/v1/admin/auth. These endpoints require an
// active session and the current database role/permission set.
adminV1Router.get('/health', requireAdminPermission('dashboard.read'), async (req, res) => {
  try {
    const [users, posts, reports, dbCheck] = await Promise.all([
      db.one<any>('SELECT COUNT(*)::int AS count FROM users'),
      db.one<any>('SELECT COUNT(*)::int AS count FROM posts'),
      db.one<any>("SELECT COUNT(*)::int AS count FROM reports WHERE status = 'pending'"),
      db.one<any>('SELECT 1 AS ok'),
    ])
    return adminSuccess(res, req, {
      api: 'healthy',
      database: dbCheck?.ok === 1 ? 'healthy' : 'degraded',
      users: Number(users?.count || 0),
      posts: Number(posts?.count || 0),
      pending_reports: Number(reports?.count || 0),
      checked_at: new Date().toISOString(),
    })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/dashboard', requireAdminPermission('dashboard.read'), async (req, res) => {
  return dashboardSummary(req, res)
})

// Contract aliases used by the separate admin project specification.
adminV1Router.get('/dashboard/summary', requireAdminPermission('dashboard.read'), async (req, res) => {
  return dashboardSummary(req, res)
})

adminV1Router.get('/health/dependencies', requireAdminPermission('dashboard.read'), async (req, res) => {
  return adminSuccess(res, req, {
    api: { status: 'healthy' },
    database: { status: 'healthy' },
    storage: { status: 'database-backed' },
    email: { status: 'configured-by-connector-or-smtp' },
  })
})

adminV1Router.get('/analytics/users', requireAdminPermission('analytics.read'), async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, Number.parseInt(String(req.query.days || '30'), 10) || 30))
    const rows = await db.all(`
      SELECT created_at::date AS date, COUNT(*)::int AS signups
      FROM users
      WHERE created_at > NOW() - ($1::int * INTERVAL '1 day')
      GROUP BY created_at::date
      ORDER BY date ASC
    `, [days])
    return adminSuccess(res, req, rows, { days })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/analytics/content', requireAdminPermission('analytics.read'), async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, Number.parseInt(String(req.query.days || '30'), 10) || 30))
    const rows = await db.all(`
      SELECT created_at::date AS date, COUNT(*)::int AS posts
      FROM posts
      WHERE created_at > NOW() - ($1::int * INTERVAL '1 day')
      GROUP BY created_at::date
      ORDER BY date ASC
    `, [days])
    return adminSuccess(res, req, rows, { days })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/dashboard/trends', requireAdminPermission('analytics.read'), async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, Number.parseInt(String(req.query.days || '30'), 10) || 30))
    const [signups, posts] = await Promise.all([
      db.all(`SELECT created_at::date AS date, COUNT(*)::int AS count FROM users WHERE created_at > NOW() - ($1::int * INTERVAL '1 day') GROUP BY created_at::date ORDER BY date ASC`, [days]),
      db.all(`SELECT created_at::date AS date, COUNT(*)::int AS count FROM posts WHERE created_at > NOW() - ($1::int * INTERVAL '1 day') GROUP BY created_at::date ORDER BY date ASC`, [days]),
    ])
    return adminSuccess(res, req, { signups, posts }, { days })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/activity/stream', requireAdminPermission('audit.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const items = await db.all(`
      SELECT id, action, resource_type, resource_id, reason, request_id, created_at
      FROM admin_audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2
    `, [limit, offset])
    return adminSuccess(res, req, items, { page, limit })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/users', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const q = String(req.query.q || '').trim().toLowerCase()
    const status = String(req.query.status || '').trim()
    const params: any[] = []
    const filters: string[] = []
    if (q) {
      params.push(`%${q}%`)
      filters.push(`(LOWER(username) LIKE $${params.length} OR LOWER(full_name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`)
    }
    if (status === 'suspended') filters.push('COALESCE(is_suspended, 0) = 1')
    if (status === 'banned') filters.push('COALESCE(is_banned, 0) = 1')
    if (status === 'pending_verification') filters.push(`verification_status = 'pending'`)
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    params.push(limit, offset)
    const users = await db.all(`
      SELECT id, email, username, full_name, avatar_url, college_name, department, course,
        is_email_verified, is_college_verified, verification_status, is_suspended, is_banned,
        is_shadowbanned, suspension_reason, warnings_count, is_online, last_seen, created_at,
        followers_count, following_count, posts_count
      FROM users ${where}
      ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params)
    const countParams = q ? [`%${q}%`] : []
    const countWhere = filters.length
      ? `WHERE ${filters.join(' AND ')}`
      : ''
    const total = await db.one<any>(`SELECT COUNT(*)::int AS count FROM users ${countWhere}`, countParams)
    return adminSuccess(res, req, users, { page, limit, total: Number(total?.count || 0) })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/users/:id', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const user = await db.one<any>(`
      SELECT u.id, u.email, u.username, u.full_name, u.avatar_url, u.cover_url, u.bio,
        u.college_id, u.college_name, u.department, u.course, u.year, u.semester,
        u.is_email_verified, u.is_college_verified, u.verification_status, u.is_suspended,
        u.is_banned, u.is_shadowbanned, u.suspension_reason, u.warnings_count,
        u.followers_count, u.following_count, u.posts_count, u.created_at, u.last_seen
      FROM users u WHERE u.id = $1
    `, [req.params.id])
    if (!user) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    const [posts, stories, reports, actions] = await Promise.all([
      db.all(`SELECT id, type, content, media, visibility, likes_count, comments_count, shares_count, created_at FROM posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]),
      db.all(`SELECT id, type, caption, views_count, expires_at, created_at FROM stories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]),
      db.all(`SELECT id, entity_type, entity_id, reason, status, created_at FROM reports WHERE reporter_id = $1 OR entity_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]),
      db.all(`SELECT id, action, target_type, target_id, reason, before_summary, after_summary, created_at FROM moderation_actions WHERE target_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]),
    ])
    return adminSuccess(res, req, { user, posts, stories, reports, moderation_actions: actions })
  } catch (error) {
    return internalError(res, req, error)
  }
})

async function updateUserModeration(req: any, res: any, action: string) {
  const userId = req.params.id
  const reason = String(req.body?.reason || '').trim()
  if (!reason && ['suspend', 'warn'].includes(action)) {
    return adminFailure(res, req, 400, 'MODERATION_REASON_REQUIRED', 'A reason is required for this moderation action.')
  }
  try {
    if (action === 'warn') {
      const result = await createUserWarning(req, userId, req.body)
      if (!result) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
      return adminSuccess(res, req, { user_id: userId, action, state: result.state })
    }
    const result = await withTransaction(async (tx) => {
      const before = await tx.one<any>('SELECT id, is_suspended, is_shadowbanned, warnings_count, suspension_reason FROM users WHERE id = $1 FOR UPDATE', [userId])
      if (!before) return null
      let after: any
      if (action === 'suspend') {
        after = await tx.one<any>('UPDATE users SET is_suspended = 1, suspension_reason = $1, warnings_count = COALESCE(warnings_count, 0) + 1 WHERE id = $2 RETURNING is_suspended, is_shadowbanned, warnings_count, suspension_reason', [reason, userId])
        await tx.run("INSERT INTO notifications (id, user_id, type, entity_type, content) VALUES ($1,$2,'system','account',$3)", [uuidv4(), userId, `Your account has been suspended. Reason: ${reason}`])
      } else if (action === 'unsuspend') {
        after = await tx.one<any>("UPDATE users SET is_suspended = 0, suspension_reason = '' WHERE id = $1 RETURNING is_suspended, is_shadowbanned, warnings_count, suspension_reason", [userId])
      } else {
        const enabled = Boolean(req.body?.enabled)
        after = await tx.one<any>('UPDATE users SET is_shadowbanned = $1 WHERE id = $2 RETURNING is_suspended, is_shadowbanned, warnings_count, suspension_reason', [enabled ? 1 : 0, userId])
        await tx.run("INSERT INTO notifications (id, user_id, type, entity_type, content) VALUES ($1,$2,'system','moderation',$3)", [uuidv4(), userId, enabled ? 'Your account visibility has been restricted by moderation.' : 'Your account visibility restriction was removed.'])
      }
      await recordModerationAction(req, { action: `user.${action}`, targetType: 'user', targetId: userId, reason, before, after }, tx)
      await recordAdminAudit(req, { action: `user.${action}`, resourceType: 'user', resourceId: userId, reason, before, after }, tx)
      return after
    })
    if (!result) return adminFailure(res, req, 404, 'USER_NOT_FOUND', 'User not found.')
    return adminSuccess(res, req, { user_id: userId, action, state: result })
  } catch (error) {
    if (error instanceof UserWarningValidationError) {
      return adminFailure(res, req, 400, error.code, error.message)
    }
    return internalError(res, req, error)
  }
}

adminV1Router.post('/users/:id/suspend', requireAdminPermission('users.moderate'), (req, res) => updateUserModeration(req, res, 'suspend'))
adminV1Router.post('/users/:id/unsuspend', requireAdminPermission('users.moderate'), (req, res) => updateUserModeration(req, res, 'unsuspend'))
adminV1Router.post('/users/:id/warn', requireAdminPermission('users.moderate'), (req, res) => updateUserModeration(req, res, 'warn'))
adminV1Router.post('/users/:id/shadowban', requireAdminPermission('users.moderate'), (req, res) => updateUserModeration(req, res, 'shadowban'))

adminV1Router.get('/content/:type', requireAdminPermission('content.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const type = String(req.params.type)
    const definitions: Record<string, { sql: string; label: string }> = {
      posts: { label: 'posts', sql: `SELECT p.id, p.user_id, p.type, p.content, p.media, p.visibility, p.likes_count, p.comments_count, p.shares_count, p.created_at, u.username, u.full_name, u.avatar_url FROM posts p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT $1 OFFSET $2` },
      reels: { label: 'reels', sql: `SELECT p.id, p.user_id, p.type, p.content, p.media, p.visibility, p.likes_count, p.comments_count, p.shares_count, p.created_at, u.username, u.full_name, u.avatar_url FROM posts p JOIN users u ON u.id = p.user_id WHERE p.type IN ('reel','glimpse','video') ORDER BY p.created_at DESC LIMIT $1 OFFSET $2` },
      stories: { label: 'stories', sql: `SELECT s.id, s.user_id, s.type, s.caption, s.views_count, s.expires_at, s.created_at, u.username, u.full_name, u.avatar_url FROM stories s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT $1 OFFSET $2` },
      comments: { label: 'comments', sql: `SELECT c.id, c.post_id, c.user_id, c.content, c.likes_count, c.created_at, u.username, u.full_name, p.content AS post_content FROM comments c JOIN users u ON u.id = c.user_id LEFT JOIN posts p ON p.id = c.post_id ORDER BY c.created_at DESC LIMIT $1 OFFSET $2` },
      groups: { label: 'groups', sql: `SELECT id, name, description, members_count, created_at FROM communities ORDER BY created_at DESC LIMIT $1 OFFSET $2` },
    }
    const definition = definitions[type]
    if (!definition) return adminFailure(res, req, 404, 'CONTENT_TYPE_NOT_FOUND', 'Unknown content section.')
    const data = await db.all(definition.sql, [limit, offset])
    return adminSuccess(res, req, data, { page, limit, type: definition.label })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/verifications', requireAdminPermission('verifications.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const status = ['pending', 'approved', 'rejected'].includes(String(req.query.status)) ? String(req.query.status) : 'pending'
    const [items, total] = await Promise.all([
      db.all(`
        SELECT cv.id, cv.user_id, cv.status, cv.ocr_name, cv.review_notes, cv.submitted_at, cv.reviewed_at,
          u.username, u.full_name, u.email, u.college_name, u.college_id, u.avatar_url,
          u.department, u.course, u.year, u.semester, u.is_email_verified, u.is_college_verified,
          (cv.id_photo_url IS NOT NULL) AS has_id_photo,
          (cv.selfie_url IS NOT NULL) AS has_selfie
        FROM college_verifications cv JOIN users u ON cv.user_id = u.id
        WHERE cv.status = $1 ORDER BY cv.submitted_at ASC LIMIT $2 OFFSET $3
      `, [status, limit, offset]),
      db.one<any>('SELECT COUNT(*)::int AS count FROM college_verifications WHERE status = $1', [status]),
    ])
    return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0), status })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/verifications/:id/media/:kind', requireAdminPermission('verifications.review'), async (req, res) => {
  try {
    const verificationId = String(req.params.id)
    const kind = String(req.params.kind)
    const column = kind === 'id' ? 'id_photo_url' : kind === 'selfie' ? 'selfie_url' : ''
    if (!column) return adminFailure(res, req, 400, 'MEDIA_KIND_INVALID', 'Media kind must be id or selfie.')
    const verification = await db.one<any>(`SELECT ${column} AS media_url FROM college_verifications WHERE id = $1`, [verificationId])
    const assetId = mediaAssetId(verification?.media_url)
    if (!assetId) return adminFailure(res, req, 404, 'MEDIA_NOT_FOUND', 'Verification media not found.')
    const asset = await db.one<any>(`
      SELECT ma.mime_type, ma.byte_size, ma.checksum
      FROM media_assets ma
      JOIN college_verifications cv ON cv.user_id = ma.owner_id
      WHERE cv.id = $1 AND ma.id = $2
        AND (cv.id_photo_url = '/api/media/' || ma.id OR cv.selfie_url = '/api/media/' || ma.id)
    `, [verificationId, assetId])
    if (!asset) return adminFailure(res, req, 404, 'MEDIA_NOT_FOUND', 'Verification media not found.')
    await recordAdminAudit(req, {
      action: 'verification.media.view',
      resourceType: 'verification',
      resourceId: verificationId,
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
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.patch('/verifications/:id', requireAdminPermission('verifications.review'), async (req, res) => {
  const status = String(req.body?.status || '')
  const reviewNotes = String(req.body?.review_notes || '').trim().slice(0, 2000)
  if (!['approved', 'rejected'].includes(status)) return adminFailure(res, req, 400, 'VERIFICATION_STATUS_INVALID', 'Status must be approved or rejected.')
  try {
    const result = await withTransaction(async (tx) => {
      const verification = await tx.one<any>('SELECT id, user_id, status FROM college_verifications WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!verification) return null
      const before = { status: verification.status }
      await tx.run('UPDATE college_verifications SET status = $1, review_notes = $2, reviewed_at = NOW(), reviewer_id = $3 WHERE id = $4', [status, reviewNotes, req.admin!.adminId, req.params.id])
      const after = await tx.one<any>('UPDATE users SET is_college_verified = $1, verification_status = $2 WHERE id = $3 RETURNING is_college_verified, verification_status', [status === 'approved' ? 1 : 0, status, verification.user_id])
       await tx.run(
         `UPDATE verification_requests SET status = $1, notes = $2, reviewer_id = $3,
            reviewed_at = NOW(), updated_at = NOW()
          WHERE id = $4`,
         [status, reviewNotes, req.admin!.adminId, req.params.id],
       )
       await tx.run(
         `INSERT INTO verification_events
           (id, verification_id, from_status, to_status, verification_type, notes, admin_id)
          VALUES ($1,$2,$3,$4,'student',$5,$6)`,
         [uuidv4(), req.params.id, verification.status, status, reviewNotes, req.admin!.adminId],
       )
      const message = status === 'approved'
        ? 'Your college verification was approved! You now have a verified badge.'
        : `Your college verification was declined. Reason: ${reviewNotes || 'Please resubmit with clearer photos.'}`
      await tx.run("INSERT INTO notifications (id, user_id, type, entity_type, content) VALUES ($1,$2,'system','verification',$3)", [uuidv4(), verification.user_id, message])
      await recordAdminAudit(req, { action: `verification.${status}`, resourceType: 'verification', resourceId: req.params.id, reason: reviewNotes, before, after }, tx)
      return { verification_id: req.params.id, user_id: verification.user_id, status }
    })
    if (!result) return adminFailure(res, req, 404, 'VERIFICATION_NOT_FOUND', 'Verification not found.')
    return adminSuccess(res, req, result)
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/reports', requireAdminPermission('reports.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const status = String(req.query.status || 'pending')
    const [reports, total] = await Promise.all([
      db.all(`
        SELECT r.*, u.username AS reporter_username, u.avatar_url AS reporter_avatar
        FROM reports r JOIN users u ON r.reporter_id = u.id
        WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT $2 OFFSET $3
      `, [status, limit, offset]),
      db.one<any>('SELECT COUNT(*)::int AS count FROM reports WHERE status = $1', [status]),
    ])
    return adminSuccess(res, req, reports, { page, limit, total: Number(total?.count || 0), status })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/reports/:id', requireAdminPermission('reports.read'), async (req, res) => {
  try {
    const report = await db.one<any>(`SELECT r.*, u.username AS reporter_username, u.full_name AS reporter_name,
      u.avatar_url AS reporter_avatar FROM reports r JOIN users u ON u.id = r.reporter_id WHERE r.id = $1`, [req.params.id])
    if (!report) return adminFailure(res, req, 404, 'REPORT_NOT_FOUND', 'Report not found.')
    const { target, media } = await loadReportTarget(report)
    return adminSuccess(res, req, { report, target, media })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/reports/:reportId/media/:assetId', requireAdminPermission('reports.read'), async (req, res) => {
  try {
    const report = await db.one<any>('SELECT entity_id FROM reports WHERE id = $1', [req.params.reportId])
    if (!report) return adminFailure(res, req, 404, 'REPORT_NOT_FOUND', 'Report not found.')
    const asset = await db.one<any>(`SELECT data, mime_type, original_name, byte_size, purpose
      FROM media_assets WHERE id = $1 AND entity_id = $2
      AND purpose NOT IN ('verification_id_photo', 'verification_selfie')`, [req.params.assetId, report.entity_id])
    if (!asset) return adminFailure(res, req, 404, 'REPORT_MEDIA_NOT_FOUND', 'Report media not found.')
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Content-Type', asset.mime_type || 'application/octet-stream')
    res.setHeader('Content-Length', asset.byte_size)
    res.setHeader('Content-Disposition', `inline; filename="${String(asset.original_name || 'report-media').replace(/["\\\r\n]/g, '_')}"`)
    return res.send(asset.data)
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/events/reports', requireAdminPermission('reports.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const status = String(req.query.status || 'pending')
    const [reports, total] = await Promise.all([
      db.all(`
        SELECT r.*, u.username AS reporter_username, u.avatar_url AS reporter_avatar,
          e.title AS event_title, e.organizer_id, organizer.username AS organizer_username
        FROM reports r
        JOIN users u ON u.id = r.reporter_id
        LEFT JOIN events e ON e.id = r.entity_id AND r.entity_type = 'event'
        LEFT JOIN users organizer ON organizer.id = e.organizer_id
        WHERE r.entity_type = 'event' AND r.status = $1
        ORDER BY r.created_at DESC LIMIT $2 OFFSET $3
      `, [status, limit, offset]),
      db.one<any>("SELECT COUNT(*)::int AS count FROM reports WHERE entity_type = 'event' AND status = $1", [status]),
    ])
    return adminSuccess(res, req, reports, { page, limit, total: Number(total?.count || 0), status })
  } catch (error) {
    return internalError(res, req, error)
  }
})

async function moderateEvent(req: any, res: any, action: 'hide' | 'remove' | 'restore' | 'suspend_organizer') {
  const reason = String(req.body?.reason || '').trim().slice(0, 2000)
  try {
    const result = await withTransaction(async (tx) => {
      const event = await tx.one<any>(`
        SELECT e.id, e.title, e.status, e.hidden_at, e.organizer_id,
          u.username AS organizer_username, u.full_name AS organizer_name
        FROM events e JOIN users u ON u.id = e.organizer_id
        WHERE e.id = $1 FOR UPDATE
      `, [req.params.id])
      if (!event) return null

      const before = {
        status: event.status,
        hidden_at: event.hidden_at,
        organizer_id: event.organizer_id,
      }
      if (action === 'suspend_organizer') {
        await tx.run(
          `UPDATE users SET is_suspended = 1, suspension_reason = $1, updated_at = NOW() WHERE id = $2`,
          [reason || `Organizer action on event ${event.id}`, event.organizer_id],
        )
      } else if (action === 'restore') {
        await tx.run('UPDATE events SET hidden_at = NULL, updated_at = NOW() WHERE id = $1', [event.id])
        await tx.run(`
          INSERT INTO content_moderation
            (content_type, content_id, status, is_hidden, reason, updated_by, deleted_at, restored_at)
          VALUES ('event', $1, 'active', 0, $2, $3, NULL, NOW())
          ON CONFLICT (content_type, content_id) DO UPDATE SET
            status = 'active', is_hidden = 0, reason = EXCLUDED.reason,
            updated_by = EXCLUDED.updated_by, deleted_at = NULL, restored_at = NOW(), updated_at = NOW()
        `, [event.id, reason, req.admin!.adminId])
      } else {
        const status = action === 'remove' ? 'deleted' : 'hidden'
        await tx.run('UPDATE events SET hidden_at = NOW(), updated_at = NOW() WHERE id = $1', [event.id])
        await tx.run(`
          INSERT INTO content_moderation
            (content_type, content_id, status, is_hidden, reason, updated_by, deleted_at)
          VALUES ('event', $1, $2, 1, $3, $4, $5)
          ON CONFLICT (content_type, content_id) DO UPDATE SET
            status = EXCLUDED.status, is_hidden = 1, reason = EXCLUDED.reason,
            updated_by = EXCLUDED.updated_by, deleted_at = EXCLUDED.deleted_at, updated_at = NOW()
        `, [event.id, status, reason, req.admin!.adminId, action === 'remove' ? new Date() : null])
      }

      const after = { action, reason: reason || null }
      await recordAdminAudit(req, { action: `event.${action}`, resourceType: 'event', resourceId: event.id, reason, before, after }, tx)
      await recordModerationAction(req, { action: `event.${action}`, targetType: action === 'suspend_organizer' ? 'user' : 'event', targetId: action === 'suspend_organizer' ? event.organizer_id : event.id, reason, before, after }, tx)
      return { event_id: event.id, action, organizer_id: event.organizer_id }
    })
    if (!result) return adminFailure(res, req, 404, 'EVENT_NOT_FOUND', 'Event not found.')
    return adminSuccess(res, req, result)
  } catch (error) {
    return internalError(res, req, error)
  }
}

adminV1Router.get('/events/:id', requireAdminPermission('content.read'), async (req, res) => {
  try {
    const event = await db.one<any>(`
      SELECT e.*, u.username AS organizer_username, u.full_name AS organizer_name,
        u.avatar_url AS organizer_avatar, u.is_suspended AS organizer_suspended,
        (SELECT COUNT(*)::int FROM reports r WHERE r.entity_type = 'event' AND r.entity_id = e.id) AS report_count
      FROM events e JOIN users u ON u.id = e.organizer_id WHERE e.id = $1
    `, [req.params.id])
    if (!event) return adminFailure(res, req, 404, 'EVENT_NOT_FOUND', 'Event not found.')
    return adminSuccess(res, req, event)
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.post('/events/:id/hide', requireAdminPermission('content.moderate'), (req, res) => moderateEvent(req, res, 'hide'))
adminV1Router.post('/events/:id/remove', requireAdminPermission('content.moderate'), (req, res) => moderateEvent(req, res, 'remove'))
adminV1Router.post('/events/:id/restore', requireAdminPermission('content.moderate'), (req, res) => moderateEvent(req, res, 'restore'))
adminV1Router.post('/events/:id/suspend-organizer', requireAdminPermission('users.moderate'), (req, res) => moderateEvent(req, res, 'suspend_organizer'))

adminV1Router.patch('/reports/:id', requireAdminPermission('reports.review'), async (req, res) => {
  const status = String(req.body?.status || 'reviewed')
  const action = String(req.body?.action || '')
  const reason = String(req.body?.reason || '').trim().slice(0, 2000)
  if (!['pending', 'reviewed', 'dismissed', 'resolved'].includes(status)) return adminFailure(res, req, 400, 'REPORT_STATUS_INVALID', 'Invalid report status.')
  try {
    const result = await withTransaction(async (tx) => {
      const report = await tx.one<any>('SELECT id, entity_id, entity_type, reason, status FROM reports WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!report) return null
      let postBefore: any = null
      let postModerationBefore: any = null
      let commentBefore: any = null
      let commentModerationBefore: any = null
      if (action === 'remove_content' && report.entity_type === 'post') {
        postBefore = await tx.one<any>(
          'SELECT id, user_id, moderation_status, discovery_restricted FROM posts WHERE id = $1 FOR UPDATE',
          [report.entity_id],
        )
        if (!postBefore) return null
        postModerationBefore = await tx.one<any>(
          `SELECT * FROM content_moderation WHERE content_type = 'post' AND content_id = $1 FOR UPDATE`,
          [report.entity_id],
        )
      }
      if (action === 'remove_content' && report.entity_type === 'comment') {
        commentBefore = await tx.one<any>(
          'SELECT id, user_id, post_id, parent_id FROM comments WHERE id = $1 FOR UPDATE',
          [report.entity_id],
        )
        if (!commentBefore) return null
        commentModerationBefore = await tx.one<any>(
          `SELECT * FROM content_moderation WHERE content_type = 'comment' AND content_id = $1 FOR UPDATE`,
          [report.entity_id],
        )
      }
      const before = { status: report.status, action: null }
      await tx.run('UPDATE reports SET status = $1, reviewed_by = $2 WHERE id = $3', [status, req.admin!.adminId, req.params.id])
      let targetId: string | null = null
      let notification: any = null
      let moderationTargetType = report.entity_type
      let moderationTargetId = report.entity_id
      if (action === 'warn_user') {
        targetId = report.entity_type === 'user'
          ? report.entity_id
          : report.entity_type === 'post'
            ? (await tx.one<any>('SELECT user_id FROM posts WHERE id = $1', [report.entity_id]))?.user_id
            : report.entity_type === 'event'
              ? (await tx.one<any>('SELECT organizer_id FROM events WHERE id = $1', [report.entity_id]))?.organizer_id
              : report.entity_type === 'comment'
                ? (await tx.one<any>('SELECT user_id FROM comments WHERE id = $1', [report.entity_id]))?.user_id
            : null
        if (targetId) {
          await tx.run('UPDATE users SET warnings_count = COALESCE(warnings_count, 0) + 1 WHERE id = $1', [targetId])
          await tx.run("INSERT INTO notifications (id, user_id, type, entity_type, content) VALUES ($1,$2,'system','moderation',$3)", [uuidv4(), targetId, `A moderation warning was issued for ${report.reason || 'a policy report'}.`])
        }
      }
      if (action === 'remove_content' && report.entity_type === 'post') {
        targetId = postBefore.user_id
        await tx.run(
          `UPDATE posts SET moderation_status = 'deleted', discovery_restricted = 1, updated_at = NOW()
           WHERE id = $1`,
          [report.entity_id],
        )
        const reasonText = reason || report.reason || 'Removed after report review'
        const moderationAfter = await tx.one<any>(
          `INSERT INTO content_moderation
            (content_type, content_id, status, is_hidden, reason, updated_by, deleted_at)
           VALUES ('post', $1, 'deleted', 0, $2, $3, NOW())
           ON CONFLICT (content_type, content_id) DO UPDATE SET
             status = 'deleted', is_hidden = 0, reason = EXCLUDED.reason,
             updated_by = EXCLUDED.updated_by, deleted_at = NOW(), updated_at = NOW()
           RETURNING *`,
          [report.entity_id, reasonText, req.admin!.adminId],
        )
        const postAfter = { ...postBefore, moderation_status: 'deleted', discovery_restricted: 1 }
        await recordModerationAction(req, {
          action: 'content.delete',
          targetType: 'post',
          targetId: report.entity_id,
          reason: reasonText,
          before: { post: postBefore, content_moderation: postModerationBefore },
          after: { post: postAfter, content_moderation: moderationAfter },
        }, tx)
        const notificationId = uuidv4()
        const notificationContent = 'Your post was removed by a moderator.'
        await tx.run(
          `INSERT INTO notifications (id, user_id, type, entity_id, entity_type, content)
           VALUES ($1,$2,'moderation',$3,'post',$4)`,
          [notificationId, targetId, report.entity_id, notificationContent],
        )
        notification = {
          id: notificationId,
          user_id: targetId,
          entity_id: report.entity_id,
          entity_type: 'post',
          content: notificationContent,
        }
      }
      if (action === 'remove_content' && report.entity_type === 'comment') {
        targetId = commentBefore.user_id
        const reasonText = reason || report.reason || 'Removed after comment report review'
        const wasHidden = Boolean(commentModerationBefore?.is_hidden || ['hidden', 'deleted'].includes(commentModerationBefore?.status))
        const moderationAfter = await tx.one<any>(
          `INSERT INTO content_moderation
            (content_type, content_id, status, is_hidden, reason, updated_by, deleted_at)
           VALUES ('comment', $1, 'deleted', 0, $2, $3, NOW())
           ON CONFLICT (content_type, content_id) DO UPDATE SET
             status = 'deleted', is_hidden = 0, reason = EXCLUDED.reason,
             updated_by = EXCLUDED.updated_by, deleted_at = NOW(), updated_at = NOW()
           RETURNING *`,
          [report.entity_id, reasonText, req.admin!.adminId],
        )
        if (!commentBefore.parent_id && !wasHidden) {
          await tx.run('UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1', [commentBefore.post_id])
        }
        await recordModerationAction(req, {
          action: 'content.delete',
          targetType: 'comment',
          targetId: report.entity_id,
          reason: reasonText,
          before: { comment: commentBefore, content_moderation: commentModerationBefore },
          after: { content_moderation: moderationAfter },
        }, tx)
        const notificationId = uuidv4()
        const notificationContent = 'Your comment was removed by a moderator.'
        await tx.run(
          `INSERT INTO notifications (id, user_id, type, entity_id, entity_type, content)
           VALUES ($1,$2,'moderation',$3,'comment',$4)`,
          [notificationId, targetId, report.entity_id, notificationContent],
        )
        notification = {
          id: notificationId,
          user_id: targetId,
          entity_id: report.entity_id,
          entity_type: 'comment',
          content: notificationContent,
        }
      }
      if (report.entity_type === 'event' && ['hide_event', 'remove_event', 'restore_event', 'suspend_event_organizer'].includes(action)) {
        if (action === 'suspend_event_organizer') {
          const organizer = await tx.one<any>('SELECT organizer_id FROM events WHERE id = $1 FOR UPDATE', [report.entity_id])
          if (!organizer) return null
          targetId = organizer.organizer_id
          moderationTargetType = 'user'
          moderationTargetId = organizer.organizer_id
          await tx.run(`UPDATE users SET is_suspended = 1, suspension_reason = $1, updated_at = NOW() WHERE id = $2`, [reason || `Event report ${report.id}`, organizer.organizer_id])
        } else if (action === 'restore_event') {
          await tx.run('UPDATE events SET hidden_at = NULL, updated_at = NOW() WHERE id = $1', [report.entity_id])
          await tx.run(`
            INSERT INTO content_moderation (content_type, content_id, status, is_hidden, reason, updated_by, restored_at)
            VALUES ('event', $1, 'active', 0, $2, $3, NOW())
            ON CONFLICT (content_type, content_id) DO UPDATE SET status = 'active', is_hidden = 0,
              reason = EXCLUDED.reason, updated_by = EXCLUDED.updated_by, deleted_at = NULL, restored_at = NOW(), updated_at = NOW()
          `, [report.entity_id, reason, req.admin!.adminId])
        } else {
          const moderationStatus = action === 'remove_event' ? 'deleted' : 'hidden'
          await tx.run('UPDATE events SET hidden_at = NOW(), updated_at = NOW() WHERE id = $1', [report.entity_id])
          await tx.run(`
            INSERT INTO content_moderation (content_type, content_id, status, is_hidden, reason, updated_by, deleted_at)
            VALUES ('event', $1, $2, 1, $3, $4, $5)
            ON CONFLICT (content_type, content_id) DO UPDATE SET status = EXCLUDED.status, is_hidden = 1,
              reason = EXCLUDED.reason, updated_by = EXCLUDED.updated_by, deleted_at = EXCLUDED.deleted_at, updated_at = NOW()
          `, [report.entity_id, moderationStatus, reason, req.admin!.adminId, action === 'remove_event' ? new Date() : null])
        }
      }
      const after = { status, action: action || null }
      await recordAdminAudit(req, { action: `report.${action || 'review'}`, resourceType: 'report', resourceId: report.id, reason, before, after }, tx)
      if (action) {
        await recordModerationAction(req, { action: `report.${action}`, targetType: moderationTargetType, targetId: moderationTargetId, reason: reason || report.reason, before, after }, tx)
      }
      return { report_id: report.id, status, action: action || null, target_user_id: targetId, notification }
    })
    if (!result) return adminFailure(res, req, 404, 'REPORT_NOT_FOUND', 'Report not found.')
    if (result.notification) {
      emitUserNotification(result.notification.user_id, {
        ...result.notification,
        type: 'moderation',
        is_read: 0,
        created_at: new Date().toISOString(),
      })
    }
    delete result.notification
    return adminSuccess(res, req, result)
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/audit', requireAdminPermission('audit.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const [items, total] = await Promise.all([
      db.all(`SELECT id, admin_id, action, resource_type, resource_id, reason, before_summary, after_summary, request_id, ip_address, created_at FROM admin_audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
      db.one<any>('SELECT COUNT(*)::int AS count FROM admin_audit_logs'),
    ])
    return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0) })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/security-events', requireAdminPermission('security.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const [items, total] = await Promise.all([
      db.all(`SELECT id, admin_id, event_type, email, ip_address, user_agent, metadata, created_at FROM admin_security_events ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
      db.one<any>('SELECT COUNT(*)::int AS count FROM admin_security_events'),
    ])
    return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0) })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.get('/moderation-actions', requireAdminPermission('audit.read'), async (req, res) => {
  try {
    const { page, limit, offset } = pageParams(req)
    const [items, total] = await Promise.all([
      db.all(`SELECT id, admin_id, action, target_type, target_id, reason, before_summary, after_summary, metadata, request_id, created_at FROM moderation_actions ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
      db.one<any>('SELECT COUNT(*)::int AS count FROM moderation_actions'),
    ])
    return adminSuccess(res, req, items, { page, limit, total: Number(total?.count || 0) })
  } catch (error) {
    return internalError(res, req, error)
  }
})

adminV1Router.post('/admin-sessions/revoke-all', requireAdminPermission('admins.manage'), async (req, res) => {
  const adminUsername = String(req.body?.admin_username || req.body?.admin_id || '').trim().replace(/^@/, '').toLowerCase()
  if (!adminUsername) return adminFailure(res, req, 400, 'ADMIN_USERNAME_REQUIRED', 'admin_username is required.')
  try {
    await db.run('UPDATE admin_sessions SET revoked_at = NOW() WHERE admin_username = $1', [adminUsername])
    await recordSecurityEvent(req, 'admin_sessions_revoked', { metadata: { target_admin_username: adminUsername } })
    await recordAdminAudit(req, { action: 'admin.sessions.revoke_all', resourceType: 'admin', resourceId: `admin:${adminUsername}` })
    return adminSuccess(res, req, { admin_username: adminUsername, revoked: true })
  } catch (error) {
    return internalError(res, req, error)
  }
})