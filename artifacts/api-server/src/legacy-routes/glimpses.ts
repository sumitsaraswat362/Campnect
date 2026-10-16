// @ts-nocheck
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { createReportWithCase } from '../legacy-services/reporting.js'
import { requireAuth } from '../legacy-middleware/auth.js'
import { query, queryAll, queryOne, withTransaction } from '../legacy-db/index.js'
import { uploadPost, assertMediaMagic, sendMediaPolicyError } from '../legacy-middleware/upload.js'
import { signedMediaUrl, storeMediaAssets } from '../legacy-services/media.js'
import { classifyPost } from '../legacy-services/classifier.js'
import { extractVideoCover, processGlimpseVideo } from '../legacy-services/videoProcessing.js'
import { enrichPost } from './posts.js'
import { recordInteraction } from '../legacy-services/recommender.js'
import { canAccessGlimpse, loadAccessibleGlimpse } from '../legacy-services/glimpseAccess.js'
import { emitGlimpseRefresh } from '../legacy-services/glimpseRealtime.js'
import { VIDEO_MAX_DURATION_SECONDS, MediaPolicyError } from '../legacy-services/mediaLimits.js'

export const glimpsesRouter = Router()

const DAILY_LIMIT = 10
const MAX_CAPTION_LENGTH = 140
const MAX_VIDEO_SECONDS = VIDEO_MAX_DURATION_SECONDS

function parseJson<T>(value: unknown, fallback: T): T {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value as T
  try { return value ? JSON.parse(String(value)) as T : fallback } catch { return fallback }
}

