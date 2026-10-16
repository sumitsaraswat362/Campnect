// @ts-nocheck
import { Server as SocketServer } from 'socket.io'
import { Server as HttpServer } from 'http'
import { verifyToken } from '../legacy-middleware/auth.js'
import { db, withTransaction } from '../legacy-db/index.js'
import { durableMediaUrl } from '../legacy-services/media.js'
import { v4 as uuidv4 } from 'uuid'
import { emitUserMessagePreview, setIo } from './io.js'
import { refreshConversationPreview } from '../legacy-services/conversationPreview.js'
import { dispatchMessageNotifications, messageNotificationContent } from '../legacy-services/messageNotifications.js'
import { activePresence } from '../legacy-services/presence.js'
import { normalizeOpenMojiSticker } from '../legacy-services/openmoji.js'
import { normalizeGiphyMessageReference } from '../legacy-services/giphy.js'

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_SIGNAL_BYTES = 16 * 1024
// Capacitor Android uses the configured HTTPS local origin, while older
// runtimes may use capacitor://localhost or http://localhost.
const localSocketOrigins = new Set([
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
])
const configuredSocketOrigins = new Set(
  [
    ...String(process.env.CAMPNECT_ORIGIN || '').split(','),
    ...String(process.env.CORS_ORIGINS || '').split(','),
    ...String(process.env.ADMIN_PANEL_ORIGIN || '').split(','),
    ...String(process.env.REPLIT_DOMAINS || '').split(',').map((domain) => domain ? `https://${domain}` : ''),
    process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '',
  ].map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean),
)

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

function validCallContext(data: any, targetRequired = false): boolean {
  return Boolean(data && typeof data === 'object' && validId(data.conversationId) && validId(data.callId)
    && (!targetRequired || validId(data.targetUserId)))
}

function validSignal(signalType: unknown, signal: unknown): boolean {
  if (!['offer', 'answer', 'ice'].includes(String(signalType)) || !signal || typeof signal !== 'object' || Array.isArray(signal)) return false
  try {
    if (Buffer.byteLength(JSON.stringify(signal), 'utf8') > MAX_SIGNAL_BYTES) return false
  } catch { return false }
  if (signalType === 'offer' || signalType === 'answer') {
    return typeof (signal as any).type === 'string'
      && typeof (signal as any).sdp === 'string'
      && (signal as any).sdp.length > 0
      && (signal as any).sdp.length <= MAX_SIGNAL_BYTES
  }
  return typeof (signal as any).candidate === 'string'
    && (signal as any).candidate.length <= 8192
    && ((signal as any).sdpMid === null || typeof (signal as any).sdpMid === 'string')
    && ((signal as any).sdpMLineIndex === null || Number.isInteger((signal as any).sdpMLineIndex))
}
function messagePreview(type: string, content?: string | null): string {
  if (type === 'text' && content?.startsWith('__POST_SHARE__:')) return 'Shared a post'
  if (type === 'sticker') return 'Sticker'
  if (type === 'gif') return 'GIF'
  return type === 'text' ? (content || '').slice(0, 80) : `[${type}]`
}

