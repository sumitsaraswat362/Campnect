// @ts-nocheck
/**
 * Campnect Recommendation Engine
 *
 * Pipeline:
 *   Candidate Generation → Privacy → Safety → Political → Ranking → Diversity → Dedup → Feed
 */

import { db }            from '../legacy-db/index.js'
import { v4 as uuidv4 } from 'uuid'
import {
  classifyPost,
  getCategoryWeight,
  freshnessScore,
  engagementQualityScore,
  type ClassificationResult,
} from './classifier.js'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface UserContext {
  userId:            string
  collegeId:         string | null
  course:            string | null
  year:              number | null
  interests:         string[]
  topicWeights:      Record<string, number>
  negativeCreators:  string[]
  preferredCreators: string[]
}

// ─── Load user context ────────────────────────────────────────────────────────
export async function loadUserContext(userId: string): Promise<UserContext> {
  const [user, profile] = await Promise.all([
    db.one<any>('SELECT college_id, course, year, interests FROM users WHERE id = $1', [userId]),
    db.one<any>('SELECT topic_weights, negative_creators, preferred_creators FROM user_interest_profiles WHERE user_id = $1', [userId]),
  ])

  let interests:         string[]               = []
  let topicWeights:      Record<string, number> = {}
  let negativeCreators:  string[]               = []
  let preferredCreators: string[]               = []

  try { interests         = JSON.parse(user?.interests             ?? '[]') } catch {}
  if (profile) {
    try { topicWeights      = JSON.parse(profile.topic_weights      ?? '{}') } catch {}
    try { negativeCreators  = JSON.parse(profile.negative_creators  ?? '[]') } catch {}
    try { preferredCreators = JSON.parse(profile.preferred_creators ?? '[]') } catch {}
  }

  // Cold-start: seed weights from declared interests
  if (Object.keys(topicWeights).length === 0 && interests.length > 0) {
    for (const interest of interests) { topicWeights[interest] = 2.0 }
  }

  return { userId, collegeId: user?.college_id ?? null, course: user?.course ?? null,
           year: user?.year ?? null, interests, topicWeights, negativeCreators, preferredCreators }
}

// ─── Ensure classification exists ─────────────────────────────────────────────
export async function ensureClassified(post: any): Promise<void> {
  if (!post?.id) return
  const exists = await db.one('SELECT 1 FROM post_classifications WHERE post_id = $1', [post.id])
  if (exists) return
  let tags: string[] = []
  try { tags = JSON.parse(post.tags ?? '[]') } catch {}
  const result = classifyPost(post.content ?? '', tags, post.type ?? 'text')
  await db.run(
    'INSERT INTO post_classifications (post_id,categories,is_political,is_campus_pol,safety_flag,safety_score,quality_score) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (post_id) DO NOTHING',
    [post.id, JSON.stringify(result.categories), result.is_political ? 1 : 0,
     result.is_campus_pol ? 1 : 0, result.safety_flag, result.safety_score, result.quality_score]
  )
}

