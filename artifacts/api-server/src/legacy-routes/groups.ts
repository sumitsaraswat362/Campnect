// @ts-nocheck
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, withTransaction } from '../legacy-db/index.js'
import { requireAuth } from '../legacy-middleware/auth.js'
import { uploadGroup, assertImageMagic, sendMediaPolicyError } from '../legacy-middleware/upload.js'
import { getIo } from '../legacy-socket/io.js'
import { storeMediaAsset } from '../legacy-services/media.js'
import { enforceUserRestriction } from '../legacy-services/userRestrictions.js'

export const groupsRouter = Router()

const ROLE_LEVEL: Record<string, number> = { member: 0, moderator: 1, admin: 2, owner: 3 }
const CONVERSATION_COLUMNS = `
  id, type, name, description, avatar_url, created_by,
  last_message_id, last_message_preview, last_message_at, members_count,
  is_request, invite_link_active, requires_approval, pinned_message_id,
  created_at, updated_at
`

async function getConversation(conversationId: string) {
  return db.one<any>(
    `SELECT ${CONVERSATION_COLUMNS} FROM conversations WHERE id = $1`,
    [conversationId],
  )
}

async function getMemberRole(userId: string, convId: string): Promise<string | null> {
  const m = await db.one<any>('SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [convId, userId])
  return m?.role ?? null
}

async function hasRole(userId: string, convId: string, min: 'admin' | 'moderator' | 'owner'): Promise<boolean> {
  const role = await getMemberRole(userId, convId)
  if (!role) return false
  return (ROLE_LEVEL[role] ?? 0) >= ROLE_LEVEL[min]
}

async function enrichGroup(conv: any, userId: string) {
  if (!conv) return null
  const [members, unreadRow, myRole] = await Promise.all([
    db.all(`
      SELECT u.id, u.username, u.full_name, u.avatar_url, u.is_college_verified, u.is_online, u.last_seen, cm.role, cm.tag, cm.admin_rights, cm.joined_at
      FROM conversation_members cm JOIN users u ON cm.user_id = u.id
      WHERE cm.conversation_id = $1
      ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, u.full_name
    `, [conv.id]),
    db.one<any>(`
      SELECT COUNT(*) as count FROM messages
      WHERE conversation_id = $1 AND sender_id != $2
        AND created_at > COALESCE((SELECT last_read_at FROM conversation_members WHERE conversation_id = $3 AND user_id = $4), '1970-01-01')
        AND is_deleted = 0
    `, [conv.id, userId, conv.id, userId]),
    getMemberRole(userId, conv.id),
  ])
  return { ...conv, members: members.map((m: any) => ({ ...m, admin_rights: parseAdminRights(m.admin_rights) })), unread_count: Number(unreadRow?.count ?? 0), my_role: myRole }
}

function parseAdminRights(value: unknown): Record<string, boolean> {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, boolean>
  try { return JSON.parse(String(value)) || {} } catch { return {} }
}

// ─── Create group ─────────────────────────────────────────────────────────────
groupsRouter.post('/', requireAuth, uploadGroup.single('avatar'), async (req, res) => {
  try {
    if (await enforceUserRestriction(req, res, 'groups')) return
    if (req.file) await assertImageMagic(req.file)
    const { name, description = '', memberIds } = req.body
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Group name required.' })
    const parsed: string[] = typeof memberIds === 'string' ? JSON.parse(memberIds) : (memberIds || [])
    const members = [req.user!.userId, ...parsed.filter((id: string) => id !== req.user!.userId)]
    const convId = uuidv4()
    await withTransaction(async (tx) => {
      const avatarUrl = req.file
        ? await storeMediaAsset(tx, req.file, req.user!.userId, 'group_avatar', convId)
        : null
      await tx.run('INSERT INTO conversations (id, type, name, description, avatar_url, created_by, members_count) VALUES ($1,$2,$3,$4,$5,$6,$7)', [convId, 'group', name.trim(), description.trim(), avatarUrl, req.user!.userId, members.length])
      for (const memberId of members) {
        await tx.run('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1,$2,$3)', [convId, memberId, memberId === req.user!.userId ? 'owner' : 'member'])
      }
      const sysId = uuidv4()
      await tx.run('INSERT INTO messages (id, conversation_id, sender_id, type, content) VALUES ($1,$2,$3,$4,$5)', [sysId, convId, req.user!.userId, 'system', 'Group created'])
      await tx.run("UPDATE conversations SET last_message_id = $1, last_message_preview = 'Group created', last_message_at = NOW(), updated_at = NOW() WHERE id = $2", [sysId, convId])
    })
    const conv = await getConversation(convId)
    res.status(201).json({ success: true, data: await enrichGroup(conv, req.user!.userId) })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Update group settings ────────────────────────────────────────────────────
groupsRouter.patch('/:id', requireAuth, uploadGroup.single('avatar'), async (req, res) => {
  try {
    if (!(await hasRole(req.user!.userId, req.params.id, 'admin'))) return res.status(403).json({ success: false, error: 'Admin or owner required.' })
    if (req.file) await assertImageMagic(req.file)
    const { name, description, requires_approval } = req.body
    const fields: string[] = []
    const vals: any[] = []
    if (name?.trim())               { fields.push('name = ?');               vals.push(name.trim()) }
    if (description !== undefined)  { fields.push('description = ?');        vals.push(description) }
    if (requires_approval !== undefined) { fields.push('requires_approval = ?'); vals.push(Number(requires_approval)) }
    if (req.file)                   { fields.push('avatar_url = ?') }
    if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update.' })
    fields.push('updated_at = NOW()')
    await withTransaction(async (tx) => {
      if (req.file) {
        const avatarUrl = await storeMediaAsset(tx, req.file, req.user!.userId, 'group_avatar', req.params.id)
        vals.push(avatarUrl)
        fields.splice(fields.indexOf('avatar_url = ?'), 1, 'avatar_url = ?')
      }
      vals.push(req.params.id)
      const [sql, params] = tx.toPos(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`, vals)
      await tx.run(sql, params)
    })
    const conv = await getConversation(req.params.id)
    const data = await enrichGroup(conv, req.user!.userId)
    getIo()?.to(`conv:${req.params.id}`).emit('group:updated', data)
    res.json({ success: true, data })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Generate invite link ─────────────────────────────────────────────────────
groupsRouter.post('/:id/invite-link', requireAuth, async (req, res) => {
  try {
    if (!(await hasRole(req.user!.userId, req.params.id, 'admin'))) return res.status(403).json({ success: false, error: 'Admin or owner required.' })
    const token = uuidv4().replace(/-/g, '')
    await db.run('UPDATE conversations SET invite_link = $1, invite_link_active = 1 WHERE id = $2', [token, req.params.id])
    res.json({ success: true, data: { token } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

groupsRouter.delete('/:id/invite-link', requireAuth, async (req, res) => {
  try {
    if (!(await hasRole(req.user!.userId, req.params.id, 'admin'))) return res.status(403).json({ success: false, error: 'Admin or owner required.' })
    await db.run('UPDATE conversations SET invite_link_active = 0 WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Join preview (public) ────────────────────────────────────────────────────
groupsRouter.get('/join/:token', async (req, res) => {
  try {
    const conv = await db.one<any>(
      `SELECT id, type, name, description, avatar_url, created_by, members_count, requires_approval
       FROM conversations
       WHERE invite_link = $1 AND invite_link_active = 1 AND type = 'group'`,
      [req.params.token],
    )
    if (!conv) return res.status(404).json({ success: false, error: 'Invite link is invalid or has expired.' })
    const countRow = await db.one<any>('SELECT COUNT(*) as c FROM conversation_members WHERE conversation_id = $1', [conv.id])
    res.json({ success: true, data: { id: conv.id, name: conv.name, description: conv.description, avatar_url: conv.avatar_url, members_count: Number(countRow?.c ?? 0), requires_approval: conv.requires_approval } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Join via invite link ─────────────────────────────────────────────────────
groupsRouter.post('/join/:token', requireAuth, async (req, res) => {
  try {
    if (await enforceUserRestriction(req, res, 'groups')) return
    const conv = await db.one<any>(
      `SELECT id, type, name, description, avatar_url, created_by, members_count, requires_approval
       FROM conversations
       WHERE invite_link = $1 AND invite_link_active = 1 AND type = 'group'`,
      [req.params.token],
    )
    if (!conv) return res.status(404).json({ success: false, error: 'Invite link is invalid or has expired.' })
    const existing = await db.one('SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [conv.id, req.user!.userId])
    if (existing) return res.json({ success: true, data: await enrichGroup(conv, req.user!.userId), already_member: true })
    if (conv.requires_approval) {
      const existingReq = await db.one<any>('SELECT * FROM join_requests WHERE conversation_id = $1 AND user_id = $2', [conv.id, req.user!.userId])
      if (existingReq?.status === 'pending') return res.json({ success: true, requested: true, message: 'Your request is pending admin approval.' })
      await db.run('INSERT INTO join_requests (id, conversation_id, user_id, status) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status', [uuidv4(), conv.id, req.user!.userId, 'pending'])
      return res.json({ success: true, requested: true, message: 'Join request sent. Waiting for admin approval.' })
    }
    await db.run('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1,$2,$3)', [conv.id, req.user!.userId, 'member'])
    await db.run('UPDATE conversations SET members_count = members_count + 1 WHERE id = $1', [conv.id])
    const sysId = uuidv4()
    const user = await db.one<any>('SELECT full_name FROM users WHERE id = $1', [req.user!.userId])
    await db.run('INSERT INTO messages (id, conversation_id, sender_id, type, content) VALUES ($1,$2,$3,$4,$5)', [sysId, conv.id, req.user!.userId, 'system', `${user?.full_name || 'Someone'} joined via invite link`])
    await db.run('UPDATE conversations SET last_message_id = $1, last_message_at = NOW() WHERE id = $2', [sysId, conv.id])
    const updated = await getConversation(conv.id)
    const data = await enrichGroup(updated, req.user!.userId)
    getIo()?.to(`conv:${conv.id}`).emit('group:member_joined', { conversationId: conv.id, userId: req.user!.userId })
    res.status(201).json({ success: true, data })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── List members ─────────────────────────────────────────────────────────────
groupsRouter.get('/:id/members', requireAuth, async (req, res) => {
  try {
    if (!(await getMemberRole(req.user!.userId, req.params.id))) return res.status(403).json({ success: false, error: 'Not a member.' })
    const members = await db.all(`
      SELECT u.id, u.username, u.full_name, u.avatar_url, u.is_college_verified, u.is_online, u.last_seen, cm.role, cm.tag, cm.admin_rights, cm.joined_at
      FROM conversation_members cm JOIN users u ON cm.user_id = u.id
      WHERE cm.conversation_id = $1
      ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, u.full_name
    `, [req.params.id])
    res.json({ success: true, data: members })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Add members ──────────────────────────────────────────────────────────────
groupsRouter.post('/:id/members', requireAuth, async (req, res) => {
  try {
    if (await enforceUserRestriction(req, res, 'groups')) return
    if (!(await hasRole(req.user!.userId, req.params.id, 'admin'))) return res.status(403).json({ success: false, error: 'Admin or owner required.' })
    const { userIds }: { userIds: string[] } = req.body
    if (!userIds?.length) return res.status(400).json({ success: false, error: 'userIds required.' })
    let added = 0
    for (const uid of userIds) {
      const already = await db.one('SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [req.params.id, uid])
      if (!already) { await db.run('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1,$2,$3)', [req.params.id, uid, 'member']); added++ }
    }
    await db.run('UPDATE conversations SET members_count = members_count + $1 WHERE id = $2', [added, req.params.id])
    const members = await db.all('SELECT u.id, u.username, u.full_name, u.avatar_url, u.is_college_verified, u.is_online, cm.role FROM conversation_members cm JOIN users u ON cm.user_id = u.id WHERE cm.conversation_id = $1', [req.params.id])
    getIo()?.to(`conv:${req.params.id}`).emit('group:members_added', { conversationId: req.params.id, userIds })
    res.json({ success: true, data: members, added })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Remove member / leave ────────────────────────────────────────────────────
groupsRouter.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const { id: convId, userId: targetId } = req.params
    const myRole = await getMemberRole(req.user!.userId, convId)
    if (!myRole) return res.status(403).json({ success: false, error: 'Not a member.' })
    const isSelf = targetId === req.user!.userId
    if (!isSelf) {
      const targetRole = await getMemberRole(targetId, convId)
      if ((ROLE_LEVEL[myRole] ?? 0) <= (ROLE_LEVEL[targetRole ?? 'member'] ?? 0)) return res.status(403).json({ success: false, error: 'Cannot remove a member with equal or higher role.' })
    }
    if (isSelf && myRole === 'owner') return res.status(400).json({ success: false, error: 'Owner cannot leave. Transfer ownership or delete the group first.' })
    await db.run('DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [convId, targetId])
    await db.run('UPDATE conversations SET members_count = GREATEST(0, members_count - 1) WHERE id = $1', [convId])
    const user = await db.one<any>('SELECT full_name FROM users WHERE id = $1', [targetId])
    const sysId = uuidv4()
    await db.run('INSERT INTO messages (id, conversation_id, sender_id, type, content) VALUES ($1,$2,$3,$4,$5)', [sysId, convId, req.user!.userId, 'system', `${user?.full_name || 'Someone'} ${isSelf ? 'left the group' : 'was removed from the group'}`])
    await db.run('UPDATE conversations SET last_message_id = $1, last_message_at = NOW() WHERE id = $2', [sysId, convId])
    getIo()?.to(`conv:${convId}`).emit('group:member_removed', { conversationId: convId, userId: targetId })
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Change member role ───────────────────────────────────────────────────────
groupsRouter.patch('/:id/members/:userId/role', requireAuth, async (req, res) => {
  try {
    const { id: convId, userId: targetId } = req.params
    const { role, rights = {} } = req.body
    const validRoles = ['member', 'moderator', 'admin']
    if (!validRoles.includes(role)) return res.status(400).json({ success: false, error: 'Invalid role.' })
    const myRole = await getMemberRole(req.user!.userId, convId)
    if (!myRole || ROLE_LEVEL[myRole] < ROLE_LEVEL['owner']) return res.status(403).json({ success: false, error: 'Only owners can change roles.' })
    const targetRole = await getMemberRole(targetId, convId)
    if (!targetRole) return res.status(404).json({ success: false, error: 'User is not a member.' })
    if (targetRole === 'owner') return res.status(400).json({ success: false, error: 'Cannot change owner role.' })
    const allowedRights = ['change_group_info', 'delete_messages', 'ban_users', 'invite_users', 'pin_messages', 'manage_calls']
    const cleanRights: Record<string, boolean> = {}
    for (const key of allowedRights) cleanRights[key] = Boolean(rights?.[key])
    await db.run('UPDATE conversation_members SET role = $1, admin_rights = $2 WHERE conversation_id = $3 AND user_id = $4', [role, JSON.stringify(role === 'admin' ? cleanRights : {}), convId, targetId])
    getIo()?.to(`conv:${convId}`).emit('group:role_changed', { conversationId: convId, userId: targetId, role, admin_rights: role === 'admin' ? cleanRights : {} })
    res.json({ success: true, data: { userId: targetId, role, admin_rights: role === 'admin' ? cleanRights : {} } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Custom member tag ────────────────────────────────────────────────────────
groupsRouter.patch('/:id/members/:userId/tag', requireAuth, async (req, res) => {
  try {
    const { id: convId, userId: targetId } = req.params
    const myRole = await getMemberRole(req.user!.userId, convId)
    if (!myRole || !['owner', 'admin'].includes(myRole)) {
      return res.status(403).json({ success: false, error: 'Admin or owner required.' })
    }
    const targetRole = await getMemberRole(targetId, convId)
    if (!targetRole) return res.status(404).json({ success: false, error: 'User is not a member.' })
    if (targetRole === 'owner' && myRole !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only the owner can tag the owner.' })
    }
    const tag = String(req.body?.tag || '').trim()
    if (tag.length > 10) return res.status(400).json({ success: false, error: 'Tags must be 10 characters or fewer.' })
    await db.run('UPDATE conversation_members SET tag = $1 WHERE conversation_id = $2 AND user_id = $3', [tag, convId, targetId])
    getIo()?.to(`conv:${convId}`).emit('group:tag_changed', { conversationId: convId, userId: targetId, tag })
    res.json({ success: true, data: { userId: targetId, tag } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Unable to update member tag.' })
  }
})

// ─── Shared media ─────────────────────────────────────────────────────────────
groupsRouter.get('/:id/media', requireAuth, async (req, res) => {
  try {
    if (!(await getMemberRole(req.user!.userId, req.params.id))) return res.status(403).json({ success: false, error: 'Not a member.' })
    const { limit = '50', before } = req.query
    let sql = "SELECT id, media_url, type, created_at, sender_id FROM messages WHERE conversation_id = ? AND type IN ('image','video') AND is_deleted = 0"
    const params: any[] = [req.params.id]
    if (before) { sql += ' AND created_at < ?'; params.push(before) }
    sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(Number(limit))
    const [finalSql, finalParams] = db.toPos(sql, params)
    res.json({ success: true, data: await db.all(finalSql, finalParams) })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

groupsRouter.get('/:id/files', requireAuth, async (req, res) => {
  try {
    if (!(await getMemberRole(req.user!.userId, req.params.id))) return res.status(403).json({ success: false, error: 'Not a member.' })
    const { limit = '50', before } = req.query
    let sql = "SELECT id, media_url, type, content, created_at, sender_id FROM messages WHERE conversation_id = ? AND type = 'file' AND is_deleted = 0"
    const params: any[] = [req.params.id]
    if (before) { sql += ' AND created_at < ?'; params.push(before) }
    sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(Number(limit))
    const [finalSql, finalParams] = db.toPos(sql, params)
    res.json({ success: true, data: await db.all(finalSql, finalParams) })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

groupsRouter.get('/:id/links', requireAuth, async (req, res) => {
  try {
    if (!(await getMemberRole(req.user!.userId, req.params.id))) return res.status(403).json({ success: false, error: 'Not a member.' })
    const { limit = '100' } = req.query
    const msgs = await db.all<any>("SELECT id, content, created_at, sender_id FROM messages WHERE conversation_id = $1 AND type = 'text' AND content LIKE '%http%' AND is_deleted = 0 ORDER BY created_at DESC LIMIT $2", [req.params.id, Number(limit)])
    const urlRe = /https?:\/\/[^\s]+/g
    const links: any[] = []
    for (const m of msgs) { const found = m.content?.match(urlRe) || []; for (const url of found) links.push({ url, messageId: m.id, created_at: m.created_at, sender_id: m.sender_id }) }
    res.json({ success: true, data: links.slice(0, Number(limit)) })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Join requests ────────────────────────────────────────────────────────────
groupsRouter.get('/:id/join-requests', requireAuth, async (req, res) => {
  try {
    if (!(await hasRole(req.user!.userId, req.params.id, 'admin'))) return res.status(403).json({ success: false, error: 'Admin or owner required.' })
    const requests = await db.all(`
      SELECT jr.*, u.username, u.full_name, u.avatar_url, u.is_college_verified
      FROM join_requests jr JOIN users u ON jr.user_id = u.id
      WHERE jr.conversation_id = $1 AND jr.status = 'pending' ORDER BY jr.requested_at DESC
    `, [req.params.id])
    res.json({ success: true, data: requests })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

groupsRouter.post('/:id/join-requests/:reqId/approve', requireAuth, async (req, res) => {
  try {
    if (!(await hasRole(req.user!.userId, req.params.id, 'admin'))) return res.status(403).json({ success: false, error: 'Admin or owner required.' })
    const request = await db.one<any>("SELECT * FROM join_requests WHERE id = $1 AND conversation_id = $2 AND status = 'pending'", [req.params.reqId, req.params.id])
    if (!request) return res.status(404).json({ success: false, error: 'Request not found.' })
    await db.run('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [req.params.id, request.user_id, 'member'])
    await db.run('UPDATE conversations SET members_count = members_count + 1 WHERE id = $1', [req.params.id])
    await db.run("UPDATE join_requests SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1 WHERE id = $2", [req.user!.userId, req.params.reqId])
    const user = await db.one<any>('SELECT full_name FROM users WHERE id = $1', [request.user_id])
    const sysId = uuidv4()
    await db.run('INSERT INTO messages (id, conversation_id, sender_id, type, content) VALUES ($1,$2,$3,$4,$5)', [sysId, req.params.id, req.user!.userId, 'system', `${user?.full_name || 'Someone'} joined the group`])
    await db.run('UPDATE conversations SET last_message_id = $1, last_message_at = NOW() WHERE id = $2', [sysId, req.params.id])
    getIo()?.to(`conv:${req.params.id}`).emit('group:member_joined', { conversationId: req.params.id, userId: request.user_id })
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

groupsRouter.post('/:id/join-requests/:reqId/reject', requireAuth, async (req, res) => {
  try {
    if (!(await hasRole(req.user!.userId, req.params.id, 'admin'))) return res.status(403).json({ success: false, error: 'Admin or owner required.' })
    const request = await db.one<any>("SELECT * FROM join_requests WHERE id = $1 AND conversation_id = $2 AND status = 'pending'", [req.params.reqId, req.params.id])
    if (!request) return res.status(404).json({ success: false, error: 'Request not found.' })
    await db.run("UPDATE join_requests SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $1 WHERE id = $2", [req.user!.userId, req.params.reqId])
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Delete group ─────────────────────────────────────────────────────────────
groupsRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    if ((await getMemberRole(req.user!.userId, req.params.id)) !== 'owner') return res.status(403).json({ success: false, error: 'Only the owner can delete the group.' })
    getIo()?.to(`conv:${req.params.id}`).emit('group:deleted', { conversationId: req.params.id })
    await db.run('DELETE FROM conversations WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})
