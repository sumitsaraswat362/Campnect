// @ts-nocheck
import { Router, raw } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { db, withTransaction } from '../legacy-db/index.js'
import { requireAuth } from '../legacy-middleware/auth.js'
import { uploadPost, assertMediaMagic, sendMediaPolicyError } from '../legacy-middleware/upload.js'
import {
  VIDEO_MAX_UPLOAD_BYTES,
  VIDEO_MAX_DURATION_SECONDS,
  MediaPolicyError,
} from '../legacy-services/mediaLimits.js'
import { deleteStoredMediaAssets, signedMediaUrl, storeMediaAsset } from '../legacy-services/media.js'
import { processGlimpseVideo, extractVideoCover } from '../legacy-services/videoProcessing.js'
import { enforceUserRestriction } from '../legacy-services/userRestrictions.js'
import { classifyNewPost } from '../legacy-services/recommender.js'
import { classifyPost } from '../legacy-services/classifier.js'
import { createReportWithCase } from '../legacy-services/reporting.js'
import { enrichPost, POST_ACCESS_SQL } from './posts.js'

export const clipsRouter = Router()

const createSchema = z.object({
  caption: z.string().max(5000).default(''),
  visibility: z.enum(['public', 'friends', 'college']).default('public'),
  idempotency_key: z.string().trim().min(1).max(128).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
})
const MAX_CLIP_BYTES = VIDEO_MAX_UPLOAD_BYTES
const CLIP_CHUNK_BYTES = 4 * 1024 * 1024
const CLIP_UPLOAD_TTL_MINUTES = 60

const startChunkedUploadSchema = z.object({
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().max(100).optional(),
  total_bytes: z.number().int().positive(),
  data: createSchema,
})

function cursorFor(post: any) {
  return Buffer.from(JSON.stringify({ createdAt: post.created_at, id: post.id })).toString('base64url')
}
function parseCursor(value: unknown) {
  try {
    const p = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'))
    return typeof p?.id === 'string' && typeof p?.createdAt === 'string' && !Number.isNaN(Date.parse(p.createdAt)) ? p : null
  } catch { return null }
}
function parseBody(body: any) {
  if (typeof body?.data === 'string') {
    try { return JSON.parse(body.data) } catch { return null }
  }
  return body
}
async function loadClip(id: string, viewerId: string) {
  return db.one<any>(`SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified
    FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN user_shadowban_controls usc ON usc.user_id=u.id
    WHERE p.id=$2 AND p.type IN ('reel','video') AND ${POST_ACCESS_SQL}`, [viewerId, id])
}
async function enrichClip(post: any, viewerId: string) {
  const enriched = await enrichPost(post, viewerId)
  return {
    ...enriched,
    media: Array.isArray(enriched?.media)
      ? enriched.media.map((value: string) => signedMediaUrl(value, viewerId) || value)
      : [],
    cover_url: signedMediaUrl(enriched?.cover_url, viewerId) || enriched?.cover_url || null,
  }
}
async function incrementView(id: string, viewerId: string) {
  const changed = await db.one<any>(`INSERT INTO clip_view_events (post_id, viewer_id, viewed_at)
    VALUES ($1,$2,NOW()) ON CONFLICT (post_id, viewer_id) DO UPDATE SET viewed_at=NOW()
    WHERE clip_view_events.viewed_at < NOW() - INTERVAL '1 hour' RETURNING post_id`, [id, viewerId])
  if (changed) await db.run('UPDATE posts SET views_count=views_count+1 WHERE id=$1', [id])
  return Boolean(changed)
}

clipsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20))
    const cursor = req.query.cursor ? parseCursor(req.query.cursor) : null
    if (req.query.cursor && !cursor) return res.status(400).json({ success: false, error: 'Invalid Clips cursor.' })
    const params: any[] = [req.user!.userId]
    let after = ''
    if (cursor) { after = 'AND (p.created_at,p.id) < ($2::timestamptz,$3)'; params.push(cursor.createdAt, cursor.id) }
    params.push(limit + 1)
    const rows = await db.all<any>(`SELECT p.*,u.username,u.full_name,u.avatar_url,u.college_name,u.is_college_verified
      FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN user_shadowban_controls usc ON usc.user_id=u.id
      WHERE p.type IN ('reel','video') AND ${POST_ACCESS_SQL} ${after}
      ORDER BY p.created_at DESC,p.id DESC LIMIT $${params.length}`, params)
    const page = rows.slice(0, limit)
    return res.json({ success: true, data: await Promise.all(page.map(p => enrichClip(p, req.user!.userId))), meta: {
      limit, hasMore: rows.length > limit, nextCursor: rows.length > limit && page.length ? cursorFor(page[page.length - 1]) : null,
    } })
  } catch { return res.status(500).json({ success: false, error: 'Unable to load Clips.' }) }
})