// ─── Score a single post ──────────────────────────────────────────────────────
function scorePost(
  post: any, clf: ClassificationResult, ctx: UserContext, feedType: string,
  isFollowing: boolean, mutualFollows: number, skipRate: number, reportCount: number,
): { score: number; reason: string } {
  let score = 0; let reason = ''

  if (clf.safety_flag === 'high')   return { score: -9999, reason: 'safety_block' }
  if (clf.safety_flag === 'medium') score -= 25
  if (clf.is_political && feedType !== 'following') return { score: -9998, reason: 'political_block' }

  // Interest match (0-40 pts)
  let interestScore = 0; let topCategory = ''
  for (const cat of clf.categories) {
    const w = ctx.topicWeights[cat] ?? 0
    if (w > 0 && !topCategory) topCategory = cat
    interestScore += w * 4
  }
  score += Math.min(40, interestScore)

  // Social relevance (0-20 pts)
  if (isFollowing) { score += 18; reason = 'Because you follow this creator' }
  else if (mutualFollows > 0) { score += Math.min(8, mutualFollows * 2); reason = 'Connected through mutual follows' }
  if (ctx.preferredCreators.includes(post.user_id)) { score += 12; if (!reason) reason = 'Similar to posts you saved' }
  if (ctx.negativeCreators.includes(post.user_id)) score -= 20

  // Campus relevance (0-27 pts)
  let campusReason = ''
  if (post.college_id && post.college_id === ctx.collegeId) { score += 18; campusReason = 'Popular at your college' }
  if (post.course && ctx.course && post.course.toLowerCase() === ctx.course.toLowerCase()) { score += 6; campusReason = campusReason || 'Same course' }
  if (post.year && ctx.year && post.year === ctx.year) { score += 3; campusReason = campusReason || 'Same year as you' }
  if (!reason && campusReason) reason = campusReason

  // Freshness (0-15 pts)
  score += freshnessScore(post.created_at, 48) * 15

  // Engagement quality (0-20 pts)
  score += engagementQualityScore(post.likes_count ?? 0, post.comments_count ?? 0,
    post.saves_count ?? 0, post.shares_count ?? 0, post.views_count ?? 0) * 20

  // Content quality (0-10 pts)
  score += (clf.quality_score ?? 0.5) * 10

  // New creator discovery bonus (0-8 pts)
  if (!isFollowing && (post.views_count ?? 0) < 100) {
    score += 8
    if (!reason) reason = 'New creator at your college'
  }

  // Negative feedback risk
  if (skipRate > 0.6)   score -= 12
  if (skipRate > 0.8)   score -= 8
  if (reportCount > 3)  score -= 20
  if (reportCount > 10) score -= 100

  // Feed-type modifiers
  if (feedType === 'reels')   score += Math.min(10, Math.log1p(post.views_count ?? 0) * 1.5)
  if (feedType === 'explore') { if (!isFollowing) score += 5; if (!ctx.collegeId || post.college_id !== ctx.collegeId) score += 3 }

  if (!reason) reason = topCategory ? `Because you enjoy ${topCategory}` : 'Trending on your campus'
  return { score, reason }
}

