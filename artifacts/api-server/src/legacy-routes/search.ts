// @ts-nocheck
import { Router } from 'express'
import { db } from '../legacy-db/index.js'
import { optionalAuth } from '../legacy-middleware/auth.js'

export const searchRouter = Router()

// ─── Enhanced search with relevance ranking ────────────────────────────────────
searchRouter.get('/', optionalAuth, async (req, res) => {
  try {
    const { q = '', type = 'all', college, department, verified, limit = '20', page = '1' } = req.query
    const query = (q as string).trim()
    const offset = (Number(page) - 1) * Number(limit)
    const lq = `%${query.toLowerCase()}%`

    const results: Record<string, any[]> = {}

    if (!query && type !== 'colleges') {
      // No query: return trending hashtags and discover suggestions
      results.trending = [
        '#Hackathon', '#Internship', '#Placement', '#CampusLife', '#FestSeason',
        '#StudyGroup', '#OpenSource', '#AIProjects', '#CollegeEvents', '#Research',
        '#StudentLife', '#TechTalk', '#Collaboration', '#CrossCollege', '#Innovation',
      ]
      return res.json({ success: true, data: results, query: '' })
    }

    const viewerCollegeId   = req.user ? (await db.one<any>('SELECT college_id, course FROM users WHERE id = $1', [req.user.userId])) : null
    const viewerCollege     = viewerCollegeId?.college_id ?? null
    const viewerCourse      = viewerCollegeId?.course     ?? null
    const userId            = req.user?.userId ?? null

    const promises: Promise<void>[] = []

    if (type === 'all' || type === 'users') {
      promises.push((async () => {
        const blockFilter = userId ? `AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = '${userId}')` : ''
        let sql = `
          SELECT
            u.id, u.username, u.full_name, u.avatar_url, u.bio, u.college_name,
            u.department, u.course, u.year, u.semester, u.is_college_verified,
            u.followers_count, u.account_type, u.is_private,
            EXISTS (
              SELECT 1 FROM follows viewer_follow
              WHERE viewer_follow.follower_id = ?::text
                AND viewer_follow.following_id = u.id
                AND viewer_follow.status = 'active'
            ) AS is_following,
            (
              SELECT viewer_follow.status FROM follows viewer_follow
              WHERE viewer_follow.follower_id = ?::text
                AND viewer_follow.following_id = u.id
              LIMIT 1
            ) AS follow_status,
             CASE WHEN LOWER(u.username)  = LOWER(?::text) THEN 100
                  WHEN LOWER(u.full_name) = LOWER(?::text) THEN 90
                  WHEN LOWER(u.username)  LIKE ?::text      THEN 70
                  WHEN LOWER(u.full_name)  LIKE ?::text      THEN 60
                 ELSE 30 END
             + CASE WHEN ?::text IS NOT NULL AND u.college_id = ?::text THEN 20 ELSE 0 END
             + CASE WHEN ?::text IS NOT NULL AND LOWER(u.course) = LOWER(?::text) THEN 10 ELSE 0 END
            + LEAST(10, ROUND(LOG(GREATEST(1, u.followers_count)))) AS relevance_score
          FROM users u
          WHERE u.is_email_verified = 1
             AND COALESCE(u.is_admin, 0) = 0
             AND COALESCE(u.is_deactivated, 0) = 0
             AND COALESCE(u.is_banned, 0) = 0
             AND COALESCE(u.is_suspended, 0) = 0
             AND COALESCE((SELECT usc.search_visibility FROM user_shadowban_controls usc WHERE usc.user_id = u.id), COALESCE(u.is_shadowbanned, 0)) = 0
            AND (
              LOWER(u.full_name)   LIKE ? OR LOWER(u.username) LIKE ?
              OR LOWER(u.college_name) LIKE ? OR LOWER(u.department) LIKE ?
              OR LOWER(u.course)   LIKE ? OR LOWER(u.bio) LIKE ?
            )
            ${blockFilter}
        `
        const params: any[] = [
          userId, userId,
          query, query, lq, lq,
          viewerCollege, viewerCollege,
          viewerCourse, viewerCourse,
          lq, lq, lq, lq, lq, lq,
        ]
        if (college)            { sql += ' AND LOWER(u.college_name) LIKE ?'; params.push(`%${(college as string).toLowerCase()}%`) }
        if (department)         { sql += ' AND LOWER(u.department)   LIKE ?'; params.push(`%${(department as string).toLowerCase()}%`) }
        if (verified === 'true') { sql += ' AND u.is_college_verified = 1' }
        sql += ' ORDER BY relevance_score DESC, u.followers_count DESC LIMIT ? OFFSET ?'
        params.push(Number(limit), offset)
        const [finalSql, finalParams] = db.toPos(sql, params)
        results.users = await db.all(finalSql, finalParams)
      })())
    }

    if (type === 'all' || type === 'posts') {
      promises.push((async () => {
        const blockFilter = userId ? `AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = '${userId}')` : ''
        results.posts = await db.all(`
          SELECT p.*, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified,
            COALESCE(pc.categories,'[]') AS categories
          FROM posts p
          JOIN users u ON p.user_id = u.id
          LEFT JOIN post_classifications pc ON pc.post_id = p.id
          WHERE p.visibility = 'public'
             AND p.type <> 'glimpse'
             AND COALESCE(u.is_admin, 0) = 0
             AND COALESCE(u.is_deactivated, 0) = 0
             AND COALESCE(u.is_banned, 0) = 0
             AND COALESCE(u.is_suspended, 0) = 0
             AND COALESCE((SELECT usc.search_visibility FROM user_shadowban_controls usc WHERE usc.user_id = u.id), COALESCE(u.is_shadowbanned, 0)) = 0
            AND (LOWER(p.content) LIKE $1 OR LOWER(p.tags::text) LIKE $1)
            AND COALESCE(pc.is_political, 0) = 0
            AND COALESCE(pc.safety_flag, 'none') != 'high'
            ${blockFilter}
          ORDER BY
            (p.saves_count*4 + p.shares_count*5 + p.comments_count*2 + p.likes_count) DESC,
            p.created_at DESC
          LIMIT $2 OFFSET $3
        `, [lq, Number(limit), offset])
        results.posts = results.posts.map(p => ({
          ...p,
          media: (() => { try { return JSON.parse(p.media ?? '[]') } catch { return [] } })(),
          tags:  (() => { try { return JSON.parse(p.tags  ?? '[]') } catch { return [] } })(),
        }))
      })())
    }

    if (type === 'all' || type === 'communities') {
      promises.push((async () => {
        results.communities = await db.all(`
          SELECT id, name, slug, description, category, avatar_url, cover_url, members_count, posts_count, is_private
           FROM communities c
           JOIN users owner ON owner.id = c.created_by
           LEFT JOIN user_shadowban_controls usc ON usc.user_id = c.created_by
           WHERE (LOWER(c.name) LIKE $1 OR LOWER(c.description) LIKE $2 OR LOWER(c.category) LIKE $3)
             AND COALESCE(usc.group_visibility, COALESCE(owner.is_shadowbanned, 0)) = 0
             AND COALESCE(owner.is_deactivated, 0) = 0
             AND COALESCE(owner.is_banned, 0) = 0
             AND COALESCE(owner.is_suspended, 0) = 0
          ORDER BY members_count DESC LIMIT $4 OFFSET $5
        `, [lq, lq, lq, Number(limit), offset])
      })())
    }

    if (type === 'all' || type === 'events') {
      promises.push((async () => {
        results.events = await db.all(`
          SELECT e.*, u.username AS organizer_username, u.full_name AS organizer_name, u.avatar_url AS organizer_avatar
           FROM events e JOIN users u ON e.organizer_id = u.id
           WHERE (LOWER(e.title) LIKE $1 OR LOWER(e.description) LIKE $2 OR LOWER(e.location) LIKE $3)
              AND COALESCE((SELECT usc.event_visibility FROM user_shadowban_controls usc WHERE usc.user_id = u.id), COALESCE(u.is_shadowbanned, 0)) = 0
              AND COALESCE(u.is_deactivated, 0) = 0
              AND COALESCE(u.is_banned, 0) = 0
              AND COALESCE(u.is_suspended, 0) = 0
            AND e.starts_at > NOW()
          ORDER BY e.starts_at ASC LIMIT $4 OFFSET $5
        `, [lq, lq, lq, Number(limit), offset])
      })())
    }

    if (type === 'all' || type === 'colleges') {
      promises.push((async () => {
        results.colleges = await db.all(`
          SELECT c.id, c.name, c.short_name, c.country, c.city, c.logo_url, c.students_count, c.about,
            COUNT(u.id)::integer AS member_count
          FROM colleges c
          JOIN users u ON u.college_id = c.id AND u.is_email_verified = 1
          ${query ? 'WHERE LOWER(c.name) LIKE $1 OR LOWER(c.short_name) LIKE $2 OR LOWER(c.city) LIKE $3' : ''}
          GROUP BY c.id
          ORDER BY member_count DESC, c.students_count DESC, c.name ASC
          LIMIT $${query ? 4 : 1} OFFSET $${query ? 5 : 2}
        `, query
          ? [lq, lq, lq, Number(limit), offset]
          : [Number(limit), offset])
      })())
    }

    await Promise.all(promises)
    res.json({ success: true, data: results, query })
  } catch (err: any) {
    console.error('search error:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})
