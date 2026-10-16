// @ts-nocheck
import { Router } from 'express'
import { emitUserNotification } from '../legacy-socket/io.js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { db, withTransaction } from '../legacy-db/index.js'
import { requireAuth, optionalAuth } from '../legacy-middleware/auth.js'
import { uploadAvatar, uploadCover, uploadVerify, assertImageMagic, sendMediaPolicyError } from '../legacy-middleware/upload.js'
import { storeMediaAsset } from '../legacy-services/media.js'
import { enforceUserRestriction } from '../legacy-services/userRestrictions.js'
import { AUTH_USER_COLUMNS, PUBLIC_USER_COLUMNS, publicUser, selfUser, withCanonicalCollegeName, withViewerMediaUrls, visiblePresence } from '../legacy-services/userPrivacy.js'
import { PROFILE_POSTS_COUNT_SQL } from '../legacy-services/profilePostsCount.js'
import { sendOTPEmail } from '../legacy-services/email.js'
import { isCollegeEmail, getCollegeDomain, getCollegeNameByEmail } from '../legacy-utils/college-domains.js'
import { isDisposableEmail } from '../legacy-utils/disposable-emails.js'
import { createReportWithCase } from '../legacy-services/reporting.js'
import {
  containsProhibitedLanguage,
  SKILL_BANNED_MESSAGE,
  USERNAME_BANNED_MESSAGE,
} from '../legacy-services/contentSafety.js'

export const usersRouter = Router()

// ─── College verification (single-document flow from RegisterScreen) ───────────
// Accepts a single `id_card` file, stores a pending verification request.
usersRouter.post('/me/verify-college', requireAuth, uploadVerify.single('id_card'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'id_card file is required.' })
    await assertImageMagic(req.file)
    await withTransaction(async (tx) => {
      const idPhotoUrl = await storeMediaAsset(tx, req.file, req.user!.userId, 'verification_id_photo', req.user!.userId)
      const user = await tx.one('SELECT full_name FROM users WHERE id = $1', [req.user!.userId])
      const ocrName = user?.full_name || ''
      const existing = await tx.one('SELECT id FROM college_verifications WHERE user_id = $1', [req.user!.userId])
      const verificationId = existing?.id || uuidv4()
      if (existing) {
        await tx.run(
          `UPDATE college_verifications SET id_photo_url=$1, selfie_url=NULL, ocr_name=$2, status='pending', submitted_at=NOW(), reviewed_at=NULL WHERE user_id=$3`,
          [idPhotoUrl, ocrName, req.user!.userId]
        )
      } else {
        await tx.run(
          `INSERT INTO college_verifications (id, user_id, id_photo_url, selfie_url, ocr_name, status) VALUES ($1,$2,$3,NULL,$4,'pending')`,
          [verificationId, req.user!.userId, idPhotoUrl, ocrName]
        )
      }
      await tx.run(
        `INSERT INTO verification_requests
          (id, user_id, verification_type, status, documents, notes, reviewer_id, submitted_at, reviewed_at, updated_at)
         VALUES ($1,$2,'student','pending',$3,'',NULL,NOW(),NULL,NOW())
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id, verification_type = 'student', status = 'pending',
           documents = EXCLUDED.documents, notes = '', reviewer_id = NULL,
           submitted_at = EXCLUDED.submitted_at, reviewed_at = NULL, updated_at = NOW()`,
        [verificationId, req.user!.userId, JSON.stringify([{ kind: 'id', url: idPhotoUrl }])]
      )
      await tx.run('UPDATE users SET verification_status = $1 WHERE id = $2', ['pending', req.user!.userId])
    })
    res.json({ success: true, message: 'Verification submitted! Our team will review within 24 hours.', data: { status: 'pending' } })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

usersRouter.get('/me/close-mates', requireAuth, async (req, res) => {
  const rows = await db.all(`SELECT u.id, u.username, u.full_name, u.avatar_url
    FROM close_mates cm JOIN users u ON u.id = cm.close_mate_id
    WHERE cm.user_id = $1 ORDER BY u.full_name`, [req.user!.userId])
  res.json({ success: true, data: rows })
})

