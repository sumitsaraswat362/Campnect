// @ts-nocheck
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, withTransaction } from '../legacy-db/index.js'
import { requireAuth, optionalAuth } from '../legacy-middleware/auth.js'
import { uploadStory, assertMediaMagic, sendMediaPolicyError } from '../legacy-middleware/upload.js'
import { rankStories } from '../legacy-services/recommender.js'
import { storeMediaAsset } from '../legacy-services/media.js'

export const storiesRouter = Router()

// ─── Feed (relationship-ranked) ───────────────────────────────────────────────
storiesRouter.get('/feed', requireAuth, async (req, res) => {
  try {
    const result = await rankStories(req.user!.userId)
    res.json({ success: true, data: result })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Create story ─────────────────────────────────────────────────────────────
storiesRouter.post('/', requireAuth, uploadStory.single('media'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Media file required.' })
    const detected = await assertMediaMagic(req.file)
    if (!detected.startsWith('image/') && !detected.startsWith('video/')) {
      return res.status(400).json({ success: false, error: 'Stories support images and videos only.' })
    }
    const { caption = '', bg_color = '#080810', duration = '5', filter_id = 'none', visibility = 'normal' } = req.body
    if (!['normal', 'close_mates'].includes(visibility)) return res.status(400).json({ success: false, error: 'Invalid story audience.' })
    const isVideo  = detected.startsWith('video/')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const storyId = uuidv4()
    await withTransaction(async (tx) => {
      const mediaUrl = await storeMediaAsset(tx, req.file!, req.user!.userId, 'story_media', storyId)
      await tx.run(`
        INSERT INTO stories (id, user_id, type, media_url, caption, bg_color, filter, duration, expires_at, visibility)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [storyId, req.user!.userId, isVideo ? 'video' : 'image', mediaUrl, caption, bg_color, filter_id, Math.min(120, Math.max(1, Number(duration))), expiresAt, visibility])

      const mentionedUsernames = [...new Set((String(caption).match(/@([a-z0-9_.]{3,30})/gi) || [])
        .map((m: string) => m.slice(1).toLowerCase()))]
      if (mentionedUsernames.length) {
        const mentioned = await tx.all<any>(
          'SELECT id FROM users WHERE LOWER(username) = ANY($1::text[])',
          [mentionedUsernames],
        )
        await Promise.all(mentioned
          .filter((u: any) => u.id !== req.user!.userId)
          .map((u: any) => tx.run(
            `INSERT INTO notifications (id,user_id,type,actor_id,entity_id,entity_type,content)
             VALUES ($1,$2,'mention',$3,$4,'story',$5)`,
            [uuidv4(), u.id, req.user!.userId, storyId, 'mentioned you in a story'],
          )))
      }
    })
    const story = await db.one(`
      SELECT s.*, u.username, u.full_name, u.avatar_url, u.is_college_verified, 0 as is_viewed
      FROM stories s JOIN users u ON s.user_id = u.id WHERE s.id = $1
    `, [storyId])
    res.status(201).json({ success: true, data: story })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Edit story caption ───────────────────────────────────────────────────────
storiesRouter.patch('/:id', requireAuth, async (req, res) => {
  try {
    const story = await db.one<any>('SELECT user_id FROM stories WHERE id = $1', [req.params.id])
    if (!story) return res.status(404).json({ success: false, error: 'Story not found.' })
    if (story.user_id !== req.user!.userId && !req.user!.isAdmin) return res.status(403).json({ success: false, error: 'Not authorized.' })
    const { caption } = req.body
    if (caption === undefined) return res.status(400).json({ success: false, error: 'No fields to update.' })
    await db.run('UPDATE stories SET caption = $1 WHERE id = $2', [String(caption).slice(0, 500), req.params.id])
    const updated = await db.one('SELECT * FROM stories WHERE id = $1', [req.params.id])
    res.json({ success: true, data: updated })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Delete story ─────────────────────────────────────────────────────────────
storiesRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    const story = await db.one<any>('SELECT user_id FROM stories WHERE id = $1', [req.params.id])
    if (!story) return res.status(404).json({ success: false, error: 'Story not found.' })
    if (story.user_id !== req.user!.userId && !req.user!.isAdmin) return res.status(403).json({ success: false, error: 'Not authorized.' })
    await db.run('DELETE FROM stories WHERE id = $1', [req.params.id])
    res.json({ success: true, message: 'Story deleted.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── View story ───────────────────────────────────────────────────────────────
storiesRouter.post('/:id/view', requireAuth, async (req, res) => {
  try {
    const story = await db.one<any>('SELECT id, user_id FROM stories WHERE id = $1', [req.params.id])
    if (!story) return res.status(404).json({ success: false, error: 'Story not found.' })
    if (story.user_id !== req.user!.userId) {
      const allowed = await db.one(`SELECT 1 FROM stories s
        WHERE s.id = $1 AND (s.visibility = 'normal' OR EXISTS (
          SELECT 1 FROM close_mates cm WHERE cm.user_id = s.user_id AND cm.close_mate_id = $2
        ))`, [req.params.id, req.user!.userId])
      if (!allowed) return res.status(403).json({ success: false, error: 'This story is for Close Mates only.' })
    }
    const result = await db.run(
      'INSERT INTO story_views (story_id, viewer_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.params.id, req.user!.userId],
    )
    if (result.rowCount > 0 && story.user_id !== req.user!.userId) {
      await db.run('UPDATE stories SET views_count = views_count + 1 WHERE id = $1', [req.params.id])
    }
    const updated = await db.one<any>('SELECT views_count FROM stories WHERE id = $1', [req.params.id])
    res.json({ success: true, data: { views_count: Number(updated?.views_count || 0), counted: result.rowCount > 0 && story.user_id !== req.user!.userId } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Story viewers ────────────────────────────────────────────────────────────
storiesRouter.get('/:id/viewers', requireAuth, async (req, res) => {
  try {
    const story = await db.one<any>('SELECT user_id FROM stories WHERE id = $1', [req.params.id])
    if (!story || story.user_id !== req.user!.userId) return res.status(403).json({ success: false, error: 'Not authorized.' })
    const viewers = await db.all(`
      SELECT u.id, u.username, u.full_name, u.avatar_url, sv.viewed_at
      FROM story_views sv JOIN users u ON sv.viewer_id = u.id
      WHERE sv.story_id = $1 ORDER BY sv.viewed_at DESC LIMIT 100
    `, [req.params.id])
    res.json({ success: true, data: viewers })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Reply to story ───────────────────────────────────────────────────────────
storiesRouter.post('/:id/reply', requireAuth, async (req, res) => {
  try {
    const story = await db.one<any>('SELECT id, user_id FROM stories WHERE id = $1', [req.params.id])
    if (!story) return res.status(404).json({ success: false, error: 'Story not found.' })
    const { content } = req.body
    if (!content?.trim()) return res.status(400).json({ success: false, error: 'Reply cannot be empty.' })
    const replyId = uuidv4()
    if (story.user_id !== req.user!.userId) {
      await db.run("INSERT INTO notifications (id,user_id,type,actor_id,entity_id,entity_type,content) VALUES ($1,$2,'story_reply',$3,$4,'story',$5)",
        [replyId, story.user_id, req.user!.userId, story.id, content.trim().slice(0, 500)])
    }
    const mentions = [...new Set((String(content).match(/@([a-z0-9_.]{3,30})/gi) || [])
      .map((m: string) => m.slice(1).toLowerCase()))]
    if (mentions.length) {
      const mentioned = await db.all<any>('SELECT id, username FROM users WHERE LOWER(username) = ANY($1::text[])', [mentions])
      await Promise.all(mentioned
        .filter((u: any) => u.id !== req.user!.userId && u.id !== story.user_id)
        .map((u: any) => db.run(
          `INSERT INTO notifications (id,user_id,type,actor_id,entity_id,entity_type,content)
           VALUES ($1,$2,'mention',$3,$4,'story',$5)`,
          [uuidv4(), u.id, req.user!.userId, story.id, `mentioned you in a story reply: ${String(content).trim().slice(0, 450)}`],
        )))
    }
    res.json({ success: true, message: 'Reply sent.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Get user stories ─────────────────────────────────────────────────────────
storiesRouter.get('/user/:userId', optionalAuth, async (req, res) => {
  try {
    const viewerId = req.user?.userId
    if (!viewerId) return res.status(401).json({ success: false, error: 'Authentication required.' })
    const stories = await db.all(`
      SELECT s.*,
        ${viewerId
          ? 'EXISTS(SELECT 1 FROM story_views sv WHERE sv.story_id = s.id AND sv.viewer_id = $2)::int as is_viewed'
          : '0 as is_viewed'}
       FROM stories s
       JOIN users story_owner ON story_owner.id = s.user_id
       WHERE s.user_id = $1 AND s.expires_at > NOW()
         AND (s.user_id = $2 OR (COALESCE(story_owner.is_shadowbanned, 0) = 0 AND COALESCE(story_owner.is_admin, 0) = 0))
        AND (s.user_id = $2 OR s.visibility = 'normal' OR EXISTS (
          SELECT 1 FROM close_mates cm WHERE cm.user_id = s.user_id AND cm.close_mate_id = $2
        ))
      ORDER BY s.created_at ASC
    `, [req.params.userId, viewerId])
    res.json({ success: true, data: stories })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})
