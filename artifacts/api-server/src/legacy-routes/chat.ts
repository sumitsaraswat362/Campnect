// @ts-nocheck
import { Router, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { db, withTransaction } from '../legacy-db/index.js'
import { requireAuth } from '../legacy-middleware/auth.js'
import { uploadMessage, assertMediaMagic, sendMediaPolicyError } from '../legacy-middleware/upload.js'
import { groupsRouter } from './groups.js'
import { storeMediaAsset } from '../legacy-services/media.js'
import { enforceUserRestriction } from '../legacy-services/userRestrictions.js'
import { isFreshOnline, privacySettings } from '../legacy-services/userPrivacy.js'
import { activePresence } from '../legacy-services/presence.js'
import { emitUserMessagePreview, emitUserNotification, getIo } from '../legacy-socket/io.js'
import { refreshConversationPreview } from '../legacy-services/conversationPreview.js'
import { fetchLinkPreview } from '../legacy-services/linkPreview.js'
import { dispatchMessageNotifications, messageNotificationContent } from '../legacy-services/messageNotifications.js'
import { createReportWithCase } from '../legacy-services/reporting.js'
import { normalizeOpenMojiSticker } from '../legacy-services/openmoji.js'
import { normalizeGiphyMessageReference, searchGiphy } from '../legacy-services/giphy.js'

export const chatRouter = Router()

chatRouter.post('/messages/:id/report', requireAuth, async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim()
    if (!reason) return res.status(400).json({ success: false, error: 'Reason required.' })
    const message = await db.one<any>(
      `SELECT m.id
       FROM messages m
       JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
       WHERE m.id = $1 AND cm.user_id = $2`,
      [req.params.id, req.user!.userId],
    )
    if (!message) return res.status(404).json({ success: false, error: 'Message not found.' })
    const report = await withTransaction((tx) => createReportWithCase(tx, {
      reporterId: req.user!.userId,
      entityId: message.id,
      entityType: 'message',
      reason,
      description: req.body?.description,
    }))
    return res.status(201).json({ success: true, data: { report_id: report.reportId, case_id: report.caseId } })
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Unable to submit report.' })
  }
})

function messagePreview(type: string, content?: string | null): string {
  if (type === 'text' && content?.startsWith('__POST_SHARE__:')) return 'Shared a post'
  if (type === 'sticker') return 'Sticker'
  if (type === 'gif') return 'GIF'
  return type === 'text' ? (content || '').slice(0, 80) : `[${type}]`
}

// Mount group routes under /chat/groups
chatRouter.use('/groups', groupsRouter)

// GIPHY's credential stays on the server; the client receives only media
// references that have been normalized to approved GIPHY hosts.
chatRouter.get('/giphy', requireAuth, async (req, res) => {
  const kind = req.query.kind === 'sticker' ? 'sticker' : req.query.kind === 'gif' ? 'gif' : null
  if (!kind) return res.status(400).json({ success: false, error: 'Choose GIFs or stickers.' })
  try {
    const results = await searchGiphy(
      kind,
      String(req.query.q || ''),
      Number(req.query.offset || 0),
    )
    return res.set('Cache-Control', 'private, max-age=60').json({ success: true, data: results })
  } catch (error: any) {
    console.error('GIPHY search error:', error?.message || error)
    return res.status(503).json({ success: false, error: 'GIFs and stickers are temporarily unavailable.' })
  }
})

// ─── Search people for messaging ──────────────────────────────────────────────
// Kept separate from global discovery so messaging always searches real users
// by display name or @username and applies the same privacy/block filters.
chatRouter.get('/users/search', requireAuth, async (req, res) => {
  try {
    const query = String(req.query.q || '').trim().toLowerCase()
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50)
    if (query.length < 2) return res.json({ success: true, data: [] })

    const like = `%${query}%`
    const exact = query.replace(/^@/, '')
    const exactLike = `%${exact}%`
    const currentUserId = req.user!.userId

    const people = await db.all(`
      SELECT
        u.id, u.username, u.full_name, u.avatar_url, u.college_name,
        u.is_college_verified, u.is_online, u.last_seen, u.privacy_settings,
        CASE
          WHEN LOWER(u.username) = $1 OR LOWER(u.username) = $2 THEN 100
          WHEN LOWER(u.full_name) = $3 THEN 90
          WHEN LOWER(u.username) LIKE $4 THEN 80
          WHEN LOWER(u.full_name) LIKE $5 THEN 70
          ELSE 50
        END AS relevance_score
      FROM users u
      WHERE u.id <> $6
        AND COALESCE(u.is_email_verified, 0) = 1
        AND COALESCE(u.is_banned, 0) = 0
        AND COALESCE(u.is_suspended, 0) = 0
        AND (
          LOWER(u.username) LIKE $7
          OR LOWER(u.full_name) LIKE $8
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE b.blocker_id = $6 AND b.blocked_id = u.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE b.blocker_id = u.id AND b.blocked_id = $6
        )
      ORDER BY relevance_score DESC, LOWER(u.full_name) ASC
      LIMIT $9
    `, [exact, `@${exact}`, exact, exactLike, like, currentUserId, like, like, limit])

    res.json({
      success: true,
      data: people.map((person: any) => ({
        ...person,
        is_online: privacySettings(person.privacy_settings).showOnlineStatus !== false && isFreshOnline(person.last_seen, person.is_online) ? 1 : 0,
        last_seen: privacySettings(person.privacy_settings).showLastSeen !== false ? person.last_seen : null,
        privacy_settings: undefined,
      })),
    })
  } catch (err: any) {
    console.error('chat user search error:', err.message)
    res.status(500).json({ success: false, error: 'Unable to search people.' })
  }
})