// ─── Full feed pipeline ───────────────────────────────────────────────────────
export async function generateFeed(opts: {
  userId: string; limit?: number; offset?: number
  feedType?: 'for_you' | 'following' | 'reels' | 'explore'
}): Promise<any[]> {
  const { userId, limit = 15, offset = 0, feedType = 'for_you' } = opts
  const ctx = await loadUserContext(userId)
  const poolSize = Math.min(200, limit * 6)
  const intervalDays = feedType === 'explore' ? '30 days' : '7 days'
  const typeFilter = feedType === 'reels'
    ? `AND p.type IN ('reel','video')`
    : feedType === 'explore' ? `AND p.type NOT IN ('reel','video')` : ''

  let candidateRows: any[]

  if (feedType === 'following') {
    candidateRows = await db.all(`
      SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_name,
        u.college_id, u.course, u.year, u.is_college_verified, u.is_private,
        1 AS is_following, 0 AS mutual_follows,
        COALESCE(pc.is_political,0)     AS is_political,
        COALESCE(pc.is_campus_pol,0)    AS is_campus_pol,
        COALESCE(pc.safety_flag,'none') AS safety_flag,
        COALESCE(pc.safety_score,1.0)   AS safety_score,
        COALESCE(pc.quality_score,0.5)  AS quality_score,
        COALESCE(pc.categories,'[]')    AS categories,
        0::float AS skip_rate, 0 AS report_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN post_classifications pc ON pc.post_id = p.id
      LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
      WHERE p.visibility IN ('public','friends','college')
        AND p.type <> 'glimpse'
        AND COALESCE(usc.feed_visibility, COALESCE(u.is_shadowbanned, 0)) = 0
        AND p.user_id != $1
        AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $1)
        AND p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $1)
        AND p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1 AND status = 'active')
        AND p.created_at > NOW() - INTERVAL '7 days'
        ${typeFilter}
      ORDER BY p.created_at DESC LIMIT $2
    `, [userId, poolSize])
  } else {
    // Build the interval string safely outside the query
    const intervalExpr = `'${intervalDays}'`
    candidateRows = await db.all(`
      WITH viewer AS (SELECT college_id, course, year FROM users WHERE id = $1),
      blocked_users AS (
        SELECT blocked_id AS uid FROM blocks WHERE blocker_id = $1
        UNION SELECT blocker_id AS uid FROM blocks WHERE blocked_id = $1
      )
      SELECT DISTINCT ON (p.id)
        p.*, u.username, u.full_name, u.avatar_url, u.college_name,
        u.college_id, u.course, u.year, u.is_college_verified, u.is_private,
        CASE WHEN f.following_id IS NOT NULL THEN 1 ELSE 0 END AS is_following,
        COALESCE((
          SELECT COUNT(*) FROM follows mf
          WHERE mf.follower_id = p.user_id
            AND mf.following_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
          LIMIT 5
        ), 0) AS mutual_follows,
        COALESCE(pc.is_political,0)     AS is_political,
        COALESCE(pc.is_campus_pol,0)    AS is_campus_pol,
        COALESCE(pc.safety_flag,'none') AS safety_flag,
        COALESCE(pc.safety_score,1.0)   AS safety_score,
        COALESCE(pc.quality_score,0.5)  AS quality_score,
        COALESCE(pc.categories,'[]')    AS categories,
        COALESCE(
          (SELECT COUNT(*) FILTER (WHERE ci.interaction_type = 'skip')::float
           FROM content_interactions ci WHERE ci.post_id = p.id)
          / NULLIF((SELECT COUNT(*) FROM content_interactions ci2
             WHERE ci2.post_id = p.id AND ci2.interaction_type IN ('view','skip')),0)
        ,0) AS skip_rate,
        COALESCE(
          (SELECT COUNT(*) FROM reports r WHERE r.entity_id = p.id AND r.entity_type = 'post')
        ,0) AS report_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN post_classifications pc ON pc.post_id = p.id
      LEFT JOIN follows f ON f.follower_id = $1 AND f.following_id = p.user_id AND f.status = 'active'
      LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
      WHERE p.visibility = 'public'
        AND p.type <> 'glimpse'
        AND u.is_private = 0
        AND COALESCE(usc.feed_visibility, COALESCE(u.is_shadowbanned, 0)) = 0
        AND p.user_id != $1
        AND p.user_id NOT IN (SELECT uid FROM blocked_users)
        AND p.id NOT IN (
          SELECT post_id FROM rec_feedback WHERE user_id = $1 AND action IN ('not_interested','hide_creator')
        )
        AND p.id NOT IN (
          SELECT post_id FROM rec_impressions WHERE user_id = $1 AND feed_type = $2
          AND shown_at > NOW() - INTERVAL '48 hours'
        )
        AND p.created_at > NOW() - INTERVAL ${intervalExpr}
        ${typeFilter}
        AND (
          f.following_id IS NOT NULL
          OR (p.college_id IS NOT NULL AND p.college_id = (SELECT college_id FROM viewer))
          OR (u.course IS NOT NULL AND u.course = (SELECT course FROM viewer))
          OR EXISTS (SELECT 1 FROM trending_cache tc WHERE tc.post_id = p.id AND tc.trend_score > 3 AND tc.computed_at > NOW() - INTERVAL '4 hours')
          OR COALESCE(pc.quality_score, 0) > 0.6
        )
      ORDER BY p.id, p.created_at DESC
      LIMIT $3
    `, [userId, feedType, poolSize])
  }

  if (candidateRows.length === 0) return []

  // Classify any unclassified posts
  const unclassified = candidateRows.filter(p => !p.categories || p.categories === '[]' || p.categories === null)
  if (unclassified.length > 0) {
    await Promise.all(unclassified.map(p => ensureClassified(p)))
    for (const p of unclassified) {
      const clf = await db.one<any>('SELECT categories,is_political,is_campus_pol,safety_flag,safety_score,quality_score FROM post_classifications WHERE post_id = $1', [p.id])
      if (clf) Object.assign(p, clf)
    }
  }

  // Score candidates
  const scored: Array<{ post: any; score: number; reason: string }> = []
  for (const row of candidateRows) {
    let cats: string[] = []
    try { cats = JSON.parse(row.categories ?? '[]') } catch {}
    const clf: ClassificationResult = {
      categories: cats,
      is_political:       row.is_political === 1 || row.is_political === true,
      is_campus_pol:      row.is_campus_pol === 1 || row.is_campus_pol === true,
      safety_flag:        (row.safety_flag ?? 'none') as any,
      safety_score:       parseFloat(row.safety_score ?? 1.0),
      quality_score:      parseFloat(row.quality_score ?? 0.5),
      is_spam: false, is_engagement_bait: false,
    }
    const { score, reason } = scorePost(row, clf, ctx, feedType,
      row.is_following === 1 || row.is_following === true,
      parseInt(row.mutual_follows ?? 0), parseFloat(row.skip_rate ?? 0), parseInt(row.report_count ?? 0))
    if (score > -100) scored.push({ post: row, score, reason })
  }

  scored.sort((a, b) => b.score - a.score)

  // Diversity constraints
  const creatorCounts: Record<string, number> = {}
  const categoryCounts: Record<string, number> = {}
  const diverse: typeof scored = []
  for (const item of scored) {
    const cid = item.post.user_id
    creatorCounts[cid] = (creatorCounts[cid] ?? 0) + 1
    if (creatorCounts[cid] > 3) continue
    let cats: string[] = []
    try { cats = JSON.parse(item.post.categories ?? '[]') } catch {}
    let blocked = false
    for (const cat of cats) {
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1
      if (categoryCounts[cat] > 5) { blocked = true; break }
    }
    if (blocked) continue
    diverse.push(item)
    if (diverse.length >= limit + offset) break
  }

  const page = diverse.slice(offset, offset + limit)
  if (page.length > 0) {
    const vals = page.map(i => `('${userId}','${i.post.id}','${feedType}',NOW())`).join(',')
    db.run(`INSERT INTO rec_impressions (user_id,post_id,feed_type,shown_at) VALUES ${vals} ON CONFLICT DO NOTHING`).catch(() => {})
  }

  return page.map(({ post, score, reason }) => ({
    ...post,
    media:        (() => { try { return JSON.parse(post.media ?? '[]') }        catch { return [] } })(),
    tags:         (() => { try { return JSON.parse(post.tags  ?? '[]') }        catch { return [] } })(),
    poll_options: post.poll_options ? (() => { try { return JSON.parse(post.poll_options) } catch { return null } })() : null,
    rec_score: Math.round(score * 10) / 10, rec_reason: reason,
    is_liked: false, is_saved: false,
  }))
}

