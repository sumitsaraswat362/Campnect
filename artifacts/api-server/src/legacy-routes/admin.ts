// @ts-nocheck
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../legacy-db/index.js'
import { requireAdminPanel, requireAdminPermission } from '../legacy-middleware/auth.js'
import { sendSuspensionEmail, sendVerificationDecisionEmail } from '../legacy-services/email.js'
import { mediaAssetId } from '../legacy-services/media.js'
import { recordAdminAudit, recordModerationAction } from '../legacy-services/adminSecurity.js'
import { emitGlimpseRefresh } from '../legacy-services/glimpseRealtime.js'

export const adminRouter = Router()
adminRouter.use(requireAdminPanel)

adminRouter.get('/stats', requireAdminPermission('dashboard.read'), async (_req, res) => {
  try {
    const range = String(_req.query.range || '30d')
    const days = range === 'today' ? 1 : range === '7d' ? 7 : range === '90d' ? 90 : 30
    const [
      totalUsers, verifiedUsers, pendingVerifications, totalPosts,
      postsToday, pendingReports, totalCommunities, activeUsers7d, signupsToday,
      dailySignups, topColleges,
    ] = await Promise.all([
      db.one<any>('SELECT COUNT(*) as c FROM users'),
      db.one<any>('SELECT COUNT(*) as c FROM users WHERE is_college_verified = 1'),
      db.one<any>("SELECT COUNT(*) as c FROM college_verifications WHERE status = 'pending'"),
      db.one<any>('SELECT COUNT(*) as c FROM posts'),
      db.one<any>("SELECT COUNT(*) as c FROM posts WHERE created_at > NOW() - INTERVAL '1 day'"),
      db.one<any>("SELECT COUNT(*) as c FROM reports WHERE status = 'pending'"),
      db.one<any>('SELECT COUNT(*) as c FROM communities'),
      db.one<any>("SELECT COUNT(*) as c FROM users WHERE last_seen > NOW() - INTERVAL '7 days'"),
      db.one<any>(`SELECT COUNT(*) as c FROM users WHERE created_at > NOW() - ($1::int * INTERVAL '1 day')`, [days]),
      db.all(`SELECT created_at::date as date, COUNT(*) as count FROM users WHERE created_at > NOW() - ($1::int * INTERVAL '1 day') GROUP BY created_at::date ORDER BY date ASC`, [days]),
      db.all("SELECT college_name, COUNT(*) as count FROM users WHERE college_name != '' GROUP BY college_name ORDER BY count DESC LIMIT 10"),
    ])
    const stats = {
      total_users: Number(totalUsers?.c ?? 0),
      verified_users: Number(verifiedUsers?.c ?? 0),
      pending_verifications: Number(pendingVerifications?.c ?? 0),
      total_posts: Number(totalPosts?.c ?? 0),
      posts_today: Number(postsToday?.c ?? 0),
      pending_reports: Number(pendingReports?.c ?? 0),
      total_communities: Number(totalCommunities?.c ?? 0),
      active_users_7d: Number(activeUsers7d?.c ?? 0),
      signups_today: Number(signupsToday?.c ?? 0),
    }
    res.json({ success: true, data: { stats, daily_signups: dailySignups, top_colleges: topColleges } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

adminRouter.get('/users', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const { q, status, limit = '20', page = '1' } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    let sql = 'SELECT id, email, username, full_name, avatar_url, college_name, department, course, year, semester, is_email_verified, is_college_verified, verification_status, is_admin, is_suspended, is_shadowbanned, suspension_reason, warnings_count, is_online, last_seen, created_at, followers_count, posts_count FROM users WHERE 1=1'
    const params: any[] = []
    if (q) { sql += ' AND (LOWER(username) LIKE ? OR LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?)'; params.push(`%${(q as string).toLowerCase()}%`, `%${(q as string).toLowerCase()}%`, `%${(q as string).toLowerCase()}%`) }
    if (status === 'unverified') { sql += ' AND is_college_verified = 0' }
    if (status === 'pending') { sql += " AND verification_status = 'pending'" }
    if (status === 'suspended') { sql += ' AND COALESCE(is_suspended, 0) = 1' }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), offset)
    const [finalSql, finalParams] = db.toPos(sql, params)
    const [users, totalRow] = await Promise.all([
      db.all(finalSql, finalParams),
      db.one<any>(`SELECT COUNT(*) as c FROM users WHERE 1=1${q ? ' AND (LOWER(username) LIKE $1 OR LOWER(full_name) LIKE $2 OR LOWER(email) LIKE $3)' : ''}${status === 'unverified' ? ' AND is_college_verified = 0' : ''}${status === 'pending' ? " AND verification_status = 'pending'" : ''}${status === 'suspended' ? ' AND COALESCE(is_suspended, 0) = 1' : ''}`, q ? [`%${String(q).toLowerCase()}%`, `%${String(q).toLowerCase()}%`, `%${String(q).toLowerCase()}%`] : []),
    ])
    res.json({ success: true, data: users, meta: { total: Number(totalRow?.c ?? 0) } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

adminRouter.get('/users/:id', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const user = await db.one<any>(`
      SELECT u.*, c.name AS linked_college_name, c.city AS linked_college_city
      FROM users u LEFT JOIN colleges c ON c.id = u.college_id
      WHERE u.id = $1
    `, [req.params.id])
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' })

    const [verifications, posts, stories, reports, comments, alumniRequests] = await Promise.all([
      db.all(`SELECT cv.*, c.name AS verification_college_name FROM college_verifications cv LEFT JOIN colleges c ON c.id = cv.college_id WHERE cv.user_id = $1 ORDER BY cv.submitted_at DESC`, [req.params.id]),
      db.all(`SELECT id, type, content, media, visibility, likes_count, comments_count, shares_count, created_at FROM posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]),
      db.all(`SELECT id, type, media_url, thumbnail_url, caption, views_count, expires_at, created_at FROM stories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]),
      db.all(`
        SELECT r.*, reporter.username AS reporter_username, reporter.full_name AS reporter_name
        FROM reports r LEFT JOIN users reporter ON reporter.id = r.reporter_id
        WHERE r.entity_id = $1 OR (r.entity_type = 'post' AND r.entity_id IN (SELECT id FROM posts WHERE user_id = $1))
        ORDER BY r.created_at DESC
      `, [req.params.id]),
      db.all(`SELECT COUNT(*)::int AS count FROM comments WHERE user_id = $1`, [req.params.id]),
      db.all(`SELECT * FROM alumni_requests WHERE user_id = $1 ORDER BY requested_at DESC`, [req.params.id]),
    ])
    for (const verification of verifications as any[]) {
      verification.id_photo_url = verification.id_photo_url ? `/api/admin/verifications/${verification.id}/media/id` : null
      verification.selfie_url = verification.selfie_url ? `/api/admin/verifications/${verification.id}/media/selfie` : null
    }
    res.json({
      success: true,
      data: {
        user,
        verifications,
        posts,
        stories,
        reports,
        comments_count: Number(comments[0]?.count || 0),
        alumni_requests: alumniRequests,
      },
    })
  } catch (err: any) {
    console.error('admin user detail failed:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

adminRouter.get('/content/:type', requireAdminPermission('content.read'), async (req, res) => {
  try {
    const type = String(req.params.type)
    const limit = Math.min(Number(req.query.limit || 50), 100)
    if (type === 'glimpses') {
      const params: any[] = []
      const filters = ['p.type = \'glimpse\'']
      if (req.query.status) {
        params.push(String(req.query.status))
        filters.push(`p.moderation_status = $${params.length}`)
      }
      if (req.query.q) {
        params.push(`%${String(req.query.q).toLowerCase()}%`)
        filters.push(`(LOWER(COALESCE(p.content, '')) LIKE $${params.length} OR LOWER(u.username) LIKE $${params.length} OR LOWER(u.full_name) LIKE $${params.length})`)
      }
      if (req.query.college_id) {
        params.push(String(req.query.college_id))
        filters.push(`u.college_id = $${params.length}`)
      }
      if (req.query.from) {
        params.push(String(req.query.from))
        filters.push(`p.created_at >= $${params.length}::timestamptz`)
      }
      if (req.query.to) {
        params.push(String(req.query.to))
        filters.push(`p.created_at < ($${params.length}::date + INTERVAL '1 day')`)
      }
      params.push(limit)
      const data = await db.all(`
        SELECT p.id, p.user_id, p.content, p.media, p.cover_url, p.event_id, p.moderation_status,
          p.discovery_restricted, p.likes_count, p.comments_count, p.created_at,
          u.username, u.full_name, u.avatar_url, c.name AS college_name,
          COALESCE((SELECT COUNT(*) FROM reports r WHERE r.entity_id = p.id AND r.entity_type = 'glimpse' AND r.status = 'pending'), 0)::int AS pending_reports
        FROM posts p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN colleges c ON c.id = u.college_id
        WHERE ${filters.join(' AND ')}
        ORDER BY p.created_at DESC
        LIMIT $${params.length}
      `, params)
      return res.json({ success: true, data, meta: { label: 'Glimpses', limit } })
    }
    const queries: Record<string, { sql: string; label: string }> = {
      posts: { label: 'Posts', sql: `SELECT p.*, u.username, u.full_name, u.avatar_url FROM posts p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT $1` },
      reels: { label: 'Reels', sql: `SELECT p.*, u.username, u.full_name, u.avatar_url FROM posts p JOIN users u ON u.id = p.user_id WHERE p.type IN ('reel','glimpse','video') ORDER BY p.created_at DESC LIMIT $1` },
      stories: { label: 'Stories', sql: `SELECT s.*, u.username, u.full_name, u.avatar_url FROM stories s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT $1` },
      comments: { label: 'Comments', sql: `SELECT c.*, u.username, u.full_name, p.content AS post_content FROM comments c JOIN users u ON u.id = c.user_id LEFT JOIN posts p ON p.id = c.post_id ORDER BY c.created_at DESC LIMIT $1` },
      groups: { label: 'Groups', sql: `SELECT c.*, c.members_count AS member_count FROM communities c ORDER BY c.created_at DESC LIMIT $1` },
    }
    const definition = queries[type]
    if (!definition) return res.status(404).json({ success: false, error: 'Unknown content section.' })
    const data = await db.all(definition.sql, [limit])
    res.json({ success: true, data, meta: { label: definition.label } })
  } catch (err: any) {
    console.error('admin content failed:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

adminRouter.patch('/glimpses/:id', requireAdminPermission('content.moderate'), async (req, res) => {
  try {
    const before = await db.one<any>(
      `SELECT id, user_id, moderation_status, discovery_restricted, content
       FROM posts WHERE id = $1 AND type = 'glimpse'`,
      [req.params.id],
    )
    if (!before) return res.status(404).json({ success: false, error: 'Glimpse not found.' })

    const requestedStatus = req.body?.moderation_status
    const allowedStatuses = new Set(['pending', 'approved', 'restricted', 'removed', 'rejected'])
    const status = allowedStatuses.has(String(requestedStatus))
      ? String(requestedStatus)
      : String(before.moderation_status || 'approved')
    const restricted = req.body?.discovery_restricted === undefined
      ? Number(before.discovery_restricted || 0)
      : (req.body.discovery_restricted ? 1 : 0)
    const reason = String(req.body?.reason || '').trim().slice(0, 2000)

    const after = await db.one<any>(`
      UPDATE posts
      SET moderation_status = $1, discovery_restricted = $2, updated_at = NOW()
      WHERE id = $3 AND type = 'glimpse'
      RETURNING id, user_id, moderation_status, discovery_restricted, updated_at
    `, [status, restricted, req.params.id])

    const action = restricted
      ? 'glimpse.discovery_restrict'
      : status === 'removed'
        ? 'glimpse.remove'
        : status === 'approved'
          ? 'glimpse.approve'
          : `glimpse.${status}`
    await recordModerationAction(req, {
      action,
      targetType: 'glimpse',
      targetId: req.params.id,
      reason,
      before,
      after,
      metadata: { discovery_restricted: Boolean(restricted) },
    })
    await recordAdminAudit(req, {
      action,
      resourceType: 'glimpse',
      resourceId: req.params.id,
      reason,
      before,
      after,
    })
    void emitGlimpseRefresh(before.user_id).catch(() => console.warn('glimpse refresh dispatch failed'))
    res.json({ success: true, data: after })
  } catch (err: any) {
    console.error('admin glimpse moderation failed:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

adminRouter.post('/glimpses/:id/restore', requireAdminPermission('content.moderate'), async (req, res) => {
  try {
    const before = await db.one<any>(
      `SELECT id, user_id, moderation_status, discovery_restricted
       FROM posts WHERE id = $1 AND type = 'glimpse'`,
      [req.params.id],
    )
    if (!before) return res.status(404).json({ success: false, error: 'Glimpse not found.' })
    const after = await db.one<any>(`
      UPDATE posts SET moderation_status = 'approved', discovery_restricted = 0, updated_at = NOW()
      WHERE id = $1 AND type = 'glimpse'
      RETURNING id, user_id, moderation_status, discovery_restricted, updated_at
    `, [req.params.id])
    const reason = String(req.body?.reason || 'Restored after moderation review').slice(0, 2000)
    await recordModerationAction(req, { action: 'glimpse.restore', targetType: 'glimpse', targetId: req.params.id, reason, before, after })
    await recordAdminAudit(req, { action: 'glimpse.restore', resourceType: 'glimpse', resourceId: req.params.id, reason, before, after })
    void emitGlimpseRefresh(before.user_id).catch(() => console.warn('glimpse refresh dispatch failed'))
    res.json({ success: true, data: after })
  } catch (err: any) {
    console.error('admin glimpse restore failed:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

adminRouter.get('/glimpses/:id/reports', requireAdminPermission('reports.read'), async (req, res) => {
  try {
    const reports = await db.all(`
      SELECT r.*, u.username AS reporter_username, u.full_name AS reporter_name, u.avatar_url AS reporter_avatar
      FROM reports r
      JOIN users u ON u.id = r.reporter_id
      WHERE r.entity_id = $1 AND r.entity_type = 'glimpse'
      ORDER BY r.created_at DESC
    `, [req.params.id])
    res.json({ success: true, data: reports })
  } catch (err: any) {
    console.error('admin glimpse reports failed:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

adminRouter.get('/glimpses/:id/moderation-history', requireAdminPermission('content.read'), async (req, res) => {
  try {
    const history = await db.all(`
      SELECT ma.*, u.username AS admin_username
      FROM moderation_actions ma
      LEFT JOIN users u ON u.id = ma.admin_id
      WHERE ma.target_type = 'glimpse' AND ma.target_id = $1
      ORDER BY ma.created_at DESC
    `, [req.params.id])
    res.json({ success: true, data: history })
  } catch (err: any) {
    console.error('admin glimpse history failed:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

adminRouter.get('/system/:type', requireAdminPermission('dashboard.read'), async (req, res) => {
  try {
    const type = String(req.params.type)
    if (type === 'health') {
      const [users, posts, pendingReports] = await Promise.all([
        db.one<any>('SELECT COUNT(*)::int AS count FROM users'),
        db.one<any>('SELECT COUNT(*)::int AS count FROM posts'),
        db.one<any>("SELECT COUNT(*)::int AS count FROM reports WHERE status = 'pending'"),
      ])
      return res.json({ success: true, data: { database: 'healthy', api: 'healthy', users: users.count, posts: posts.count, pending_reports: pendingReports.count, checked_at: new Date().toISOString() } })
    }
     if (type === 'audit') {
       if (!req.admin?.permissions.includes('*') && !req.admin?.permissions.includes('audit.read')) {
         return res.status(403).json({ success: false, error: 'Audit access required.' })
       }
       const limit = Math.min(Number(req.query.limit || 50), 100)
       const audit = await db.all(
         `SELECT id, admin_id, action, resource_type, resource_id, reason, before_summary, after_summary, request_id, created_at
          FROM admin_audit_logs ORDER BY created_at DESC LIMIT $1`,
         [limit],
       )
       return res.json({ success: true, data: audit, meta: { limit, request_id: req.requestId } })
    }
    if (type === 'settings') {
      return res.json({ success: true, data: { admin_email: 'admin@campnect.com', password_source: 'Replit Secret', student_login_separate: true } })
    }
    return res.status(404).json({ success: false, error: 'Unknown system section.' })
  } catch (err: any) {
    console.error('admin system failed:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

adminRouter.post('/users/:id/suspend', requireAdminPermission('users.moderate'), async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim()
    if (!reason) return res.status(400).json({ success: false, error: 'A suspension reason is required.' })
     const user = await db.one<any>('SELECT id, email, full_name, is_suspended, is_shadowbanned, warnings_count, suspension_reason FROM users WHERE id = $1', [req.params.id])
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' })
     const after = await db.one<any>("UPDATE users SET is_suspended = 1, suspension_reason = $1, warnings_count = COALESCE(warnings_count, 0) + 1 WHERE id = $2 RETURNING is_suspended, is_shadowbanned, warnings_count, suspension_reason", [reason, req.params.id])
    await db.run("INSERT INTO notifications (id, user_id, type, entity_type, content) VALUES ($1,$2,'system','account',$3)", [uuidv4(), req.params.id, `Your account has been suspended. Reason: ${reason}`])
     await recordAdminAudit(req, { action: 'user.suspend', resourceType: 'user', resourceId: req.params.id, reason, before: user, after })
    sendSuspensionEmail(user.email, user.full_name, reason).catch((err) => console.error('suspension email failed:', err.message))
    res.json({ success: true, message: 'User suspended.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

adminRouter.post('/users/:id/warn', requireAdminPermission('users.moderate'), async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim()
    if (!reason) return res.status(400).json({ success: false, error: 'A warning reason is required.' })
     const user = await db.one<any>('SELECT id, warnings_count FROM users WHERE id = $1', [req.params.id])
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' })
    const message = `You received a moderation warning: ${reason}`
     const after = await db.one<any>('UPDATE users SET warnings_count = COALESCE(warnings_count, 0) + 1 WHERE id = $1 RETURNING warnings_count', [req.params.id])
    await db.run("INSERT INTO notifications (id, user_id, type, entity_type, content) VALUES ($1,$2,'system','moderation',$3)", [uuidv4(), req.params.id, message])
     await recordAdminAudit(req, { action: 'user.warn', resourceType: 'user', resourceId: req.params.id, reason, before: user, after })
    res.json({ success: true, message: 'Warning issued.' })
  } catch (err: any) {
    console.error('admin warning failed:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

adminRouter.post('/users/:id/remove-warning', requireAdminPermission('users.moderate'), async (req, res) => {
  try {
    const user = await db.one<any>('SELECT id, warnings_count FROM users WHERE id = $1', [req.params.id])
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' })
     const after = await db.one<any>('UPDATE users SET warnings_count = GREATEST(COALESCE(warnings_count, 0) - 1, 0) WHERE id = $1 RETURNING warnings_count', [req.params.id])
    await db.run("INSERT INTO notifications (id, user_id, type, entity_type, content) VALUES ($1,$2,'system','moderation',$3)", [uuidv4(), req.params.id, 'One moderation warning was removed from your account.'])
     await recordAdminAudit(req, { action: 'user.remove_warning', resourceType: 'user', resourceId: req.params.id, before: user, after })
    res.json({ success: true, message: 'Warning removed.' })
  } catch (err: any) {
    console.error('admin warning removal failed:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

adminRouter.post('/users/:id/shadowban', requireAdminPermission('users.moderate'), async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled)
     const user = await db.one<any>('SELECT id, is_shadowbanned FROM users WHERE id = $1', [req.params.id])
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' })
     const after = await db.one<any>('UPDATE users SET is_shadowbanned = $1 WHERE id = $2 RETURNING is_shadowbanned', [enabled ? 1 : 0, req.params.id])
    await db.run("INSERT INTO notifications (id, user_id, type, entity_type, content) VALUES ($1,$2,'system','moderation',$3)", [uuidv4(), req.params.id, enabled ? 'Your account visibility has been restricted by moderation.' : 'Your account visibility restriction was removed.'])
     await recordAdminAudit(req, { action: `user.${enabled ? 'shadowban' : 'unshadowban'}`, resourceType: 'user', resourceId: req.params.id, before: user, after })
    res.json({ success: true, shadowbanned: enabled })
  } catch (err: any) {
    console.error('admin shadowban failed:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

adminRouter.post('/users/:id/unsuspend', requireAdminPermission('users.moderate'), async (req, res) => {
  try {
     const before = await db.one<any>('SELECT id, is_suspended, suspension_reason FROM users WHERE id = $1', [req.params.id])
     const after = await db.one<any>("UPDATE users SET is_suspended = 0, suspension_reason = '' WHERE id = $1 RETURNING is_suspended, suspension_reason", [req.params.id])
     await recordAdminAudit(req, { action: 'user.unsuspend', resourceType: 'user', resourceId: req.params.id, before, after })
    res.json({ success: true, message: 'User unsuspended.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

adminRouter.post('/users/:id/make-admin', requireAdminPermission('admins.manage'), async (req, res) => {
   await recordAdminAudit(req, {
     action: 'user.make_admin.rejected',
     resourceType: 'user',
     resourceId: req.params.id,
     reason: 'Profile-based Admin identities are retired; the separate Admin Panel uses Replit Secrets.',
   })
   return res.status(409).json({
     success: false,
     error: 'Profile-based Admin identities are retired. Configure the separate Admin Panel identity in Replit Secrets.',
   })
})

adminRouter.get('/verifications', requireAdminPermission('verifications.read'), async (req, res) => {
  try {
    const { status = 'pending', limit = '20', page = '1' } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    const [verifications, totalRow] = await Promise.all([
      db.all(`
         SELECT cv.*, u.username, u.full_name, u.email, u.college_name, u.college_id, u.avatar_url,
           u.department, u.course, u.year, u.semester, u.is_email_verified, u.is_college_verified
        FROM college_verifications cv JOIN users u ON cv.user_id = u.id
        WHERE cv.status = $1 ORDER BY cv.submitted_at ASC LIMIT $2 OFFSET $3
      `, [status, Number(limit), offset]),
      db.one<any>('SELECT COUNT(*) as c FROM college_verifications WHERE status = $1', [status]),
    ])
    const data = verifications.map((verification: any) => ({
      ...verification,
      id_photo_url: verification.id_photo_url ? `/api/admin/verifications/${verification.id}/media/id` : null,
      selfie_url: verification.selfie_url ? `/api/admin/verifications/${verification.id}/media/selfie` : null,
    }))
    res.json({ success: true, data, meta: { total: Number(totalRow?.c ?? 0) } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// Transitional embedded-console compatibility route. Verification bytes are
// never served by the public /api/media route; the current console fetches
// them here with its bearer-authenticated admin session.
adminRouter.get('/verifications/:id/media/:kind', async (req, res) => {
  try {
    const kind = String(req.params.kind)
    const column = kind === 'id' ? 'id_photo_url' : kind === 'selfie' ? 'selfie_url' : ''
    if (!column) return res.status(400).json({ success: false, error: 'Media kind must be id or selfie.' })
    const verificationId = String(req.params.id)
    const verification = await db.one<any>(`SELECT ${column} AS media_url FROM college_verifications WHERE id = $1`, [verificationId])
    const assetId = mediaAssetId(verification?.media_url)
    if (!assetId) return res.status(404).type('text').send('Verification media not found')
    const asset = await db.one<any>(`
      SELECT ma.mime_type, ma.byte_size, ma.checksum
      FROM media_assets ma
      JOIN college_verifications cv ON cv.user_id = ma.owner_id
      WHERE cv.id = $1 AND ma.id = $2
        AND (cv.id_photo_url = '/api/media/' || ma.id OR cv.selfie_url = '/api/media/' || ma.id)
    `, [verificationId, assetId])
    if (!asset) return res.status(404).type('text').send('Verification media not found')
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
  } catch (err: any) {
    console.error('admin verification media failed:', err.message)
    return res.status(500).json({ success: false, error: 'Unable to load verification media.' })
  }
})

adminRouter.patch('/verifications/:id', requireAdminPermission('verifications.review'), async (req, res) => {
  try {
    const { status, review_notes } = req.body
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, error: 'Status must be approved or rejected.' })
     const verification = await db.one<any>('SELECT cv.id, cv.user_id, cv.status, u.email, u.full_name FROM college_verifications cv JOIN users u ON u.id = cv.user_id WHERE cv.id = $1', [req.params.id])
    if (!verification) return res.status(404).json({ success: false, error: 'Verification not found.' })

    await db.run('UPDATE college_verifications SET status = $1, review_notes = $2, reviewed_at = NOW(), reviewer_id = $3 WHERE id = $4', [status, review_notes || '', req.user!.userId, req.params.id])

    if (status === 'approved') {
      await db.run("UPDATE users SET is_college_verified = 1, verification_status = 'approved' WHERE id = $1", [verification.user_id])
    } else {
      await db.run("UPDATE users SET verification_status = 'rejected' WHERE id = $1", [verification.user_id])
    }

    const decisionMessage = status === 'approved'
      ? 'Your college verification was approved! 🎉 You now have a verified badge.'
      : `Your college verification was declined. Reason: ${review_notes || 'Please resubmit with clearer photos.'}`
    await db.run("INSERT INTO notifications (id, user_id, type, entity_type, content) VALUES ($1,$2,'system','verification',$3)", [uuidv4(), verification.user_id, decisionMessage])
     await recordAdminAudit(req, { action: `verification.${status}`, resourceType: 'verification', resourceId: req.params.id, reason: review_notes || '', before: verification, after: { status, review_notes } })
    sendVerificationDecisionEmail(verification.email, verification.full_name, status === 'approved', review_notes || '').catch((err) => console.error('verification email failed:', err.message))
    res.json({ success: true, message: `Verification ${status}.` })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

adminRouter.get('/reports', requireAdminPermission('reports.read'), async (req, res) => {
  try {
    const { status = 'pending', limit = '20', page = '1' } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    const reports = await db.all(`
      SELECT r.*, u.username as reporter_username, u.avatar_url as reporter_avatar
      FROM reports r JOIN users u ON r.reporter_id = u.id
      WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT $2 OFFSET $3
    `, [status, Number(limit), offset])
    res.json({ success: true, data: reports })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

adminRouter.patch('/reports/:id', requireAdminPermission('reports.review'), async (req, res) => {
  try {
    const { status, action } = req.body
     const report = await db.one<any>('SELECT id, entity_id, entity_type, reason, status FROM reports WHERE id = $1', [req.params.id])
     if (!report) return res.status(404).json({ success: false, error: 'Report not found.' })
    await db.run('UPDATE reports SET status = $1, reviewed_by = $2 WHERE id = $3', [status || 'reviewed', req.user!.userId, req.params.id])
    if (action === 'warn_user' && report) {
      const target = report.entity_type === 'user'
        ? report.entity_id
        : ['post', 'glimpse'].includes(report.entity_type)
          ? (await db.one<any>('SELECT user_id FROM posts WHERE id = $1', [report.entity_id]))?.user_id
          : null
      if (target) {
        const message = `A moderation warning was issued for a report categorized as ${report.reason || 'policy violation'}.`
        await db.run('UPDATE users SET warnings_count = COALESCE(warnings_count, 0) + 1 WHERE id = $1', [target])
        await db.run("INSERT INTO notifications (id, user_id, type, entity_type, content) VALUES ($1,$2,'system','moderation',$3)", [uuidv4(), target, message])
      }
    }
    if (action === 'remove_content') {
      if (['post', 'glimpse'].includes(report?.entity_type)) {
        const post = await db.one<any>(
          'SELECT id, user_id, type, moderation_status, discovery_restricted FROM posts WHERE id = $1',
          [report.entity_id],
        )
        if (post?.type === 'glimpse') {
          // Keep the legacy Glimpse removal status and discovery handling intact.
          await db.run(`
            UPDATE posts
            SET moderation_status = 'removed', discovery_restricted = 1, updated_at = NOW()
            WHERE id = $1
          `, [report.entity_id])
        } else if (post && report.entity_type === 'post') {
          const moderationBefore = await db.one<any>(
            `SELECT * FROM content_moderation WHERE content_type = 'post' AND content_id = $1`,
            [report.entity_id],
          )
          const reason = String(req.body?.reason || report.reason || 'Removed after report review').trim().slice(0, 2000)
          const adminId = req.admin?.adminId || req.user!.userId
          const after = await db.one<any>(`
            UPDATE posts
            SET moderation_status = 'deleted', discovery_restricted = 1, updated_at = NOW()
            WHERE id = $1
            RETURNING id, user_id, moderation_status, discovery_restricted, updated_at
          `, [report.entity_id])
          const moderationAfter = await db.one<any>(`
            INSERT INTO content_moderation
              (content_type, content_id, status, is_hidden, reason, updated_by, deleted_at)
            VALUES ('post', $1, 'deleted', 0, $2, $3, NOW())
            ON CONFLICT (content_type, content_id) DO UPDATE SET
              status = 'deleted', is_hidden = 0, reason = EXCLUDED.reason,
              updated_by = EXCLUDED.updated_by, deleted_at = NOW(), updated_at = NOW()
            RETURNING *
          `, [report.entity_id, reason, adminId])
          await recordModerationAction(req, {
            action: 'content.delete',
            targetType: 'post',
            targetId: report.entity_id,
            reason,
            before: { post, content_moderation: moderationBefore },
            after: { post: after, content_moderation: moderationAfter },
          })
          await db.run(
            `INSERT INTO notifications (id, user_id, type, entity_id, entity_type, content)
             VALUES ($1,$2,'moderation',$3,'post',$4)`,
            [uuidv4(), post.user_id, report.entity_id, 'Your post was removed by a moderator.'],
          )
        }
      }
    }
     await recordAdminAudit(req, { action: `report.${action || 'review'}`, resourceType: 'report', resourceId: req.params.id, reason: String(req.body?.reason || report.reason || ''), before: report, after: { status: status || 'reviewed', action: action || null } })
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Alumni requests ──────────────────────────────────────────────────────────
adminRouter.get('/alumni-requests', requireAdminPermission('users.read'), async (req, res) => {
  try {
    const { status = 'pending' } = req.query
    const requests = await db.all(`
      SELECT ar.*, u.username, u.full_name, u.email, u.avatar_url, u.college_name
      FROM alumni_requests ar JOIN users u ON ar.user_id = u.id
      WHERE ar.status = $1 ORDER BY ar.requested_at ASC
    `, [status])
    res.json({ success: true, data: requests })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

adminRouter.patch('/alumni-requests/:id', requireAdminPermission('users.moderate'), async (req, res) => {
  try {
    const { status } = req.body
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status.' })
     const request = await db.one<any>('SELECT id, user_id, status FROM alumni_requests WHERE id = $1', [req.params.id])
    if (!request) return res.status(404).json({ success: false, error: 'Request not found.' })
     const before = { status: request.status }
     await db.run('UPDATE alumni_requests SET status = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE id = $3', [status, req.user!.userId, req.params.id])
    if (status === 'approved') {
      await db.run("UPDATE users SET account_type = 'alumni' WHERE id = $1", [request.user_id])
    }
    await db.run("INSERT INTO notifications (id, user_id, type, entity_type, content) VALUES ($1,$2,'system','user',$3)", [uuidv4(), request.user_id, status === 'approved' ? 'Your alumni status has been approved! Welcome to the alumni network.' : 'Your alumni request was not approved at this time.'])
     await recordAdminAudit(req, { action: `alumni_request.${status}`, resourceType: 'alumni_request', resourceId: req.params.id, before, after: { status } })
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Colleges management ──────────────────────────────────────────────────────
adminRouter.post('/colleges', requireAdminPermission('colleges.manage'), async (req, res) => {
  try {
    const { name, short_name, domains, country = 'IN', city, about, website, logo_url, cover_url } = req.body
    if (!name || !domains) return res.status(400).json({ success: false, error: 'Name and domains required.' })
    const { v4: uuid } = await import('uuid')
    const id = uuid()
    await db.run('INSERT INTO colleges (id, name, short_name, domains, country, city, about, website, logo_url, cover_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, name, short_name || name, JSON.stringify(typeof domains === 'string' ? [domains] : domains), country, city || '', about || '', website || '', logo_url || null, cover_url || null])
    const college = await db.one('SELECT * FROM colleges WHERE id = $1', [id])
     await recordAdminAudit(req, { action: 'college.create', resourceType: 'college', resourceId: id, after: { name, short_name, country, city } })
    res.status(201).json({ success: true, data: college })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})