// ─── Link preview for URLs shared in chat ──────────────────────────────────
// Requires auth (like every other chat endpoint) so this cannot be used as an
// open SSRF-probing proxy by unauthenticated callers.
chatRouter.get('/link-preview', requireAuth, async (req, res) => {
  try {
    const url = String(req.query.url || '').trim()
    if (!url) return res.status(400).json({ success: false, error: 'A url is required.' })
    const preview = await fetchLinkPreview(url)
    if (!preview) return res.json({ success: true, data: null })
    res.json({ success: true, data: preview })
  } catch (err: any) {
    console.error('link preview error:', err.message)
    res.json({ success: true, data: null })
  }
})

async function enrichConversation(conv: any, userId: string) {
  if (!conv) return null
  const [members, unreadRow, eventMeta] = await Promise.all([
    db.all(`
      SELECT u.id, u.username, u.full_name, u.avatar_url, u.is_college_verified, u.is_online, u.last_seen, u.privacy_settings, cm.role, cm.tag, cm.admin_rights, cm.last_read_at
      FROM conversation_members cm JOIN users u ON cm.user_id = u.id
      WHERE cm.conversation_id = $1
    `, [conv.id]),
    db.one<any>(`
      SELECT COUNT(*) as count FROM messages
      WHERE conversation_id = $1 AND sender_id != $2
        AND created_at > COALESCE((SELECT last_read_at FROM conversation_members WHERE conversation_id = $3 AND user_id = $4), '1970-01-01')
        AND is_deleted = 0
    `, [conv.id, userId, conv.id, userId]),
    conv.event_id
      ? db.one<any>('SELECT title, cover_url, status FROM events WHERE id = $1', [conv.event_id])
      : null,
  ])
  const me = members.find((m: any) => m.id === userId)
  const other = conv.type === 'private' ? members.find((m: any) => m.id !== userId) : null
  const blockState = other
    ? await db.one<any>(
        `SELECT
           EXISTS(SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2) AS blocked_by_me,
           EXISTS(SELECT 1 FROM blocks WHERE blocker_id = $2 AND blocked_id = $1) AS blocked_me`,
        [userId, other.id],
      )
    : null
  const blockedByMe = Boolean(blockState?.blocked_by_me)
  const blockedMe = Boolean(blockState?.blocked_me)
  return {
    ...conv,
    ...(eventMeta ? {
      type: 'event',
      name: eventMeta.title || conv.name || 'Event chat',
      avatar_url: eventMeta.cover_url || conv.avatar_url || null,
      event_status: eventMeta.status,
    } : {}),
    members: members.map((m: any) => ({
      ...m,
       is_online: m.id === userId || (privacySettings(m.privacy_settings).showOnlineStatus !== false && activePresence.isOnline(m.id)) ? 1 : 0,
      last_seen: m.id === userId || privacySettings(m.privacy_settings).showLastSeen !== false ? m.last_seen : null,
      privacy_settings: undefined,
      admin_rights: parseAdminRights(m.admin_rights),
    })),
    unread_count: Number(unreadRow?.count ?? 0),
    is_muted: Number(me?.is_muted ?? 0),
    is_blocked: blockedByMe || blockedMe,
    blocked_by_me: blockedByMe,
    blocked_me: blockedMe,
  }
}

function parseAdminRights(value: unknown): Record<string, boolean> {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, boolean>
  try { return JSON.parse(String(value)) || {} } catch { return {} }
}

async function isEventChatOpen(conversationId: string, userId?: string): Promise<boolean> {
  const conversation = await db.one<any>(`
    SELECT 1
    FROM conversations c
    WHERE c.id = $1
      AND (
        c.event_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM events e
          WHERE e.id = c.event_id
            AND e.status NOT IN ('cancelled', 'ended')
            AND e.cancelled_at IS NULL
            AND e.ended_at IS NULL
            AND (
              $2::text IS NULL
              OR e.organizer_id = $2
              OR EXISTS (SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = $2)
              OR EXISTS (
                SELECT 1 FROM event_attendees ea
                WHERE ea.event_id = e.id AND ea.user_id = $2 AND ea.status IN ('going', 'interested')
              )
            )
        )
      )
  `, [conversationId, userId || null])
  return Boolean(conversation)
}