// ─── Record interaction & update interest profile ─────────────────────────────
export async function recordInteraction(
  userId: string, postId: string, interactionType: string,
  watchPct = 0, watchSeconds = 0,
): Promise<void> {
  const weight = getCategoryWeight(interactionType)
  if (weight === 0) return
  try {
    await db.run(
      'INSERT INTO content_interactions (id,user_id,post_id,interaction_type,watch_pct,watch_seconds,signal_weight) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [uuidv4(), userId, postId, interactionType, watchPct, watchSeconds, weight]
    )

    let clf = await db.one<any>('SELECT categories FROM post_classifications WHERE post_id = $1', [postId])
    if (!clf) {
      const post = await db.one<any>('SELECT content,tags,type FROM posts WHERE id = $1', [postId])
      if (!post) return
      await ensureClassified(post)
      clf = await db.one<any>('SELECT categories FROM post_classifications WHERE post_id = $1', [postId])
    }
    let categories: string[] = []
    try { categories = JSON.parse(clf?.categories ?? '[]') } catch {}
    if (categories.length === 0) return

    let profile = await db.one<any>('SELECT topic_weights,negative_creators,preferred_creators FROM user_interest_profiles WHERE user_id = $1', [userId])
    let topicWeights: Record<string, number> = {}
    let negativeCreators: string[] = []
    let preferredCreators: string[] = []
    if (profile) {
      try { topicWeights      = JSON.parse(profile.topic_weights     ?? '{}') } catch {}
      try { negativeCreators  = JSON.parse(profile.negative_creators ?? '[]') } catch {}
      try { preferredCreators = JSON.parse(profile.preferred_creators?? '[]') } catch {}
    }

    for (const key of Object.keys(topicWeights)) topicWeights[key] = (topicWeights[key] ?? 0) * 0.98
    for (const cat of categories) {
      topicWeights[cat] = Math.max(-20, Math.min(20, (topicWeights[cat] ?? 0) + weight))
    }

    if (['block','mute','not_interested','hide'].includes(interactionType)) {
      const p = await db.one<any>('SELECT user_id FROM posts WHERE id = $1', [postId])
      if (p?.user_id && !negativeCreators.includes(p.user_id)) {
        negativeCreators.push(p.user_id)
        preferredCreators = preferredCreators.filter(id => id !== p.user_id)
      }
    }
    if (['save','share','follow_after','show_more'].includes(interactionType)) {
      const p = await db.one<any>('SELECT user_id FROM posts WHERE id = $1', [postId])
      if (p?.user_id && !preferredCreators.includes(p.user_id)) preferredCreators.push(p.user_id)
    }

    const pruned: Record<string, number> = {}
    Object.keys(topicWeights).sort((a,b) => (topicWeights[b]??0) - (topicWeights[a]??0)).slice(0,200)
      .forEach(k => { pruned[k] = topicWeights[k]! })

    await db.run(`
      INSERT INTO user_interest_profiles (user_id,topic_weights,negative_creators,preferred_creators,last_updated)
      VALUES ($1,$2,$3,$4,NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        topic_weights=EXCLUDED.topic_weights, negative_creators=EXCLUDED.negative_creators,
        preferred_creators=EXCLUDED.preferred_creators, last_updated=NOW()
    `, [userId, JSON.stringify(pruned), JSON.stringify(negativeCreators.slice(-100)), JSON.stringify(preferredCreators.slice(-100))])

    if (['save','share','follow_after','rewatch'].includes(interactionType)) updateReelPhase(postId, 1)
    else if (['skip','hide','report'].includes(interactionType)) updateReelPhase(postId, -1)
  } catch (err: any) { console.error('[recommender] recordInteraction:', err.message) }
}