export function initSocket(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin(origin, callback) {
        // Browser same-origin deployments are included via their explicitly
        // configured Replit/Campnect domain. Native Socket.IO clients normally
        // send no Origin and are authenticated by the handshake below.
        if (!origin || localSocketOrigins.has(origin) || configuredSocketOrigins.has(origin.replace(/\/+$/, ''))) return callback(null, true)
        callback(new Error('Origin not allowed'))
      },
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  })

  // ─── Auth middleware ──────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token as string
      if (!token || typeof token !== 'string') return next(new Error('Authentication required'))
      const payload = verifyToken(token)
      if (!payload?.userId || payload.type === 'refresh' || !validId(payload.userId)) return next(new Error('Authentication required'))
      const userRow = await db.one<any>(
        `SELECT full_name, avatar_url FROM users
         WHERE id = $1 AND COALESCE(is_banned, 0) = 0
           AND COALESCE(is_deactivated, 0) = 0 AND COALESCE(is_suspended, 0) = 0`,
        [payload.userId],
      )
      if (!userRow) return next(new Error('Authentication required'))
      socket.data.userId = payload.userId
      socket.data.username = payload.username
      socket.data.fullName  = userRow?.full_name  ?? payload.username
      socket.data.avatarUrl = userRow?.avatar_url ?? null
      next()
    } catch (err) {
      next(new Error('Authentication required'))
    }
  })

  setIo(io)
  const callHistoryEvents = new Set<string>()
  const presenceTransitions = new Map<string, Promise<void>>()

  function queuePresenceTransition(userId: string, task: () => Promise<void>) {
    const previous = presenceTransitions.get(userId) || Promise.resolve()
    const next = previous.catch(() => {}).then(task).catch(() => {}).finally(() => {
      if (presenceTransitions.get(userId) === next) presenceTransitions.delete(userId)
    })
    presenceTransitions.set(userId, next)
    return next
  }

  function logPresence(event: string, userId: string, socketId: string, connectionCount: number, lastSeen?: string) {
    if (process.env.NODE_ENV !== 'development') return
    console.info('[PRESENCE]', { event, userId, socketId, activeConnections: connectionCount, online: connectionCount > 0, ...(lastSeen ? { lastSeen } : {}) })
  }

  async function emitPresenceToConversationPeers(
    userId: string,
    payload: { userId: string; online: boolean; lastSeen?: string },
  ) {
    const peers = await db.all<{ user_id: string }>(
      `SELECT DISTINCT peer.user_id
       FROM conversation_members owner
       JOIN conversation_members peer
         ON peer.conversation_id = owner.conversation_id
        AND peer.user_id <> owner.user_id
       WHERE owner.user_id = $1
         AND NOT EXISTS (
           SELECT 1
           FROM blocks b
           WHERE (b.blocker_id = owner.user_id AND b.blocked_id = peer.user_id)
              OR (b.blocker_id = peer.user_id AND b.blocked_id = owner.user_id)
         )`,
      [userId],
    )
    const rooms = peers.map((peer) => `user:${peer.user_id}`)
    if (rooms.length > 0) io.to(rooms).emit(event, payload)
  }

  async function addCallHistory(conversationId: string, senderId: string, callId: string, type: 'voice' | 'video', action: 'started' | 'ended') {
    const eventKey = `${callId}:${action}`
    if (callHistoryEvents.has(eventKey)) return
    callHistoryEvents.add(eventKey)
    setTimeout(() => callHistoryEvents.delete(eventKey), 10 * 60 * 1000)
    const content = `${type === 'video' ? 'Video' : 'Voice'} call ${action}`
    try {
      const messageId = uuidv4()
      await db.run(
        'INSERT INTO messages (id, conversation_id, sender_id, type, content) VALUES ($1,$2,$3,$4,$5)',
        [messageId, conversationId, senderId, 'system', content],
      )
      await db.run(
        'UPDATE conversations SET last_message_id = $1, last_message_preview = $2, last_message_at = NOW(), updated_at = NOW() WHERE id = $3',
        [messageId, content, conversationId],
      )
      const message = await db.one<any>(
        'SELECT m.*, u.username, u.full_name, u.avatar_url, u.is_college_verified FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = $1',
        [messageId],
      )
      io.to(`conv:${conversationId}`).emit('message:new', message)
    } catch (error: any) {
      console.error('call history error:', error?.message || error)
    }
  }

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string | null
    const signalTimes: number[] = []
    const allowSignal = () => {
      const now = Date.now()
      while (signalTimes.length && signalTimes[0] <= now - 10_000) signalTimes.shift()
      if (signalTimes.length >= 60) return false
      signalTimes.push(now)
      return true
    }

    if (userId) {
      socket.join(`user:${userId}`)
      const { wasOnline, connectionCount } = activePresence.connect(userId, socket.id)
      logPresence('connect', userId, socket.id, connectionCount)
      if (!wasOnline) void queuePresenceTransition(userId, async () => {
        // A quick disconnect/reconnect can make the original connection
        // transition stale before its database write runs.
        if (!activePresence.isOnline(userId)) return
        const presence = await db.one<{ last_seen: Date | string }>(
          'UPDATE users SET is_online = 1 WHERE id = $1 RETURNING last_seen',
          [userId],
        )
        try {
          const privRow = await db.one<any>('SELECT privacy_settings FROM users WHERE id = $1', [userId])
          const priv = (() => { try { return JSON.parse(privRow?.privacy_settings || '{}') } catch { return {} } })()
          if (priv.showOnlineStatus !== false) {
            await emitPresenceToConversationPeers(userId, {
              userId,
              online: true,
              lastSeen: presence?.last_seen ? new Date(presence.last_seen).toISOString() : undefined,
            })
          }
        } catch {}
      })
    }

    // ─── Conversations ────────────────────────────────────────────────────────
    socket.on('join:conversation', async (conversationId: string) => {
      if (!userId || !validId(conversationId)) return
      try {
        if (await assertMember(conversationId)) socket.join(`conv:${conversationId}`)
      } catch {}
    })

    socket.on('leave:conversation', (conversationId: string) => {
      if (!validId(conversationId)) return
      socket.leave(`conv:${conversationId}`)
    })

    // ─── WebRTC calls ─────────────────────────────────────────────────────────
    // Signaling is relayed only between members of the conversation. Media never
    // passes through the server; peers connect directly with WebRTC.
    socket.on('call:invite', async (data: { conversationId: string; callId: string; type: 'voice' | 'video' }) => {
      if (!validCallContext(data) || !['voice', 'video'].includes(data.type)) return
      if (!(await assertMember(data.conversationId))) return
      const members = await db.all<any>('SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id != $2', [data.conversationId, userId])
      let reachable = false
      for (const member of members) {
        const recipientRoom = io.sockets.adapter.rooms.get(`user:${member.user_id}`)
        const recipientReachable = Boolean(recipientRoom?.size)
        reachable = reachable || recipientReachable
        if (!recipientReachable) continue
        io.to(`user:${member.user_id}`).emit('call:incoming', {
          ...data,
          fromUserId: userId,
          fromName: socket.data.fullName || socket.data.username,
          fromAvatar: socket.data.avatarUrl || null,
        })
      }
      socket.emit('call:delivery', { callId: data.callId, reachable })
      await addCallHistory(data.conversationId, userId!, data.callId, data.type, 'started')
    })

    socket.on('call:accept', async (data: { conversationId: string; callId: string; targetUserId: string }) => {
      if (!validCallContext(data, true)) return
      if (!(await assertMember(data.conversationId))) return
      io.to(`conv:${data.conversationId}`).emit('call:accepted', { ...data, fromUserId: userId })
    })

    socket.on('call:decline', async (data: { conversationId: string; callId: string; targetUserId: string }) => {
      if (!validCallContext(data, true)) return
      if (!(await assertMember(data.conversationId))) return
      io.to(`conv:${data.conversationId}`).emit('call:declined', { ...data, fromUserId: userId })
    })

    socket.on('call:signal', async (data: {
      conversationId: string
      callId: string
      targetUserId: string
      signalType: 'offer' | 'answer' | 'ice'
      signal: unknown
    }) => {
      if (!validCallContext(data, true) || !validSignal(data.signalType, data.signal) || !allowSignal()) return
      if (!(await assertMember(data.conversationId))) return
      if (data.targetUserId === userId) return
      const targetMember = await db.one(
        'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
        [data.conversationId, data.targetUserId],
      )
      if (!targetMember) return
      io.to(`user:${data.targetUserId}`).emit('call:signal', { ...data, fromUserId: userId })
    })

    socket.on('call:end', async (data: { conversationId: string; callId: string; type?: 'voice' | 'video' }) => {
      if (!validCallContext(data) || (data.type && !['voice', 'video'].includes(data.type))) return
      if (!(await assertMember(data.conversationId))) return
      await addCallHistory(data.conversationId, userId!, data.callId, data.type || 'voice', 'ended')
      socket.to(`conv:${data.conversationId}`).emit('call:ended', { ...data, fromUserId: userId })
    })

    // ─── Membership guard ─────────────────────────────────────────────────────
    async function assertMember(conversationId: string): Promise<boolean> {
      if (!userId) return false
      try {
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
        if (blocked) return false
        return !!(await db.one(`
          SELECT 1
          FROM conversation_members cm
          JOIN conversations c ON c.id = cm.conversation_id
          LEFT JOIN events e ON e.id = c.event_id
          WHERE cm.conversation_id = $1 AND cm.user_id = $2
            AND NOT EXISTS (
              SELECT 1 FROM message_requests mr
              WHERE mr.conversation_id = c.id
                AND mr.to_user_id = $2
                AND mr.status = 'pending'
            )
            AND (
              c.event_id IS NULL
              OR (
                e.status NOT IN ('cancelled', 'ended')
                AND e.cancelled_at IS NULL
                AND e.ended_at IS NULL
                AND (
                  e.organizer_id = $2
                  OR EXISTS (SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = $2)
                  OR EXISTS (
                    SELECT 1 FROM event_attendees ea
                    WHERE ea.event_id = e.id AND ea.user_id = $2 AND ea.status IN ('going', 'interested')
                  )
                )
              )
            )
        `, [conversationId, userId]))
      } catch { return false }
    }

    // ─── Typing ───────────────────────────────────────────────────────────────
    socket.on('typing:start', async ({ conversationId }: { conversationId: string }) => {
      if (!(await assertMember(conversationId))) return
      socket.to(`conv:${conversationId}`).emit('typing:start', { conversationId, userId, username: socket.data.username })
    })

    socket.on('typing:stop', async ({ conversationId }: { conversationId: string }) => {
      if (!(await assertMember(conversationId))) return
      socket.to(`conv:${conversationId}`).emit('typing:stop', { conversationId, userId, username: socket.data.username })
    })

    // ─── Send message ─────────────────────────────────────────────────────────
    socket.on('message:send', async (data: {
      conversationId: string
      type?: string
      content?: string
      mediaUrl?: string
      mediaType?: string
      replyToId?: string
    }) => {
      if (!userId) return
      try {
        const { conversationId, type = 'text', content, mediaUrl, mediaType, replyToId } = data
        if (!(await assertMember(conversationId))) {
          socket.emit('message:error', { error: 'You cannot send messages in this conversation.' })
          return
        }
        const normalizedOpenMojiSticker = type === 'sticker' ? normalizeOpenMojiSticker(content) : null
        const normalizedGiphy = type === 'gif' || type === 'sticker' ? normalizeGiphyMessageReference(content) : null
        const normalizedProviderContent = normalizedGiphy || normalizedOpenMojiSticker
        if ((type === 'sticker' && (!normalizedProviderContent || mediaUrl || mediaType)) || (type === 'gif' && (!normalizedGiphy || mediaUrl || mediaType))) {
          socket.emit('message:error', { error: 'Choose a valid GIPHY GIF or sticker.' })
          return
        }
        if (mediaUrl) {
          const canonicalMediaUrl = durableMediaUrl(mediaUrl)
          const assetId = canonicalMediaUrl?.split('/').pop()
          if (!assetId || !(await db.one(
            'SELECT 1 FROM media_assets WHERE id = $1 AND owner_id = $2',
            [assetId, userId],
          ))) {
            socket.emit('message:error', { error: 'Media must be uploaded through the media endpoint first.' })
            return
          }
        }

        const msgId = uuidv4()
        await withTransaction(async (tx) => {
          await tx.run(
            'INSERT INTO messages (id, conversation_id, sender_id, type, content, media_url, media_type, reply_to_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [msgId, conversationId, userId, type, normalizedProviderContent || content || null, mediaUrl ? durableMediaUrl(mediaUrl) : null, mediaType || null, replyToId || null]
          )

          const preview = messagePreview(type, content)
          await tx.run(
            'UPDATE conversations SET last_message_id = $1, last_message_preview = $2, last_message_at = NOW(), updated_at = NOW() WHERE id = $3',
            [msgId, preview, conversationId]
          )
        })

        const msg = await db.one(`
          SELECT m.*, u.username, u.full_name, u.avatar_url, u.is_college_verified
          FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = $1
        `, [msgId])
        const preview = messagePreview(type, content)

        io.to(`conv:${conversationId}`).emit('message:new', msg)

        const members = await db.all<any>(`
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
        `, [conversationId, userId])
        for (const m of members) {
          emitUserMessagePreview(m.user_id, {
            id: msgId,
            conversation_id: conversationId,
            actor_id: userId,
            actor_name: socket.data.fullName || socket.data.username,
            actor_username: socket.data.username,
            actor_avatar: socket.data.avatarUrl || null,
            message_type: type,
            content: messageNotificationContent(type, content),
            created_at: new Date().toISOString(),
          })
        }
        await dispatchMessageNotifications({
          conversationId,
          messageId: msgId,
          senderId: userId,
          sender: { username: msg.username, full_name: msg.full_name, avatar_url: msg.avatar_url },
          recipientIds: members.map((member) => member.user_id),
          content: messageNotificationContent(type, content),
        })
      } catch (err: any) { console.error('socket message:send error:', err.message) }
    })

    socket.on('message:edit', async ({ messageId, content }: { messageId: string; content: string }) => {
      if (!userId) return
      try {
        const msg = await db.one<any>('SELECT * FROM messages WHERE id = $1 AND sender_id = $2', [messageId, userId])
        if (!msg) return
        await db.run('UPDATE messages SET content = $1, is_edited = 1, updated_at = NOW() WHERE id = $2', [content, messageId])
        io.to(`conv:${msg.conversation_id}`).emit('message:edit', { messageId, content, is_edited: 1 })
      } catch {}
    })

    socket.on('message:delete', async ({ messageId, forEveryone }: { messageId: string; forEveryone: boolean }) => {
      if (!userId) return
      try {
        const msg = await db.one<any>('SELECT * FROM messages WHERE id = $1', [messageId])
        if (!msg) return
        if (msg.sender_id !== userId && forEveryone) return
        if (forEveryone) {
          await withTransaction(async (tx) => {
            await tx.run('UPDATE messages SET is_deleted = 1, content = NULL, media_url = NULL, updated_at = NOW() WHERE id = $1', [messageId])
            await refreshConversationPreview(tx, msg.conversation_id)
          })
          io.to(`conv:${msg.conversation_id}`).emit('message:delete', { messageId, forEveryone: true })
        } else {
          socket.emit('message:delete', { messageId, forEveryone: false })
        }
      } catch {}
    })

    socket.on('message:react', async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!userId) return
      try {
        const msg = await db.one<any>('SELECT conversation_id, sender_id FROM messages WHERE id = $1', [messageId])
        if (!msg) return
        const isMember = await db.one('SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [msg.conversation_id, userId])
        if (!isMember) return
        const existing = await db.one<any>('SELECT emoji FROM message_reactions WHERE message_id = $1 AND user_id = $2', [messageId, userId])
        const shouldNotify = !existing || existing.emoji !== emoji
        if (existing?.emoji === emoji) {
          await db.run('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2', [messageId, userId])
        } else {
          await db.run('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1,$2,$3) ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji', [messageId, userId, emoji])
        }
        const reactions = await db.all('SELECT emoji, COUNT(*) as count FROM message_reactions WHERE message_id = $1 GROUP BY emoji', [messageId])
        io.to(`conv:${msg.conversation_id}`).emit('message:reactions', { messageId, reactions })
        if (shouldNotify && msg.sender_id !== userId) {
          const actor = await db.one<any>('SELECT username, full_name, avatar_url FROM users WHERE id = $1', [userId])
          const notificationId = uuidv4()
          const content = `reacted ${emoji} to your message`
          await db.run(
            `INSERT INTO notifications (id,user_id,type,actor_id,entity_id,entity_type,content)
             VALUES ($1,$2,'message_reaction',$3,$4,'message',$5)`,
            [notificationId, msg.sender_id, userId, messageId, content],
          )
          emitUserNotification(msg.sender_id, {
            id: notificationId,
            user_id: msg.sender_id,
            actor_id: userId,
            actor_name: actor?.full_name || actor?.username || 'Someone',
            actor_username: actor?.username || null,
            actor_avatar: actor?.avatar_url || null,
            type: 'message_reaction',
            entity_type: 'message',
            entity_id: messageId,
            content,
            is_read: 0,
            created_at: new Date().toISOString(),
          })
        }
      } catch {}
    })

    socket.on('message:read', async ({ conversationId }: { conversationId: string }) => {
      try {
        if (!(await assertMember(conversationId))) return
        await db.run('UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId])
        socket.to(`conv:${conversationId}`).emit('message:read', { conversationId, userId })
      } catch {}
    })

    // ─── Pin / Unpin ──────────────────────────────────────────────────────────
    socket.on('message:pin', async ({ messageId, pin }: { messageId: string; pin: boolean }) => {
      if (!userId) return
      try {
        const msg = await db.one<any>('SELECT conversation_id FROM messages WHERE id = $1', [messageId])
        if (!msg) return
        const [member, conv] = await Promise.all([
          db.one<any>('SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [msg.conversation_id, userId]),
          db.one<any>('SELECT type FROM conversations WHERE id = $1', [msg.conversation_id]),
        ])
        if (!member) return
        if (conv?.type !== 'private' && member.role === 'member') return
        await db.run('UPDATE messages SET is_pinned = $1 WHERE id = $2', [pin ? 1 : 0, messageId])
        if (pin) {
          await db.run('UPDATE conversations SET pinned_message_id = $1 WHERE id = $2', [messageId, msg.conversation_id])
        } else {
          await db.run('UPDATE conversations SET pinned_message_id = NULL WHERE id = $1 AND pinned_message_id = $2', [msg.conversation_id, messageId])
        }
        io.to(`conv:${msg.conversation_id}`).emit('message:pinned', { messageId, is_pinned: pin ? 1 : 0 })
      } catch {}
    })

    // ─── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      if (!userId) return
      try {
        const { becameOffline, connectionCount } = activePresence.disconnect(userId, socket.id)
        logPresence('disconnect', userId, socket.id, connectionCount)
        if (!becameOffline) return
        void queuePresenceTransition(userId, async () => {
          // Do not allow a final-disconnect callback from an older socket to
          // mark a user offline after another device has already reconnected.
          if (activePresence.isOnline(userId)) return
          const presence = await db.one<{ last_seen: Date | string }>(
            'UPDATE users SET is_online = 0, last_seen = NOW() WHERE id = $1 RETURNING last_seen',
            [userId],
          )
          const privRow = await db.one<any>('SELECT privacy_settings FROM users WHERE id = $1', [userId])
          const priv = (() => { try { return JSON.parse(privRow?.privacy_settings || '{}') } catch { return {} } })()
          const lastSeen = presence?.last_seen ? new Date(presence.last_seen).toISOString() : new Date().toISOString()
          logPresence('offline', userId, socket.id, 0, lastSeen)
          const showOnline = priv.showOnlineStatus !== false
          const showLastSeen = priv.showLastSeen !== false
          if (showOnline || showLastSeen) {
            await emitPresenceToConversationPeers(userId, {
              userId,
              online: false,
              ...(showLastSeen ? { lastSeen } : {}),
            })
          }
        })
      } catch {}
    })
  })

  return io
}