clipsRouter.get('/users/:username', requireAuth, async (req, res) => {
  try {
    const rows = await db.all<any>(`SELECT p.*,
      u.username,u.full_name,u.avatar_url,u.college_name,u.is_college_verified
      FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN user_shadowban_controls usc ON usc.user_id=u.id
      WHERE LOWER(u.username)=LOWER($2) AND p.type IN ('reel','video') AND ${POST_ACCESS_SQL}
      ORDER BY p.created_at DESC,p.id DESC`, [req.user!.userId, req.params.username])
    const enriched = await Promise.all(rows.map(p => enrichClip(p, req.user!.userId)))
    return res.json({ success: true, data: enriched.map(p => ({ ...p, thumbnail_url: p.cover_url || null })) })
  } catch { return res.status(500).json({ success: false, error: 'Unable to load Clips.' }) }
})

clipsRouter.get('/:id', requireAuth, async (req, res) => {
  try {
    const clip = await loadClip(req.params.id, req.user!.userId)
    if (!clip) return res.status(404).json({ success: false, error: 'Clip not found.' })
    const counted = await incrementView(clip.id, req.user!.userId)
    const enriched = await enrichClip({
      ...clip,
      views_count: Number(clip.views_count || 0) + (counted ? 1 : 0),
    }, req.user!.userId)
    return res.json({ success: true, data: { ...enriched, processing: false, status: 'ready' } })
  } catch { return res.status(500).json({ success: false, error: 'Unable to load Clip.' }) }
})