// ─── Reel distribution phase ──────────────────────────────────────────────────
async function updateReelPhase(postId: string, delta: number): Promise<void> {
  try {
    const dist = await db.one<any>('SELECT * FROM reel_distribution WHERE post_id = $1', [postId])
    if (!dist) {
      await db.run('INSERT INTO reel_distribution (post_id,phase,satisfaction_score,test_views,positive_signals) VALUES ($1,\'initial\',$2,1,$3) ON CONFLICT DO NOTHING',
        [postId, Math.max(0,delta), delta>0?1:0])
      return
    }
    const newViews = (dist.test_views ?? 0) + 1
    const newPositive = (dist.positive_signals ?? 0) + (delta > 0 ? 1 : 0)
    const satisfaction = newPositive / Math.max(1, newViews)
    let phase = dist.phase ?? 'initial'
    if      (phase==='initial' && newViews>=10  && satisfaction>=0.30) phase='campus'
    else if (phase==='campus'  && newViews>=30  && satisfaction>=0.25) phase='similar'
    else if (phase==='similar' && newViews>=100 && satisfaction>=0.20) phase='broad'
    if (satisfaction < 0.05 && newViews >= 20) phase = 'initial'
    await db.run('UPDATE reel_distribution SET phase=$1,satisfaction_score=$2,test_views=$3,positive_signals=$4,phase_updated_at=NOW() WHERE post_id=$5',
      [phase, (dist.satisfaction_score??0)+delta, newViews, newPositive, postId])
  } catch {}
}

