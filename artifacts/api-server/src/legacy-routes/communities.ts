// @ts-nocheck
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { db, withTransaction } from '../legacy-db/index.js'
import { requireAuth, optionalAuth } from '../legacy-middleware/auth.js'
import { enforceUserRestriction } from '../legacy-services/userRestrictions.js'
import { uploadGroup, assertImageMagic, sendMediaPolicyError } from '../legacy-middleware/upload.js'
import { storeMediaAsset } from '../legacy-services/media.js'

export const communitiesRouter = Router()
const CATEGORIES = ['Technology', 'Design', 'Entrepreneurship', 'Sports', 'Music', 'Gaming', 'Photography', 'Academic', 'Arts', 'Wellness', 'Social', 'Other']

communitiesRouter.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, q, limit = '20', page = '1', joined } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    let sql = `SELECT c.*
      FROM communities c
      LEFT JOIN user_shadowban_controls usc ON usc.user_id = c.created_by
      JOIN users owner ON owner.id = c.created_by
      WHERE COALESCE(usc.group_visibility, COALESCE(owner.is_shadowbanned, 0)) = 0
        AND COALESCE(owner.is_deactivated, 0) = 0
        AND COALESCE(owner.is_banned, 0) = 0
        AND COALESCE(owner.is_suspended, 0) = 0`
    const params: any[] = []
    if (q) { sql += ' AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?)'; params.push(`%${(q as string).toLowerCase()}%`, `%${(q as string).toLowerCase()}%`) }
    if (category) { sql += ' AND category = ?'; params.push(category) }
    if (joined && req.user) { sql += ' AND id IN (SELECT community_id FROM community_members WHERE user_id = ?)'; params.push(req.user.userId) }
    sql += ' ORDER BY c.created_at DESC, c.members_count DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), offset)
    const [finalSql, finalParams] = db.toPos(sql, params)
    const communities = await db.all<any>(finalSql, finalParams)
    const enriched = await Promise.all(communities.map(async c => ({
      ...c,
      is_member: req.user ? !!(await db.one('SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2', [c.id, req.user!.userId])) : false,
    })))
    res.json({ success: true, data: enriched, categories: CATEGORIES })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