async function publishClip(req: any, res: any, fileOverride?: any) {
  let key: string | null = null
  try {
    if (await enforceUserRestriction(req, res, 'posting')) return
    const parsed = createSchema.safeParse(parseBody(req.body))
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors[0].message })
    const file = fileOverride || req.file
    if (!file) return res.status(400).json({ success: false, error: 'A video file is required.' })
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw Object.assign(new Error('Clip upload body was unavailable after parsing.'), {
        status: 503,
        code: 'CLIP_UPLOAD_BODY_UNAVAILABLE',
      })
    }
    if (file.buffer.length > MAX_CLIP_BYTES) {
      throw new MediaPolicyError('VIDEO_TOO_LARGE', 'Video must be 100 MB or smaller.', 413)
    }
    const detected = await assertMediaMagic(file)
    if (!detected.startsWith('video/')) return res.status(400).json({ success: false, error: 'A supported video file is required.' })
    key = parsed.data.idempotency_key || parsed.data.idempotencyKey || null
    if (key) {
      const prior = await db.one<any>('SELECT id FROM posts WHERE user_id=$1 AND idempotency_key=$2 AND type=$3', [req.user!.userId, key, 'reel'])
      if (prior) {
        const existing = await loadClip(prior.id, req.user!.userId)
        return res.status(200).json({ success: true, data: { ...(await enrichClip(existing, req.user!.userId)), processing: false, status: 'ready' } })
      }
    }
    const classification = classifyPost(parsed.data.caption, [], 'reel')
    if (classification.safety_flag === 'high') {
      return res.status(422).json({
        success: false,
        error: 'This Clip cannot be published because it did not pass safety checks.',
      })
    }
    const moderationStatus =
      classification.safety_flag === 'medium' ||
      classification.is_spam ||
      classification.is_engagement_bait
        ? 'pending'
        : 'approved'
    // Clips do not expose trim controls, so validate and publish the complete
    // source duration; the processor rejects uploads longer than the policy.
    const processed = await processGlimpseVideo(file.buffer, {
      start: 0,
      end: VIDEO_MAX_DURATION_SECONDS,
      maxDuration: VIDEO_MAX_DURATION_SECONDS,
      speed: 1,
      filter: 'none',
      // Unlike an ephemeral Glimpse, a Clip is fetched repeatedly from the
      // feed. Always use the delivery-optimized MP4 rather than retaining an
      // oversized camera original.
      preserveOriginal: false,
    })
    let cover: Buffer
    try {
      cover = await extractVideoCover(processed.buffer, Math.min(0.1, Math.max(0, processed.duration - .01)), 'none')
    } catch {
      throw new MediaPolicyError('OPTIMIZATION_FAILED', 'The video could not be optimized. Please try another video.')
    }
    const id = uuidv4()
    await withTransaction(async tx => {
      // Recheck under the unique index so concurrent submissions cannot duplicate.
      if (key) {
        const old = await tx.one<any>('SELECT id FROM posts WHERE user_id=$1 AND idempotency_key=$2 AND type=$3 FOR UPDATE', [req.user!.userId, key, 'reel'])
        if (old) throw Object.assign(new Error('DUPLICATE_CLIP'), { existingId: old.id })
      }
      const user = await tx.one<any>('SELECT college_id FROM users WHERE id=$1', [req.user!.userId])
      const videoUrl = await storeMediaAsset(tx, { ...file, buffer: processed.buffer, size: processed.buffer.length, mimetype: 'video/mp4', originalname: 'clip.mp4', campnectDeliveryOptimized: true } as any, req.user!.userId, 'clip_media', id)
      const coverUrl = await storeMediaAsset(tx, { ...file, buffer: cover, size: cover.length, mimetype: 'image/jpeg', originalname: 'clip-cover.jpg' }, req.user!.userId, 'clip_cover', id)
      await tx.run(`INSERT INTO posts (id,user_id,type,content,media,college_id,visibility,duration,cover_url,idempotency_key,moderation_status)
        VALUES ($1,$2,'reel',$3,$4,$5,$6,$7,$8,$9,$10)`, [id, req.user!.userId, parsed.data.caption, JSON.stringify([videoUrl]), user?.college_id || null, parsed.data.visibility, processed.duration, coverUrl, key, moderationStatus])
      await tx.run(`
        INSERT INTO post_classifications (
          post_id, categories, is_political, is_campus_pol, safety_flag, safety_score, quality_score
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (post_id) DO UPDATE SET
          categories=EXCLUDED.categories,
          is_political=EXCLUDED.is_political,
          is_campus_pol=EXCLUDED.is_campus_pol,
          safety_flag=EXCLUDED.safety_flag,
          safety_score=EXCLUDED.safety_score,
          quality_score=EXCLUDED.quality_score,
          classified_at=NOW()
      `, [
        id,
        JSON.stringify(classification.categories || []),
        classification.is_political ? 1 : 0,
        classification.is_campus_pol ? 1 : 0,
        classification.safety_flag,
        classification.safety_score,
        classification.quality_score,
      ])
      await tx.run('UPDATE users SET posts_count=posts_count+1 WHERE id=$1', [req.user!.userId])
    })
    const clip = await loadClip(id, req.user!.userId)
    classifyNewPost(id, parsed.data.caption, [], 'reel').catch(() => {})
    return res.status(moderationStatus === 'pending' ? 202 : 201).json({
      success: true,
      data: {
        ...(await enrichClip(clip, req.user!.userId)),
        processing: false,
        status: moderationStatus === 'pending' ? 'pending_moderation' : 'ready',
      },
      message: moderationStatus === 'pending'
        ? 'Your Clip is awaiting moderation before it appears to others.'
        : 'Clip published.',
    })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    if (err?.message === 'DUPLICATE_CLIP' || (err?.code === '23505' && key)) {
      const existingId = err.existingId || (await db.one<any>(
        "SELECT id FROM posts WHERE user_id=$1 AND idempotency_key=$2 AND type='reel'",
        [req.user!.userId, key],
      ))?.id
      const clip = existingId ? await loadClip(existingId, req.user!.userId) : null
      if (!clip) return res.status(409).json({ success: false, error: 'A Clip with this idempotency key is being created.' })
      return res.status(200).json({ success: true, data: { ...(await enrichClip(clip, req.user!.userId)), processing: false, status: 'ready' } })
    }
    console.error('[clips] create failed:', {
      code: err?.code || 'CLIP_PROCESSING_FAILED',
      message: err?.message || String(err),
      hasUploadBytes: Boolean(fileOverride?.buffer || req.file?.buffer),
      uploadBytes: fileOverride?.size || req.file?.size || 0,
    })
    const status = err?.status === 400 ? 400 : err?.status === 503 ? 503 : 422
    return res.status(status).json({
      success: false,
      error: status === 400
        ? 'Unsupported or malformed video.'
        : status === 503
          ? err?.code === 'CLIP_UPLOAD_BODY_UNAVAILABLE'
            ? 'The video bytes were not received intact. Please retry.'
            : 'Video processing is temporarily unavailable. Please retry.'
          : 'Video processing failed. Please try another video.',
    })
  }
}