async function isPendingPrivateRequestForUser(conversationId: string, userId: string): Promise<boolean> {
  const request = await db.one(`
    SELECT 1
    FROM conversations c
    JOIN message_requests mr ON mr.conversation_id = c.id
    WHERE c.id = $1 AND c.type = 'private'
      AND mr.to_user_id = $2 AND mr.status = 'pending'
  `, [conversationId, userId])
  return Boolean(request)
}

async function isBlockedPrivateConversationForUser(conversationId: string, userId: string): Promise<boolean> {
  const blocked = await db.one(`
    SELECT 1
    FROM conversations c
    JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = $2
    JOIN conversation_members other ON other.conversation_id = c.id AND other.user_id <> $2
    JOIN blocks b ON (b.blocker_id = me.user_id AND b.blocked_id = other.user_id)
                 OR (b.blocker_id = other.user_id AND b.blocked_id = me.user_id)
    WHERE c.id = $1 AND c.type = 'private'
    LIMIT 1
  `, [conversationId, userId])
  return Boolean(blocked)
}

async function blockUnacceptedPrivateRequest(req: any, res: any, next: NextFunction) {
  try {
    if (await isPendingPrivateRequestForUser(req.params.id, req.user!.userId)) {
      return res.status(403).json({ success: false, error: 'This conversation is waiting for your approval.' })
    }
    next()
  } catch {
    res.status(500).json({ success: false, error: 'Unable to access this conversation.' })
  }
}

async function blockClosedEventChat(req: any, res: any, next: NextFunction) {
  try {
    if (!(await isEventChatOpen(req.params.id, req.user!.userId))) {
      return res.status(403).json({ success: false, error: 'Join this active event to access its chat.' })
    }
    next()
  } catch {
    res.status(500).json({ success: false, error: 'Unable to access this conversation.' })
  }
}

// Event conversations are closed as a whole, not just for new messages.
// This protects direct REST access to history, mute, read, and moderation
// actions after an event is cancelled or manually ended.
chatRouter.use('/conversations/:id', requireAuth, blockClosedEventChat, blockUnacceptedPrivateRequest)

async function enrichMessage(msg: any) {
  if (!msg) return null
  const [reactions, replyTo] = await Promise.all([
    db.all('SELECT emoji, COUNT(*) as count FROM message_reactions WHERE message_id = $1 GROUP BY emoji', [msg.id]),
    msg.reply_to_id
      ? db.one('SELECT m.id, m.content, m.type, u.username, u.full_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = $1', [msg.reply_to_id])
      : null,
  ])
  return { ...msg, reactions, reply_to: replyTo }
}