// ─── Stories ranked by relationship strength ──────────────────────────────────
export async function rankStories(userId: string): Promise<any[]> {
  const stories = await db.all(`
    WITH viewer_signals AS (
      SELECT p.user_id AS creator_id,
        COUNT(*) FILTER (WHERE ci.interaction_type IN ('like','comment','save','share','follow_after')) * 5 AS strong,
        COUNT(*) FILTER (WHERE ci.interaction_type='view') AS weak
      FROM content_interactions ci JOIN posts p ON p.id=ci.post_id
      WHERE ci.user_id=$1 AND ci.created_at > NOW() - INTERVAL '30 days' GROUP BY p.user_id
    ),
    story_signals AS (
      SELECT s.user_id AS creator_id, COUNT(*)*2 AS svs
      FROM story_views sv JOIN stories s ON s.id=sv.story_id
      WHERE sv.viewer_id=$1 AND sv.viewed_at > NOW() - INTERVAL '30 days' GROUP BY s.user_id
    )
    SELECT s.*, u.username, u.full_name, u.avatar_url, u.is_college_verified,
      COALESCE(vs.strong,0)+COALESCE(vs.weak,0)+COALESCE(ss.svs,0) AS rel_score,
      EXISTS(SELECT 1 FROM story_views sv WHERE sv.story_id=s.id AND sv.viewer_id=$1)::int AS is_viewed
    FROM stories s JOIN users u ON s.user_id=u.id
    LEFT JOIN viewer_signals vs ON vs.creator_id=s.user_id
    LEFT JOIN story_signals  ss ON ss.creator_id=s.user_id
    WHERE s.expires_at > NOW()
      AND (s.user_id=$1 OR COALESCE(u.is_shadowbanned,0)=0)
      AND (s.user_id=$1 OR s.user_id IN (SELECT following_id FROM follows WHERE follower_id=$1 AND status='active'))
      AND (s.visibility = 'normal' OR s.user_id = $1 OR EXISTS (
        SELECT 1 FROM close_mates cm WHERE cm.user_id = s.user_id AND cm.close_mate_id = $1
      ))
      AND s.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$1)
    ORDER BY (s.user_id=$1) DESC,
      (COALESCE(vs.strong,0)+COALESCE(vs.weak,0)+COALESCE(ss.svs,0)) DESC, s.created_at DESC
  `, [userId])

  const grouped: Record<string, any> = {}
  for (const story of stories) {
    if (!grouped[story.user_id]) {
      grouped[story.user_id] = {
        user_id: story.user_id, username: story.username, full_name: story.full_name,
        avatar_url: story.avatar_url, is_college_verified: story.is_college_verified,
        has_unseen: false, rel_score: parseInt(story.rel_score??0), stories: [],
      }
    }
    if (!story.is_viewed) grouped[story.user_id].has_unseen = true
    grouped[story.user_id].stories.push(story)
  }
  return Object.values(grouped).sort((a: any, b: any) =>
    b.has_unseen !== a.has_unseen
      ? (b.has_unseen?1:0)-(a.has_unseen?1:0)
      : b.rel_score - a.rel_score
  )
}