communitiesRouter.get('/categories', async (_req, res) => {
  try {
    const cats = await Promise.all(CATEGORIES.map(async cat => ({
      name: cat,
      count: Number((await db.one<any>('SELECT COUNT(*) as c FROM communities WHERE category = $1', [cat]))?.c ?? 0),
    })))
    res.json({ success: true, data: cats })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

communitiesRouter.get('/:slug', optionalAuth, async (req, res) => {
  try {
    const community = await db.one<any>('SELECT * FROM communities WHERE slug = $1 OR id = $1', [req.params.slug])
    if (!community) return res.status(404).json({ success: false, error: 'Community not found.' })
    const [memberRole, topMembers] = await Promise.all([
      req.user ? db.one<any>('SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2', [community.id, req.user.userId]) : null,
      db.all(`
        SELECT u.id, u.username, u.full_name, u.avatar_url, u.is_college_verified, cm.role
        FROM community_members cm JOIN users u ON cm.user_id = u.id
        WHERE cm.community_id = $1 ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 10
      `, [community.id]),
    ])
    res.json({ success: true, data: { ...community, member_role: memberRole?.role || null, is_member: !!memberRole, top_members: topMembers } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

communitiesRouter.post('/', requireAuth, async (req, res) => {
  try {
    if (await enforceUserRestriction(req, res, 'groups')) return
    const schema = z.object({
      name: z.string().min(3).max(60).trim(),
      description: z.string().max(500).default(''),
      category: z.enum(CATEGORIES as [string, ...string[]]),
      is_private: z.boolean().default(false),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors[0].message })
    const { name, description, category, is_private } = parsed.data
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + uuidv4().slice(0, 6)
    const existing = await db.one('SELECT id FROM communities WHERE LOWER(name) = $1', [name.toLowerCase()])
    if (existing) return res.status(409).json({ success: false, error: 'A community with this name already exists.' })
    const user = await db.one<any>('SELECT college_id FROM users WHERE id = $1', [req.user!.userId])
    const commId = uuidv4()
    await db.run('INSERT INTO communities (id, name, slug, description, category, is_private, created_by, college_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [commId, name, slug, description, category, is_private ? 1 : 0, req.user!.userId, user?.college_id || null])
    await db.run('INSERT INTO community_members (community_id, user_id, role) VALUES ($1,$2,$3)', [commId, req.user!.userId, 'owner'])
    const community = await db.one('SELECT * FROM communities WHERE id = $1', [commId])
    res.status(201).json({ success: true, data: community })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

communitiesRouter.patch('/:id', requireAuth, uploadGroup.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]), async (req, res) => {
  try {
    const role = await db.one<any>(
      'SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2',
      [req.params.id, req.user!.userId],
    )
    if (!role || !['owner', 'admin'].includes(role.role)) {
      return res.status(403).json({ success: false, error: 'Admin or owner required.' })
    }
    const files = (req.files || {}) as Record<string, Express.Multer.File[]>
    const avatar = files.avatar?.[0]
    const cover = files.cover?.[0]
    if (avatar) await assertImageMagic(avatar)
    if (cover) await assertImageMagic(cover)

    const schema = z.object({
      name: z.string().min(3).max(60).trim().optional(),
      description: z.string().max(500).optional(),
      category: z.enum(CATEGORIES as [string, ...string[]]).optional(),
      is_private: z.union([z.boolean(), z.string()]).optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors[0].message })
    if (!Object.keys(parsed.data).length && !avatar && !cover) {
      return res.status(400).json({ success: false, error: 'Nothing to update.' })
    }

    await withTransaction(async (tx) => {
      const fields: string[] = []
      const values: any[] = []
      if (parsed.data.name !== undefined) { fields.push('name = ?'); values.push(parsed.data.name) }
      if (parsed.data.description !== undefined) { fields.push('description = ?'); values.push(parsed.data.description.trim()) }
      if (parsed.data.category !== undefined) { fields.push('category = ?'); values.push(parsed.data.category) }
      if (parsed.data.is_private !== undefined) {
        fields.push('is_private = ?')
        values.push(parsed.data.is_private === true || parsed.data.is_private === 'true' || parsed.data.is_private === '1' ? 1 : 0)
      }
      if (avatar) {
        fields.push('avatar_url = ?')
        values.push(await storeMediaAsset(tx, avatar, req.user!.userId, 'community_avatar', req.params.id))
      }
      if (cover) {
        fields.push('cover_url = ?')
        values.push(await storeMediaAsset(tx, cover, req.user!.userId, 'community_cover', req.params.id))
      }
      values.push(req.params.id)
      const [sql, params] = tx.toPos(`UPDATE communities SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values)
      await tx.run(sql, params)
    })
    const community = await db.one<any>('SELECT * FROM communities WHERE id = $1', [req.params.id])
    res.json({ success: true, data: { ...community, member_role: role.role, is_member: true } })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    res.status(err?.status || 500).json({ success: false, error: err?.status ? err.message : 'Internal server error.' })
  }
})

communitiesRouter.post('/:id/join', requireAuth, async (req, res) => {
  try {
    if (await enforceUserRestriction(req, res, 'groups')) return
    const community = await db.one('SELECT * FROM communities WHERE id = $1', [req.params.id])
    if (!community) return res.status(404).json({ success: false, error: 'Community not found.' })
    const existing = await db.one('SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    if (existing) return res.status(409).json({ success: false, error: 'Already a member.' })
    await db.run('INSERT INTO community_members (community_id, user_id, role) VALUES ($1,$2,$3)', [req.params.id, req.user!.userId, 'member'])
    await db.run('UPDATE communities SET members_count = members_count + 1 WHERE id = $1', [req.params.id])
    res.json({ success: true, message: 'Joined community.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

communitiesRouter.delete('/:id/join', requireAuth, async (req, res) => {
  try {
    const existing = await db.one<any>('SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    if (!existing) return res.status(404).json({ success: false, error: 'Not a member.' })
    if (existing.role === 'owner') return res.status(400).json({ success: false, error: 'Owner cannot leave. Transfer ownership first.' })
    await db.run('DELETE FROM community_members WHERE community_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    await db.run('UPDATE communities SET members_count = GREATEST(1, members_count - 1) WHERE id = $1', [req.params.id])
    res.json({ success: true, message: 'Left community.' })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

communitiesRouter.get('/:id/members', optionalAuth, async (req, res) => {
  try {
    const { limit = '20', page = '1' } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    const members = await db.all(`
      SELECT u.id, u.username, u.full_name, u.avatar_url, u.college_name, u.is_college_verified, cm.role, cm.joined_at
      FROM community_members cm JOIN users u ON cm.user_id = u.id
      WHERE cm.community_id = $1
      ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cm.joined_at ASC
      LIMIT $2 OFFSET $3
    `, [req.params.id, Number(limit), offset])
    res.json({ success: true, data: members })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

communitiesRouter.get('/:id/posts', optionalAuth, async (req, res) => {
  try {
    const { limit = '15', page = '1' } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    const posts = await db.all(`
      SELECT p.*, u.username, u.full_name, u.avatar_url, u.is_college_verified
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
       WHERE p.community_id = $1
          AND p.type <> 'glimpse'
         AND COALESCE(usc.group_visibility, COALESCE(u.is_shadowbanned, 0)) = 0
       ORDER BY p.created_at DESC LIMIT $2 OFFSET $3
    `, [req.params.id, Number(limit), offset])
    res.json({ success: true, data: posts })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})
