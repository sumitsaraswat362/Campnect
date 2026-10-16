// @ts-nocheck
import { Router } from 'express'
import { db } from '../legacy-db/index.js'
import { requireAuth } from '../legacy-middleware/auth.js'

export const notificationsRouter = Router()

notificationsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const { type, page = '1', limit = '30' } = req.query
    const offset = (Number(page) - 1) * Number(limit)

    let sql = `
      SELECT n.*,
        CASE
          WHEN p.type = 'glimpse' THEN 'glimpse'
          WHEN p.type = 'reel' THEN 'clip'
          ELSE n.entity_type
        END AS entity_type,
        u.username as actor_username, u.full_name as actor_name, u.avatar_url as actor_avatar
      FROM notifications n
      LEFT JOIN users u ON n.actor_id = u.id
      LEFT JOIN posts p ON n.entity_id = p.id
      WHERE n.user_id = ? AND n.type <> 'message'
    `
    const params: any[] = [req.user!.userId]
    if (type === 'messages') {
      sql += ` AND n.type IN ('message', 'message_request', 'message_request_accepted', 'message_request_declined', 'message_reaction')`
    } else if (type === 'follow') {
      sql += ` AND n.type IN ('follow', 'follow_request')`
    } else if (type && type !== 'all') {
      sql += ' AND n.type = ?'
      params.push(type)
    }
    sql += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), offset)

    const [finalSql, finalParams] = db.toPos(sql, params)
    const [notifications, unreadRow] = await Promise.all([
      db.all(finalSql, finalParams),
      db.one<any>("SELECT COUNT(*) as c FROM notifications WHERE user_id = $1 AND is_read = 0 AND type <> 'message'", [req.user!.userId]),
    ])

    res.json({ success: true, data: notifications, meta: { unread_count: Number(unreadRow?.c ?? 0) } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

notificationsRouter.post('/read-all', requireAuth, async (req, res) => {
  try {
    await db.run('UPDATE notifications SET is_read = 1 WHERE user_id = $1', [req.user!.userId])
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

notificationsRouter.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    await db.run('UPDATE notifications SET is_read = 1 WHERE id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

notificationsRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})