// ─── Suggested accounts ───────────────────────────────────────────────────────
export async function suggestAccounts(userId: string, limit = 10): Promise<any[]> {
  return db.all(`
    WITH viewer AS (SELECT college_id, course, year FROM users WHERE id = $1),
    already_following AS (SELECT following_id FROM follows WHERE follower_id=$1),
    blocked_set AS (
      SELECT blocked_id AS uid FROM blocks WHERE blocker_id=$1
      UNION SELECT blocker_id AS uid FROM blocks WHERE blocked_id=$1
    ),
    hidden_creators AS (SELECT creator_id FROM rec_feedback WHERE user_id=$1 AND action='hide_creator' AND creator_id IS NOT NULL)
    SELECT u.id, u.username, u.full_name, u.avatar_url, u.bio, u.college_name,
      u.college_id, u.course, u.year, u.department, u.followers_count, u.is_college_verified, u.is_private,
      CASE WHEN u.college_id=(SELECT college_id FROM viewer) THEN 10 ELSE 0 END
      + CASE WHEN u.course=(SELECT course FROM viewer) AND (SELECT course FROM viewer) IS NOT NULL THEN 6 ELSE 0 END
      + CASE WHEN u.year=(SELECT year FROM viewer) AND (SELECT year FROM viewer) IS NOT NULL THEN 2 ELSE 0 END
      + COALESCE((SELECT COUNT(*) FROM follows mf WHERE mf.follower_id=u.id AND mf.following_id IN (SELECT following_id FROM already_following) LIMIT 5),0)*3
      + LEAST(5, ROUND(LOG(GREATEST(1,u.followers_count)))) AS suggestion_score,
      CASE
        WHEN u.college_id=(SELECT college_id FROM viewer) AND u.course=(SELECT course FROM viewer) THEN 'Same college & course'
        WHEN u.college_id=(SELECT college_id FROM viewer) THEN 'Same college'
        WHEN u.course=(SELECT course FROM viewer) AND (SELECT course FROM viewer) IS NOT NULL THEN 'Same course'
        ELSE 'Popular on Campnect'
      END AS suggestion_reason
    FROM users u
    WHERE u.is_email_verified=1 AND u.id!=$1
      AND u.id NOT IN (SELECT following_id FROM already_following)
      AND u.id NOT IN (SELECT uid FROM blocked_set)
      AND u.id NOT IN (SELECT creator_id FROM hidden_creators)
    ORDER BY suggestion_score DESC, u.followers_count DESC LIMIT $2
  `, [userId, limit])
}

// ─── Compute trending scores ──────────────────────────────────────────────────
export async function computeTrendingScores(scope: string, whereClause = ''): Promise<void> {
  const posts = await db.all(`
    SELECT p.id, p.created_at,
      COUNT(DISTINCT pl.user_id) FILTER (WHERE pl.created_at > NOW() - INTERVAL '24 hours') AS recent_likes,
      COUNT(DISTINCT c.id)       FILTER (WHERE c.created_at  > NOW() - INTERVAL '24 hours') AS recent_comments,
      COUNT(DISTINCT ps.user_id) FILTER (WHERE ps.created_at > NOW() - INTERVAL '24 hours') AS recent_saves,
      COUNT(DISTINCT pl.user_id)  AS unique_likers,
      COUNT(DISTINCT c.user_id)   AS unique_commenters,
      COUNT(DISTINCT ci.user_id) FILTER (WHERE ci.interaction_type IN ('share','save')) AS unique_sharers
    FROM posts p
    LEFT JOIN post_likes    pl ON pl.post_id=p.id
    LEFT JOIN comments       c ON c.post_id=p.id
    LEFT JOIN post_saves     ps ON ps.post_id=p.id
    LEFT JOIN content_interactions ci ON ci.post_id=p.id
    LEFT JOIN post_classifications pc ON pc.post_id=p.id
    WHERE p.visibility='public'
      AND p.type <> 'glimpse'
      AND p.created_at > NOW() - INTERVAL '7 days'
      AND COALESCE(pc.is_political,0)=0
      AND COALESCE(pc.safety_flag,'none') NOT IN ('high','medium')
      ${whereClause}
    GROUP BY p.id, p.created_at
    HAVING COUNT(DISTINCT pl.user_id)+COUNT(DISTINCT c.id) > 0
    LIMIT 500
  `, [])

  for (const post of posts) {
    const ageHours = Math.max(0.5, (Date.now()-new Date(post.created_at).getTime())/3_600_000)
    const velocity = (
      parseInt(post.recent_likes??0)*1.0 + parseInt(post.recent_comments??0)*2.5 +
      parseInt(post.recent_saves??0)*4.0 + parseInt(post.unique_likers??0)*0.5 +
      parseInt(post.unique_commenters??0)*1.0 + parseInt(post.unique_sharers??0)*3.0
    ) / Math.sqrt(ageHours)
    if (velocity > 0.5) {
      await db.run(`INSERT INTO trending_cache (post_id,scope,trend_score,computed_at) VALUES ($1,$2,$3,NOW())
        ON CONFLICT (post_id,scope) DO UPDATE SET trend_score=EXCLUDED.trend_score,computed_at=NOW()`,
        [post.id, scope, velocity])
    }
  }
}

