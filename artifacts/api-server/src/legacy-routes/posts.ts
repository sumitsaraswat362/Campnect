// @ts-nocheck
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { db, withTransaction } from '../legacy-db/index.js'
import { requireAuth, optionalAuth } from '../legacy-middleware/auth.js'
import { uploadPost, assertMediaMagic, sendMediaPolicyError } from '../legacy-middleware/upload.js'
import { generateFeed, classifyNewPost } from '../legacy-services/recommender.js'
import { storeMediaAsset, storeMediaAssets } from '../legacy-services/media.js'
import { enforceUserRestriction } from '../legacy-services/userRestrictions.js'
import { createReportWithCase } from '../legacy-services/reporting.js'
import { extractVideoCover, processGlimpseVideo } from '../legacy-services/videoProcessing.js'
import {
  VIDEO_MAX_DURATION_SECONDS,
  MediaPolicyError,
  assertVideoDuration,
} from '../legacy-services/mediaLimits.js'
import { emitUserNotification } from '../legacy-socket/io.js'
import { loadAccessibleGlimpse } from '../legacy-services/glimpseAccess.js'
import { normalizeGiphyMessageReference } from '../legacy-services/giphy.js'
import {
  assessCommentSubmission,
  CommentRateLimitError,
  publicCommentModerationResult,
} from '../legacy-services/commentEnforcement.js'
import { evaluateComment } from '../legacy-services/commentModeration.js'
import { hashCommentContent, verifyCommentConfirmation } from '../legacy-services/commentConfirmation.js'

export const postsRouter = Router()
export const commentModerationRouter = Router()

async function canSubmitComment(req: any, res: any) {
  const user = await db.one<any>(
    `SELECT is_suspended, is_banned, is_deactivated, suspension_ends_at, ban_ends_at
     FROM users WHERE id = $1`,
    [req.user!.userId],
  )
  if (!user || user.is_deactivated) {
    res.status(403).json({ success: false, code: 'COMMENT_ACCOUNT_UNAVAILABLE', error: 'Your account is not available for commenting.' })
    return false
  }
  const now = Date.now()
  const suspendedUntil = user.suspension_ends_at ? new Date(user.suspension_ends_at).getTime() : 0
  const bannedUntil = user.ban_ends_at ? new Date(user.ban_ends_at).getTime() : 0
  if (
    (user.is_suspended && (!suspendedUntil || suspendedUntil > now)) ||
    (user.is_banned && (!bannedUntil || bannedUntil > now))
  ) {
    res.status(403).json({ success: false, code: 'COMMENT_ACCOUNT_RESTRICTED', error: 'Your account cannot comment while this restriction is active.' })
    return false
  }
  return !await enforceUserRestriction(req, res, 'comments')
}

function sendCommentAssessment(res: any, result: any, stage: string) {
  if (result.decision === 'ALLOW') return true
  if (result.assessment?.category === 'SPAM') {
    res.setHeader('Retry-After', '60')
    res.status(429).json({
      success: false,
      code: 'COMMENT_SPAM',
      retryAfter: 60,
      error: 'This comment appears to be repetitive or promotional spam. Please wait and review it before trying again.',
    })
    return false
  }
  if (result.decision === 'WARN') {
    res.status(409).json({
      success: false,
      code: 'COMMENT_MODERATION_WARNING',
      moderation: publicCommentModerationResult(result),
      error: result.message,
    })
    return false
  }
  if (result.decision === 'BLOCK') {
    res.status(422).json({
      success: false,
      code: 'COMMENT_MODERATION_BLOCKED',
      moderation: publicCommentModerationResult(result),
      error: result.message,
    })
    return false
  }
  res.status(422).json({
    success: false,
    code: 'COMMENT_MODERATION_REVIEW',
    moderation: publicCommentModerationResult(result),
    error: result.message,
  })
  return false
}

async function moderateCommentSubmission(req: any, res: any, input: {
  postId: string
  parentId?: string | null
  commentId?: string | null
  operation: 'create' | 'edit'
  text: string
  stage: 'preflight' | 'commit'
}) {
  try {
    const result = await assessCommentSubmission({
      userId: req.user!.userId,
      postId: input.postId,
      parentId: input.parentId || null,
      commentId: input.commentId || null,
      operation: input.operation,
      stage: input.stage,
      text: input.text,
      requestId: req.id || null,
      confirmationToken: req.body?.moderationConfirmation ?? req.body?.moderation_confirmation ?? null,
    })
    if (result.assessment?.category === 'SPAM') {
      res.setHeader('Retry-After', '60')
      res.status(429).json({
        success: false,
        code: 'COMMENT_SPAM',
        retryAfter: 60,
        error: 'This comment appears to be repetitive or promotional spam. Please wait and review it before trying again.',
      })
      return false
    }
    if (result.approvedOverrideId) req.approvedCommentOverrideId = result.approvedOverrideId
    if (result.decision !== 'WARN') return sendCommentAssessment(res, result, input.stage)

    if (input.stage === 'commit') {
      const grant = verifyCommentConfirmation(
        req.body?.moderationConfirmation ?? req.body?.moderation_confirmation,
        {
        userId: req.user!.userId,
        postId: input.postId,
        parentId: input.parentId || null,
        commentId: input.commentId || null,
        operation: input.operation,
        contentHash: result.contentHash,
        },
      )
      if (grant) {
        const consumed = await db.one<any>(
          `UPDATE comment_moderation_decisions
           SET confirmation_used_at = NOW()
           WHERE id = $1 AND user_id = $2 AND post_id = $3
             AND COALESCE(parent_id, '') = COALESCE($4, '')
             AND COALESCE(target_comment_id, '') = COALESCE($5, '')
              AND operation = $6 AND request_stage IN ('preflight','commit')
             AND content_hash = $7 AND confirmation_nonce_hash = $8
             AND confirmation_used_at IS NULL AND confirmation_expires_at > NOW()
           RETURNING id`,
          [
            grant.attemptId,
            req.user!.userId,
            input.postId,
            input.parentId || null,
            input.commentId || null,
            input.operation,
            result.contentHash,
            grant.nonceHash,
          ],
        )
        if (consumed) return true
      }
    }
    return sendCommentAssessment(res, result, input.stage)
  } catch (error: any) {
    if (error instanceof CommentRateLimitError) {
      res.setHeader('Retry-After', String(error.retryAfter))
      res.status(429).json({
        success: false,
        code: 'COMMENT_SPAM',
        retryAfter: error.retryAfter,
        error: error.message,
      })
      return false
    }
    throw error
  }
}