function safeTags(caption: string): string[] {
  return [...caption.matchAll(/#([\p{L}\p{N}_]{1,40})/gu)]
    .map(match => match[1].toLowerCase())
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 12)
}

function httpError(message: string, status: number, code?: string) {
  const error: any = new Error(message)
  error.status = status
  if (code) error.code = code
  return error
}

function isTruthy(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

async function quotaFor(userId: string) {
  const row = await queryOne<{ published_count: number }>(
    `SELECT published_count FROM glimpse_daily_limits
     WHERE user_id = $1 AND day_key = CURRENT_DATE`,
    [userId],
  )
  const fallback = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM posts
     WHERE user_id = $1 AND type = 'glimpse' AND created_at >= CURRENT_DATE`,
    [userId],
  )
  const used = Math.max(Number(row?.published_count ?? 0), Number(fallback?.count ?? 0))
  return { used, remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT }
}

async function hydrateGlimpse(row: any, viewerId: string) {
  const post = await enrichPost(row, viewerId)
  return {
    ...post,
    media: Array.isArray(post.media)
      ? post.media.map((value: string) => signedMediaUrl(value, viewerId) || value)
      : [],
    cover_url: signedMediaUrl(post.cover_url, viewerId),
    type: 'glimpse',
    event: row.event_id
      ? {
          id: row.event_id,
          title: row.event_title || '',
          cover_url: row.event_cover_url || null,
          starts_at: row.event_starts_at || null,
          status: row.event_status || null,
        }
      : null,
    moderation_status: row.moderation_status || 'approved',
    discovery_restricted: isTruthy(row.discovery_restricted),
    views_count: Number(row.views_count ?? 0),
    shares_count: Number(row.shares_count ?? 0),
    is_viewed: Boolean(row.is_viewed),
    is_liked: Boolean(post.is_liked),
    is_saved: Boolean(post.is_saved),
  }
}

async function loadFeedRows(viewerId: string, options: { page: number; limit: number; mode: 'feed' | 'my'; q?: string; eventId?: string; creatorId?: string }) {
  const params: any[] = [viewerId]
  const where: string[] = [`p.created_at > NOW() - INTERVAL '24 hours'`]

  if (options.mode === 'my') {
    where.push('p.user_id = $1')
  } else {
    if (options.creatorId) {
      params.push(options.creatorId)
      where.push(`p.user_id = $${params.length}`)
    } else {
      where.push('p.user_id <> $1')
    }
    where.push(`
      p.visibility = 'public'
      AND (
        COALESCE(u.is_private, 0) = 0
        OR EXISTS (
          SELECT 1 FROM follows f
          WHERE f.follower_id = $1 AND f.following_id = p.user_id AND f.status = 'active'
        )
      )
      AND (
        (LOWER(viewer.username) = 'ceo' AND u.college_id IS NOT NULL)
        OR (viewer.college_id IS NOT NULL AND u.college_id = viewer.college_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id = $1 AND b.blocked_id = p.user_id)
           OR (b.blocker_id = p.user_id AND b.blocked_id = $1)
      )
    `)
  }

  if (options.mode !== 'my') {
    where.push(`p.moderation_status = 'approved'`)
    where.push(`COALESCE(p.discovery_restricted, 0) = 0`)
    where.push(`NOT (COALESCE(pc.is_political, 0) = 1 AND COALESCE(pc.is_campus_pol, 0) = 0)`)
    where.push(`COALESCE(u.is_shadowbanned, 0) = 0`)
  }

  if (options.q?.trim()) {
    params.push(`%${options.q.trim().toLowerCase()}%`)
    const qIndex = params.length
    where.push(`(
      LOWER(COALESCE(p.content, '')) LIKE $${qIndex}
      OR LOWER(COALESCE(e.title, '')) LIKE $${qIndex}
      OR LOWER(COALESCE(u.username, '')) LIKE $${qIndex}
      OR LOWER(COALESCE(u.full_name, '')) LIKE $${qIndex}
    )`)
  }
  if (options.eventId) {
    params.push(options.eventId)
    where.push(`p.event_id = $${params.length}`)
  }

  const poolLimit = Math.min(100, Math.max(options.limit, 1))
  const offset = Math.max(0, (options.page - 1) * options.limit)
  params.push(poolLimit, offset)
  const limitIndex = params.length - 1
  const offsetIndex = params.length

  const rows = await queryAll<any>(`
    SELECT
      p.*,
      u.username, u.full_name, u.avatar_url, u.college_id AS creator_college_id,
      u.is_college_verified, u.is_private,
       viewer.college_id AS viewer_college_id, viewer.username AS viewer_username,
      c.name AS college_name,
      e.title AS event_title, e.cover_url AS event_cover_url,
      e.starts_at AS event_starts_at, e.status AS event_status,
      COALESCE(pc.categories, '[]') AS categories,
      COALESCE(pc.is_political, 0) AS is_political,
      COALESCE(pc.is_campus_pol, 0) AS is_campus_pol,
      COALESCE(pc.quality_score, 0.5) AS quality_score,
      EXISTS (
        SELECT 1
        FROM content_interactions ci_view
        WHERE ci_view.user_id = $1
          AND ci_view.post_id = p.id
          AND ci_view.interaction_type IN ('view', 'rewatch')
      ) AS is_viewed,
      COALESCE((
        SELECT COUNT(*) FROM reports r
        WHERE r.entity_id = p.id AND r.entity_type IN ('glimpse', 'post')
          AND r.status IN ('pending', 'reviewing')
      ), 0) AS report_count,
      (
        GREATEST(0, 72 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) * 1.7
        + LN(1 + COALESCE(p.likes_count, 0)) * 2.8
        + LN(1 + COALESCE(p.comments_count, 0)) * 2.2
        + LN(1 + COALESCE(p.saves_count, 0)) * 1.5
        + COALESCE(pc.quality_score, 0.5) * 5
        - COALESCE((
          SELECT COUNT(*) FROM reports r2
          WHERE r2.entity_id = p.id AND r2.entity_type IN ('glimpse', 'post')
            AND r2.status IN ('pending', 'reviewing')
        ), 0) * 4
      ) AS glimpse_score
    FROM posts p
    JOIN users u ON u.id = p.user_id
    JOIN users viewer ON viewer.id = $1
    LEFT JOIN colleges c ON c.id = u.college_id
    LEFT JOIN events e ON e.id = p.event_id
    LEFT JOIN post_classifications pc ON pc.post_id = p.id
    WHERE p.type = 'glimpse'
      AND (${where.join(' AND ')})
    ORDER BY glimpse_score DESC, p.created_at DESC, p.id DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `, params)

  return rows
}

// GET /api/glimpses/quota
glimpsesRouter.get('/quota', requireAuth, async (req: any, res, next) => {
  try {
    const quota = await quotaFor(req.user.userId)
    res.json({ success: true, data: quota })
  } catch (error) {
    next(error)
  }
})

// GET /api/glimpses?mode=feed|my&page=1&limit=8&q=...
glimpsesRouter.get('/', requireAuth, async (req: any, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24))
    const mode = req.query.mode === 'my' ? 'my' : 'feed'
    const rows = await loadFeedRows(req.user.userId, {
      page,
      limit,
      mode,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      eventId: typeof req.query.event_id === 'string' ? req.query.event_id : undefined,
      creatorId: typeof req.query.creator_id === 'string' ? req.query.creator_id : undefined,
    })
    const chosen = rows.slice(0, limit)
    const data = await Promise.all(chosen.map(row => hydrateGlimpse(row, req.user.userId)))
    res.json({
      success: true,
      data,
      meta: { page, limit, hasMore: rows.length >= limit },
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/glimpses/:id
glimpsesRouter.get('/:id', requireAuth, async (req: any, res, next) => {
  try {
    const row = await queryOne<any>(`
      SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_id AS creator_college_id,
        u.is_college_verified, u.is_private,
         viewer.college_id AS viewer_college_id, viewer.username AS viewer_username, c.name AS college_name,
        e.title AS event_title, e.cover_url AS event_cover_url,
        e.starts_at AS event_starts_at, e.status AS event_status,
        EXISTS (
          SELECT 1
          FROM content_interactions ci_view
          WHERE ci_view.user_id = $2
            AND ci_view.post_id = p.id
            AND ci_view.interaction_type IN ('view', 'rewatch')
        ) AS is_viewed
      FROM posts p
      JOIN users u ON u.id = p.user_id
      JOIN users viewer ON viewer.id = $2
      LEFT JOIN colleges c ON c.id = u.college_id
      LEFT JOIN events e ON e.id = p.event_id
      WHERE p.id = $1
        AND p.type = 'glimpse'
        AND p.created_at > NOW() - INTERVAL '24 hours'
    `, [req.params.id, req.user.userId])
    if (!row || !(await canAccessGlimpse(req.user.userId, row))) {
      return res.status(404).json({ success: false, error: 'Glimpse not found.' })
    }
    await query(`UPDATE posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1`, [req.params.id])
    void recordInteraction(req.user.userId, req.params.id, 'view', 0, 0)
    res.json({ success: true, data: await hydrateGlimpse(row, req.user.userId) })
  } catch (error) {
    next(error)
  }
})

// POST /api/glimpses
glimpsesRouter.post('/', requireAuth, uploadPost.array('media', 1), async (req: any, res, next) => {
  try {
    const file = Array.isArray(req.files) ? req.files[0] : null
    if (!file) throw httpError('Choose one image or video to share.', 400, 'MEDIA_REQUIRED')
    const detected = await assertMediaMagic(file)

    const isImage = detected.startsWith('image/')
    const isVideo = detected.startsWith('video/')
    if (!isImage && !isVideo) throw httpError('Glimpses support one image or one video.', 400, 'MEDIA_TYPE')

    const caption = String(req.body.caption || '').trim().slice(0, MAX_CAPTION_LENGTH)
    const eventId = String(req.body.event_id || '').trim() || null
    const classification = classifyPost(
      caption,
      safeTags(caption),
      isVideo ? 'video' : 'photo',
    )
    if (classification.safety_flag === 'high') {
      throw httpError('This media cannot be published because it did not pass safety checks.', 422, 'MODERATION_REJECTED')
    }

    if (eventId) {
      const event = await queryOne<any>(
        `SELECT id FROM events
         WHERE id = $1 AND (college_id = (SELECT college_id FROM users WHERE id = $2) OR organizer_id = $2)
           AND status NOT IN ('cancelled', 'ended')`,
        [eventId, req.user.userId],
      )
      if (!event) throw httpError('Choose an event from your campus that is still active.', 400, 'EVENT_NOT_AVAILABLE')
    }

    const quota = await quotaFor(req.user.userId)
    if (quota.remaining <= 0) {
      return res.status(429).json({
        success: false,
        code: 'GLIMPSE_DAILY_LIMIT',
        error: 'You have reached today’s Glimpse limit.',
        data: quota,
      })
    }

    let mediaBuffer = file.buffer
    let mediaMime = file.mimetype
    let duration: number | null = null
    let coverBuffer: Buffer | null = null

    if (isVideo) {
      const processed = await processGlimpseVideo(file.buffer, {
        start: 0,
        end: MAX_VIDEO_SECONDS,
        maxDuration: MAX_VIDEO_SECONDS,
        speed: 1,
        filter: 'none',
      })
      mediaBuffer = processed.buffer
      // processGlimpseVideo retains untouched capture bytes. Preserve the
      // source MIME in that common case rather than labelling WebM as MP4.
      mediaMime = processed.buffer === file.buffer ? file.mimetype : 'video/mp4'
      duration = processed.duration
      try {
        coverBuffer = await extractVideoCover(processed.buffer, Math.min(1, Math.max(0, duration / 3)), 'none')
      } catch {
        throw new MediaPolicyError('OPTIMIZATION_FAILED', 'The video could not be optimized. Please try another video.')
      }
    }

    const moderationStatus = classification.safety_flag === 'medium' || classification.is_spam || classification.is_engagement_bait
      ? 'pending'
      : 'approved'
    const postId = uuidv4()
    const tags = safeTags(caption)
    const post = await withTransaction(async (tx) => {
      const reserved = await tx.one<any>(`
        INSERT INTO glimpse_daily_limits (user_id, day_key, published_count, updated_at)
        VALUES ($1, CURRENT_DATE, 1, NOW())
        ON CONFLICT (user_id, day_key)
        DO UPDATE SET published_count = glimpse_daily_limits.published_count + 1, updated_at = NOW()
        WHERE glimpse_daily_limits.published_count < $2
        RETURNING published_count
      `, [req.user.userId, DAILY_LIMIT])
      if (!reserved) throw httpError('You have reached today’s Glimpse limit.', 429, 'GLIMPSE_DAILY_LIMIT')

      const mediaFile = {
        ...file,
        buffer: mediaBuffer,
        mimetype: mediaMime,
        originalname: isVideo ? 'glimpse.mp4' : (file.originalname || 'glimpse-image'),
        size: mediaBuffer.length,
      } as Express.Multer.File
      const mediaUrls = await storeMediaAssets(tx, [mediaFile], req.user.userId, 'glimpse', postId)
      const mediaUrl = mediaUrls[0]
      if (!mediaUrl) throw httpError('The upload could not be stored.', 500, 'MEDIA_STORAGE')

      let coverUrl: string | null = null
      if (coverBuffer) {
        const coverFile = {
          ...file,
          buffer: coverBuffer,
          mimetype: 'image/jpeg',
          originalname: 'glimpse-cover.jpg',
          size: coverBuffer.length,
        } as Express.Multer.File
        const covers = await storeMediaAssets(tx, [coverFile], req.user.userId, 'glimpse-cover', postId)
        coverUrl = covers[0] || null
      }

      await tx.run(`
        INSERT INTO posts (
          id, user_id, type, content, media, cover_url, duration, tags, visibility,
          event_id, moderation_status, discovery_restricted, created_at
        ) VALUES ($1, $2, 'glimpse', $3, $4, $5, $6, $7, 'public', $8, $9, 0, NOW())
      `, [
        postId,
        req.user.userId,
        caption,
        JSON.stringify([mediaUrl]),
        coverUrl,
        duration,
        JSON.stringify(tags),
        eventId,
        moderationStatus,
      ])
      await tx.run(`
        INSERT INTO post_classifications (
          post_id, categories, is_political, is_campus_pol, safety_flag, safety_score, quality_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (post_id) DO UPDATE SET
          categories = EXCLUDED.categories, is_political = EXCLUDED.is_political,
          is_campus_pol = EXCLUDED.is_campus_pol, safety_flag = EXCLUDED.safety_flag,
          safety_score = EXCLUDED.safety_score, quality_score = EXCLUDED.quality_score,
          classified_at = NOW()
      `, [
        postId,
        JSON.stringify(classification.categories || []),
        classification.is_political ? 1 : 0,
        classification.is_campus_pol ? 1 : 0,
        classification.safety_flag,
        classification.safety_score,
        classification.quality_score,
      ])
      return await tx.one<any>('SELECT * FROM posts WHERE id = $1', [postId])
    })

    const enriched = await queryOne<any>(`
      SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_id AS creator_college_id,
        u.is_college_verified, u.is_private, u.college_id AS viewer_college_id,
        c.name AS college_name, e.title AS event_title, e.cover_url AS event_cover_url,
        e.starts_at AS event_starts_at, e.status AS event_status
      FROM posts p JOIN users u ON u.id = p.user_id
      LEFT JOIN colleges c ON c.id = u.college_id
      LEFT JOIN events e ON e.id = p.event_id
      WHERE p.id = $1
    `, [post.id])
    const quotaAfter = await quotaFor(req.user.userId)
    if (moderationStatus === 'approved') {
      void emitGlimpseRefresh(req.user.userId).catch(() => console.warn('glimpse refresh dispatch failed'))
    }
    res.status(moderationStatus === 'pending' ? 202 : 201).json({
      success: true,
      data: await hydrateGlimpse(enriched, req.user.userId),
      meta: { quota: quotaAfter, processing: false },
      message: moderationStatus === 'pending'
        ? 'Your Glimpse is processing moderation before it can appear on campus.'
        : 'Glimpse published.',
    })
  } catch (error: any) {
    if (sendMediaPolicyError(res, error)) return
    if ([
      'MEDIA_REQUIRED',
      'MEDIA_TYPE',
      'MODERATION_REJECTED',
      'EVENT_NOT_AVAILABLE',
      'GLIMPSE_DAILY_LIMIT',
      'MEDIA_STORAGE',
    ].includes(error?.code)) {
      return res.status(Number(error.status) || 400).json({
        success: false,
        error: error.message || 'This media could not be uploaded.',
        code: error.code,
      })
    }
    console.error('[glimpses] media upload failed:', error?.message || error)
    const status = error?.status === 503 ? 503 : 422
    return res.status(status).json({
      success: false,
      error: status === 503
        ? 'Video processing is temporarily unavailable. Please retry.'
        : 'Video processing failed. Please try another video.',
    })
  }
})

glimpsesRouter.post('/:id/view', requireAuth, async (req: any, res, next) => {
  try {
    const row = await loadAccessibleGlimpse(req.params.id, req.user.userId)
    if (!row) {
      return res.status(404).json({ success: false, error: 'Glimpse not found.' })
    }
    const view = await query(
      `INSERT INTO glimpse_view_events (post_id, viewer_id)
       SELECT $1, $2
       WHERE EXISTS (SELECT 1 FROM posts WHERE id = $1 AND user_id <> $2)
       ON CONFLICT (post_id, viewer_id) DO UPDATE SET viewed_at = NOW()`,
      [req.params.id, req.user.userId],
    )
    if (view.rowCount && row.user_id !== req.user.userId) {
      await query(`UPDATE posts SET views_count = (SELECT COUNT(*)::int FROM glimpse_view_events WHERE post_id = $1) WHERE id = $1`, [req.params.id])
    }
    await recordInteraction(req.user.userId, req.params.id, 'view', Number(req.body?.watch_pct || 0), Number(req.body?.watch_seconds || 0))
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

glimpsesRouter.get('/:id/insights', requireAuth, async (req: any, res, next) => {
  try {
    const glimpse = await queryOne<{ id: string }>(
      `SELECT id FROM posts WHERE id = $1 AND type = 'glimpse' AND user_id = $2`,
      [req.params.id, req.user.userId],
    )
    if (!glimpse) return res.status(403).json({ success: false, error: 'Only the creator can view Glimpse activity.' })

    const [viewers, likes] = await Promise.all([
      queryAll(`
        SELECT u.id, u.username, u.full_name, u.avatar_url, gve.viewed_at
        FROM glimpse_view_events gve
        JOIN users u ON u.id = gve.viewer_id
        WHERE gve.post_id = $1
        ORDER BY gve.viewed_at DESC
        LIMIT 100
      `, [glimpse.id]),
      queryAll(`
        SELECT u.id, u.username, u.full_name, u.avatar_url, pl.created_at AS liked_at
        FROM post_likes pl
        JOIN users u ON u.id = pl.user_id
        WHERE pl.post_id = $1
        ORDER BY pl.created_at DESC
        LIMIT 100
      `, [glimpse.id]),
    ])
    res.json({ success: true, data: { viewers, likes } })
  } catch (error) {
    next(error)
  }
})

glimpsesRouter.delete('/:id', requireAuth, async (req: any, res, next) => {
  try {
    const row = await queryOne<any>(
      `SELECT id, user_id, moderation_status, discovery_restricted
       FROM posts WHERE id = $1 AND type = 'glimpse'`,
      [req.params.id],
    )
    if (!row) return res.status(404).json({ success: false, error: 'Glimpse not found.' })
    if (row.user_id !== req.user.userId) return res.status(403).json({ success: false, error: 'Only the creator can delete this Glimpse.' })
    const deleted = await queryOne<any>(`
      UPDATE posts
      SET moderation_status = 'removed', discovery_restricted = 1, updated_at = NOW()
      WHERE id = $1 AND type = 'glimpse'
      RETURNING id, moderation_status, discovery_restricted, updated_at
    `, [req.params.id])
    void emitGlimpseRefresh(row.user_id).catch(() => console.warn('glimpse refresh dispatch failed'))
    res.json({ success: true, data: deleted })
  } catch (error) {
    next(error)
  }
})

glimpsesRouter.post('/:id/share', requireAuth, async (req: any, res, next) => {
  try {
    const row = await loadAccessibleGlimpse(req.params.id, req.user.userId)
    if (!row) {
      return res.status(404).json({ success: false, error: 'Glimpse not found.' })
    }
    await query(`UPDATE posts SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = $1`, [req.params.id])
    void recordInteraction(req.user.userId, req.params.id, 'share')
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

glimpsesRouter.post('/:id/report', requireAuth, async (req: any, res, next) => {
  try {
    const row = await loadAccessibleGlimpse(req.params.id, req.user.userId)
    if (!row) {
      return res.status(404).json({ success: false, error: 'Glimpse not found.' })
    }
    const reason = String(req.body?.reason || 'other').trim().slice(0, 120)
    await withTransaction((tx) => createReportWithCase(tx, {
      reporterId: req.user.userId,
      entityId: row.id,
      entityType: 'glimpse',
      reason,
      description: req.body?.description,
    }))
    void recordInteraction(req.user.userId, req.params.id, 'report')
    res.status(201).json({ success: true, message: 'Thanks — the Glimpse was sent for review.' })
  } catch (error) {
    next(error)
  }
})