// ─── List conversations ───────────────────────────────────────────────────────
chatRouter.get('/conversations', requireAuth, async (req, res) => {
  try {
    // Membership is durable, but member presence is resolved from the live
    // socket registry. A conditional 304 would reuse an older offline member
    // snapshot when a peer was already connected before this client opened chat.
    res.setHeader('Cache-Control', 'no-store')
    delete req.headers['if-none-match']
    const convs = await db.all(`
      SELECT c.*,
        latest.id AS effective_last_message_id,
        CASE
          WHEN latest.id IS NULL THEN NULL
          WHEN latest.type = 'text' AND latest.content LIKE '__POST_SHARE__:%' THEN 'Shared a post'
          WHEN latest.type = 'text' THEN LEFT(COALESCE(latest.content, ''), 80)
          ELSE '[' || latest.type || ']'
        END AS effective_last_message_preview,
        latest.created_at AS effective_last_message_at
      FROM conversations c
      JOIN conversation_members cm ON c.id = cm.conversation_id
      LEFT JOIN LATERAL (
        SELECT m.id, m.type, m.content, m.created_at
        FROM messages m
        WHERE m.conversation_id = c.id AND m.is_deleted = 0
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE cm.user_id = $1 AND cm.is_archived = 0 AND c.is_request = 0
        AND (c.event_id IS NULL OR EXISTS (
          SELECT 1 FROM events e
          WHERE e.id = c.event_id
            AND e.status NOT IN ('cancelled', 'ended')
            AND e.cancelled_at IS NULL
            AND e.ended_at IS NULL
            AND (
              e.organizer_id = $1
              OR EXISTS (SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = $1)
              OR EXISTS (
                SELECT 1 FROM event_attendees ea
                WHERE ea.event_id = e.id AND ea.user_id = $1 AND ea.status IN ('going', 'interested')
              )
            )
        ))
      ORDER BY COALESCE(latest.created_at, c.created_at) DESC LIMIT 50
    `, [req.user!.userId])
    const normalized = convs.map(c => ({
      ...c,
      last_message_id: c.effective_last_message_id,
      last_message_preview: c.effective_last_message_preview,
      last_message_at: c.effective_last_message_at,
    }))
    const enriched = await Promise.all(normalized.map(c => enrichConversation(c, req.user!.userId)))
    res.json({ success: true, data: enriched })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Message requests inbox ───────────────────────────────────────────────────
chatRouter.get('/requests', requireAuth, async (req, res) => {
  try {
    // Request rows include the same live member presence projection as regular
    // conversations, so they must not be served from a conditional cache.
    res.setHeader('Cache-Control', 'no-store')
    delete req.headers['if-none-match']
    const convs = await db.all(`
      SELECT c.* FROM conversations c
      JOIN message_requests mr ON mr.conversation_id = c.id
      JOIN conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = $1
      WHERE mr.to_user_id = $2 AND mr.status = 'pending' AND cm.is_archived = 0
        AND NOT EXISTS (
          SELECT 1
          FROM blocks b
          WHERE (b.blocker_id = $2 AND b.blocked_id = mr.from_user_id)
             OR (b.blocker_id = mr.from_user_id AND b.blocked_id = $2)
        )
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 50
    `, [req.user!.userId, req.user!.userId])
    const enriched = await Promise.all(convs.map(c => enrichConversation(c, req.user!.userId)))
    res.json({ success: true, data: enriched, meta: { count: convs.length } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Accept message request ───────────────────────────────────────────────────
chatRouter.post('/requests/:convId/accept', requireAuth, async (req, res) => {
  try {
    const request = await db.one<any>("SELECT * FROM message_requests WHERE conversation_id = $1 AND to_user_id = $2 AND status = 'pending'", [req.params.convId, req.user!.userId])
    if (!request) return res.status(403).json({ success: false, error: 'No pending request found for you on this conversation.' })
    const blocked = await db.one(
      'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1',
      [req.user!.userId, request.from_user_id],
    )
    if (blocked) return res.status(403).json({ success: false, error: 'You cannot accept a request from this user.' })
    await Promise.all([
      db.run('UPDATE conversations SET is_request = 0 WHERE id = $1', [req.params.convId]),
      db.run("UPDATE message_requests SET status = 'accepted' WHERE conversation_id = $1 AND to_user_id = $2", [req.params.convId, req.user!.userId]),
    ])
    const notificationId = uuidv4()
    await db.run("INSERT INTO notifications (id,user_id,type,actor_id,entity_id,entity_type,content) VALUES ($1,$2,'message_request_accepted',$3,$4,'conversation','accepted your message request')",
      [notificationId, request.from_user_id, req.user!.userId, req.params.convId])
    emitUserNotification(request.from_user_id, { id: notificationId, user_id: request.from_user_id, actor_id: req.user!.userId, type: 'message_request_accepted', entity_type: 'conversation', entity_id: req.params.convId, content: 'accepted your message request', is_read: 0, created_at: new Date().toISOString() })
    const conv = await db.one('SELECT * FROM conversations WHERE id = $1', [req.params.convId])
    res.json({ success: true, data: await enrichConversation(conv, req.user!.userId) })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Decline message request ──────────────────────────────────────────────────
chatRouter.post('/requests/:convId/decline', requireAuth, async (req, res) => {
  try {
    const request = await db.one<any>("SELECT * FROM message_requests WHERE conversation_id = $1 AND to_user_id = $2 AND status = 'pending'", [req.params.convId, req.user!.userId])
    if (!request) return res.status(403).json({ success: false, error: 'No pending request found for you on this conversation.' })
    await Promise.all([
      db.run('UPDATE conversation_members SET is_archived = 1 WHERE conversation_id = $1 AND user_id = $2', [req.params.convId, req.user!.userId]),
      db.run("UPDATE message_requests SET status = 'declined' WHERE conversation_id = $1 AND to_user_id = $2", [req.params.convId, req.user!.userId]),
    ])
    const notificationId = uuidv4()
    await db.run("INSERT INTO notifications (id,user_id,type,actor_id,entity_id,entity_type,content) VALUES ($1,$2,'message_request_declined',$3,$4,'conversation','declined your message request')",
      [notificationId, request.from_user_id, req.user!.userId, req.params.convId])
    emitUserNotification(request.from_user_id, { id: notificationId, user_id: request.from_user_id, actor_id: req.user!.userId, type: 'message_request_declined', entity_type: 'conversation', entity_id: req.params.convId, content: 'declined your message request', is_read: 0, created_at: new Date().toISOString() })
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Block message request ────────────────────────────────────────────────────
chatRouter.post('/requests/:convId/block', requireAuth, async (req, res) => {
  try {
    const request = await db.one<any>(
      "SELECT * FROM message_requests WHERE conversation_id = $1 AND to_user_id = $2 AND status = 'pending'",
      [req.params.convId, req.user!.userId],
    )
    if (!request) return res.status(403).json({ success: false, error: 'No pending request found for you on this conversation.' })
    await withTransaction(async (tx) => {
      const follows = await tx.all<any>(
        `SELECT follower_id, following_id, status
         FROM follows
         WHERE (follower_id = $1 AND following_id = $2)
            OR (follower_id = $2 AND following_id = $1)`,
        [req.user!.userId, request.from_user_id],
      )
      await tx.run('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user!.userId, request.from_user_id])
      await tx.run('DELETE FROM follows WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)', [req.user!.userId, request.from_user_id])
      for (const follow of follows) {
        if (follow.status !== 'active') continue
        await tx.run('UPDATE users SET following_count = GREATEST(0, following_count - 1) WHERE id = $1', [follow.follower_id])
        await tx.run('UPDATE users SET followers_count = GREATEST(0, followers_count - 1) WHERE id = $1', [follow.following_id])
      }
      await tx.run('UPDATE conversations SET is_request = 0 WHERE id = $1', [req.params.convId])
      await tx.run('UPDATE conversation_members SET is_archived = 0 WHERE conversation_id = $1', [req.params.convId])
      await tx.run("UPDATE message_requests SET status = 'blocked', reviewed_at = NOW(), reviewed_by = $1 WHERE conversation_id = $2 AND to_user_id = $3", [req.user!.userId, req.params.convId, req.user!.userId])
    })
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Unable to block this user.' }) }
})

// ─── Get or Create conversation ───────────────────────────────────────────────
chatRouter.post('/conversations', requireAuth, async (req, res) => {
  try {
    if (await enforceUserRestriction(req, res, 'messaging')) return
    const { userId: targetId, type = 'private', name, memberIds } = req.body

    if (type === 'private') {
      if (!targetId) return res.status(400).json({ success: false, error: 'Target user ID required.' })
      if (targetId === req.user!.userId) return res.status(400).json({ success: false, error: 'Cannot message yourself.' })
      const blocked = await db.one(
        'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1',
        [req.user!.userId, targetId],
      )
      if (blocked) return res.status(403).json({ success: false, error: 'You cannot message this user.' })

      const target = await db.one<any>('SELECT who_can_message FROM users WHERE id = $1', [targetId])
      if (target) {
        const wcm = target.who_can_message || 'everyone'
        if (wcm === 'none') return res.status(403).json({ success: false, error: 'This user is not accepting messages.' })
        if (wcm === 'followers') {
          const isFollower = await db.one("SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'active'", [req.user!.userId, targetId])
          if (!isFollower) return res.status(403).json({ success: false, error: 'This user only accepts messages from people they follow.' })
        }
      }

      const existing = await db.one<any>(`
        SELECT c.id FROM conversations c
        JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = $1
        JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = $2
        WHERE c.type = 'private' LIMIT 1
      `, [req.user!.userId, targetId])

      if (existing) {
        const conv = await db.one('SELECT * FROM conversations WHERE id = $1', [existing.id])
        return res.json({ success: true, data: await enrichConversation(conv, req.user!.userId) })
      }

      const [senderFollowsTarget, targetFollowsSender] = await Promise.all([
        db.one("SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'active'", [req.user!.userId, targetId]),
        db.one("SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'active'", [targetId, req.user!.userId]),
      ])
      const isRequest = (!senderFollowsTarget && !targetFollowsSender) ? 1 : 0

      const creation = await withTransaction(async (tx) => {
        const lockKey = [req.user!.userId, targetId].sort().join(':')
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey])
        const lockedExisting = await tx.one<any>(`
          SELECT c.id FROM conversations c
          JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = $1
          JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = $2
          WHERE c.type = 'private' LIMIT 1
        `, [req.user!.userId, targetId])
        if (lockedExisting) return { id: lockedExisting.id, created: false }

        const id = uuidv4()
        await tx.run('INSERT INTO conversations (id, type, created_by, members_count, is_request) VALUES ($1,$2,$3,2,$4)', [id, 'private', req.user!.userId, isRequest])
        await tx.run('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1,$2,$3)', [id, req.user!.userId, 'member'])
        await tx.run('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1,$2,$3)', [id, targetId, 'member'])
        if (isRequest) {
          await tx.run('INSERT INTO message_requests (id, from_user_id, to_user_id, conversation_id) VALUES ($1,$2,$3,$4)', [uuidv4(), req.user!.userId, targetId, id])
        }
        return { id, created: true }
      })

      const conv = await db.one('SELECT * FROM conversations WHERE id = $1', [creation.id])
      return res.status(creation.created ? 201 : 200).json({ success: true, data: await enrichConversation(conv, req.user!.userId) })
    }

    // Group chat
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Group name required.' })
    const members: string[] = [req.user!.userId, ...(memberIds || []).filter((id: string) => id !== req.user!.userId)]
    const convId = uuidv4()
    await withTransaction(async (tx) => {
      await tx.run('INSERT INTO conversations (id, type, name, created_by, members_count) VALUES ($1,$2,$3,$4,$5)', [convId, 'group', name.trim(), req.user!.userId, members.length])
      for (const memberId of members) {
        await tx.run('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1,$2,$3)', [convId, memberId, memberId === req.user!.userId ? 'owner' : 'member'])
      }
    })
    const conv = await db.one('SELECT * FROM conversations WHERE id = $1', [convId])
    res.status(201).json({ success: true, data: await enrichConversation(conv, req.user!.userId) })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Get conversation ─────────────────────────────────────────────────────────
chatRouter.get('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const member = await db.one('SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    if (!member) return res.status(404).json({ success: false, error: 'Conversation not found.' })
    const conv = await db.one('SELECT * FROM conversations WHERE id = $1', [req.params.id])
    if (!(await isEventChatOpen(req.params.id))) return res.status(403).json({ success: false, error: 'This event chat is closed.' })
    res.json({ success: true, data: await enrichConversation(conv, req.user!.userId) })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

chatRouter.post('/conversations/:id/mute', requireAuth, async (req, res) => {
  try {
    const member = await db.one('SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    if (!member) return res.status(403).json({ success: false, error: 'Not a member.' })
    if (!(await isEventChatOpen(req.params.id))) return res.status(403).json({ success: false, error: 'This event chat is closed.' })
    const muted = req.body?.muted ? 1 : 0
    await db.run('UPDATE conversation_members SET is_muted = $1 WHERE conversation_id = $2 AND user_id = $3', [muted, req.params.id, req.user!.userId])
    res.json({ success: true, data: { is_muted: muted } })
  } catch { res.status(500).json({ success: false, error: 'Unable to update mute setting.' }) }
})

// ─── Messages ─────────────────────────────────────────────────────────────────
chatRouter.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const member = await db.one('SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    if (!member) return res.status(403).json({ success: false, error: 'Not a member.' })
    if (!(await isEventChatOpen(req.params.id))) return res.status(403).json({ success: false, error: 'This event chat is closed.' })
    const { before, limit = '30' } = req.query
    let sql = 'SELECT m.*, u.username, u.full_name, u.avatar_url, u.is_college_verified FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ?'
    const params: any[] = [req.params.id]
    if (before) { sql += ' AND m.created_at < ?'; params.push(before) }
    sql += ' ORDER BY m.created_at DESC LIMIT ?'
    params.push(Number(limit))
    const [finalSql, finalParams] = db.toPos(sql, params)
    const messages = (await db.all(finalSql, finalParams)).reverse()
    const enriched = await Promise.all(messages.map(m => enrichMessage(m)))
    await db.run('UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    res.json({ success: true, data: enriched, meta: { hasMore: messages.length === Number(limit) } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Send message (REST fallback) ─────────────────────────────────────────────
chatRouter.post('/conversations/:id/messages', requireAuth, uploadMessage.single('media'), async (req, res) => {
  try {
    if (await enforceUserRestriction(req, res, 'messaging')) return
    if (await isBlockedPrivateConversationForUser(req.params.id, req.user!.userId)) {
      return res.status(403).json({ success: false, error: 'Unblock this account before sending a message.' })
    }
    const member = await db.one('SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    if (!member) return res.status(403).json({ success: false, error: 'Not a member.' })
    const { type = 'text', content, reply_to_id } = req.body
    if (type === 'text' && !content?.trim()) return res.status(400).json({ success: false, error: 'Message content required.' })
    const normalizedOpenMojiSticker = type === 'sticker' ? normalizeOpenMojiSticker(content) : null
    const normalizedGiphy = type === 'gif' || type === 'sticker' ? normalizeGiphyMessageReference(content) : null
    const normalizedProviderContent = normalizedGiphy || normalizedOpenMojiSticker
    if ((type === 'sticker' && (!normalizedProviderContent || req.file)) || (type === 'gif' && (!normalizedGiphy || req.file))) {
      return res.status(400).json({ success: false, error: 'Choose a valid GIPHY GIF or sticker.' })
    }
    if (req.file) await assertMediaMagic(req.file)
    const msgId = uuidv4()
    await withTransaction(async (tx) => {
      const mediaUrl = req.file
        ? await storeMediaAsset(tx, req.file, req.user!.userId, 'message_media', msgId)
        : null
      await tx.run('INSERT INTO messages (id, conversation_id, sender_id, type, content, media_url, media_type, reply_to_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [msgId, req.params.id, req.user!.userId, type, normalizedProviderContent || content?.trim() || null, mediaUrl, req.file?.mimetype || null, reply_to_id || null])
      const preview = messagePreview(type, normalizedProviderContent || content)
      await tx.run('UPDATE conversations SET last_message_id = $1, last_message_preview = $2, last_message_at = NOW(), updated_at = NOW() WHERE id = $3', [msgId, preview, req.params.id])
    })
    const msg = await db.one('SELECT m.*, u.username, u.full_name, u.avatar_url FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = $1', [msgId])
    const enrichedMessage = await enrichMessage(msg)
    getIo()?.to(`conv:${req.params.id}`).emit('message:new', enrichedMessage)
    const preview = messagePreview(type, content)
    const recipients = await db.all<any>(`
      SELECT cm.user_id
      FROM conversation_members cm
      JOIN conversations c ON c.id = cm.conversation_id
      WHERE cm.conversation_id = $1 AND cm.user_id <> $2
        AND (
          c.event_id IS NULL
          OR EXISTS (
            SELECT 1 FROM events e
            WHERE e.id = c.event_id
              AND e.status NOT IN ('cancelled', 'ended')
              AND e.cancelled_at IS NULL
              AND e.ended_at IS NULL
              AND (
                e.organizer_id = cm.user_id
                OR EXISTS (SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = cm.user_id)
                OR EXISTS (
                  SELECT 1 FROM event_attendees ea
                  WHERE ea.event_id = e.id AND ea.user_id = cm.user_id AND ea.status IN ('going', 'interested')
                )
              )
          )
        )
    `, [req.params.id, req.user!.userId])
    for (const recipient of recipients) {
      const contentText = messageNotificationContent(type, content)
      emitUserMessagePreview(recipient.user_id, {
        id: msgId,
        conversation_id: req.params.id,
        actor_id: req.user!.userId,
        actor_name: msg.full_name,
        actor_username: msg.username,
        actor_avatar: msg.avatar_url || null,
        message_type: type,
        content: contentText,
        created_at: new Date().toISOString(),
      })
    }
    await dispatchMessageNotifications({
      conversationId: req.params.id,
      messageId: msgId,
      senderId: req.user!.userId,
      sender: { username: msg.username, full_name: msg.full_name, avatar_url: msg.avatar_url },
      recipientIds: recipients.map((recipient) => recipient.user_id),
      content: messageNotificationContent(type, content),
    })
    res.status(201).json({ success: true, data: enrichedMessage })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Group message seen-by list ───────────────────────────────────────────────
chatRouter.get('/messages/:id/seen-by', requireAuth, async (req, res) => {
  try {
    const message = await db.one<any>(
      'SELECT id, conversation_id, sender_id, created_at FROM messages WHERE id = $1 AND is_deleted = 0',
      [req.params.id],
    )
    if (!message) return res.status(404).json({ success: false, error: 'Message not found.' })
    if (!(await isEventChatOpen(message.conversation_id))) return res.status(403).json({ success: false, error: 'This event chat is closed.' })

    const member = await db.one(
      'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [message.conversation_id, req.user!.userId],
    )
    if (!member) return res.status(403).json({ success: false, error: 'Not a member.' })

    const conversation = await db.one<any>(
      'SELECT type FROM conversations WHERE id = $1',
      [message.conversation_id],
    )
    if (conversation?.type !== 'group') {
      return res.status(400).json({ success: false, error: 'Seen-by is only available in group chats.' })
    }

    const seenBy = await db.all<any>(`
      SELECT u.id, u.username, u.full_name, u.avatar_url, cm.last_read_at AS seen_at
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = $1
        AND cm.user_id <> $2
        AND cm.last_read_at IS NOT NULL
        AND cm.last_read_at >= $3
      ORDER BY cm.last_read_at DESC, LOWER(u.full_name) ASC
    `, [message.conversation_id, message.sender_id, message.created_at])

    res.json({
      success: true,
      data: {
        message_id: message.id,
        seen_by: seenBy,
        count: seenBy.length,
      },
    })
  } catch (err: any) {
    console.error('group message seen-by error:', err.message)
    res.status(500).json({ success: false, error: 'Unable to load seen-by list.' })
  }
})

// ─── Edit message ─────────────────────────────────────────────────────────────
chatRouter.patch('/messages/:id', requireAuth, async (req, res) => {
  try {
    const msg = await db.one<any>('SELECT * FROM messages WHERE id = $1', [req.params.id])
    if (!msg) return res.status(404).json({ success: false, error: 'Message not found.' })
    if (!(await isEventChatOpen(msg.conversation_id))) return res.status(403).json({ success: false, error: 'This event chat is closed.' })
    if (msg.sender_id !== req.user!.userId) return res.status(403).json({ success: false, error: 'Not authorized.' })
    const { content } = req.body
    if (!content?.trim()) return res.status(400).json({ success: false, error: 'Content required.' })
    await db.run('UPDATE messages SET content = $1, is_edited = 1, updated_at = NOW() WHERE id = $2', [content.trim(), req.params.id])
    res.json({ success: true, data: { id: req.params.id, content: content.trim(), is_edited: 1 } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Delete message ───────────────────────────────────────────────────────────
chatRouter.delete('/messages/:id', requireAuth, async (req, res) => {
  try {
    const msg = await db.one<any>('SELECT * FROM messages WHERE id = $1', [req.params.id])
    if (!msg) return res.status(404).json({ success: false, error: 'Message not found.' })
    if (!(await isEventChatOpen(msg.conversation_id))) return res.status(403).json({ success: false, error: 'This event chat is closed.' })
    if (msg.sender_id !== req.user!.userId) return res.status(403).json({ success: false, error: 'Not authorized.' })
    const { forEveryone } = req.body
    await withTransaction(async (tx) => {
      if (forEveryone) {
        await tx.run('UPDATE messages SET is_deleted = 1, content = NULL, media_url = NULL, updated_at = NOW() WHERE id = $1', [req.params.id])
      } else {
        await tx.run('DELETE FROM messages WHERE id = $1', [req.params.id])
      }
      await refreshConversationPreview(tx, msg.conversation_id)
    })
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── React to message ─────────────────────────────────────────────────────────
chatRouter.post('/messages/:id/react', requireAuth, async (req, res) => {
  try {
    const { emoji } = req.body
    if (!emoji) return res.status(400).json({ success: false, error: 'Emoji required.' })
    const msg = await db.one<any>('SELECT conversation_id, sender_id FROM messages WHERE id = $1', [req.params.id])
    if (!msg) return res.status(404).json({ success: false, error: 'Message not found.' })
    if (!(await isEventChatOpen(msg.conversation_id))) return res.status(403).json({ success: false, error: 'This event chat is closed.' })
    const isMember = await db.one('SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [msg.conversation_id, req.user!.userId])
    if (!isMember) return res.status(403).json({ success: false, error: 'Not a member of this conversation.' })
    const existing = await db.one<any>('SELECT emoji FROM message_reactions WHERE message_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    const shouldNotify = !existing || existing.emoji !== emoji
    if (existing?.emoji === emoji) {
      await db.run('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    } else {
      await db.run('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1,$2,$3) ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji', [req.params.id, req.user!.userId, emoji])
    }
    const reactions = await db.all('SELECT emoji, COUNT(*) as count FROM message_reactions WHERE message_id = $1 GROUP BY emoji', [req.params.id])
    if (shouldNotify && msg.sender_id !== req.user!.userId) {
      const actor = await db.one<any>('SELECT username, full_name, avatar_url FROM users WHERE id = $1', [req.user!.userId])
      const notificationId = uuidv4()
      const content = `reacted ${emoji} to your message`
      await db.run(
        `INSERT INTO notifications (id,user_id,type,actor_id,entity_id,entity_type,content)
         VALUES ($1,$2,'message_reaction',$3,$4,'message',$5)`,
        [notificationId, msg.sender_id, req.user!.userId, req.params.id, content],
      )
      emitUserNotification(msg.sender_id, {
        id: notificationId,
        user_id: msg.sender_id,
        actor_id: req.user!.userId,
        actor_name: actor?.full_name || actor?.username || 'Someone',
        actor_username: actor?.username || null,
        actor_avatar: actor?.avatar_url || null,
        type: 'message_reaction',
        entity_type: 'message',
        entity_id: req.params.id,
        content,
        is_read: 0,
        created_at: new Date().toISOString(),
      })
    }
    res.json({ success: true, data: reactions })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Pin / Unpin message ──────────────────────────────────────────────────────
chatRouter.post('/messages/:id/pin', requireAuth, async (req, res) => {
  try {
    const msg = await db.one<any>('SELECT conversation_id FROM messages WHERE id = $1', [req.params.id])
    if (!msg) return res.status(404).json({ success: false, error: 'Message not found.' })
    if (!(await isEventChatOpen(msg.conversation_id))) return res.status(403).json({ success: false, error: 'This event chat is closed.' })
    const [member, conv] = await Promise.all([
      db.one<any>('SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [msg.conversation_id, req.user!.userId]),
      db.one<any>('SELECT type FROM conversations WHERE id = $1', [msg.conversation_id]),
    ])
    if (!member) return res.status(403).json({ success: false, error: 'Not a member of this conversation.' })
    if (conv?.type !== 'private' && member.role === 'member') return res.status(403).json({ success: false, error: 'Only admins and owners can pin messages in groups.' })
    await db.run('UPDATE messages SET is_pinned = 1 WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

chatRouter.delete('/messages/:id/pin', requireAuth, async (req, res) => {
  try {
    const msg = await db.one<any>('SELECT conversation_id FROM messages WHERE id = $1', [req.params.id])
    if (!msg) return res.status(404).json({ success: false, error: 'Message not found.' })
    if (!(await isEventChatOpen(msg.conversation_id))) return res.status(403).json({ success: false, error: 'This event chat is closed.' })
    const [member, conv] = await Promise.all([
      db.one<any>('SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [msg.conversation_id, req.user!.userId]),
      db.one<any>('SELECT type FROM conversations WHERE id = $1', [msg.conversation_id]),
    ])
    if (!member) return res.status(403).json({ success: false, error: 'Not a member of this conversation.' })
    if (conv?.type !== 'private' && member.role === 'member') return res.status(403).json({ success: false, error: 'Only admins and owners can unpin messages in groups.' })
    await db.run('UPDATE messages SET is_pinned = 0 WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// ─── Archive / unarchive conversation ────────────────────────────────────────
chatRouter.post('/conversations/:id/archive', requireAuth, async (req, res) => {
  try {
    await db.run('UPDATE conversation_members SET is_archived = 1 WHERE conversation_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

chatRouter.delete('/conversations/:id/archive', requireAuth, async (req, res) => {
  try {
    await db.run('UPDATE conversation_members SET is_archived = 0 WHERE conversation_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})