clipsRouter.post('/', requireAuth, uploadPost.single('video'), publishClip)

// The production edge rejects large multipart bodies before they reach Express.
// These endpoints keep each request small while retaining the same final
// signature validation and Clip publishing pipeline.
clipsRouter.post('/uploads', requireAuth, async (req, res) => {
  const parsed = startChunkedUploadSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors[0].message })
  const { file_name, mime_type, total_bytes, data } = parsed.data
  if (total_bytes > MAX_CLIP_BYTES) {
    const error = new MediaPolicyError('VIDEO_TOO_LARGE', 'Video must be 100 MB or smaller.', 413)
    sendMediaPolicyError(res, error)
    return
  }
  if (mime_type && !mime_type.startsWith('video/')) {
    return res.status(400).json({ success: false, error: 'A video file is required.' })
  }
  try {
    await db.run('DELETE FROM clip_upload_sessions WHERE expires_at < NOW()')
    const id = uuidv4()
    const totalChunks = Math.ceil(total_bytes / CLIP_CHUNK_BYTES)
    await db.run(
      `INSERT INTO clip_upload_sessions
        (id, owner_id, file_name, mime_type, total_bytes, chunk_size, total_chunks, create_data, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW() + INTERVAL '${CLIP_UPLOAD_TTL_MINUTES} minutes')`,
      [id, req.user!.userId, file_name, mime_type || 'video/mp4', total_bytes, CLIP_CHUNK_BYTES, totalChunks, JSON.stringify(data)],
    )
    return res.status(201).json({ success: true, data: { id, chunk_size: CLIP_CHUNK_BYTES, total_chunks: totalChunks } })
  } catch (err) {
    console.error('[clips] could not start chunked upload:', err)
    return res.status(503).json({ success: false, error: 'Unable to start this upload. Please retry.' })
  }
})

clipsRouter.put('/uploads/:uploadId/chunks/:chunkIndex', requireAuth, raw({ type: 'application/octet-stream', limit: CLIP_CHUNK_BYTES + 1024 }), async (req, res) => {
  const chunkIndex = Number(req.params.chunkIndex)
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) return res.status(400).json({ success: false, error: 'Invalid upload chunk.' })
  try {
    const session = await db.one<any>(
      `SELECT total_bytes, chunk_size, total_chunks FROM clip_upload_sessions
       WHERE id=$1 AND owner_id=$2 AND expires_at > NOW()`,
      [req.params.uploadId, req.user!.userId],
    )
    if (!session) return res.status(404).json({ success: false, error: 'This upload has expired. Please start again.' })
    if (chunkIndex >= Number(session.total_chunks) || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({ success: false, error: 'Invalid upload chunk.' })
    }
    const expectedBytes = chunkIndex === Number(session.total_chunks) - 1
      ? Number(session.total_bytes) - chunkIndex * Number(session.chunk_size)
      : Number(session.chunk_size)
    if (req.body.length !== expectedBytes) {
      return res.status(400).json({ success: false, error: 'Upload chunk size did not match the expected size.' })
    }
    await db.run(
      `INSERT INTO clip_upload_chunks (upload_id, chunk_index, data, byte_size)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (upload_id, chunk_index) DO UPDATE SET data=EXCLUDED.data, byte_size=EXCLUDED.byte_size, created_at=NOW()`,
      [req.params.uploadId, chunkIndex, req.body, req.body.length],
    )
    return res.status(204).end()
  } catch (err) {
    console.error('[clips] could not store upload chunk:', err)
    return res.status(503).json({ success: false, error: 'Unable to save this part of the upload. Please retry.' })
  }
})