usersRouter.put('/me/close-mates/:id', requireAuth, async (req, res) => {
  if (req.params.id === req.user!.userId) return res.status(400).json({ success: false, error: 'You cannot add yourself.' })
  const target = await db.one('SELECT id FROM users WHERE id = $1', [req.params.id])
  if (!target) return res.status(404).json({ success: false, error: 'User not found.' })
  await db.run('INSERT INTO close_mates (user_id, close_mate_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user!.userId, req.params.id])
  res.json({ success: true })
})

usersRouter.delete('/me/close-mates/:id', requireAuth, async (req, res) => {
  await db.run('DELETE FROM close_mates WHERE user_id = $1 AND close_mate_id = $2', [req.user!.userId, req.params.id])
  res.json({ success: true })
})

async function enrichPost(post: any, viewerId?: string) {
  if (!post) return null
  const tags = (() => {
    try {
      const parsed = typeof post.tags === 'string' ? JSON.parse(post.tags) : (post.tags ?? [])
      return (Array.isArray(parsed) ? parsed : [])
        .map((tag: unknown) => String(tag || '').trim().replace(/^@/, '').toLowerCase())
        .filter((tag: string) => /^[a-z0-9_.]{3,30}$/.test(tag))
        .filter(Boolean)
    } catch {
      return []
    }
  })()
  const [isLiked, isSaved, taggedUserRows] = await Promise.all([
    viewerId ? db.one('SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2', [post.id, viewerId]) : null,
    viewerId ? db.one('SELECT 1 FROM post_saves WHERE post_id = $1 AND user_id = $2', [post.id, viewerId]) : null,
    tags.length
      ? db.all<any>(
          `SELECT id, username, full_name, avatar_url, college_name, is_college_verified
           FROM users
           WHERE LOWER(username) = ANY($1::text[])
             AND COALESCE(is_admin, 0) = 0
             AND COALESCE(is_banned, 0) = 0
             AND COALESCE(is_deactivated, 0) = 0`,
          [tags],
        )
      : [],
  ])
  const taggedUsersByUsername = new Map(
    taggedUserRows.map((user: any) => [String(user.username).toLowerCase(), user]),
  )
  return {
    ...post,
    content: post.content,
    media: (() => { try { return typeof post.media === 'string' ? JSON.parse(post.media) : (post.media ?? []) } catch { return [] } })(),
    tags,
    tagged_users: tags.map((username: string) => taggedUsersByUsername.get(username)).filter(Boolean),
    poll_options: post.poll_options ? (() => { try { return typeof post.poll_options === 'string' ? JSON.parse(post.poll_options) : post.poll_options } catch { return null } })() : null,
    poll_votes: post.poll_votes ? (() => { try { return typeof post.poll_votes === 'string' ? JSON.parse(post.poll_votes) : post.poll_votes } catch { return null } })() : null,
    is_liked: !!isLiked,
    is_saved: !!isSaved,
  }
}

async function safeUser(user: any, viewerId?: string) {
  if (!user) return null
  const [canonicalUser, presenceUser] = await Promise.all([
    withCanonicalCollegeName(user),
    db.one<any>('SELECT privacy_settings, is_online, last_seen FROM users WHERE id = $1', [user.id]),
  ])
  const userWithPresence = { ...canonicalUser, ...presenceUser }
  const safeSource = visiblePresence(userWithPresence, viewerId)
  const safe: any = withViewerMediaUrls(
    viewerId === user.id ? selfUser(safeSource) : publicUser(safeSource),
    viewerId,
  )
  const [liveFollowers, liveFollowing] = await Promise.all([
    db.one<any>("SELECT COUNT(*)::int AS count FROM follows WHERE following_id = $1 AND status = 'active'", [user.id]),
    db.one<any>("SELECT COUNT(*)::int AS count FROM follows WHERE follower_id = $1 AND status = 'active'", [user.id]),
  ])
  safe.followers_count = Number(liveFollowers?.count || 0)
  safe.following_count = Number(liveFollowing?.count || 0)
  const livePosts = await db.one<any>(
    PROFILE_POSTS_COUNT_SQL,
    [user.id],
  )
  safe.posts_count = Number(livePosts?.count || 0)
  safe.is_following = false
  safe.follow_status = null
  safe.is_followed_by = false
  if (viewerId && viewerId !== user.id) {
    const [followRelation, isFollowedBy, isBlocked, isRestricted] = await Promise.all([
      db.one('SELECT status FROM follows WHERE follower_id = $1 AND following_id = $2', [viewerId, user.id]),
      db.one('SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = $3', [user.id, viewerId, 'active']),
      db.one('SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [viewerId, user.id]),
      db.one('SELECT 1 FROM user_profile_restrictions WHERE restrictor_id = $1 AND restricted_id = $2', [viewerId, user.id]),
    ])
    safe.follow_status = followRelation?.status || null
    safe.is_following = followRelation?.status === 'active'
    safe.is_followed_by = !!isFollowedBy
    safe.is_blocked = !!isBlocked
    safe.is_restricted = !!isRestricted
  }
  return safe
}

async function hasBlockBetween(firstUserId: string | undefined, secondUserId: string): Promise<boolean> {
  if (!firstUserId || firstUserId === secondUserId) return false
  return Boolean(await db.one(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [firstUserId, secondUserId],
  ))
}

// ─── Current user ─────────────────────────────────────────────────────────────
usersRouter.get('/me', requireAuth, async (req, res) => {
  try {
      const user = await db.one<any>(`SELECT ${AUTH_USER_COLUMNS} FROM users WHERE id = $1`, [req.user!.userId])
     if (!user) return res.status(404).json({ success: false, error: 'User not found.' })
      res.json({ success: true, data: await safeUser(user, req.user!.userId) })
  } catch (err: any) {
    console.error('block user error:', err.message)
    res.status(500).json({ success: false, error: 'Unable to block this account.' })
  }
})

// ─── Faculty email change ─────────────────────────────────────────────────────
const emailChangeSchema = z.object({ email: z.string().email().toLowerCase().trim() })

usersRouter.post('/me/change-email/request', requireAuth, async (req, res) => {
  try {
    const parsed = emailChangeSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Enter a valid email address.' })
    const newEmail = parsed.data.email
    const current = await db.one<any>('SELECT email, user_role FROM users WHERE id = $1', [req.user!.userId])
    if (!['teacher', 'faculty'].includes(current?.user_role)) return res.status(403).json({ success: false, error: 'Only faculty accounts can change their institution email.' })
    if (newEmail === current.email) return res.status(400).json({ success: false, error: 'That is already your current email.' })
    if (isDisposableEmail(newEmail) || !isCollegeEmail(newEmail)) {
      return res.status(400).json({ success: false, error: 'Please use an official institution email address.' })
    }
    const taken = await db.one('SELECT id FROM users WHERE email = $1', [newEmail])
    if (taken) return res.status(409).json({ success: false, error: 'That email is already linked to an account.' })
    const otp = crypto.randomInt(100000, 1000000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await db.run('DELETE FROM otps WHERE email = $1 AND type = $2', [newEmail, 'email_change'])
    await db.run('INSERT INTO otps (id, email, otp, type, expires_at) VALUES ($1,$2,$3,$4,$5)', [uuidv4(), newEmail, otp, 'email_change', expiresAt])
    await sendOTPEmail(newEmail, otp, 'change')
    res.json({ success: true, data: { email: newEmail } })
  } catch (err: any) {
    console.error('email change request error:', err.message)
    res.status(500).json({ success: false, error: 'Unable to send the confirmation code.' })
  }
})

usersRouter.post('/me/change-email/verify', requireAuth, async (req, res) => {
  try {
    const parsed = emailChangeSchema.extend({ otp: z.string().regex(/^\d{6}$/) }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Email and 6-digit code are required.' })
    const { email, otp } = parsed.data
    const current = await db.one<any>('SELECT email, user_role FROM users WHERE id = $1', [req.user!.userId])
    if (!['teacher', 'faculty'].includes(current?.user_role)) return res.status(403).json({ success: false, error: 'Only faculty accounts can change their institution email.' })
    const taken = await db.one('SELECT id FROM users WHERE email = $1 AND id <> $2', [email, req.user!.userId])
    if (taken) return res.status(409).json({ success: false, error: 'That email is already linked to an account.' })
    const record = await db.one<any>('SELECT * FROM otps WHERE email = $1 AND type = $2 AND used = 0 ORDER BY created_at DESC LIMIT 1', [email, 'email_change'])
    if (!record || new Date(record.expires_at) < new Date()) return res.status(400).json({ success: false, error: 'That code is missing or expired.' })
    await db.run('UPDATE otps SET attempts = attempts + 1 WHERE id = $1', [record.id])
    if (record.attempts >= 5) return res.status(429).json({ success: false, error: 'Too many attempts. Request a new code.' })
    if (record.otp !== otp) return res.status(400).json({ success: false, error: 'Incorrect confirmation code.' })
    await db.run('UPDATE otps SET used = 1 WHERE id = $1', [record.id])
    const domain = getCollegeDomain(email)
    const college = await db.one<any>('SELECT id, name FROM colleges WHERE domains LIKE $1', [`%"${domain}"%`])
    const user = await db.one<any>(
      `UPDATE users SET email = $1, college_id = $2, college_name = $3, is_email_verified = 1, updated_at = NOW()
       WHERE id = $4 RETURNING ${AUTH_USER_COLUMNS}`,
      [email, college?.id || null, college?.name || getCollegeNameByEmail(email) || '', req.user!.userId],
    )
    res.json({ success: true, data: await safeUser(user) })
  } catch (err: any) {
    console.error('email change verify error:', err.message)
    res.status(500).json({ success: false, error: 'Unable to change your email.' })
  }
})

// ─── Update profile ───────────────────────────────────────────────────────────
const updateSchema = z.object({
  full_name: z.string().min(2).max(50).optional(),
  department: z.string().max(120).optional(),
  institute_post: z.string().max(120).optional(),
  semester: z.union([z.number().int().min(1).max(6), z.string().max(40)]).optional(),
  course: z.string().max(120).optional(),
  username: z.string().min(5).max(30).transform(v => v.trim().toLowerCase()).refine(v => /^[a-z0-9_.]+$/.test(v), { message: 'Username can only contain lowercase letters, numbers, underscores, and periods.' }).refine(v => v !== 'ceo', { message: 'Reserved' }).optional(),
  bio: z.string().max(500).optional(),
  year: z.number().int().min(1).max(6).optional(),
  interests: z.array(z.string()).optional(),
  skills: z.array(z.string()).max(4).optional(),
  relationship_status: z.enum(['single', 'mingle', 'hidden']).optional(),
  // Keep accepting the legacy provider->URL map, while also supporting the
  // editor's two custom links with a label and URL.
  social_links: z.union([
    z.record(z.string()),
    z.object({
      custom: z.array(z.object({
        label: z.string().trim().min(1).max(40),
        url: z.string().trim().min(1).max(500),
      })).max(2),
    }),
  ]).optional(),
  is_private: z.number().int().min(0).max(1).optional(),
  who_can_message: z.enum(['everyone', 'followers', 'none']).optional(),
  account_type: z.enum(['public', 'private']).optional(),
})

usersRouter.patch('/me', requireAuth, async (req, res) => {
  try {
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors[0].message })
    const data = parsed.data

    if (data.username && containsProhibitedLanguage(data.username)) {
      return res.status(400).json({ success: false, error: USERNAME_BANNED_MESSAGE, code: 'USERNAME_BANNED' })
    }
    if (data.skills?.some((skill) => containsProhibitedLanguage(skill))) {
      return res.status(400).json({ success: false, error: SKILL_BANNED_MESSAGE, code: 'SKILL_BANNED' })
    }

    if (data.username) {
      const taken = await db.one('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2', [data.username, req.user!.userId])
      if (taken) return res.status(409).json({ success: false, error: 'Username already taken.' })
    }

    const fields: string[] = []
    const values: any[] = []
    if (data.full_name !== undefined) { fields.push('full_name = ?'); values.push(data.full_name.trim()) }
    if (data.department !== undefined) { fields.push('department = ?'); values.push(data.department) }
    if (data.institute_post !== undefined) { fields.push('institute_post = ?'); values.push(data.institute_post.trim()) }
    if (data.course !== undefined) { fields.push('course = ?'); values.push(data.course) }
    if (data.semester !== undefined) { fields.push('semester = ?'); values.push(data.semester) }
    if (data.username !== undefined) { fields.push('username = ?'); values.push(data.username) }
    if (data.bio !== undefined) { fields.push('bio = ?'); values.push(data.bio) }
    if (data.year !== undefined) { fields.push('year = ?'); values.push(data.year); fields.push('semester = ?'); values.push(data.year) }
    if (data.interests !== undefined) { fields.push('interests = ?'); values.push(JSON.stringify(data.interests)) }
    if (data.skills !== undefined) { fields.push('skills = ?'); values.push(JSON.stringify(data.skills)) }
    if (data.social_links !== undefined) { fields.push('social_links = ?'); values.push(JSON.stringify(data.social_links)) }
    if (data.relationship_status !== undefined) { fields.push('relationship_status = ?'); values.push(data.relationship_status) }
    if (data.is_private !== undefined) {
      fields.push('is_private = ?'); values.push(data.is_private)
      fields.push('account_type = ?'); values.push(data.is_private ? 'private' : 'public')
    }
    if (data.account_type !== undefined) { fields.push('account_type = ?'); values.push(data.account_type) }
    if (data.who_can_message !== undefined) { fields.push('who_can_message = ?'); values.push(data.who_can_message) }
    if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update.' })

    fields.push('updated_at = NOW()')
    values.push(req.user!.userId)
    const [sql, params] = db.toPos(`UPDATE users SET ${fields.join(', ')} WHERE id = ? RETURNING ${AUTH_USER_COLUMNS}`, values)
    const user = await db.one<any>(sql, params)
    res.json({ success: true, data: await safeUser(user, req.user!.userId) })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Avatar / cover ───────────────────────────────────────────────────────────
usersRouter.post('/me/avatar', requireAuth, uploadAvatar.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image uploaded.' })
    await assertImageMagic(req.file)
    const url = await withTransaction(async (tx) => {
      const storedUrl = await storeMediaAsset(tx, req.file!, req.user!.userId, 'user_avatar', req.user!.userId)
      await tx.run('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [storedUrl, req.user!.userId])
      return storedUrl
    })
    res.json({ success: true, data: { avatar_url: url } })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

usersRouter.post('/me/cover', requireAuth, uploadCover.single('cover'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image uploaded.' })
    await assertImageMagic(req.file)
    const url = await withTransaction(async (tx) => {
      const storedUrl = await storeMediaAsset(tx, req.file!, req.user!.userId, 'user_cover', req.user!.userId)
      await tx.run('UPDATE users SET cover_url = $1, updated_at = NOW() WHERE id = $2', [storedUrl, req.user!.userId])
      return storedUrl
    })
    res.json({ success: true, data: { cover_url: url } })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

usersRouter.delete('/me/avatar', requireAuth, async (req, res) => {
  try {
    await db.run('UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = $1', [req.user!.userId])
    res.json({ success: true, data: { avatar_url: null } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

usersRouter.delete('/me/cover', requireAuth, async (req, res) => {
  try {
    await db.run('UPDATE users SET cover_url = NULL, updated_at = NOW() WHERE id = $1', [req.user!.userId])
    res.json({ success: true, data: { cover_url: null } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Remove follower ──────────────────────────────────────────────────────────
usersRouter.delete('/me/followers/:followerId', requireAuth, async (req, res) => {
  try {
    const { followerId } = req.params
    const existing = await db.one<any>('SELECT status FROM follows WHERE follower_id = $1 AND following_id = $2', [followerId, req.user!.userId])
    if (!existing) return res.status(404).json({ success: false, error: 'Not a follower.' })
    await db.run('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2', [followerId, req.user!.userId])
    if (existing.status === 'active') {
      await Promise.all([
        db.run('UPDATE users SET followers_count = GREATEST(0, followers_count - 1) WHERE id = $1', [req.user!.userId]),
        db.run('UPDATE users SET following_count = GREATEST(0, following_count - 1) WHERE id = $1', [followerId]),
      ])
    }
    res.json({ success: true, message: 'Follower removed.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Alumni request ───────────────────────────────────────────────────────────
usersRouter.post('/me/alumni-request', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId
    const existing = await db.one<any>('SELECT status FROM alumni_requests WHERE user_id = $1', [userId])
    if (existing) return res.status(409).json({ success: false, error: 'Request already submitted.', data: existing })
    const { message = '' } = req.body
    await db.run('INSERT INTO alumni_requests (id, user_id, message) VALUES ($1,$2,$3)', [uuidv4(), userId, String(message).slice(0, 500)])
    const admins = await db.all<any>('SELECT id FROM users WHERE is_admin = 1')
    await Promise.all(admins.map(admin =>
      db.run(`INSERT INTO notifications (id, user_id, type, actor_id, entity_type, content) VALUES ($1,$2,'alumni_request',$3,'user','requested alumni status conversion')`, [uuidv4(), admin.id, userId])
    ))
    res.status(201).json({ success: true, message: 'Request submitted.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// Students may appeal a moderation case/action that targets their account.
// Evidence and decisions remain private to the Admin API.
usersRouter.get('/me/appeals', requireAuth, async (req, res) => {
  try {
    const appeals = await db.all(
      `SELECT a.id, a.status, a.evidence, a.moderator_notes, a.decision,
         a.submitted_at, a.decided_at, a.created_at, a.updated_at, a.moderation_action_id
       FROM appeals a WHERE a.user_id = $1 ORDER BY a.submitted_at DESC`,
      [req.user!.userId],
    )
    const withTarget = await Promise.all(appeals.map(async (appeal: any) => {
      const action = appeal.moderation_action_id
        ? await db.one<any>('SELECT target_type, target_id, action FROM moderation_actions WHERE id = $1', [appeal.moderation_action_id])
        : null
      const isContent = action?.target_type === 'post' && String(action.action || '').startsWith('content.')
      const post = isContent
        ? await db.one<any>('SELECT id, type FROM posts WHERE id = $1 AND user_id = $2', [action.target_id, req.user!.userId])
        : null
      const isCommentAction = ['comment', 'comment_submission'].includes(action?.target_type) &&
        (String(action.action || '').startsWith('comment.') || String(action.action || '').startsWith('content.'))
      const comment = isCommentAction && action?.target_type === 'comment'
        ? await db.one<any>(
            `SELECT c.id FROM comments c
             WHERE c.id = $1 AND c.user_id = $2
               AND EXISTS (
                 SELECT 1 FROM content_moderation cm
                 WHERE cm.content_type = 'comment' AND cm.content_id = c.id
                   AND (cm.is_hidden = 1 OR cm.status = 'deleted')
               )`,
            [action.target_id, req.user!.userId],
          )
        : isCommentAction && action?.target_type === 'comment_submission'
          ? await db.one<any>('SELECT id FROM comment_moderation_decisions WHERE id = $1 AND user_id = $2', [action.target_id, req.user!.userId])
          : null
      return {
        id: appeal.id,
        appeal_type: post || comment ? 'content' : 'account',
        target: post
          ? { type: 'post', id: post.id, post_type: post.type }
          : comment
            ? { type: 'comment', id: action.target_type === 'comment' ? comment.id : null }
            : { type: 'account' },
        status: appeal.status,
        evidence: appeal.evidence,
        moderator_notes: appeal.moderator_notes,
        decision: appeal.decision,
        submitted_at: appeal.submitted_at,
        decided_at: appeal.decided_at,
        created_at: appeal.created_at,
        updated_at: appeal.updated_at,
      }
    }))
    return res.json({ success: true, data: withTarget })
  } catch {
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

usersRouter.get('/me/moderated-content', requireAuth, async (req, res) => {
  try {
    const posts = await db.all<any>(
      `SELECT p.id, p.type, p.content, p.created_at, p.moderation_status,
         cm.reason, current_appeal.status AS appeal_status,
         current_appeal.decision AS appeal_decision,
         current_appeal.evidence AS appeal_evidence
       FROM posts p
       LEFT JOIN content_moderation cm ON cm.content_type = 'post' AND cm.content_id = p.id
       LEFT JOIN LATERAL (
         SELECT a.status, a.decision, a.evidence
         FROM moderation_actions ma
         JOIN appeals a ON a.moderation_action_id = ma.id AND a.user_id = p.user_id
         WHERE ma.target_type = 'post' AND ma.target_id = p.id
           AND ma.action IN ('content.hide','content.delete','content.restore','content.unhide')
           AND ma.id = (
             SELECT latest.id FROM moderation_actions latest
             WHERE latest.target_type = 'post' AND latest.target_id = p.id
               AND latest.action IN ('content.hide','content.delete','content.restore','content.unhide')
             ORDER BY latest.created_at DESC LIMIT 1
           )
         ORDER BY a.submitted_at DESC LIMIT 1
       ) current_appeal ON TRUE
       WHERE p.user_id = $1
         AND (p.moderation_status IN ('hidden','deleted','rejected')
              OR COALESCE(cm.is_hidden, 0) = 1 OR cm.status = 'deleted')
       ORDER BY p.created_at DESC`,
      [req.user!.userId],
    )
    return res.json({ success: true, data: posts })
  } catch {
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// The user-facing history contains appealable decisions but never classifier
// scores, draft text, credentials, or moderation-rule details.
usersRouter.get('/me/comment-moderation', requireAuth, async (req, res) => {
  try {
    const decisions = await db.all<any>(
      `SELECT a.id AS moderation_action_id, a.operation, a.target_comment_id, a.post_id,
          a.category, a.severity, a.decision,
          CASE
            WHEN a.decision = 'HUMAN_REVIEW'
              THEN 'This comment needs a safety review before posting.'
            WHEN a.decision = 'BLOCK'
              THEN 'This comment could not be posted because it may violate Campnect Community Guidelines.'
            ELSE 'Campnect displayed a Community Guidelines reminder for this comment.'
          END AS reason,
          a.created_at,
          latest_appeal.status AS appeal_status, latest_appeal.decision AS appeal_decision,
          (a.appeal_status = 'eligible'
            AND (a.severity IN ('HIGH','CRITICAL') OR a.decision = 'HUMAN_REVIEW')) AS appealable
       FROM comment_moderation_decisions a
       LEFT JOIN LATERAL (
         SELECT status, decision FROM appeals
         WHERE moderation_action_id = a.id AND user_id = a.user_id
         ORDER BY submitted_at DESC LIMIT 1
       ) latest_appeal ON TRUE
       WHERE a.user_id = $1 AND a.decision IN ('WARN','BLOCK','HUMAN_REVIEW')
       ORDER BY a.created_at DESC LIMIT 100`,
      [req.user!.userId],
    )
    const removedComments = await db.all<any>(
      `SELECT ma.id AS moderation_action_id, ma.target_id AS target_comment_id,
          c.post_id, 'content' AS operation, 'CONTENT_HIDDEN' AS category,
          'HIGH' AS severity, 'BLOCK' AS decision,
          'A moderator removed or hid this comment.' AS reason, ma.created_at,
          latest_appeal.status AS appeal_status, latest_appeal.decision AS appeal_decision,
          true AS appealable
       FROM moderation_actions ma
       JOIN comments c ON c.id = ma.target_id AND c.user_id = $1
       JOIN content_moderation cm ON cm.content_type = 'comment' AND cm.content_id = c.id
         AND (cm.is_hidden = 1 OR cm.status = 'deleted')
       LEFT JOIN LATERAL (
         SELECT status, decision FROM appeals
         WHERE moderation_action_id = ma.id AND user_id = $1
         ORDER BY submitted_at DESC LIMIT 1
       ) latest_appeal ON TRUE
       WHERE ma.target_type = 'comment' AND ma.action IN ('content.hide','content.delete')
         AND NOT EXISTS (
           SELECT 1 FROM moderation_actions latest
           WHERE latest.target_type = ma.target_type AND latest.target_id = ma.target_id
             AND latest.action IN ('content.hide','content.delete','content.restore','content.unhide')
             AND latest.created_at > ma.created_at
         )
       ORDER BY ma.created_at DESC LIMIT 100`,
      [req.user!.userId],
    )
    return res.json({
      success: true,
      data: [...decisions, ...removedComments]
        .map((item: any) => ({
          ...item,
          id: item.moderation_action_id,
          action: String(item.decision || item.category || '').toLowerCase(),
        }))
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 100),
    })
  } catch {
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

usersRouter.post('/me/appeals', requireAuth, async (req, res) => {
  try {
    const caseId = String(req.body?.case_id || '').trim().slice(0, 200)
    const moderationActionId = String(req.body?.moderation_action_id || '').trim().slice(0, 200)
    const postId = String(req.body?.post_id || '').trim().slice(0, 200)
    const evidence = String(req.body?.evidence || '').trim().slice(0, 10000)
    if (!evidence) return res.status(400).json({ success: false, error: 'Please explain why you believe this moderation action was a mistake.' })
    const result = await withTransaction(async (tx) => {
      if (!postId && moderationActionId) {
        const moderationAction = await tx.one<any>(
          `SELECT id, target_type, target_id, action FROM moderation_actions
           WHERE id = $1 AND target_type IN ('comment','comment_submission')
             AND action IN ('comment.warn','comment.block','comment.human_review','content.hide','content.delete')`,
          [moderationActionId],
        )
        if (moderationAction?.action.startsWith('comment.')) {
          const attempt = await tx.one<any>(
            `SELECT id, user_id, post_id, decision, category, severity, appeal_status
             FROM comment_moderation_decisions
             WHERE id = $1 AND user_id = $2 FOR UPDATE`,
            [moderationAction.id, req.user!.userId],
          )
          if (
            !attempt ||
            attempt.appeal_status !== 'eligible' ||
            !(['HIGH', 'CRITICAL'].includes(attempt.severity) || attempt.decision === 'HUMAN_REVIEW')
          ) return { error: 'COMMENT_ACTION_NOT_APPEALABLE' as const }
          const existing = await tx.one<any>(
            `SELECT id FROM appeals WHERE user_id = $1 AND moderation_action_id = $2
             AND status NOT IN ('approved','rejected','expired')`,
            [req.user!.userId, moderationAction.id],
          )
          if (existing) return { error: 'APPEAL_ALREADY_OPEN' as const }
          const linkedCase = await tx.one<any>(
            `SELECT id FROM moderation_cases
             WHERE target_type = 'comment_submission' AND target_id = $1
             ORDER BY created_at DESC LIMIT 1`,
            [attempt.id],
          )
          const id = uuidv4()
          const appeal = await tx.one<any>(
            `INSERT INTO appeals (id, user_id, case_id, moderation_action_id, evidence)
             VALUES ($1,$2,$3,$4,$5) RETURNING id, status, evidence, submitted_at`,
            [id, req.user!.userId, linkedCase?.id || null, moderationAction.id, evidence],
          )
          await tx.run(
            `UPDATE comment_moderation_decisions SET appeal_status = 'pending' WHERE id = $1`,
            [attempt.id],
          )
          await tx.run(
            `INSERT INTO appeal_history (id, appeal_id, from_status, to_status, notes, admin_id)
             VALUES ($1,$2,NULL,'pending','Comment moderation appeal submitted by account holder',NULL)`,
            [uuidv4(), id],
          )
          return { appeal: { ...appeal, appeal_type: 'comment_moderation', target: { type: 'comment_submission' } } }
        }
        if (moderationAction?.target_type === 'comment') {
          const comment = await tx.one<any>(
            `SELECT c.id, c.post_id, c.parent_id
             FROM comments c
             JOIN content_moderation cm ON cm.content_type = 'comment' AND cm.content_id = c.id
               AND (cm.is_hidden = 1 OR cm.status = 'deleted')
             WHERE c.id = $1 AND c.user_id = $2 FOR UPDATE`,
            [moderationAction.target_id, req.user!.userId],
          )
          if (!comment) return { error: 'COMMENT_ACTION_NOT_APPEALABLE' as const }
          const latestAction = await tx.one<any>(
            `SELECT id, action FROM moderation_actions
             WHERE target_type = 'comment' AND target_id = $1
               AND action IN ('content.hide','content.delete','content.restore','content.unhide')
             ORDER BY created_at DESC LIMIT 1`,
            [comment.id],
          )
          if (latestAction?.id !== moderationAction.id || !['content.hide', 'content.delete'].includes(moderationAction.action)) {
            return { error: 'COMMENT_ACTION_NOT_APPEALABLE' as const }
          }
          const existing = await tx.one<any>(
            `SELECT id FROM appeals WHERE user_id = $1 AND moderation_action_id = $2
             AND status NOT IN ('approved','rejected','expired')`,
            [req.user!.userId, moderationAction.id],
          )
          if (existing) return { error: 'APPEAL_ALREADY_OPEN' as const }
          const linkedCase = await tx.one<any>(
            `SELECT id FROM moderation_cases
             WHERE target_type = 'comment' AND target_id = $1
             ORDER BY created_at DESC LIMIT 1`,
            [comment.id],
          )
          const id = uuidv4()
          const appeal = await tx.one<any>(
            `INSERT INTO appeals (id, user_id, case_id, moderation_action_id, evidence)
             VALUES ($1,$2,$3,$4,$5) RETURNING id, status, evidence, submitted_at`,
            [id, req.user!.userId, linkedCase?.id || null, moderationAction.id, evidence],
          )
          await tx.run(
            `INSERT INTO appeal_history (id, appeal_id, from_status, to_status, notes, admin_id)
             VALUES ($1,$2,NULL,'pending','Comment moderation appeal submitted by account holder',NULL)`,
            [uuidv4(), id],
          )
          return { appeal: { ...appeal, appeal_type: 'comment', target: { type: 'comment', id: comment.id } } }
        }
      }
      if (postId) {
        const post = await tx.one<any>(
          `SELECT id, type FROM posts
           WHERE id = $1 AND user_id = $2
             AND (moderation_status IN ('hidden','deleted','rejected')
                  OR EXISTS (SELECT 1 FROM content_moderation cm WHERE cm.content_type='post' AND cm.content_id=posts.id AND (cm.is_hidden=1 OR cm.status='deleted')))
           FOR UPDATE`,
          [postId, req.user!.userId],
        )
        if (!post) return { error: 'CONTENT_TARGET_NOT_FOUND' as const }
        const action = await tx.one<any>(
          `SELECT id, action FROM moderation_actions
           WHERE target_type = 'post' AND target_id = $1
             AND action IN ('content.hide','content.delete','content.restore','content.unhide')
           ORDER BY created_at DESC LIMIT 1`,
          [post.id],
        )
        if (!action || !['content.hide', 'content.delete'].includes(action.action)) {
          return { error: 'CONTENT_ACTION_NOT_FOUND' as const }
        }
        const existing = await tx.one<any>(
          `SELECT id FROM appeals WHERE user_id = $1 AND moderation_action_id = $2
           AND status NOT IN ('approved','rejected','expired')`,
          [req.user!.userId, action.id],
        )
        if (existing) return { error: 'APPEAL_ALREADY_OPEN' as const }
        const id = uuidv4()
        const appeal = await tx.one<any>(
          `INSERT INTO appeals (id, user_id, moderation_action_id, evidence)
           VALUES ($1,$2,$3,$4)
           RETURNING id, status, evidence, submitted_at`,
          [id, req.user!.userId, action.id, evidence],
        )
        await tx.run(
          `INSERT INTO appeal_history (id, appeal_id, from_status, to_status, notes, admin_id)
           VALUES ($1,$2,NULL,'pending','Content action appeal submitted by account holder',NULL)`,
          [uuidv4(), id],
        )
        return { appeal: { ...appeal, appeal_type: 'content', target: { type: 'post', id: post.id, post_type: post.type } } }
      }
      const account = await tx.one<any>(
        'SELECT is_suspended, is_banned FROM users WHERE id = $1 FOR UPDATE',
        [req.user!.userId],
      )
      if (!account || (!account.is_suspended && !account.is_banned)) {
        return { error: 'ACCOUNT_NOT_RESTRICTED' as const }
      }
      let validTarget = false
      if (caseId) {
        const target = await tx.one<any>(
          `SELECT id FROM moderation_cases
           WHERE id = $1 AND target_type = 'user' AND target_id = $2`,
          [caseId, req.user!.userId],
        )
        validTarget = Boolean(target)
      }
      if (!validTarget && moderationActionId) {
        const action = await tx.one<any>(
          `SELECT id FROM moderation_actions
           WHERE id = $1 AND target_type = 'user' AND target_id = $2`,
          [moderationActionId, req.user!.userId],
        )
        validTarget = Boolean(action)
      }
      // The suspension screen does not expose internal moderation identifiers.
      // Resolve its most recent account suspension/ban server-side instead.
      let resolvedActionId = moderationActionId || null
      if (!validTarget && !caseId && !moderationActionId) {
        const action = await tx.one<any>(
          `SELECT id FROM moderation_actions
           WHERE target_type = 'user' AND target_id = $1
             AND action IN ('user.suspend', 'user.ban')
           ORDER BY created_at DESC LIMIT 1`,
          [req.user!.userId],
        )
        resolvedActionId = action?.id || null
        validTarget = true
      }
      if (!validTarget) return { error: 'MODERATION_TARGET_NOT_FOUND' as const }
      const existing = await tx.one<any>(
        `SELECT id FROM appeals
         WHERE user_id = $1
           AND COALESCE(case_id, '') = COALESCE($2, '')
           AND COALESCE(moderation_action_id, '') = COALESCE($3, '')
           AND status NOT IN ('approved', 'rejected', 'expired')`,
        [req.user!.userId, caseId || null, resolvedActionId],
      )
      if (existing) return { error: 'APPEAL_ALREADY_OPEN' as const }
      const id = uuidv4()
      const appeal = await tx.one<any>(
        `INSERT INTO appeals (id, user_id, case_id, moderation_action_id, evidence)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, case_id, moderation_action_id, status, evidence, submitted_at`,
        [id, req.user!.userId, caseId || null, resolvedActionId, evidence],
      )
      await tx.run(
        `INSERT INTO appeal_history (id, appeal_id, from_status, to_status, notes, admin_id)
         VALUES ($1,$2,NULL,'pending','Appeal submitted by account holder',NULL)`,
        [uuidv4(), id],
      )
      return { appeal }
    })
    if (result.error === 'CONTENT_TARGET_NOT_FOUND' || result.error === 'CONTENT_ACTION_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'No eligible moderation action was found for that post.' })
    }
    if (result.error === 'COMMENT_ACTION_NOT_APPEALABLE') {
      return res.status(404).json({ success: false, error: 'No eligible comment moderation action was found.' })
    }
    if (result.error === 'MODERATION_TARGET_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'Moderation case or action not found.' })
    }
    if (result.error === 'ACCOUNT_NOT_RESTRICTED') {
      return res.status(409).json({ success: false, error: 'Your account is no longer suspended or banned.' })
    }
    if (result.error === 'APPEAL_ALREADY_OPEN') {
      return res.status(409).json({ success: false, error: 'An appeal is already open for this moderation action.' })
    }
    return res.status(201).json({ success: true, data: result.appeal })
  } catch {
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

usersRouter.get('/me/alumni-request', requireAuth, async (req, res) => {
  try {
    const data = await db.one('SELECT * FROM alumni_requests WHERE user_id = $1', [req.user!.userId])
    res.json({ success: true, data: data || null })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Privacy / notification prefs ─────────────────────────────────────────────
usersRouter.patch('/me/privacy', requireAuth, async (req, res) => {
  try {
    const current = await db.one<any>('SELECT privacy_settings FROM users WHERE id = $1', [req.user!.userId])
    const currentSettings = (() => { try { return JSON.parse(current?.privacy_settings || '{}') } catch { return {} } })()
    const merged = { ...currentSettings, ...req.body }
    await db.run('UPDATE users SET privacy_settings = $1 WHERE id = $2', [JSON.stringify(merged), req.user!.userId])
    res.json({ success: true, data: merged })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

usersRouter.patch('/me/notification-prefs', requireAuth, async (req, res) => {
  try {
    const allowedKeys = new Set([
      'likes',
      'comments',
      'follows',
      'mentions',
      'group_activity',
      'community_activity',
      'college_notices',
      'marketing',
    ])
    const updates: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(req.body || {})) {
      if (!allowedKeys.has(key) || typeof value !== 'boolean') {
        return res.status(400).json({ success: false, error: 'Invalid notification preference.' })
      }
      updates[key] = value
    }

    const current = await db.one<any>('SELECT notification_prefs FROM users WHERE id = $1', [req.user!.userId])
    const existing = (() => { try { return JSON.parse(current?.notification_prefs || '{}') } catch { return {} } })()
    const merged = {
      likes: existing.likes ?? true,
      comments: existing.comments ?? true,
      follows: existing.follows ?? true,
      mentions: existing.mentions ?? true,
      group_activity: existing.group_activity ?? existing.groupActivity ?? true,
      community_activity: existing.community_activity ?? existing.communityActivity ?? true,
      college_notices: existing.college_notices ?? existing.collegeNotices ?? true,
      marketing: existing.marketing ?? false,
      ...updates,
    }
    await db.run('UPDATE users SET notification_prefs = $1 WHERE id = $2', [JSON.stringify(merged), req.user!.userId])
    res.json({ success: true, data: merged })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Change password ──────────────────────────────────────────────────────────
usersRouter.post('/me/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, error: 'Current and new password required.' })
    if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'New password must be at least 8 characters.' })
    const user = await db.one<any>('SELECT * FROM users WHERE id = $1', [req.user!.userId])
    if (!user.password_hash) return res.status(400).json({ success: false, error: 'No password set (use social login).' })
    const valid = await bcrypt.compare(currentPassword, user.password_hash)
    if (!valid) return res.status(401).json({ success: false, error: 'Current password is incorrect.' })
    const hash = await bcrypt.hash(newPassword, 12)
    await db.run('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user!.userId])
    res.json({ success: true, message: 'Password changed.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Suggestions (before /:username) ─────────────────────────────────────────
usersRouter.get('/suggestions', requireAuth, async (req, res) => {
  try {
    const suggestions = await db.all(`
      SELECT u.id, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified,
        u.followers_count,
        (SELECT COUNT(*) FROM follows f2 WHERE f2.following_id = u.id AND f2.follower_id IN (
          SELECT following_id FROM follows WHERE follower_id = $1
        )) as mutual_follows
      FROM users u
      WHERE u.id != $2
        AND COALESCE(u.is_admin, 0) = 0
        AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = $3)
        AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $4)
        AND u.is_email_verified = 1
      ORDER BY mutual_follows DESC, u.followers_count DESC
      LIMIT 10
    `, [req.user!.userId, req.user!.userId, req.user!.userId, req.user!.userId])
    res.json({ success: true, data: suggestions })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── ID suggestions / mutual followers ───────────────────────────────────────
usersRouter.get('/id-suggestions', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(30, Math.max(1, Number(req.query.limit || 10)))
    const suggestions = await db.all(`
      WITH viewer AS (
        SELECT college_id, course, year FROM users WHERE id = $1
      ),
      following AS (
        SELECT following_id FROM follows WHERE follower_id = $1 AND status = 'active'
      ),
      blocked AS (
        SELECT blocked_id AS id FROM blocks WHERE blocker_id = $1
        UNION SELECT blocker_id AS id FROM blocks WHERE blocked_id = $1
      )
      SELECT u.id, u.username, u.full_name, u.avatar_url, u.bio, u.college_name,
        u.course, u.year, u.followers_count,
        COUNT(DISTINCT mutual.following_id)::int AS mutual_follows,
        CASE
          WHEN u.college_id = (SELECT college_id FROM viewer)
            AND u.course = (SELECT course FROM viewer) THEN 'Same college & course'
          WHEN u.college_id = (SELECT college_id FROM viewer) THEN 'Same college'
          WHEN COUNT(DISTINCT mutual.following_id) > 0 THEN 'Followed by people you follow'
          ELSE 'Suggested for you'
        END AS suggestion_reason
      FROM users u
      LEFT JOIN follows mutual
        ON mutual.follower_id = u.id
       AND mutual.following_id IN (SELECT following_id FROM following)
       AND mutual.status = 'active'
      WHERE u.id != $1
        AND COALESCE(u.is_admin, 0) = 0
        AND u.is_email_verified = 1
        AND u.id NOT IN (SELECT following_id FROM following)
        AND u.id NOT IN (SELECT id FROM blocked)
      GROUP BY u.id, u.username, u.full_name, u.avatar_url, u.bio, u.college_name,
        u.course, u.year, u.college_id, u.followers_count
      ORDER BY mutual_follows DESC,
        (u.college_id = (SELECT college_id FROM viewer)) DESC,
        u.followers_count DESC
      LIMIT $2
    `, [req.user!.userId, limit])
    res.json({ success: true, data: suggestions })
  } catch (err: any) {
    console.error('id suggestions error:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

usersRouter.get('/:id/mutual-followers', requireAuth, async (req, res) => {
  try {
    const mutuals = await db.all(`
      SELECT u.id, u.username, u.full_name, u.avatar_url, u.college_name
      FROM follows a
      JOIN follows b ON b.follower_id = $1
        AND b.following_id = a.follower_id
        AND b.status = 'active'
      JOIN users u ON u.id = a.follower_id
      WHERE a.following_id = $2
        AND a.status = 'active'
      ORDER BY a.created_at DESC
      LIMIT 50
    `, [req.user!.userId, req.params.id])
    res.json({ success: true, data: mutuals })
  } catch (err: any) {
    console.error('mutual followers error:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Me saved (before /:id) ───────────────────────────────────────────────────
usersRouter.get('/me/saved', requireAuth, async (req, res) => {
  try {
    const { page = '1', limit = '12' } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    const posts = await db.all(`
      SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified
      FROM post_saves ps JOIN posts p ON ps.post_id = p.id JOIN users u ON p.user_id = u.id
       WHERE ps.user_id = $1 AND p.type <> 'glimpse'
       ORDER BY ps.created_at DESC LIMIT $2 OFFSET $3
    `, [req.user!.userId, Number(limit), offset])
    const enriched = await Promise.all(posts.map(p => enrichPost(p, req.user!.userId)))
    res.json({ success: true, data: enriched })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Me activity — Instagram-style content history ────────────────────────────
usersRouter.get('/me/activity', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId
    const [likedRows, commentRows, watchedRows] = await Promise.all([
      db.all<any>(`
        SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified,
          pl.created_at AS activity_at
        FROM post_likes pl
        JOIN posts p ON p.id = pl.post_id
        JOIN users u ON u.id = p.user_id
        WHERE pl.user_id = $1
          AND p.type <> 'glimpse'
        ORDER BY pl.created_at DESC
        LIMIT 100
      `, [userId]),
      db.all<any>(`
        SELECT c.id AS comment_id, c.content AS comment_text, c.created_at AS activity_at,
          p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified
        FROM comments c
        JOIN posts p ON p.id = c.post_id
        JOIN users u ON u.id = p.user_id
        WHERE c.user_id = $1
          AND p.type <> 'glimpse'
        ORDER BY c.created_at DESC
        LIMIT 100
      `, [userId]),
      db.all<any>(`
        SELECT DISTINCT ON (ci.post_id)
          ci.created_at AS activity_at, ci.interaction_type, ci.watch_pct, ci.watch_seconds,
          p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified
        FROM content_interactions ci
        JOIN posts p ON p.id = ci.post_id
        JOIN users u ON u.id = p.user_id
        WHERE ci.user_id = $1
          AND p.type <> 'glimpse'
          AND ci.interaction_type IN ('view', 'rewatch')
        ORDER BY ci.post_id, ci.created_at DESC
      `, [userId]),
    ])

    const enrichRows = (rows: any[]) => Promise.all(rows.map((row) => enrichPost(row, userId)))
    const [liked, comments, watched] = await Promise.all([
      enrichRows(likedRows),
      enrichRows(commentRows),
      enrichRows(watchedRows),
    ])

    res.json({
      success: true,
      data: {
        liked,
        comments: comments.map((post: any, index) => ({
          ...post,
          comment_id: commentRows[index].comment_id,
          comment_text: commentRows[index].comment_text,
          activity_at: commentRows[index].activity_at,
        })),
        watched: watched.map((post: any, index) => ({
          ...post,
          activity_at: watchedRows[index].activity_at,
          interaction_type: watchedRows[index].interaction_type,
          watch_pct: watchedRows[index].watch_pct,
          watch_seconds: watchedRows[index].watch_seconds,
        })),
      },
    })
  } catch (err: any) {
    console.error('activity error:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Data export / deactivate / delete ───────────────────────────────────────
usersRouter.get('/me/data-export', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId
    const [user, posts, follows] = await Promise.all([
      db.one('SELECT id, email, username, full_name, bio, college_name, created_at FROM users WHERE id = $1', [userId]),
      db.all('SELECT id, content, created_at FROM posts WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      db.all('SELECT following_id FROM follows WHERE follower_id = $1', [userId]),
    ])
    res.json({ success: true, data: { user, posts, follows, exported_at: new Date().toISOString() } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

usersRouter.post('/me/deactivate', requireAuth, async (req, res) => {
  try {
    await db.run('UPDATE users SET is_email_verified = 0 WHERE id = $1', [req.user!.userId])
    await db.run('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user!.userId])
    res.json({ success: true, message: 'Account deactivated.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

usersRouter.delete('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId
    await db.run("UPDATE users SET is_email_verified = 0, bio = $1 WHERE id = $2", ['[PENDING_DELETION]', userId])
    await db.run('DELETE FROM refresh_tokens WHERE user_id = $1', [userId])
    res.json({ success: true, message: 'Account scheduled for deletion in 30 days.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Block / Unblock ──────────────────────────────────────────────────────────
usersRouter.get('/me/blocked', requireAuth, async (req, res) => {
  try {
    const blocked = await db.all(`
      SELECT u.id, u.username, u.full_name, u.avatar_url
      FROM blocks b JOIN users u ON b.blocked_id = u.id
      WHERE b.blocker_id = $1 ORDER BY b.created_at DESC
    `, [req.user!.userId])
    res.json({ success: true, data: blocked })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

usersRouter.post('/block/:id', requireAuth, async (req, res) => {
  try {
    const blockerId = req.user!.userId
    const { id: targetId } = req.params
    if (targetId === blockerId) return res.status(400).json({ success: false, error: 'Cannot block yourself.' })
    const target = await db.one('SELECT id FROM users WHERE id = $1', [targetId])
    if (!target) return res.status(404).json({ success: false, error: 'User not found.' })

    await withTransaction(async (tx) => {
      const follows = await tx.all<any>(
        `SELECT follower_id, following_id, status
         FROM follows
         WHERE (follower_id = $1 AND following_id = $2)
            OR (follower_id = $2 AND following_id = $1)`,
        [blockerId, targetId],
      )

      await tx.run(
        'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [blockerId, targetId],
      )
      await tx.run(
        'DELETE FROM follows WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)',
        [blockerId, targetId],
      )
      await tx.run(
        `UPDATE conversations
         SET is_request = 0
         WHERE type = 'private'
           AND id IN (SELECT conversation_id FROM conversation_members WHERE user_id = $1)
           AND id IN (SELECT conversation_id FROM conversation_members WHERE user_id = $2)`,
        [blockerId, targetId],
      )
      await tx.run(
        `UPDATE conversation_members
         SET is_archived = 0
         WHERE conversation_id IN (
           SELECT c.id
           FROM conversations c
           JOIN conversation_members first_member ON first_member.conversation_id = c.id AND first_member.user_id = $1
           JOIN conversation_members second_member ON second_member.conversation_id = c.id AND second_member.user_id = $2
           WHERE c.type = 'private'
         )`,
        [blockerId, targetId],
      )
      await tx.run(
        `UPDATE message_requests
         SET status = 'blocked', reviewed_at = NOW(), reviewed_by = $1
         WHERE status = 'pending'
           AND conversation_id IN (
             SELECT c.id
             FROM conversations c
             JOIN conversation_members first_member ON first_member.conversation_id = c.id AND first_member.user_id = $1
             JOIN conversation_members second_member ON second_member.conversation_id = c.id AND second_member.user_id = $2
             WHERE c.type = 'private'
           )`,
        [blockerId, targetId],
      )

      for (const follow of follows) {
        if (follow.status !== 'active') continue
        await tx.run('UPDATE users SET following_count = GREATEST(0, following_count - 1) WHERE id = $1', [follow.follower_id])
        await tx.run('UPDATE users SET followers_count = GREATEST(0, followers_count - 1) WHERE id = $1', [follow.following_id])
      }
    })

    // Private conversations and their messages are intentionally preserved.
    // The chat API exposes the history while blocking any new messages until
    // the relationship is unblocked.
    res.json({ success: true, message: 'User blocked.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

usersRouter.post('/:id/report', requireAuth, async (req, res) => {
  try {
    const target = await db.one('SELECT id FROM users WHERE id = $1', [req.params.id])
    if (!target || req.params.id === req.user!.userId) return res.status(400).json({ success: false, error: 'Invalid user.' })
    const reason = String(req.body?.reason || '').trim().slice(0, 120)
    if (!reason) return res.status(400).json({ success: false, error: 'Reason required.' })
    const description = String(req.body?.description || '').slice(0, 1000)
    const report = await withTransaction((tx) => createReportWithCase(tx, {
      reporterId: req.user!.userId,
      entityId: req.params.id,
      entityType: 'user',
      reason,
      description,
    }))
    res.status(201).json({ success: true, data: { report_id: report.reportId, case_id: report.caseId }, message: 'Report submitted.' })
  } catch { res.status(500).json({ success: false, error: 'Unable to submit report.' }) }
})

usersRouter.post('/:id/restrict', requireAuth, async (req, res) => {
  try {
    if (req.params.id === req.user!.userId) return res.status(400).json({ success: false, error: 'Cannot restrict yourself.' })
    const target = await db.one('SELECT id FROM users WHERE id = $1', [req.params.id])
    if (!target) return res.status(404).json({ success: false, error: 'User not found.' })
    await db.run('INSERT INTO user_profile_restrictions (restrictor_id, restricted_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user!.userId, req.params.id])
    res.json({ success: true, message: 'User restricted.' })
  } catch { res.status(500).json({ success: false, error: 'Unable to restrict user.' }) }
})

usersRouter.delete('/:id/restrict', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM user_profile_restrictions WHERE restrictor_id = $1 AND restricted_id = $2', [req.user!.userId, req.params.id])
    res.json({ success: true, message: 'Restriction removed.' })
  } catch { res.status(500).json({ success: false, error: 'Unable to remove restriction.' }) }
})

usersRouter.delete('/block/:id', requireAuth, async (req, res) => {
  try {
    const blockerId = req.user!.userId
    const targetId = req.params.id
    await withTransaction(async (tx) => {
      await tx.run('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [blockerId, targetId])
      // Older message-request blocks archived both members. Restore any
      // surviving private thread so unblocking immediately reveals its history.
      await tx.run(
        `UPDATE conversations
         SET is_request = 0
         WHERE type = 'private'
           AND id IN (SELECT conversation_id FROM conversation_members WHERE user_id = $1)
           AND id IN (SELECT conversation_id FROM conversation_members WHERE user_id = $2)`,
        [blockerId, targetId],
      )
      await tx.run(
        `UPDATE conversation_members
         SET is_archived = 0
         WHERE conversation_id IN (
           SELECT c.id
           FROM conversations c
           JOIN conversation_members first_member ON first_member.conversation_id = c.id AND first_member.user_id = $1
           JOIN conversation_members second_member ON second_member.conversation_id = c.id AND second_member.user_id = $2
           WHERE c.type = 'private'
         )`,
        [blockerId, targetId],
      )
    })
    res.json({ success: true, message: 'User unblocked.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Get user by username ─────────────────────────────────────────────────────
usersRouter.get('/:username', optionalAuth, async (req, res) => {
  try {
    const user = await db.one<any>(`SELECT ${PUBLIC_USER_COLUMNS}, is_admin FROM users WHERE username = $1`, [req.params.username])
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' })
    if (user.is_admin && !req.user?.isAdmin) {
      return res.status(404).json({ success: false, error: 'User not found.' })
    }
    // The person who initiated the block can still see a restricted profile
    // shell with an unblock action. The blocked person remains fully denied.
    const blockedByViewer = req.user
      ? await db.one('SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.user.userId, user.id])
      : null
    const blockedViewer = req.user
      ? await db.one('SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [user.id, req.user.userId])
      : null
    if (blockedViewer) {
      return res.status(404).json({ success: false, error: 'User not found.' })
    }
    const safe = await safeUser(user, req.user?.userId)
    safe.is_blocked = Boolean(blockedByViewer)
    if (user.account_type === 'private' && req.user?.userId !== user.id && !safe.is_following) {
      return res.json({ success: true, data: { ...safe, bio: '', interests: '[]', skills: '[]', is_private: true } })
    }
    res.json({ success: true, data: safe })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Follow / Unfollow ────────────────────────────────────────────────────────
usersRouter.post('/:id/follow', requireAuth, async (req, res) => {
  try {
    if (await enforceUserRestriction(req, res, 'read_only')) return
    const { id: targetId } = req.params
    if (targetId === req.user!.userId) return res.status(400).json({ success: false, error: 'Cannot follow yourself.' })
    const target = await db.one<any>('SELECT id, account_type FROM users WHERE id = $1', [targetId])
    if (!target) return res.status(404).json({ success: false, error: 'User not found.' })
    if (await hasBlockBetween(req.user!.userId, targetId)) {
      return res.status(403).json({ success: false, error: 'You cannot follow this user.' })
    }
    const existing = await db.one<any>('SELECT status FROM follows WHERE follower_id = $1 AND following_id = $2', [req.user!.userId, targetId])
    if (existing) {
      if (existing.status === 'active') return res.status(409).json({ success: false, error: 'Already following.' })
      if (existing.status === 'pending') return res.json({ success: true, data: { status: 'pending' } })
    }
    const status = target.account_type === 'private' ? 'pending' : 'active'
    await db.run(
      'INSERT INTO follows (follower_id, following_id, status) VALUES ($1,$2,$3) ON CONFLICT (follower_id, following_id) DO UPDATE SET status = EXCLUDED.status',
      [req.user!.userId, targetId, status]
    )
    if (status === 'active') {
      await Promise.all([
        db.run('UPDATE users SET followers_count = followers_count + 1 WHERE id = $1', [targetId]),
        db.run('UPDATE users SET following_count = following_count + 1 WHERE id = $1', [req.user!.userId]),
        (async () => {
          const notificationId = uuidv4()
          await db.run(`INSERT INTO notifications (id, user_id, type, actor_id, entity_type, content) VALUES ($1,$2,'follow',$3,'user','started following you')`, [notificationId, targetId, req.user!.userId])
          emitUserNotification(targetId, { id: notificationId, user_id: targetId, actor_id: req.user!.userId, type: 'follow', entity_type: 'user', content: 'started following you', is_read: 0, created_at: new Date().toISOString() })
        })(),
      ])
    } else {
      const notificationId = uuidv4()
      await db.run(
        `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, content)
         VALUES ($1, $2, 'follow_request', $3, 'user', $4, 'requested to follow you')`,
        [notificationId, targetId, req.user!.userId, req.user!.userId],
      )
      emitUserNotification(targetId, {
        id: notificationId,
        user_id: targetId,
        actor_id: req.user!.userId,
        type: 'follow_request',
        entity_type: 'user',
        entity_id: req.user!.userId,
        content: 'requested to follow you',
        is_read: 0,
        created_at: new Date().toISOString(),
      })
    }
    res.json({ success: true, data: { status } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

usersRouter.get('/me/follow-requests', requireAuth, async (req, res) => {
  try {
    const requests = await db.all(
      `SELECT f.follower_id AS id, f.created_at,
              u.username, u.full_name, u.avatar_url, u.college_name
       FROM follows f
       JOIN users u ON u.id = f.follower_id
       WHERE f.following_id = $1
         AND f.status = 'pending'
         AND COALESCE(u.is_banned, 0) = 0
         AND COALESCE(u.is_deactivated, 0) = 0
       ORDER BY f.created_at DESC`,
      [req.user!.userId],
    )
    res.json({ success: true, data: requests })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

usersRouter.post('/follow-requests/:followerId/accept', requireAuth, async (req, res) => {
  try {
    const accepted = await withTransaction(async (tx) => {
      const request = await tx.one(
        `SELECT follower_id FROM follows
         WHERE follower_id = $1 AND following_id = $2 AND status = 'pending'
         FOR UPDATE`,
        [req.params.followerId, req.user!.userId],
      )
      if (!request) return false
      await tx.run(
        `UPDATE follows SET status = 'active'
         WHERE follower_id = $1 AND following_id = $2`,
        [req.params.followerId, req.user!.userId],
      )
      await Promise.all([
        tx.run('UPDATE users SET followers_count = followers_count + 1 WHERE id = $1', [req.user!.userId]),
        tx.run('UPDATE users SET following_count = following_count + 1 WHERE id = $1', [req.params.followerId]),
      ])
      return true
    })
    if (!accepted) return res.status(404).json({ success: false, error: 'Follow request not found.' })
    res.json({ success: true, data: { status: 'active' } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

usersRouter.delete('/follow-requests/:followerId', requireAuth, async (req, res) => {
  try {
    const result = await db.run(
      `DELETE FROM follows
       WHERE follower_id = $1 AND following_id = $2 AND status = 'pending'`,
      [req.params.followerId, req.user!.userId],
    )
    if (!result?.rowCount) return res.status(404).json({ success: false, error: 'Follow request not found.' })
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

usersRouter.delete('/:id/follow', requireAuth, async (req, res) => {
  try {
    const { id: targetId } = req.params
    const existing = await db.one<any>('SELECT status FROM follows WHERE follower_id = $1 AND following_id = $2', [req.user!.userId, targetId])
    if (!existing) return res.status(404).json({ success: false, error: 'Not following.' })
    await db.run('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2', [req.user!.userId, targetId])
    if (existing.status === 'active') {
      await Promise.all([
        db.run('UPDATE users SET followers_count = GREATEST(0, followers_count - 1) WHERE id = $1', [targetId]),
        db.run('UPDATE users SET following_count = GREATEST(0, following_count - 1) WHERE id = $1', [req.user!.userId]),
      ])
    }
    res.json({ success: true, message: 'Unfollowed.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Followers / Following ────────────────────────────────────────────────────
usersRouter.get('/:id/followers', optionalAuth, async (req, res) => {
  try {
    if (await hasBlockBetween(req.user?.userId, req.params.id)) {
      return res.status(404).json({ success: false, error: 'User not found.' })
    }
    const { page = '1', limit = '20' } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    const followers = await db.all(`
      SELECT
        u.id,
        u.username,
        u.full_name,
        u.avatar_url,
        u.college_name,
        u.is_college_verified,
        EXISTS (
          SELECT 1
          FROM follows viewer_follow
          WHERE viewer_follow.follower_id = $4
            AND viewer_follow.following_id = u.id
            AND viewer_follow.status = 'active'
        ) AS is_following
      FROM follows f JOIN users u ON f.follower_id = u.id
      WHERE f.following_id = $1 AND f.status = 'active' AND COALESCE(u.is_admin, 0) = 0
      ORDER BY f.created_at DESC LIMIT $2 OFFSET $3
    `, [req.params.id, Number(limit), offset, req.user?.userId ?? null])
    res.json({ success: true, data: followers })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

usersRouter.get('/:id/following', optionalAuth, async (req, res) => {
  try {
    if (await hasBlockBetween(req.user?.userId, req.params.id)) {
      return res.status(404).json({ success: false, error: 'User not found.' })
    }
    const { page = '1', limit = '20' } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    const following = await db.all(`
      SELECT
        u.id,
        u.username,
        u.full_name,
        u.avatar_url,
        u.college_name,
        u.is_college_verified,
        EXISTS (
          SELECT 1
          FROM follows viewer_follow
          WHERE viewer_follow.follower_id = $4
            AND viewer_follow.following_id = u.id
            AND viewer_follow.status = 'active'
        ) AS is_following
      FROM follows f JOIN users u ON f.following_id = u.id
      WHERE f.follower_id = $1 AND f.status = 'active' AND COALESCE(u.is_admin, 0) = 0
      ORDER BY f.created_at DESC LIMIT $2 OFFSET $3
    `, [req.params.id, Number(limit), offset, req.user?.userId ?? null])
    res.json({ success: true, data: following })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Posts by user ────────────────────────────────────────────────────────────
usersRouter.get('/:id/posts', optionalAuth, async (req, res) => {
  try {
    if (await hasBlockBetween(req.user?.userId, req.params.id)) {
      return res.status(404).json({ success: false, error: 'User not found.' })
    }
    const target = await db.one<any>(
      'SELECT id, username, is_private, account_type FROM users WHERE id = $1',
      [req.params.id],
    )
    if (!target) return res.status(404).json({ success: false, error: 'User not found.' })
    if (req.user?.userId !== target.id && (target.is_private || target.account_type === 'private')) {
      const follows = req.user?.userId
        ? await db.one(
            "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'active'",
            [req.user.userId, target.id],
          )
        : null
      if (!follows) return res.json({ success: true, data: [] })
    }

    const { page = '1', limit = '12', type, view = 'posts' } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    const taggedView = view === 'tagged'
    const normalizedUsername = String(target.username || '').toLowerCase()
    let sql = `
      SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified
      FROM posts p JOIN users u ON p.user_id = u.id
      WHERE ${taggedView
        ? `(EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(NULLIF(p.tags, ''), '[]')::jsonb) AS tagged(value)
            WHERE LOWER(REGEXP_REPLACE(tagged.value, '^@', '')) = ?
          ))`
        : 'p.user_id = ?'}
        AND p.visibility = 'public' AND COALESCE(u.is_admin, 0) = 0
        AND COALESCE(u.is_banned, 0) = 0
        AND COALESCE(u.is_deactivated, 0) = 0
        AND COALESCE(p.type, '') <> 'glimpse'
    `
    const params: any[] = taggedView
      ? [normalizedUsername]
      : [req.params.id]
    if (taggedView && req.user?.userId) {
      sql += ` AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id = ? AND b.blocked_id = p.user_id)
           OR (b.blocker_id = p.user_id AND b.blocked_id = ?)
      )`
      params.push(req.user.userId, req.user.userId)
    }
    if (type) { sql += ' AND p.type = ?'; params.push(type) }
    sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), offset)
    const [finalSql, finalParams] = db.toPos(sql, params)
    const posts = await db.all(finalSql, finalParams)
    const enriched = await Promise.all(posts.map(p => enrichPost(p, req.user?.userId)))
    res.json({ success: true, data: enriched })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Saved posts by id ────────────────────────────────────────────────────────
usersRouter.get('/:id/saved', requireAuth, async (req, res) => {
  try {
    if (req.params.id !== req.user!.userId) return res.status(403).json({ success: false, error: 'Can only view your own saved posts.' })
    const { page = '1', limit = '12' } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    const posts = await db.all(`
      SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified
      FROM post_saves ps JOIN posts p ON ps.post_id = p.id JOIN users u ON p.user_id = u.id
      WHERE ps.user_id = $1 ORDER BY ps.created_at DESC LIMIT $2 OFFSET $3
    `, [req.user!.userId, Number(limit), offset])
    const enriched = await Promise.all(posts.map(p => enrichPost(p, req.user!.userId)))
    res.json({ success: true, data: enriched })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})