async function publishModeratedComment(input: {
  userId: string
  postId: string
  parentId?: string | null
  commentId?: string | null
  content: string
  approvedOverrideId?: string | null
}) {
  return withTransaction(async (tx) => {
    // Comment-only restrictions and duplicate publication checks are
    // serialized with other moderation decisions for this user.
    await tx.one(
      'SELECT pg_advisory_xact_lock(hashtext($1)) AS locked',
      [`comment-enforcement:${input.userId}`],
    )
    const unavailable = await tx.one<any>(
      `SELECT is_banned, is_suspended, is_deactivated, ban_ends_at, suspension_ends_at
       FROM users WHERE id = $1`,
      [input.userId],
    )
    const now = Date.now()
    const banExpires = unavailable?.ban_ends_at ? new Date(unavailable.ban_ends_at).getTime() : 0
    const suspensionExpires = unavailable?.suspension_ends_at ? new Date(unavailable.suspension_ends_at).getTime() : 0
    if (
      !unavailable ||
      unavailable.is_deactivated ||
      (unavailable.is_banned && (!banExpires || banExpires > now)) ||
      (unavailable.is_suspended && (!suspensionExpires || suspensionExpires > now))
    ) return { error: 'COMMENT_ACCOUNT_RESTRICTED' as const }

    const commentRestriction = await tx.one<any>(
      `SELECT id FROM user_restrictions
       WHERE user_id = $1 AND restriction_type = 'comments' AND removed_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [input.userId],
    )
    if (commentRestriction) return { error: 'COMMENT_ACCOUNT_RESTRICTED' as const }

    const duplicate = await tx.one<any>(
      `SELECT c.id FROM comments c
       WHERE c.user_id = $1
         AND c.created_at >= NOW() - INTERVAL '1 hour'
         AND lower(regexp_replace(btrim(c.content), '\\s+', ' ', 'g')) =
             lower(regexp_replace(btrim($2), '\\s+', ' ', 'g'))
         AND ($3::text IS NULL OR c.id <> $3)
         AND NOT EXISTS (
           SELECT 1 FROM content_moderation cm
           WHERE cm.content_type = 'comment' AND cm.content_id = c.id
             AND (cm.is_hidden = 1 OR cm.status IN ('hidden', 'deleted'))
         )
       LIMIT 1`,
      [input.userId, input.content, input.commentId || null],
    )
    if (duplicate) return { error: 'COMMENT_SPAM' as const }

    if (input.approvedOverrideId) {
      const usedOverride = await tx.one<any>(
        `UPDATE comment_moderation_overrides
         SET consumed_at = NOW()
         WHERE id = $1 AND user_id = $2 AND post_id = $3
           AND operation = $4 AND content_hash = $5
           AND COALESCE(parent_id, '') = COALESCE($6, '')
           AND COALESCE(target_comment_id, '') = COALESCE($7, '')
           AND consumed_at IS NULL AND expires_at > NOW()
         RETURNING id`,
        [
          input.approvedOverrideId, input.userId, input.postId,
          input.commentId ? 'edit' : 'create', hashCommentContent(input.content),
          input.parentId || null, input.commentId || null,
        ],
      )
      if (!usedOverride) return { error: 'COMMENT_APPROVAL_EXPIRED' as const }
    }

    if (input.commentId) {
      const updated = await tx.one<any>(
        `UPDATE comments SET content = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3 AND post_id = $4
         RETURNING id`,
        [input.content, input.commentId, input.userId, input.postId],
      )
      return updated ? { commentId: updated.id } : { error: 'COMMENT_NOT_FOUND' as const }
    }

    const commentId = uuidv4()
    await tx.run(
      'INSERT INTO comments (id, post_id, user_id, parent_id, content) VALUES ($1,$2,$3,$4,$5)',
      [commentId, input.postId, input.userId, input.parentId || null, input.content],
    )
    if (!input.parentId) {
      await tx.run('UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1', [input.postId])
    }
    return { commentId }
  })
}

export const POST_ACCESS_SQL = `
  (
    p.user_id = $1
    OR (
      p.moderation_status = 'approved'
      AND COALESCE(p.discovery_restricted, 0) = 0
      AND COALESCE(u.is_banned, 0) = 0
      AND COALESCE(u.is_deactivated, 0) = 0
      AND COALESCE(u.is_admin, 0) = 0
      AND COALESCE(usc.feed_visibility, COALESCE(u.is_shadowbanned, 0)) = 0
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id = $1 AND b.blocked_id = p.user_id)
           OR (b.blocker_id = p.user_id AND b.blocked_id = $1)
      )
      AND (
        (
          p.visibility = 'public'
          AND (
            COALESCE(u.is_private, 0) = 0
            OR EXISTS (
              SELECT 1 FROM follows f
              WHERE f.follower_id = $1 AND f.following_id = p.user_id AND f.status = 'active'
            )
          )
        )
        OR (
          p.visibility = 'friends'
          AND EXISTS (
            SELECT 1 FROM follows viewer_follows
            WHERE viewer_follows.follower_id = $1
              AND viewer_follows.following_id = p.user_id
              AND viewer_follows.status = 'active'
          )
          AND EXISTS (
            SELECT 1 FROM follows author_follows
            WHERE author_follows.follower_id = p.user_id
              AND author_follows.following_id = $1
              AND author_follows.status = 'active'
          )
        )
        OR (
          p.visibility = 'college'
          AND p.college_id IS NOT NULL
          AND p.college_id = (SELECT college_id FROM users WHERE id = $1)
        )
      )
    )
  )
`

function encodeFeedCursor(post: any) {
  return Buffer.from(JSON.stringify({ createdAt: post.created_at, id: post.id })).toString('base64url')
}

function decodeFeedCursor(value: unknown): { createdAt: string; id: string } | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (
      typeof parsed?.createdAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.createdAt)) ||
      typeof parsed?.id !== 'string' ||
      !parsed.id
    ) return null
    return parsed
  } catch {
    return null
  }
}

async function canAccessPost(postId: string, viewerId?: string) {
  const post = await db.one<any>('SELECT id, type FROM posts WHERE id = $1', [postId])
  if (!post) return false
  if (post.type === 'glimpse') {
    if (!viewerId) return false
    return Boolean(await loadAccessibleGlimpse(postId, viewerId))
  }
  return Boolean(await db.one(`
    SELECT 1
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
    WHERE p.id = $2 AND ${POST_ACCESS_SQL}
  `, [viewerId || null, postId]))
}

function parseJson(v: any, fallback: any) {
  if (v === null || v === undefined) return fallback
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return fallback } }
  return v
}

function normalizeStoredTaggedUsername(value: unknown) {
  const username = String(value || '').trim().replace(/^@/, '').toLowerCase()
  return /^[a-z0-9_.]{3,30}$/.test(username) ? username : ''
}

function normalizeTagInput(value: unknown) {
  const tag = String(value || '').trim().toLowerCase()
  return /^@[a-z0-9_.]{3,30}$/.test(tag) ? tag.slice(1) : ''
}

async function loadTaggedUsers(tags: unknown) {
  const usernames = [...new Set(
    (Array.isArray(tags) ? tags : [])
      .map(normalizeStoredTaggedUsername)
      .filter(Boolean),
  )]
  if (usernames.length === 0) return []
  const users = await db.all<any>(
    `SELECT id, username, full_name, avatar_url, college_name, is_college_verified
     FROM users
     WHERE LOWER(username) = ANY($1::text[])
       AND COALESCE(is_admin, 0) = 0
       AND COALESCE(is_banned, 0) = 0
       AND COALESCE(is_deactivated, 0) = 0`,
    [usernames],
  )
  const byUsername = new Map(users.map((user: any) => [String(user.username).toLowerCase(), user]))
  return usernames.map((username) => byUsername.get(username)).filter(Boolean)
}

export async function enrichPost(post: any, viewerId?: string) {
  if (!post) return null
  const storedTags = parseJson(post.tags, [])
  const tags = [...new Set(
    (Array.isArray(storedTags) ? storedTags : [])
      .map(normalizeStoredTaggedUsername)
      .filter(Boolean),
  )]
  const [isLiked, isSaved, isFollowing, taggedUsers] = await Promise.all([
    viewerId ? db.one('SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2', [post.id, viewerId]) : null,
    viewerId ? db.one('SELECT 1 FROM post_saves WHERE post_id = $1 AND user_id = $2', [post.id, viewerId]) : null,
    viewerId && viewerId !== post.user_id
      ? db.one("SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'active'", [viewerId, post.user_id])
      : null,
    loadTaggedUsers(tags),
  ])
  return {
    ...post,
    content:       post.content,
    media:        parseJson(post.media, []),
    tags,
    tagged_users: taggedUsers,
    poll_options: post.poll_options ? parseJson(post.poll_options, null) : null,
    is_liked:     !!isLiked,
    is_saved:     !!isSaved,
    is_following_author: viewerId && viewerId !== post.user_id ? !!isFollowing : null,
  }
}

// ─── Feed (legacy / simple — kept for backwards compatibility) ─────────────────
postsRouter.get('/feed', requireAuth, async (req, res) => {
  try {
    const { page = '1', limit = '15', type, mode = 'latest', cursor } = req.query
    const parsedLimit = Math.max(1, Math.min(50, Number(limit) || 15))
    const parsedPage = Math.max(1, Number(page) || 1)
    const offset = (parsedPage - 1) * parsedLimit
    const userId = req.user!.userId

    // Route to recommendation engine for for_you / following
    if (mode === 'for_you' || mode === 'following') {
      const feedType = mode === 'following' ? 'following' : 'for_you'
      const posts = await generateFeed({ userId, limit: parsedLimit, offset, feedType })

      // Enrich with viewer like/save state
      const enriched = await Promise.all(posts.map(async (p: any) => {
        const [isLiked, isSaved] = await Promise.all([
          db.one('SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2', [p.id, userId]),
          db.one('SELECT 1 FROM post_saves WHERE post_id = $1 AND user_id = $2', [p.id, userId]),
        ])
        return { ...p, is_liked: !!isLiked, is_saved: !!isSaved }
      }))

      return res.json({ success: true, data: enriched, meta: { page: parsedPage, limit: parsedLimit, hasMore: posts.length === parsedLimit } })
    }

    // Reliable baseline feed: every post this viewer is allowed to see, newest first.
    // Keyset pagination keeps pages stable while newer posts are published.
    const decodedCursor = decodeFeedCursor(cursor)
    if (cursor && !decodedCursor) {
      return res.status(400).json({ success: false, error: 'Invalid feed cursor.' })
    }
    const params: any[] = [userId]
    let typeFilter = ''
    if (type && type !== 'all') { typeFilter = `AND p.type = $${params.length + 1}`; params.push(type) }
    let cursorFilter = ''
    if (decodedCursor) {
      cursorFilter = `AND (p.created_at, p.id) < ($${params.length + 1}::timestamptz, $${params.length + 2})`
      params.push(decodedCursor.createdAt, decodedCursor.id)
    }
    params.push(parsedLimit + 1)
    const limitIdx = params.length

    const rows = await db.all(`
      SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.college_id, u.is_college_verified,
        CASE WHEN EXISTS(
          SELECT 1 FROM follows f
          WHERE f.follower_id = $1 AND f.following_id = p.user_id AND f.status = 'active'
        ) THEN true ELSE false END AS is_following_author
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
      WHERE p.type <> 'glimpse'
        AND ${POST_ACCESS_SQL}
        ${typeFilter}
        ${cursorFilter}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $${limitIdx}
    `, params)

    const hasMore = rows.length > parsedLimit
    const posts = rows.slice(0, parsedLimit)
    const enriched = await Promise.all(posts.map(p => enrichPost(p, userId)))
    res.json({
      success: true,
      data: enriched,
      meta: {
        limit: parsedLimit,
        hasMore,
        nextCursor: hasMore && posts.length ? encodeFeedCursor(posts[posts.length - 1]) : null,
      },
    })
  } catch (err: any) {
    console.error('feed error:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Create post ──────────────────────────────────────────────────────────────
const createSchema = z.object({
  type:         z.enum(['text','photo','carousel','video','reel','poll','campus_update']).default('text'),
  content:      z.string().max(5000).default(''),
  tags:         z.array(z.string()).default([]),
  community_id: z.string().optional(),
  visibility:   z.enum(['public','friends','college']).default('public'),
  poll_options: z.array(z.string().min(1)).min(2).max(6).optional(),
  location:     z.string().max(200).optional(),
  filter:       z.string().max(50).optional(),
  trim_start:   z.coerce.number().finite().min(0).optional(),
  trim_end:     z.coerce.number().finite().min(0).optional(),
  playback_speed: z.coerce.number().finite().optional(),
  cover_time:   z.coerce.number().finite().min(0).optional(),
  client_processed: z.boolean().optional(),
  source_duration: z.coerce.number().finite().positive().optional(),
})

// Some browsers cannot expose metadata for an otherwise valid phone MOV.
// Normalize that exact uploaded file to a browser-friendly MP4 without
// persisting it; the client still performs the final trim before publishing.
postsRouter.post('/video-preview', requireAuth, uploadPost.single('media'), async (req, res) => {
  try {
    const file = req.file
    if (!file || !file.mimetype.startsWith('video/')) {
      return res.status(400).json({ success: false, error: 'A video file is required.' })
    }
    await assertMediaMagic(file)
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[posts] video preview normalization', {
        name: file.originalname,
        mime: file.mimetype,
        bytes: file.size,
      })
    }
    const normalized = await processGlimpseVideo(file.buffer, {
      start: 0,
      end: VIDEO_MAX_DURATION_SECONDS,
      speed: 1,
      filter: 'none',
    })
    res.set({
      'Content-Type': 'video/mp4',
      'Content-Length': String(normalized.buffer.length),
      'Cache-Control': 'no-store',
      'X-Video-Duration': normalized.duration.toFixed(3),
    })
    return res.status(200).send(normalized.buffer)
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    console.error('[posts] video preview normalization failed:', err?.message || err)
    return res.status(422).json({ success: false, error: 'This video could not be prepared for editing.' })
  }
})

postsRouter.post('/', requireAuth, uploadPost.array('media', 10), async (req, res) => {
  try {
    if (await enforceUserRestriction(req, res, 'posting')) return
    let body: any
    try { body = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body } catch { body = req.body }
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors[0].message })
    const {
      type, content, tags, community_id, visibility, poll_options, location,
      filter, trim_start, trim_end, playback_speed, cover_time,
      client_processed, source_duration,
    } = parsed.data
    const effectiveType = type === 'video' ? 'reel' : type
    const invalidTags = tags
      .map((tag) => String(tag || '').trim())
      .filter((tag) => tag && !normalizeTagInput(tag))
    if (invalidTags.length > 0) {
      return res.status(400).json({ success: false, error: 'Tag people using @username only.' })
    }
    const normalizedTags = [...new Set(tags.map(normalizeTagInput).filter(Boolean))]
    const normalizedContent = content

    const files = (req.files as Express.Multer.File[]) || []
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[posts] upload received', {
        type: effectiveType,
        fileCount: files.length,
        files: files.map(file => ({ name: file.originalname, mime: file.mimetype, bytes: file.size })),
      })
    }
    if (['photo', 'reel', 'carousel'].includes(effectiveType) && files.length === 0) {
      return res.status(400).json({ success: false, error: 'Media file required.' })
    }
    if (effectiveType === 'carousel' && files.length < 2) {
      return res.status(400).json({ success: false, error: 'A carousel needs at least two media files.' })
    }
    for (const file of files) {
      await assertMediaMagic(file)
    }
    if (effectiveType === 'carousel' && files.some(file => file.mimetype.startsWith('video/'))) {
      return res.status(400).json({ success: false, error: 'Videos are published as Clips. Upload one video at a time.' })
    }
    if (effectiveType === 'reel' && (files.length !== 1 || !files[0].mimetype.startsWith('video/'))) {
      return res.status(400).json({ success: false, error: 'A Clip must contain one video.' })
    }
    const postId = uuidv4()

    let filesToStore = files
    let glimpseDuration: number | null = null
    let glimpseCover: Express.Multer.File | null = null
    let glimpseTrimStart: number | null = null
    let glimpseTrimEnd: number | null = null
    let glimpseSpeed = 1

    if (effectiveType === 'reel') {
      const speed = playback_speed ?? 1
      const start = trim_start ?? 0
      const end = trim_end ?? 60
      const isClientProcessed = client_processed === true
      if (isClientProcessed) {
        if (end <= start) throw new Error('Choose a valid trim range.')
        assertVideoDuration(end - start)
        if (source_duration !== undefined && end > source_duration + 0.1) {
          throw new Error('Choose a valid trim range.')
        }
        if (![0.5, 1, 1.5, 2].includes(speed)) {
          throw new Error('Unsupported playback speed.')
        }
      }
      const processed = await processGlimpseVideo(files[0].buffer, {
        // The browser has already created the final trimmed File. Re-encode
        // that file only to apply the selected server-side filter and produce
        // a durable MP4; never trim the original upload a second time.
        start: isClientProcessed ? 0 : start,
        end: isClientProcessed ? VIDEO_MAX_DURATION_SECONDS : end,
        speed: isClientProcessed ? 1 : speed,
        filter: filter || 'none',
      })
      const effectiveStart = isClientProcessed ? start : processed.start
      const effectiveEnd = isClientProcessed ? end : processed.end
      const clientCoverTime = cover_time === undefined
        ? 0
        : (cover_time - start) / speed
      const coverAt = Math.max(0, Math.min(
        isClientProcessed ? clientCoverTime : (cover_time ?? effectiveStart),
        processed.end - 0.01,
      ))
      let coverBuffer: Buffer
      try {
        coverBuffer = await extractVideoCover(files[0].buffer, coverAt, filter || 'none')
      } catch {
        throw new MediaPolicyError('OPTIMIZATION_FAILED', 'The video could not be optimized. Please try another video.')
      }
      filesToStore = [{
        ...files[0],
        buffer: processed.buffer,
        mimetype: 'video/mp4',
        originalname: 'glimpse.mp4',
        size: processed.buffer.length,
        campnectDeliveryOptimized: true,
      }]
      glimpseCover = {
        ...files[0],
        buffer: coverBuffer,
        mimetype: 'image/jpeg',
        originalname: 'glimpse-cover.jpg',
        size: coverBuffer.length,
      }
      glimpseDuration = processed.duration
      glimpseTrimStart = effectiveStart
      glimpseTrimEnd = effectiveEnd
      glimpseSpeed = speed
    }

    let mediaUrls: string[] = []
    let coverUrl: string | null = null
    await withTransaction(async (tx) => {
      const user = await tx.one<any>('SELECT college_id FROM users WHERE id = $1', [req.user!.userId])
      mediaUrls = await storeMediaAssets(tx, filesToStore, req.user!.userId, effectiveType === 'reel' ? 'clip_media' : 'post_media', postId)
      if (glimpseCover) {
        coverUrl = await storeMediaAsset(tx, glimpseCover, req.user!.userId, effectiveType === 'reel' ? 'clip_cover' : 'post_cover', postId)
      }

      await tx.run(`
        INSERT INTO posts
          (id, user_id, type, content, media, tags, college_id, community_id, visibility,
           poll_options, location, filter, duration, cover_url, trim_start, trim_end, playback_speed)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      `, [postId, req.user!.userId, effectiveType, normalizedContent, JSON.stringify(mediaUrls), JSON.stringify(normalizedTags),
          user?.college_id || null, community_id || null, visibility, poll_options ? JSON.stringify(poll_options) : null,
          location || null, filter || null, glimpseDuration, coverUrl, glimpseTrimStart, glimpseTrimEnd, glimpseSpeed])

      await tx.run('UPDATE users SET posts_count = posts_count + 1 WHERE id = $1', [req.user!.userId])

      const mentionedUsernames = [...new Set([
        ...(String(normalizedContent).match(/@([a-z0-9_.]{3,30})/gi) || []).map(m => m.slice(1).toLowerCase()),
        ...normalizedTags,
      ])]
      if (mentionedUsernames.length) {
        const mentioned = await tx.all<any>(
          'SELECT id, username FROM users WHERE LOWER(username) = ANY($1::text[])',
          [mentionedUsernames],
        )
        await Promise.all(mentioned
          .filter((u: any) => u.id !== req.user!.userId)
          .map((u: any) => tx.run(
            `INSERT INTO notifications (id,user_id,type,actor_id,entity_id,entity_type,content)
             VALUES ($1,$2,'mention',$3,$4,$5,$6)`,
            [uuidv4(), u.id, req.user!.userId, postId, effectiveType === 'glimpse' ? 'glimpse' : 'post', `mentioned or tagged you in a ${effectiveType === 'glimpse' ? 'Glimpse' : 'post'}`],
          )))
      }
    })

    // Classify post asynchronously (fire-and-forget so it doesn't block the response)
    classifyNewPost(postId, normalizedContent, normalizedTags, effectiveType).catch((err: any) => console.error('[classifier] error:', err.message))

    const post = await db.one(`
      SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified
      FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = $1
    `, [postId])
    res.status(201).json({ success: true, data: await enrichPost(post, req.user!.userId) })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    console.error('[posts] create failed:', err?.message || err)
    if (
      err?.message?.startsWith('Choose a trim range') ||
      err?.message?.startsWith('Choose a valid trim range') ||
      err?.message?.startsWith('Glimpse videos') ||
      err?.message?.startsWith('Unsupported')
    ) {
      return res.status(400).json({ success: false, error: err.message })
    }
    const requestedType = (() => {
      try {
        const parsedBody = typeof req.body?.data === 'string' ? JSON.parse(req.body.data) : req.body
        return parsedBody?.type
      } catch { return undefined }
    })()
    if (requestedType === 'reel') {
      return res.status(422).json({ success: false, error: 'Video processing failed. Try another video or trim range.' })
    }
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Get post ─────────────────────────────────────────────────────────────────
postsRouter.get('/:id', optionalAuth, async (req, res) => {
  try {
    const post = await db.one(`
      SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
      WHERE p.id = $1
        AND COALESCE(usc.feed_visibility, COALESCE(u.is_shadowbanned, 0)) = 0
    `, [req.params.id])
    if (!post) return res.status(404).json({ success: false, error: 'Post not found.' })
    if (!(await canAccessPost(post.id, req.user?.userId))) {
      return res.status(404).json({ success: false, error: 'Post not found.' })
    }
    await db.run('UPDATE posts SET views_count = views_count + 1 WHERE id = $1', [req.params.id])
    res.json({ success: true, data: await enrichPost(post, req.user?.userId) })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Edit post ────────────────────────────────────────────────────────────────
const editPostSchema = z.object({
  content:    z.string().max(5000).optional(),
  visibility: z.enum(['public','friends','college']).optional(),
  location:   z.string().max(200).optional(),
})

postsRouter.patch('/:id', requireAuth, async (req, res) => {
  try {
    const post = await db.one<any>('SELECT * FROM posts WHERE id = $1', [req.params.id])
    if (!post) return res.status(404).json({ success: false, error: 'Post not found.' })
    if (post.user_id !== req.user!.userId && !req.user!.isAdmin) return res.status(403).json({ success: false, error: 'Not authorized.' })
    const parsed = editPostSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors[0].message })
    const data = parsed.data
    const fields: string[] = []
    const values: any[] = []
    if (data.content    !== undefined) { fields.push('content = ?');    values.push(data.content) }
    if (data.visibility !== undefined) { fields.push('visibility = ?'); values.push(data.visibility) }
    if (data.location   !== undefined) { fields.push('location = ?');   values.push(data.location) }
    if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update.' })
    fields.push('updated_at = NOW()')
    values.push(req.params.id)
    const [sql, params] = db.toPos(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`, values)
    await db.run(sql, params)

    // Reclassify if content changed
    if (data.content !== undefined) {
      const tags = parseJson(post.tags, [])
      await db.run('DELETE FROM post_classifications WHERE post_id = $1', [req.params.id])
      classifyNewPost(req.params.id, data.content, tags, post.type ?? 'text').catch(() => {})
    }

    const updated = await db.one(`
      SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified
      FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = $1
    `, [req.params.id])
    res.json({ success: true, data: await enrichPost(updated, req.user!.userId) })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Delete post ──────────────────────────────────────────────────────────────
postsRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    const post = await db.one<any>('SELECT user_id FROM posts WHERE id = $1', [req.params.id])
    if (!post) return res.status(404).json({ success: false, error: 'Post not found.' })
    if (post.user_id !== req.user!.userId && !req.user!.isAdmin) return res.status(403).json({ success: false, error: 'Not authorized.' })
    await db.run('DELETE FROM posts WHERE id = $1', [req.params.id])
    await db.run('UPDATE users SET posts_count = GREATEST(0, posts_count - 1) WHERE id = $1', [post.user_id])
    res.json({ success: true, message: 'Post deleted.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Like / Unlike ────────────────────────────────────────────────────────────
postsRouter.post('/:id/like', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessPost(req.params.id, req.user!.userId))) return res.status(404).json({ success: false, error: 'Post not found.' })
    const existing = await db.one('SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    if (existing) return res.status(409).json({ success: false, error: 'Already liked.' })
    await db.run('INSERT INTO post_likes (post_id, user_id) VALUES ($1,$2)', [req.params.id, req.user!.userId])
    const post = await db.one<any>('UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1 RETURNING likes_count, user_id, type', [req.params.id])
    if (post?.user_id && post.user_id !== req.user!.userId) {
      const notificationId = uuidv4()
      const entityType = post.type === 'glimpse' ? 'glimpse' : post.type === 'reel' ? 'clip' : 'post'
      const content = `liked your ${entityType === 'glimpse' ? 'Glimpse' : entityType === 'clip' ? 'Clip' : 'post'}`
      await db.run("INSERT INTO notifications (id,user_id,type,actor_id,entity_id,entity_type,content) VALUES ($1,$2,'like',$3,$4,$5,$6)",
        [notificationId, post.user_id, req.user!.userId, req.params.id, entityType, content])
      const actor = await db.one<any>('SELECT username, full_name, avatar_url FROM users WHERE id = $1', [req.user!.userId])
      emitUserNotification(post.user_id, {
        id: notificationId, user_id: post.user_id, actor_id: req.user!.userId,
        actor_name: actor?.full_name || actor?.username || 'Someone',
        actor_username: actor?.username || null, actor_avatar: actor?.avatar_url || null,
        type: 'like', entity_type: entityType, entity_id: req.params.id,
        content, is_read: 0, created_at: new Date().toISOString(),
      })
    }
    res.json({ success: true, data: { likes_count: post?.likes_count || 0 } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

postsRouter.delete('/:id/like', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessPost(req.params.id, req.user!.userId))) return res.status(404).json({ success: false, error: 'Post not found.' })
    const result = await db.run('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    let post: any
    if (result.rowCount > 0) {
      post = await db.one('UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1 RETURNING likes_count', [req.params.id])
    } else {
      post = await db.one('SELECT likes_count FROM posts WHERE id = $1', [req.params.id])
    }
    res.json({ success: true, data: { likes_count: post?.likes_count || 0 } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Save / Unsave ────────────────────────────────────────────────────────────
postsRouter.post('/:id/save', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessPost(req.params.id, req.user!.userId))) return res.status(404).json({ success: false, error: 'Post not found.' })
    const result = await db.run('INSERT INTO post_saves (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.user!.userId])
    if (result.rowCount > 0) await db.run('UPDATE posts SET saves_count = saves_count + 1 WHERE id = $1', [req.params.id])
    res.json({ success: true, message: 'Post saved.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

postsRouter.delete('/:id/save', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessPost(req.params.id, req.user!.userId))) return res.status(404).json({ success: false, error: 'Post not found.' })
    const result = await db.run('DELETE FROM post_saves WHERE post_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    if (result.rowCount > 0) await db.run('UPDATE posts SET saves_count = GREATEST(0, saves_count - 1) WHERE id = $1', [req.params.id])
    res.json({ success: true, message: 'Post unsaved.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Comments ─────────────────────────────────────────────────────────────────
postsRouter.get('/:id/comments', optionalAuth, async (req, res) => {
  try {
    if (!(await canAccessPost(req.params.id, req.user?.userId))) return res.status(404).json({ success: false, error: 'Post not found.' })
    const { page = '1', limit = '20' } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    const comments = await db.all(`
      SELECT c.*, u.username, u.full_name, u.avatar_url, u.is_college_verified,
        EXISTS(SELECT 1 FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = $2) AS is_liked,
        (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id
          AND NOT EXISTS (
            SELECT 1 FROM content_moderation rcm
            WHERE rcm.content_type = 'comment' AND rcm.content_id = r.id
              AND (rcm.is_hidden = 1 OR rcm.status IN ('hidden', 'deleted'))
          )) as replies_count
      FROM comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
      WHERE c.post_id = $1 AND c.parent_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM content_moderation cm
          WHERE cm.content_type = 'comment' AND cm.content_id = c.id
            AND (cm.is_hidden = 1 OR cm.status IN ('hidden', 'deleted'))
        )
        AND COALESCE(usc.comment_visibility, COALESCE(u.is_shadowbanned, 0)) = 0
      ORDER BY c.created_at ASC LIMIT $3 OFFSET $4
    `, [req.params.id, req.user?.userId || null, Number(limit), offset])
    res.json({ success: true, data: comments })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

postsRouter.get('/:id/comments/:commentId/replies', optionalAuth, async (req, res) => {
  try {
    if (!(await canAccessPost(req.params.id, req.user?.userId))) return res.status(404).json({ success: false, error: 'Post not found.' })
    const parent = await db.one<any>(
      `SELECT c.id FROM comments c
       WHERE c.id = $1 AND c.post_id = $2 AND c.parent_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM content_moderation cm
           WHERE cm.content_type = 'comment' AND cm.content_id = c.id
             AND (cm.is_hidden = 1 OR cm.status IN ('hidden', 'deleted'))
         )`,
      [req.params.commentId, req.params.id],
    )
    if (!parent) return res.status(404).json({ success: false, error: 'Comment not found.' })
    const replies = await db.all(`
      SELECT c.*, u.username, u.full_name, u.avatar_url, u.is_college_verified,
        EXISTS(SELECT 1 FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = $3) AS is_liked
      FROM comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
      WHERE c.parent_id = $1 AND c.post_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM content_moderation cm
          WHERE cm.content_type = 'comment' AND cm.content_id = c.id
            AND (cm.is_hidden = 1 OR cm.status IN ('hidden', 'deleted'))
        )
        AND COALESCE(usc.comment_visibility, COALESCE(u.is_shadowbanned, 0)) = 0
      ORDER BY c.created_at ASC LIMIT 50
    `, [req.params.commentId, req.params.id, req.user?.userId || null])
    res.json({ success: true, data: replies })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// Optional UX preflight. The create/edit routes repeat this server-side decision
// independently; a preflight result can never authorize publication by itself.
async function handleCommentModerationPreflight(req: any, res: any, boundPostId?: string) {
  try {
    if (boundPostId && !(await canAccessPost(boundPostId, req.user!.userId))) {
      return res.status(404).json({ success: false, error: 'Post not found.' })
    }
    if (!(await canSubmitComment(req, res))) return
    const rawContent = req.body?.text ?? req.body?.content
    const content = typeof rawContent === 'string' ? rawContent.trim() : ''
    const commentContent = normalizeGiphyMessageReference(content) || content
    if (!commentContent) return res.status(400).json({ success: false, error: 'Comment cannot be empty.' })
    if (commentContent.length > 2000) return res.status(400).json({ success: false, error: 'Comment too long.' })

    if (!boundPostId) {
      const hasBoundComment = Boolean(
        req.body?.parentId ?? req.body?.parent_id ?? req.body?.commentId ?? req.body?.comment_id,
      )
      if (hasBoundComment) {
        return res.status(400).json({ success: false, error: 'A post is required for a bound comment preflight.' })
      }
      const assessment = await evaluateComment({
        text: commentContent,
        userId: req.user!.userId,
      })
      return res.json({
        success: true,
        moderation: {
          decision: assessment.decision,
          severity: assessment.severity,
          category: assessment.category,
          requiresConfirmation: assessment.requiresConfirmation === true,
        },
      })
    }

    const requestedCommentId = typeof (req.body?.commentId ?? req.body?.comment_id) === 'string'
      ? String(req.body.commentId ?? req.body.comment_id).trim()
      : ''
    let commentId = ''
    let operation: 'create' | 'edit' = 'create'
    let parentId = typeof (req.body?.parentId ?? req.body?.parent_id) === 'string'
      ? String(req.body.parentId ?? req.body.parent_id).trim()
      : ''
    if (requestedCommentId) {
      const existing = await db.one<any>('SELECT id, post_id, parent_id, user_id FROM comments WHERE id = $1', [requestedCommentId])
      if (!existing || existing.post_id !== boundPostId || existing.user_id !== req.user!.userId) {
        return res.status(404).json({ success: false, error: 'Comment not found.' })
      }
      operation = 'edit'
      commentId = existing.id
      parentId = existing.parent_id || ''
    }
    if (parentId) {
      const parent = await db.one<any>(
        `SELECT c.id FROM comments c
         WHERE c.id = $1 AND c.post_id = $2 AND c.parent_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM content_moderation cm
             WHERE cm.content_type = 'comment' AND cm.content_id = c.id
               AND (cm.is_hidden = 1 OR cm.status IN ('hidden', 'deleted'))
           )`,
        [parentId, boundPostId],
      )
      if (!parent) return res.status(400).json({ success: false, error: 'Parent comment not found.' })
    }
    const result = await assessCommentSubmission({
      userId: req.user!.userId, postId: boundPostId, parentId: parentId || null,
      commentId: commentId || null, operation, stage: 'preflight',
      text: commentContent, requestId: req.id || null,
    })
    const status = result.decision === 'ALLOW' ? 200 : result.decision === 'WARN' ? 409 : 422
    return res.status(status).json(result.decision === 'ALLOW'
      ? { success: true, moderation: publicCommentModerationResult(result) }
      : {
          success: false,
          code: result.decision === 'WARN'
            ? 'COMMENT_MODERATION_WARNING'
            : result.decision === 'BLOCK'
              ? 'COMMENT_MODERATION_BLOCKED'
              : 'COMMENT_MODERATION_REVIEW',
          moderation: publicCommentModerationResult(result),
          error: result.message,
        })
  } catch (err: any) {
    if (err instanceof CommentRateLimitError) {
      res.setHeader('Retry-After', String(err.retryAfter))
      return res.status(429).json({ success: false, code: 'COMMENT_SPAM', retryAfter: err.retryAfter, error: err.message })
    }
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}

postsRouter.post('/:id/comments/moderate', requireAuth, async (req, res) => {
  return handleCommentModerationPreflight(req, res, req.params.id)
})

commentModerationRouter.post('/moderate', requireAuth, async (req, res) => {
  const rawPostId = req.body?.post_id ?? req.body?.postId
  if (rawPostId !== undefined && typeof rawPostId !== 'string') {
    return res.status(400).json({ success: false, error: 'Post ID must be a string.' })
  }
  const postId = typeof rawPostId === 'string' ? rawPostId.trim() : ''
  if (rawPostId !== undefined && !postId) {
    return res.status(400).json({ success: false, error: 'Post ID cannot be empty.' })
  }
  return handleCommentModerationPreflight(req, res, postId || undefined)
})

postsRouter.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessPost(req.params.id, req.user!.userId))) return res.status(404).json({ success: false, error: 'Post not found.' })
    if (!(await canSubmitComment(req, res))) return
    const { content } = req.body
    const parent_id = typeof (req.body?.parentId ?? req.body?.parent_id) === 'string'
      ? String(req.body.parentId ?? req.body.parent_id).trim()
      : null
    const rawContent = typeof content === 'string' ? content.trim() : ''
    const normalizedGiphy = normalizeGiphyMessageReference(rawContent)
    const commentContent = normalizedGiphy || rawContent
    if (!commentContent) return res.status(400).json({ success: false, error: 'Comment cannot be empty.' })
    if (commentContent.length > 2000) return res.status(400).json({ success: false, error: 'Comment too long.' })
    if (parent_id) {
      const parent = await db.one<any>(
        `SELECT c.id FROM comments c
         WHERE c.id = $1 AND c.post_id = $2 AND c.parent_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM content_moderation cm
             WHERE cm.content_type = 'comment' AND cm.content_id = c.id
               AND (cm.is_hidden = 1 OR cm.status IN ('hidden', 'deleted'))
           )`,
        [parent_id, req.params.id],
      )
      if (!parent) return res.status(400).json({ success: false, error: 'Parent comment not found.' })
    }
    if (!(await moderateCommentSubmission(req, res, {
      postId: req.params.id,
      parentId: parent_id || null,
      operation: 'create',
      text: commentContent,
      stage: 'commit',
    }))) return
    const publication = await publishModeratedComment({
      userId: req.user!.userId,
      postId: req.params.id,
      parentId: parent_id,
      content: commentContent,
      approvedOverrideId: req.approvedCommentOverrideId,
    })
    if (publication.error === 'COMMENT_SPAM') {
      res.setHeader('Retry-After', '60')
      return res.status(429).json({
        success: false,
        code: 'COMMENT_SPAM',
        retryAfter: 60,
        error: 'This comment was already posted recently.',
      })
    }
    if (publication.error === 'COMMENT_ACCOUNT_RESTRICTED') {
      return res.status(403).json({ success: false, code: 'COMMENT_ACCOUNT_RESTRICTED', error: 'Your account cannot comment while this restriction is active.' })
    }
    if (publication.error === 'COMMENT_APPROVAL_EXPIRED') {
      return res.status(409).json({ success: false, code: 'COMMENT_MODERATION_REVIEW', error: 'The moderator approval expired. Please submit the comment again for a fresh review.' })
    }
    if (publication.error || !publication.commentId) {
      return res.status(404).json({ success: false, error: 'Post not found.' })
    }
    const commentId = publication.commentId
    const post = await db.one<any>('SELECT user_id, type FROM posts WHERE id = $1', [req.params.id])
    if (post?.user_id && post.user_id !== req.user!.userId) {
      const notificationId = uuidv4()
      const entityType = post.type === 'glimpse' ? 'glimpse' : post.type === 'reel' ? 'clip' : 'post'
      const notificationContent = `commented on your ${entityType === 'glimpse' ? 'Glimpse' : entityType === 'clip' ? 'Clip' : 'post'}`
      await db.run("INSERT INTO notifications (id,user_id,type,actor_id,entity_id,entity_type,content) VALUES ($1,$2,'comment',$3,$4,$5,$6)",
        [notificationId, post.user_id, req.user!.userId, req.params.id, entityType, notificationContent])
      const actor = await db.one<any>('SELECT username, full_name, avatar_url FROM users WHERE id = $1', [req.user!.userId])
      emitUserNotification(post.user_id, {
        id: notificationId, user_id: post.user_id, actor_id: req.user!.userId,
        actor_name: actor?.full_name || actor?.username || 'Someone',
        actor_username: actor?.username || null, actor_avatar: actor?.avatar_url || null,
        type: 'comment', entity_type: entityType, entity_id: req.params.id,
        content: notificationContent, is_read: 0, created_at: new Date().toISOString(),
      })
    }
    const comment = await db.one(`SELECT c.*, u.username, u.full_name, u.avatar_url, u.is_college_verified, false AS is_liked FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = $1`, [commentId])
    res.status(201).json({ success: true, data: comment })
  } catch (err: any) {
    if (err instanceof CommentRateLimitError) {
      res.setHeader('Retry-After', String(err.retryAfter))
      return res.status(429).json({ success: false, code: 'COMMENT_SPAM', retryAfter: err.retryAfter, error: err.message })
    }
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Like / Unlike comment ────────────────────────────────────────────────────
postsRouter.post('/comments/:commentId/like', requireAuth, async (req, res) => {
  try {
    const comment = await db.one<any>(`
      SELECT c.id, c.post_id
      FROM comments c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
      WHERE c.id = $1
        AND NOT EXISTS (
          SELECT 1 FROM content_moderation cm
          WHERE cm.content_type = 'comment' AND cm.content_id = c.id
            AND (cm.is_hidden = 1 OR cm.status IN ('hidden', 'deleted'))
        )
        AND COALESCE(usc.comment_visibility, COALESCE(u.is_shadowbanned, 0)) = 0
    `, [req.params.commentId])
    if (!comment || !(await canAccessPost(comment.post_id, req.user!.userId))) {
      return res.status(404).json({ success: false, error: 'Comment not found.' })
    }
    const inserted = await db.run(
      'INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [comment.id, req.user!.userId],
    )
    const updated = inserted.rowCount > 0
      ? await db.one<any>('UPDATE comments SET likes_count = likes_count + 1 WHERE id = $1 RETURNING likes_count', [comment.id])
      : await db.one<any>('SELECT likes_count FROM comments WHERE id = $1', [comment.id])
    res.json({ success: true, data: { likes_count: Number(updated?.likes_count || 0), is_liked: true } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

postsRouter.delete('/comments/:commentId/like', requireAuth, async (req, res) => {
  try {
    const comment = await db.one<any>(`
      SELECT c.id, c.post_id
      FROM comments c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
      WHERE c.id = $1
        AND NOT EXISTS (
          SELECT 1 FROM content_moderation cm
          WHERE cm.content_type = 'comment' AND cm.content_id = c.id
            AND (cm.is_hidden = 1 OR cm.status IN ('hidden', 'deleted'))
        )
        AND COALESCE(usc.comment_visibility, COALESCE(u.is_shadowbanned, 0)) = 0
    `, [req.params.commentId])
    if (!comment || !(await canAccessPost(comment.post_id, req.user!.userId))) {
      return res.status(404).json({ success: false, error: 'Comment not found.' })
    }
    const deleted = await db.run('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [comment.id, req.user!.userId])
    const updated = deleted.rowCount > 0
      ? await db.one<any>('UPDATE comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1 RETURNING likes_count', [comment.id])
      : await db.one<any>('SELECT likes_count FROM comments WHERE id = $1', [comment.id])
    res.json({ success: true, data: { likes_count: Number(updated?.likes_count || 0), is_liked: false } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

postsRouter.patch('/comments/:commentId', requireAuth, async (req, res) => {
  try {
    if (!(await canSubmitComment(req, res))) return
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    const normalizedGiphy = normalizeGiphyMessageReference(content)
    const commentContent = normalizedGiphy || content
    if (!commentContent) return res.status(400).json({ success: false, error: 'Comment cannot be empty.' })
    if (commentContent.length > 2000) return res.status(400).json({ success: false, error: 'Comment too long.' })

    const comment = await db.one<any>('SELECT * FROM comments WHERE id = $1', [req.params.commentId])
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found.' })
    if (!(await canAccessPost(comment.post_id, req.user!.userId))) return res.status(404).json({ success: false, error: 'Comment not found.' })
    if (comment.user_id !== req.user!.userId && !req.user!.isAdmin) {
      return res.status(403).json({ success: false, error: 'Not authorized.' })
    }
    if (!(await moderateCommentSubmission(req, res, {
      postId: comment.post_id,
      parentId: comment.parent_id,
      commentId: comment.id,
      operation: 'edit',
      text: commentContent,
      stage: 'commit',
    }))) return

    const publication = await publishModeratedComment({
      userId: req.user!.userId,
      postId: comment.post_id,
      parentId: comment.parent_id,
      commentId: comment.id,
      content: commentContent,
      approvedOverrideId: req.approvedCommentOverrideId,
    })
    if (publication.error === 'COMMENT_SPAM') {
      res.setHeader('Retry-After', '60')
      return res.status(429).json({
        success: false,
        code: 'COMMENT_SPAM',
        retryAfter: 60,
        error: 'This comment was already posted recently.',
      })
    }
    if (publication.error === 'COMMENT_ACCOUNT_RESTRICTED') {
      return res.status(403).json({ success: false, code: 'COMMENT_ACCOUNT_RESTRICTED', error: 'Your account cannot comment while this restriction is active.' })
    }
    if (publication.error === 'COMMENT_APPROVAL_EXPIRED') {
      return res.status(409).json({ success: false, code: 'COMMENT_MODERATION_REVIEW', error: 'The moderator approval expired. Please submit the comment again for a fresh review.' })
    }
    if (publication.error || !publication.commentId) {
      return res.status(404).json({ success: false, error: 'Comment not found.' })
    }
    const enriched = await db.one<any>(`
      SELECT c.*, u.username, u.full_name, u.avatar_url, u.is_college_verified
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = $1
    `, [publication.commentId])
    res.json({ success: true, data: enriched })
  } catch (err: any) {
    if (err instanceof CommentRateLimitError) {
      res.setHeader('Retry-After', String(err.retryAfter))
      return res.status(429).json({ success: false, code: 'COMMENT_SPAM', retryAfter: err.retryAfter, error: err.message })
    }
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

postsRouter.delete('/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const comment = await db.one<any>('SELECT * FROM comments WHERE id = $1', [req.params.commentId])
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found.' })
    if (!(await canAccessPost(comment.post_id, req.user!.userId))) return res.status(404).json({ success: false, error: 'Comment not found.' })
    if (comment.user_id !== req.user!.userId && !req.user!.isAdmin) return res.status(403).json({ success: false, error: 'Not authorized.' })
    await db.run('DELETE FROM comments WHERE id = $1', [req.params.commentId])
    if (!comment.parent_id) await db.run('UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1', [comment.post_id])
    res.json({ success: true, message: 'Comment deleted.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Report ───────────────────────────────────────────────────────────────────
postsRouter.post('/:id/report', requireAuth, async (req, res) => {
  try {
    if (!(await canAccessPost(req.params.id, req.user!.userId))) return res.status(404).json({ success: false, error: 'Post not found.' })
    const { reason, description } = req.body
    if (!reason) return res.status(400).json({ success: false, error: 'Reason required.' })
    await withTransaction((tx) => createReportWithCase(tx, {
      reporterId: req.user!.userId,
      entityId: req.params.id,
      entityType: 'post',
      reason,
      description,
    }))
    res.json({ success: true, message: 'Report submitted. Thank you for keeping Campnect safe.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Poll vote ────────────────────────────────────────────────────────────────
postsRouter.post('/:id/poll-vote', requireAuth, async (req, res) => {
  try {
    const { optionIndex } = req.body
    const post = await db.one<any>('SELECT poll_votes, poll_options FROM posts WHERE id = $1', [req.params.id])
    if (!post?.poll_options) return res.status(400).json({ success: false, error: 'Not a poll.' })
    const votes   = parseJson(post.poll_votes, {})
    const prevVote = votes[req.user!.userId]
    if (prevVote === optionIndex) { delete votes[req.user!.userId] } else { votes[req.user!.userId] = optionIndex }
    await db.run('UPDATE posts SET poll_votes = $1 WHERE id = $2', [JSON.stringify(votes), req.params.id])
    const options = parseJson(post.poll_options, [])
    const results = options.map((_: string, i: number) => Object.values(votes).filter(v => v === i).length)
    res.json({ success: true, data: { votes, results, total: Object.keys(votes).length } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})