clipsRouter.post('/uploads/:uploadId/complete', requireAuth, async (req, res) => {
  try {
    const session = await db.one<any>(
      `SELECT id, file_name, mime_type, total_bytes, chunk_size, total_chunks, create_data
       FROM clip_upload_sessions WHERE id=$1 AND owner_id=$2 AND expires_at > NOW()`,
      [req.params.uploadId, req.user!.userId],
    )
    if (!session) return res.status(404).json({ success: false, error: 'This upload has expired. Please start again.' })
    const chunks = await db.all<any>(
      'SELECT chunk_index, data, byte_size FROM clip_upload_chunks WHERE upload_id=$1 ORDER BY chunk_index ASC',
      [session.id],
    )
    if (chunks.length !== Number(session.total_chunks)) {
      return res.status(409).json({ success: false, error: 'The upload is incomplete. Please retry.' })
    }
    for (let index = 0; index < chunks.length; index += 1) {
      const expectedBytes = index === Number(session.total_chunks) - 1
        ? Number(session.total_bytes) - index * Number(session.chunk_size)
        : Number(session.chunk_size)
      if (Number(chunks[index].chunk_index) !== index || Number(chunks[index].byte_size) !== expectedBytes) {
        return res.status(409).json({ success: false, error: 'The upload is incomplete. Please retry.' })
      }
    }
    req.body = { data: session.create_data }
    await publishClip(req, res, {
      buffer: Buffer.concat(chunks.map((chunk: any) => Buffer.from(chunk.data))),
      size: Number(session.total_bytes),
      mimetype: session.mime_type,
      originalname: session.file_name,
    })
    if (res.statusCode >= 200 && res.statusCode < 300) {
      await db.run('DELETE FROM clip_upload_sessions WHERE id=$1 AND owner_id=$2', [session.id, req.user!.userId])
    }
  } catch (err) {
    console.error('[clips] could not complete chunked upload:', err)
    if (!res.headersSent) return res.status(503).json({ success: false, error: 'Unable to complete this upload. Please retry.' })
  }
})

clipsRouter.post('/:id/view', requireAuth, async (req, res) => {
  try { const clip = await loadClip(req.params.id, req.user!.userId); if (!clip) return res.status(404).json({ success:false,error:'Clip not found.' }); await incrementView(clip.id, req.user!.userId); return res.json({ success:true }) }
  catch { return res.status(500).json({ success:false,error:'Unable to record view.' }) }
})
clipsRouter.post('/:id/report', requireAuth, async (req, res) => {
  try {
    const clip = await loadClip(req.params.id, req.user!.userId)
    const reason = String(req.body?.reason || '').trim()
    if (!clip) return res.status(404).json({ success:false,error:'Clip not found.' })
    if (!reason) return res.status(400).json({ success:false,error:'Reason required.' })
    const report = await withTransaction(tx => createReportWithCase(tx, { reporterId:req.user!.userId, entityId:clip.id, entityType:'clip', reason, description:req.body?.description }))
    return res.status(201).json({ success:true,data:{ report_id:report.reportId,case_id:report.caseId } })
  } catch { return res.status(500).json({ success:false,error:'Unable to submit report.' }) }
})
clipsRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    const removedAssets = await withTransaction(async tx => {
      const clip = await tx.one<any>("SELECT id,user_id FROM posts WHERE id=$1 AND type IN ('reel','video') FOR UPDATE", [req.params.id])
      if (!clip) throw Object.assign(new Error('NOT_FOUND'), { status:404 })
      if (clip.user_id !== req.user!.userId && !req.user!.isAdmin) throw Object.assign(new Error('FORBIDDEN'), { status:403 })
      const assets = await tx.all<any>(
        "SELECT storage_bucket, storage_path, storage_status FROM media_assets WHERE entity_id=$1 AND owner_id=$2 AND purpose IN ('clip_media','clip_cover','post_media')",
        [clip.id, clip.user_id],
      )
      await tx.run("DELETE FROM media_assets WHERE entity_id=$1 AND owner_id=$2 AND purpose IN ('clip_media','clip_cover','post_media')", [clip.id, clip.user_id])
      await tx.run('DELETE FROM posts WHERE id=$1', [clip.id])
      await tx.run('UPDATE users SET posts_count=GREATEST(0,posts_count-1) WHERE id=$1', [clip.user_id])
      return assets
    })
    await deleteStoredMediaAssets(removedAssets)
    return res.json({ success:true,message:'Clip deleted.' })
  } catch (err:any) { return res.status(err?.status || 500).json({ success:false,error:err?.status===404?'Clip not found.':err?.status===403?'Not authorized.':'Unable to delete Clip.' }) }
})