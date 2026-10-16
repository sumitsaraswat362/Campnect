// @ts-nocheck
import express from 'express'
import { randomUUID } from 'crypto'
import { db, withTransaction } from '../legacy-db/index.js'
import { requireAuth } from '../legacy-middleware/auth.js'
import { durableMediaUrl } from '../legacy-services/media.js'

export const highlightsRouter = express.Router()

function highlightFailure(res: express.Response, err: unknown) {
  console.error('highlight route error:', err instanceof Error ? err.message : err)
  return res.status(500).json({ success: false, error: 'Unable to complete the highlight request.' })
}

// GET /api/highlights/user/:userId
highlightsRouter.get('/user/:userId', requireAuth, async (req: any, res) => {
  try {
    const { userId } = req.params
    const highlights = await db.all('SELECT * FROM highlights WHERE user_id = $1 ORDER BY created_at DESC', [userId])
    const withStories = await Promise.all(highlights.map(async (h: any) => {
      const stories = await db.all('SELECT * FROM highlight_stories WHERE highlight_id = $1 ORDER BY added_at ASC', [h.id])
      return { ...h, stories }
    }))
    res.json({ success: true, data: withStories })
  } catch (err: any) {
    highlightFailure(res, err)
  }
})

// POST /api/highlights — create highlight with stories
highlightsRouter.post('/', requireAuth, async (req: any, res) => {
  try {
    const { title, cover_url, stories = [] } = req.body
    if (!title?.trim()) return res.status(400).json({ success: false, error: 'Title is required' })

    if (!Array.isArray(stories)) return res.status(400).json({ success: false, error: 'Stories must be an array.' })
    if (cover_url !== undefined && cover_url !== null) {
      const canonicalCoverUrl = durableMediaUrl(cover_url)
      const coverAssetId = canonicalCoverUrl?.split('/').pop()
      if (!coverAssetId || !(await db.one('SELECT 1 FROM media_assets WHERE id = $1', [coverAssetId]))) {
        return res.status(400).json({ success: false, error: 'Highlight cover must be durable uploaded media.' })
      }
    }
    const id = randomUUID()
    await withTransaction(async (tx) => {
      const canonicalCoverUrl = cover_url === null ? null : durableMediaUrl(cover_url)
      await tx.run('INSERT INTO highlights (id, user_id, title, cover_url) VALUES ($1,$2,$3,$4)', [id, req.user.userId, title.trim(), canonicalCoverUrl])

      for (const s of stories) {
        if (s.story_id) {
          const source = await tx.one<any>(
            'SELECT id, media_url, type FROM stories WHERE id = $1 AND user_id = $2',
            [s.story_id, req.user.userId],
          )
          if (!source) throw new Error('A selected story is no longer available.')
          const canonicalStoryUrl = durableMediaUrl(source.media_url)
          const sourceAssetId = canonicalStoryUrl?.split('/').pop()
          if (!sourceAssetId || !(await tx.one('SELECT 1 FROM media_assets WHERE id = $1', [sourceAssetId]))) {
            throw new Error('A selected story does not have durable media.')
          }
          await tx.run(
            'INSERT INTO highlight_stories (id, highlight_id, story_id, media_url, type) VALUES ($1,$2,$3,$4,$5)',
            [randomUUID(), id, source.id, canonicalStoryUrl, source.type === 'video' ? 'video' : 'photo'],
          )
        } else {
          // Backward compatibility for older clients. The URL still has to be
          // durable; transient blob/data URLs are not valid stored media.
          if (!s?.media_url || typeof s.media_url !== 'string') {
            throw new Error('Each highlight story must include media.')
          }
          const canonicalStoryUrl = durableMediaUrl(s.media_url)
          const assetId = canonicalStoryUrl?.split('/').pop()
          if (!assetId || !(await tx.one('SELECT 1 FROM media_assets WHERE id = $1', [assetId]))) {
            throw new Error('Highlight media must be a durable media URL.')
          }
          await tx.run(
            'INSERT INTO highlight_stories (id, highlight_id, story_id, media_url, type) VALUES ($1,$2,$3,$4,$5)',
            [randomUUID(), id, null, canonicalStoryUrl, s.type || 'photo'],
          )
        }
      }
    })

    const created = await db.one('SELECT * FROM highlights WHERE id = $1', [id])
    const hs = await db.all('SELECT * FROM highlight_stories WHERE highlight_id = $1 ORDER BY added_at ASC', [id])
    res.json({ success: true, data: { ...created, stories: hs } })
  } catch (err: any) {
    highlightFailure(res, err)
  }
})

// PATCH /api/highlights/:id
highlightsRouter.patch('/:id', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params
    const highlight = await db.one<any>('SELECT * FROM highlights WHERE id = $1', [id])
    if (!highlight) return res.status(404).json({ success: false, error: 'Not found' })
    if (highlight.user_id !== req.user.userId) return res.status(403).json({ success: false, error: 'Forbidden' })

    const { title, cover_url } = req.body
    let canonicalCoverUrl: string | null | undefined
    if (cover_url !== undefined) {
      canonicalCoverUrl = cover_url === null ? null : durableMediaUrl(cover_url)
      if (cover_url !== null) {
        const assetId = canonicalCoverUrl?.split('/').pop()
        if (!assetId || !(await db.one('SELECT 1 FROM media_assets WHERE id = $1', [assetId]))) {
          return res.status(400).json({ success: false, error: 'Highlight cover must be durable uploaded media.' })
        }
      }
    }
    await withTransaction(async (tx) => {
      if (title !== undefined) await tx.run('UPDATE highlights SET title = $1 WHERE id = $2', [title, id])
      if (cover_url !== undefined) await tx.run('UPDATE highlights SET cover_url = $1 WHERE id = $2', [canonicalCoverUrl, id])
    })

    const updated = await db.one('SELECT * FROM highlights WHERE id = $1', [id])
    const stories = await db.all('SELECT * FROM highlight_stories WHERE highlight_id = $1 ORDER BY added_at ASC', [id])
    res.json({ success: true, data: { ...updated, stories } })
  } catch (err: any) {
    highlightFailure(res, err)
  }
})

// DELETE /api/highlights/:id
highlightsRouter.delete('/:id', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params
    const highlight = await db.one<any>('SELECT * FROM highlights WHERE id = $1', [id])
    if (!highlight) return res.status(404).json({ success: false, error: 'Not found' })
    if (highlight.user_id !== req.user.userId) return res.status(403).json({ success: false, error: 'Forbidden' })
    await db.run('DELETE FROM highlights WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err: any) {
    highlightFailure(res, err)
  }
})
