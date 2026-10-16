// @ts-nocheck
import { Router }         from 'express'
import { v4 as uuidv4 }   from 'uuid'
import { db }              from '../legacy-db/index.js'
import { requireAuth }     from '../legacy-middleware/auth.js'
import {
  generateFeed,
  recordInteraction,
  suggestAccounts,
  getTrending,
  computeTrendingScores,
  rankStories,
  classifyNewPost,
} from '../legacy-services/recommender.js'
import { loadAccessibleGlimpse } from '../legacy-services/glimpseAccess.js'

export const recommendRouter = Router()

// ─── For You feed ─────────────────────────────────────────────────────────────
recommendRouter.get('/feed/for-you', requireAuth, async (req, res) => {
  try {
    const { limit = '15', offset = '0' } = req.query
    const posts = await generateFeed({
      userId:   req.user!.userId,
      limit:    Number(limit),
      offset:   Number(offset),
      feedType: 'for_you',
    })
    res.json({ success: true, data: posts, meta: { limit: Number(limit), offset: Number(offset), hasMore: posts.length === Number(limit) } })
  } catch (err: any) {
    console.error('[rec] for-you:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Following feed ───────────────────────────────────────────────────────────
recommendRouter.get('/feed/following', requireAuth, async (req, res) => {
  try {
    const { limit = '15', offset = '0' } = req.query
    const posts = await generateFeed({
      userId:   req.user!.userId,
      limit:    Number(limit),
      offset:   Number(offset),
      feedType: 'following',
    })
    res.json({ success: true, data: posts, meta: { limit: Number(limit), offset: Number(offset), hasMore: posts.length === Number(limit) } })
  } catch (err: any) {
    console.error('[rec] following:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Reels feed ───────────────────────────────────────────────────────────────
recommendRouter.get('/reels', requireAuth, async (req, res) => {
  try {
    const { limit = '10', offset = '0' } = req.query
    const posts = await generateFeed({
      userId:   req.user!.userId,
      limit:    Number(limit),
      offset:   Number(offset),
      feedType: 'reels',
    })
    res.json({ success: true, data: posts, meta: { limit: Number(limit), offset: Number(offset), hasMore: posts.length === Number(limit) } })
  } catch (err: any) {
    console.error('[rec] reels:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Explore / Discovery ──────────────────────────────────────────────────────
recommendRouter.get('/explore', requireAuth, async (req, res) => {
  try {
    const { limit = '20', offset = '0' } = req.query
    const posts = await generateFeed({
      userId:   req.user!.userId,
      limit:    Number(limit),
      offset:   Number(offset),
      feedType: 'explore',
    })
    res.json({ success: true, data: posts, meta: { limit: Number(limit), offset: Number(offset), hasMore: posts.length === Number(limit) } })
  } catch (err: any) {
    console.error('[rec] explore:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Stories feed (ranked) ────────────────────────────────────────────────────
recommendRouter.get('/stories', requireAuth, async (req, res) => {
  try {
    const grouped = await rankStories(req.user!.userId)
    res.json({ success: true, data: grouped })
  } catch (err: any) {
    console.error('[rec] stories:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Suggested accounts ───────────────────────────────────────────────────────
recommendRouter.get('/suggested-accounts', requireAuth, async (req, res) => {
  try {
    const { limit = '10' } = req.query
    const accounts = await suggestAccounts(req.user!.userId, Number(limit))
    res.json({ success: true, data: accounts })
  } catch (err: any) {
    console.error('[rec] suggested-accounts:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Trending ─────────────────────────────────────────────────────────────────
recommendRouter.get('/trending', requireAuth, async (req, res) => {
  try {
    const { scope = 'campus', limit = '20', offset = '0' } = req.query
    const validScope = ['campus','network','course'].includes(scope as string)
      ? (scope as 'campus' | 'network' | 'course')
      : 'campus'
    const result = await getTrending(req.user!.userId, validScope, Number(limit), Number(offset))
    res.json({ success: true, data: result.posts, scope: result.scope, meta: { limit: Number(limit), offset: Number(offset) } })
  } catch (err: any) {
    console.error('[rec] trending:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Record interaction ───────────────────────────────────────────────────────
// Called by frontend after user interactions: view, like, share, save, skip, etc.
recommendRouter.post('/interact', requireAuth, async (req, res) => {
  try {
    const { post_id, interaction_type, watch_pct = 0, watch_seconds = 0 } = req.body
    if (!post_id || !interaction_type) {
      return res.status(400).json({ success: false, error: 'post_id and interaction_type required.' })
    }
    const validTypes = [
      'view','like','comment','save','share','skip','hide','report',
      'follow_after','profile_visit','rewatch','show_more','not_interested','mute',
    ]
    if (!validTypes.includes(interaction_type)) {
      return res.status(400).json({ success: false, error: 'Invalid interaction_type.' })
    }

    // Verify post exists and respect privacy
    const post = await db.one<any>('SELECT id, user_id, visibility, type FROM posts WHERE id = $1', [post_id])
    if (!post) return res.status(404).json({ success: false, error: 'Post not found.' })
    if (post.type === 'glimpse' && !(await loadAccessibleGlimpse(post_id, req.user!.userId))) {
      return res.status(404).json({ success: false, error: 'Post not found.' })
    }

    await recordInteraction(req.user!.userId, post_id, interaction_type, Number(watch_pct), Number(watch_seconds))
    res.json({ success: true })
  } catch (err: any) {
    console.error('[rec] interact:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── User feedback (Not Interested / Show More / Hide Creator) ────────────────
recommendRouter.post('/feedback', requireAuth, async (req, res) => {
  try {
    const { post_id, creator_id, category, action } = req.body
    const validActions = ['not_interested','show_more','hide_creator','hide_topic','mute_creator']
    if (!action || !validActions.includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action.' })
    }

    if (post_id) {
      const post = await db.one<any>('SELECT type FROM posts WHERE id = $1', [post_id])
      if (!post || (post.type === 'glimpse' && !(await loadAccessibleGlimpse(post_id, req.user!.userId)))) {
        return res.status(404).json({ success: false, error: 'Post not found.' })
      }
    }

    await db.run(`
      INSERT INTO rec_feedback (id, user_id, post_id, creator_id, category, action)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [uuidv4(), req.user!.userId, post_id || null, creator_id || null, category || null, action])

    // Immediately update interest profile based on feedback action
    if (post_id) {
      const interactionType = action === 'show_more' ? 'show_more' : 'not_interested'
      await recordInteraction(req.user!.userId, post_id, interactionType)
    }

    res.json({ success: true, message: 'Feedback recorded.' })
  } catch (err: any) {
    console.error('[rec] feedback:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Classify a post (admin / internal) ──────────────────────────────────────
recommendRouter.post('/classify/:postId', requireAuth, async (req, res) => {
  try {
    if (!req.user!.isAdmin) return res.status(403).json({ success: false, error: 'Admin only.' })
    const post = await db.one<any>('SELECT * FROM posts WHERE id = $1', [req.params.postId])
    if (!post) return res.status(404).json({ success: false, error: 'Post not found.' })

    // Force reclassification
    await db.run('DELETE FROM post_classifications WHERE post_id = $1', [req.params.postId])
    let tags: string[] = []
    try { tags = JSON.parse(post.tags ?? '[]') } catch {}
    await classifyNewPost(post.id, post.content ?? '', tags, post.type ?? 'text')
    const clf = await db.one('SELECT * FROM post_classifications WHERE post_id = $1', [req.params.postId])
    res.json({ success: true, data: clf })
  } catch (err: any) {
    console.error('[rec] classify:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Refresh trending (admin / internal) ─────────────────────────────────────
recommendRouter.post('/trending/refresh', requireAuth, async (req, res) => {
  try {
    if (!req.user!.isAdmin) return res.status(403).json({ success: false, error: 'Admin only.' })
    const viewer = await db.one<any>('SELECT college_id, course FROM users WHERE id = $1', [req.user!.userId])

    await Promise.all([
      computeTrendingScores('network'),
      viewer?.college_id
        ? computeTrendingScores(`campus:${viewer.college_id}`, `AND p.college_id='${viewer.college_id.replace(/'/g,"''")}'`)
        : Promise.resolve(),
      viewer?.course
        ? computeTrendingScores(`course:${viewer.course}`, `AND u.course='${viewer.course.replace(/'/g,"''")}'`)
        : Promise.resolve(),
    ])

    res.json({ success: true, message: 'Trending scores refreshed.' })
  } catch (err: any) {
    console.error('[rec] trending/refresh:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Get user interest profile (debug) ───────────────────────────────────────
recommendRouter.get('/profile', requireAuth, async (req, res) => {
  try {
    const profile = await db.one<any>('SELECT topic_weights, last_updated FROM user_interest_profiles WHERE user_id = $1', [req.user!.userId])
    if (!profile) return res.json({ success: true, data: { topic_weights: {}, last_updated: null } })

    let topicWeights: Record<string, number> = {}
    try { topicWeights = JSON.parse(profile.topic_weights ?? '{}') } catch {}

    // Return sorted by weight descending (show top interests)
    const sorted = Object.entries(topicWeights)
      .sort(([,a],[,b]) => b - a)
      .slice(0, 30)
      .reduce((acc, [k,v]) => { acc[k] = Math.round(v*100)/100; return acc }, {} as Record<string, number>)

    res.json({ success: true, data: { top_interests: sorted, last_updated: profile.last_updated } })
  } catch (err: any) {
    console.error('[rec] profile:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})