// ─── Get trending feed ────────────────────────────────────────────────────────
export async function getTrending(
  userId: string, scope: 'campus' | 'network' | 'course', limit = 20, offset = 0,
): Promise<{ posts: any[]; scope: string }> {
  const viewer = await db.one<any>('SELECT college_id, course FROM users WHERE id = $1', [userId])
  const scopeKey =
    scope==='campus'  ? `campus:${viewer?.college_id??'global'}`  :
    scope==='course'  ? `course:${viewer?.course??'global'}`      : 'network'

  const rows = await db.all(`
    SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified,
      tc.trend_score, 'Trending on your campus' AS rec_reason,
      COALESCE(pc.categories,'[]') AS categories
    FROM trending_cache tc
    JOIN posts p ON p.id=tc.post_id JOIN users u ON u.id=p.user_id
    LEFT JOIN post_classifications pc ON pc.post_id=p.id
    WHERE tc.scope=$1 AND tc.computed_at > NOW() - INTERVAL '4 hours'
      AND p.user_id!=$2
      AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$2)
      AND COALESCE(pc.is_political,0)=0
      AND COALESCE(pc.safety_flag,'none') NOT IN ('high','medium')
    ORDER BY tc.trend_score DESC LIMIT $3 OFFSET $4
  `, [scopeKey, userId, limit, offset])

  if (rows.length === 0) {
    const wh = scope==='campus' && viewer?.college_id
      ? `AND p.college_id='${viewer.college_id.replace(/'/g,"''")}'` : ''
    computeTrendingScores(scopeKey, wh).catch(()=>{})
  }

  return {
    posts: rows.map(row => ({
      ...row,
      media: (() => { try { return JSON.parse(row.media??'[]') } catch { return [] } })(),
      tags:  (() => { try { return JSON.parse(row.tags??'[]')  } catch { return [] } })(),
    })),
    scope: scopeKey,
  }
}

// ─── Classify post on creation ────────────────────────────────────────────────
export async function classifyNewPost(postId: string, content: string, tags: string[], type: string): Promise<void> {
  const result = classifyPost(content, tags, type)
  await db.run(
    'INSERT INTO post_classifications (post_id,categories,is_political,is_campus_pol,safety_flag,safety_score,quality_score) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (post_id) DO NOTHING',
    [postId, JSON.stringify(result.categories), result.is_political?1:0,
     result.is_campus_pol?1:0, result.safety_flag, result.safety_score, result.quality_score]
  )
  if (['reel','video'].includes(type)) {
    await db.run('INSERT INTO reel_distribution (post_id,phase,satisfaction_score,test_views,positive_signals) VALUES ($1,\'initial\',0,0,0) ON CONFLICT DO NOTHING', [postId])
  }
}
