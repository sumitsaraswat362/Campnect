// @ts-nocheck
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { db, withTransaction } from '../legacy-db/index.js'
import { requireAuth, optionalAuth } from '../legacy-middleware/auth.js'
import { uploadCover, assertImageMagic, sendMediaPolicyError } from '../legacy-middleware/upload.js'
import { deleteStoredMediaAssets, storeMediaAsset } from '../legacy-services/media.js'
import { enforceUserRestriction } from '../legacy-services/userRestrictions.js'
import { createReportWithCase } from '../legacy-services/reporting.js'
import { getIo } from '../legacy-socket/io.js'

export const eventsRouter = Router()

const EVENT_TYPES = ['meetup', 'hackathon', 'seminar', 'workshop', 'sports', 'social', 'cultural', 'fest', 'online']
const EVENT_CATEGORIES = ['Music', 'Sports', 'Gaming', 'Coding', 'Academic', 'Clubs', 'Meetups', 'Social', 'Competition', 'Other']

const EVENT_COLUMNS = `
  e.id, e.title, e.description, e.type, e.category, e.visibility,
  e.organizer_id, e.community_id, e.college_id, e.location_type, e.location, e.address,
  e.latitude, e.longitude, e.is_online, e.meeting_link, e.starts_at,
  e.ends_at, e.max_attendees, e.attendees_count, e.allow_waitlist,
  e.waitlist_count, e.status, e.cancelled_at, e.cancel_reason, e.ended_at, e.hidden_at,
  e.cover_url, e.tags, e.created_at, e.updated_at
`

function parseJson(value: unknown, fallback: any = []) {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return fallback }
  }
  return value
}

function asBoolean(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on'
}

function asNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function eventState(event: any): 'upcoming' | 'live' | 'ended' | 'cancelled' {
  if (event.status === 'cancelled' || event.cancelled_at) return 'cancelled'
  if (event.status === 'ended' || event.ended_at) return 'ended'
  const now = Date.now()
  const start = new Date(event.starts_at).getTime()
  if (Number.isNaN(start)) return 'upcoming'
  if (start <= now) return 'live'
  return 'upcoming'
}

function normalizeEvent(event: any) {
  if (!event) return null
  return {
    ...event,
    is_online: Boolean(event.is_online),
    allow_waitlist: Boolean(event.allow_waitlist),
    tags: parseJson(event.tags, []),
    attendees_count: Number(event.attendees_count || 0),
    waitlist_count: Number(event.waitlist_count || 0),
    event_state: event.event_state || eventState(event),
    is_saved: Boolean(event.is_saved),
    is_attending: Boolean(event.is_attending),
    user_status: event.user_status || null,
    attendees_preview: parseJson(event.attendees_preview, []),
  }
}

function addParam(params: any[], value: any) {
  params.push(value)
  return `$${params.length}`
}

function parseRequestBody(req: any) {
  const raw = typeof req.body?.data === 'string' ? parseJson(req.body.data, {}) : req.body
  const body = raw && typeof raw === 'object' ? raw : {}
  return {
    ...body,
    tags: Array.isArray(body.tags) ? body.tags : parseJson(body.tags, []),
    is_online: asBoolean(body.is_online),
    allow_waitlist: asBoolean(body.allow_waitlist),
    max_attendees: asNumber(body.max_attendees),
    latitude: asNumber(body.latitude),
    longitude: asNumber(body.longitude),
  }
}

async function currentViewerCollege(userId?: string) {
  if (!userId) return null
  const row = await db.one<{ college_id: string | null }>('SELECT college_id FROM users WHERE id = $1', [userId])
  return row?.college_id || null
}

async function resolveEventCollegeId(userId: string, requestedCollegeId: unknown, locationType: string, isOnline = false) {
  if (isOnline || locationType !== 'inside') return null

  const user = await db.one<any>('SELECT username, college_id FROM users WHERE id = $1', [userId])
  const isCeo = String(user?.username || '').trim().toLowerCase() === 'ceo'
  const collegeId = String(requestedCollegeId || user?.college_id || '').trim()
  if (!collegeId) {
    throw Object.assign(new Error('Choose a verified college for this inside-campus event.'), { status: 400 })
  }
  if (!isCeo && collegeId !== user?.college_id) {
    throw Object.assign(new Error('Regular users can only create events at their own campus.'), { status: 403 })
  }
  const college = await db.one('SELECT id FROM colleges WHERE id = $1', [collegeId])
  if (!college) {
    throw Object.assign(new Error('Choose a valid college.'), { status: 400 })
  }
  return collegeId
}

function isActiveParticipant(status?: string | null) {
  return status === 'going' || status === 'interested'
}

async function isEventHost(eventId: string, userId: string) {
  const event = await db.one<any>('SELECT organizer_id FROM events WHERE id = $1', [eventId])
  if (!event) return false
  if (event.organizer_id === userId) return true
  return Boolean(await db.one('SELECT 1 FROM event_hosts WHERE event_id = $1 AND user_id = $2', [eventId, userId]))
}

async function isEventParticipant(eventId: string, userId: string) {
  const attendee = await db.one<any>(
    `SELECT status FROM event_attendees WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId],
  )
  return isActiveParticipant(attendee?.status) || await isEventHost(eventId, userId)
}

async function createEventNotification(
  userId: string,
  type: string,
  actorId: string | null,
  eventId: string,
  content: string,
  extraData: Record<string, unknown> = {},
) {
  await db.run(
    `INSERT INTO notifications (id, user_id, type, actor_id, entity_id, entity_type, content, extra_data)
     VALUES ($1,$2,$3,$4,$5,'event',$6,$7)
     ON CONFLICT DO NOTHING`,
    [uuidv4(), userId, type, actorId, eventId, content, JSON.stringify(extraData)],
  )
}

async function removeEventChatAccess(tx: any, eventId: string, userId: string) {
  const conversation = await tx.one<any>('SELECT id FROM conversations WHERE event_id = $1', [eventId])
  if (!conversation) return
  await tx.run(`
    DELETE FROM conversation_members cm
    WHERE cm.conversation_id = $1 AND cm.user_id = $2
      AND NOT EXISTS (SELECT 1 FROM events WHERE id = $3 AND organizer_id = $2)
      AND NOT EXISTS (SELECT 1 FROM event_hosts WHERE event_id = $3 AND user_id = $2)
  `, [conversation.id, userId, eventId])
  await tx.run(`
    DELETE FROM notifications
    WHERE user_id = $1
      AND (
        (entity_type = 'event' AND entity_id = $2)
        OR (entity_type = 'conversation' AND entity_id = $3)
      )
  `, [userId, eventId, conversation.id])
  await tx.run(`
    UPDATE conversations
    SET members_count = (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = $1),
        updated_at = NOW()
    WHERE id = $1
  `, [conversation.id])
}

async function evictEventChatSockets(eventId: string, userId: string) {
  const conversation = await db.one<any>('SELECT id FROM conversations WHERE event_id = $1', [eventId])
  if (!conversation) return
  try {
    const sockets = await getIo()?.in(`conv:${conversation.id}`).fetchSockets()
    for (const socket of sockets || []) {
      if (socket.data.userId === userId) socket.leave(`conv:${conversation.id}`)
    }
  } catch {}
}

async function hardDeleteEvent(eventId: string) {
  const removedAssets = await withTransaction(async (tx) => {
    const event = await tx.one<any>('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId])
    if (!event) return null

    const assets = await tx.all<any>(`
      SELECT storage_bucket, storage_path, storage_status
      FROM media_assets
      WHERE (entity_type = 'event_cover' AND entity_id = $1)
         OR (entity_type = 'message_media' AND entity_id IN (
           SELECT m.id
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE c.event_id = $1
         ))
    `, [eventId])

    await tx.run(`
      DELETE FROM media_assets
      WHERE (entity_type = 'event_cover' AND entity_id = $1)
         OR (entity_type = 'message_media' AND entity_id IN (
           SELECT m.id
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE c.event_id = $1
         ))
    `, [eventId])
    await tx.run(`
      DELETE FROM notifications
      WHERE (entity_type = 'event' AND entity_id = $1)
         OR (entity_type = 'conversation' AND entity_id IN (
           SELECT id FROM conversations WHERE event_id = $1
         ))
    `, [eventId])
    // Event-linked posts remain the author's content, but no longer point at
    // an event that has been removed.
    await tx.run('UPDATE posts SET event_id = NULL WHERE event_id = $1', [eventId])
    await tx.run('DELETE FROM event_attendees WHERE event_id = $1', [eventId])
    await tx.run('DELETE FROM conversations WHERE event_id = $1', [eventId])
    await tx.run('DELETE FROM events WHERE id = $1', [eventId])
    return assets
  })
  if (removedAssets === null) return false
  await deleteStoredMediaAssets(removedAssets)
  return true
}

async function purgeRetiredEvents() {
  const retired = await db.all<{ id: string }>(`
    SELECT id FROM events
    WHERE status IN ('cancelled', 'ended') OR cancelled_at IS NOT NULL OR ended_at IS NOT NULL
  `)
  for (const event of retired) await hardDeleteEvent(event.id)
}

async function fetchEvent(eventId: string, viewerId?: string) {
  const event = await db.one<any>(`
    SELECT ${EVENT_COLUMNS},
      u.username AS organizer_username,
      u.full_name AS organizer_name,
      u.avatar_url AS organizer_avatar,
      c.name AS college_name,
      CASE WHEN $2::text IS NULL THEN FALSE
        ELSE EXISTS(SELECT 1 FROM event_saves es WHERE es.event_id = e.id AND es.user_id = $2)
      END AS is_saved,
      CASE WHEN $2::text IS NULL THEN NULL
        ELSE (SELECT ea.status FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = $2)
      END AS user_status,
      CASE WHEN $2::text IS NULL THEN FALSE
        ELSE EXISTS(SELECT 1 FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = $2 AND ea.status IN ('going','interested'))
      END AS is_attending
    FROM events e
    JOIN users u ON e.organizer_id = u.id
    LEFT JOIN colleges c ON e.college_id = c.id
    LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
    WHERE e.id = $1
      AND e.hidden_at IS NULL
      AND COALESCE(usc.event_visibility, COALESCE(u.is_shadowbanned, 0)) = 0
      AND COALESCE(u.is_deactivated, 0) = 0
      AND COALESCE(u.is_banned, 0) = 0
      AND e.status NOT IN ('cancelled', 'ended')
      AND e.cancelled_at IS NULL
      AND e.ended_at IS NULL
      AND (
        e.visibility = 'public'
        OR e.organizer_id = $2
        OR EXISTS(SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = $2)
        OR EXISTS(SELECT 1 FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = $2)
        OR EXISTS(SELECT 1 FROM event_invitations ei WHERE ei.event_id = e.id AND ei.invited_user_id = $2 AND ei.status IN ('pending','accepted'))
      )
      AND ($2::text IS NULL OR (
        NOT EXISTS(SELECT 1 FROM blocks b WHERE b.blocker_id = $2 AND b.blocked_id = e.organizer_id)
        AND NOT EXISTS(SELECT 1 FROM blocks b WHERE b.blocker_id = e.organizer_id AND b.blocked_id = $2)
      ))
  `, [eventId, viewerId || null])

  if (!event) return null

  const [attendees, hosts, announcements, counts, chat] = await Promise.all([
    db.all(`
      SELECT u.id, u.username, u.full_name, u.avatar_url, u.college_name,
        u.is_college_verified, ea.status, ea.created_at
      FROM event_attendees ea
      JOIN users u ON ea.user_id = u.id
      WHERE ea.event_id = $1 AND ea.status IN ('going','interested')
      ORDER BY CASE WHEN ea.status = 'going' THEN 0 ELSE 1 END, ea.created_at ASC
      LIMIT 50
    `, [eventId]),
    db.all(`
      SELECT u.id, u.username, u.full_name, u.avatar_url, u.college_name,
        eh.role, eh.created_at
      FROM event_hosts eh
      JOIN users u ON eh.user_id = u.id
      WHERE eh.event_id = $1
      ORDER BY eh.created_at ASC
    `, [eventId]),
    db.all(`
      SELECT ea.id, ea.body, ea.created_at, u.id AS author_id, u.username AS author_username,
        u.full_name AS author_name, u.avatar_url AS author_avatar
      FROM event_announcements ea
      JOIN users u ON ea.author_id = u.id
      WHERE ea.event_id = $1
      ORDER BY ea.created_at DESC
      LIMIT 20
    `, [eventId]),
    db.one<any>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'going')::int AS going,
        COUNT(*) FILTER (WHERE status = 'interested')::int AS interested,
        COUNT(*) FILTER (WHERE status = 'waitlist')::int AS waitlist
      FROM event_attendees WHERE event_id = $1
    `, [eventId]),
    eventState(event) !== 'ended' && eventState(event) !== 'cancelled' && viewerId && await isEventParticipant(eventId, viewerId)
      ? db.one<any>('SELECT id, name, avatar_url FROM conversations WHERE event_id = $1', [eventId])
      : null,
  ])

  return normalizeEvent({
    ...event,
    attendees_preview: attendees.filter((a: any) => a.status === 'going').slice(0, 10),
    attendees,
    hosts,
    announcements,
    counts: {
      going: Number(counts?.going || 0),
      interested: Number(counts?.interested || 0),
      waitlist: Number(counts?.waitlist || 0),
    },
    conversation_id: chat?.id || null,
  })
}

async function ensureEventChat(eventId: string, userId: string) {
  if (!(await isEventParticipant(eventId, userId))) return null
  const event = await db.one<any>('SELECT id, title, cover_url, organizer_id, status, cancelled_at, ended_at FROM events WHERE id = $1', [eventId])
  if (!event) return null
  if (eventState(event) === 'ended' || eventState(event) === 'cancelled') return null

  let conversation = await db.one<any>('SELECT id FROM conversations WHERE event_id = $1', [eventId])
  if (!conversation) {
    const conversationId = uuidv4()
    await withTransaction(async (tx) => {
      const existing = await tx.one<any>('SELECT id FROM conversations WHERE event_id = $1 FOR UPDATE', [eventId])
      if (existing) {
        conversation = existing
        return
      }
       await tx.run(`
        INSERT INTO conversations (id, type, name, avatar_url, event_id, created_by, members_count)
        VALUES ($1, 'event', $2, $3, $4, $5, 0)
      `, [conversationId, event.title, event.cover_url || null, eventId, event.organizer_id])
      conversation = { id: conversationId }
    })
  } else {
    // Repair conversations created before event chats carried their own
    // metadata. The event remains the source of truth for both fields.
    await db.run(
      `UPDATE conversations SET type = 'event', name = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3`,
      [event.title, event.cover_url || null, conversation.id],
    )
  }

  const goingMembers = await db.all<{ user_id: string }>(
    `SELECT user_id FROM event_attendees WHERE event_id = $1 AND status IN ('going','interested')
     UNION SELECT organizer_id FROM events WHERE id = $1
     UNION SELECT user_id FROM event_hosts WHERE event_id = $1`,
    [eventId],
  )
  for (const member of goingMembers) {
    await db.run(
      `INSERT INTO conversation_members (conversation_id, user_id, role)
       VALUES ($1,$2,$3) ON CONFLICT (conversation_id, user_id) DO NOTHING`,
      [conversation!.id, member.user_id, member.user_id === event.organizer_id ? 'owner' : 'member'],
    )
  }
  await db.run(`
    DELETE FROM conversation_members
    WHERE conversation_id = $1
      AND user_id NOT IN (
        SELECT user_id FROM event_attendees WHERE event_id = $2 AND status IN ('going', 'interested')
        UNION SELECT organizer_id FROM events WHERE id = $2
        UNION SELECT user_id FROM event_hosts WHERE event_id = $2
      )
  `, [conversation!.id, eventId])
  await db.run(`
    DELETE FROM notifications n
    WHERE n.entity_type = 'conversation' AND n.entity_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM conversation_members cm
        WHERE cm.conversation_id = $1 AND cm.user_id = n.user_id
      )
  `, [conversation!.id])
  await db.run(`
    UPDATE conversations SET members_count = (
      SELECT COUNT(*) FROM conversation_members WHERE conversation_id = $1
    ), updated_at = NOW() WHERE id = $1
  `, [conversation!.id])
  return conversation!.id
}

async function promoteNextWaitlisted(tx: any, eventId: string) {
  const event = await tx.one<any>('SELECT max_attendees FROM events WHERE id = $1 FOR UPDATE', [eventId])
  if (!event?.max_attendees) return null
  const going = await tx.one<any>("SELECT COUNT(*)::int AS count FROM event_attendees WHERE event_id = $1 AND status = 'going'", [eventId])
  if (Number(going?.count || 0) >= Number(event.max_attendees)) return null
  const next = await tx.one<any>(`
    SELECT ea.user_id
    FROM event_attendees ea
    JOIN event_waitlist ew ON ew.event_id = ea.event_id AND ew.user_id = ea.user_id
    WHERE ea.event_id = $1 AND ea.status = 'waitlist' AND ew.status = 'waiting'
    ORDER BY ew.position ASC, ew.created_at ASC
    LIMIT 1
    FOR UPDATE OF ea
  `, [eventId])
  if (!next?.user_id) return null
  await tx.run(`UPDATE event_attendees SET status = 'going', created_at = NOW() WHERE event_id = $1 AND user_id = $2`, [eventId, next.user_id])
  await tx.run(`UPDATE event_waitlist SET status = 'promoted' WHERE event_id = $1 AND user_id = $2`, [eventId, next.user_id])
  return next.user_id as string
}

eventsRouter.get('/', optionalAuth, async (req, res) => {
  try {
    // Event discovery is personalized and changes with RSVP, save, block, and
    // campus state. Never let Express turn this JSON response into a bodyless
    // 304, which Axios treats as a failed request on app reload.
    delete req.headers['if-none-match']
    delete req.headers['if-modified-since']
    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    await purgeRetiredEvents()
    const viewerId = req.user?.userId || null
    const viewerCollegeId = await currentViewerCollege(viewerId || undefined)
    const filter = String(req.query.filter || '')
    const query = String(req.query.q || req.query.search || '').trim().toLowerCase()
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)))
    const page = Math.max(1, Number(req.query.page || 1))
    const offset = (page - 1) * limit
    const params: any[] = [viewerId, viewerCollegeId]
    const add = (value: any) => addParam(params, value)

    let sql = `
      SELECT ${EVENT_COLUMNS},
        u.username AS organizer_username,
        u.full_name AS organizer_name,
        u.avatar_url AS organizer_avatar,
        c.name AS college_name,
        CASE
          WHEN e.status = 'cancelled' OR e.cancelled_at IS NOT NULL THEN 'cancelled'
          WHEN e.status = 'ended' OR e.ended_at IS NOT NULL THEN 'ended'
          WHEN e.starts_at <= NOW() THEN 'live'
          ELSE 'upcoming'
        END AS event_state,
        CASE WHEN $1::text IS NULL THEN FALSE
          ELSE EXISTS(SELECT 1 FROM event_saves es WHERE es.event_id = e.id AND es.user_id = $1)
        END AS is_saved,
        CASE WHEN $1::text IS NULL THEN NULL
          ELSE (SELECT ea.status FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = $1)
        END AS user_status,
        CASE WHEN $1::text IS NULL THEN FALSE
          ELSE EXISTS(SELECT 1 FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = $1 AND ea.status = 'going')
        END AS is_attending,
        COALESCE((
          SELECT json_agg(preview ORDER BY preview.created_at ASC)
          FROM (
            SELECT u2.id, u2.username, u2.full_name, u2.avatar_url, ea2.created_at
            FROM event_attendees ea2
            JOIN users u2 ON u2.id = ea2.user_id
            WHERE ea2.event_id = e.id AND ea2.status = 'going'
            ORDER BY ea2.created_at ASC LIMIT 5
          ) preview
        ), '[]'::json) AS attendees_preview
      FROM events e
      JOIN users u ON e.organizer_id = u.id
      LEFT JOIN colleges c ON e.college_id = c.id
      LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
      WHERE e.hidden_at IS NULL
        AND COALESCE(usc.event_visibility, COALESCE(u.is_shadowbanned, 0)) = 0
        AND COALESCE(u.is_deactivated, 0) = 0
        AND COALESCE(u.is_banned, 0) = 0
        AND ($1::text IS NULL OR (
          NOT EXISTS(SELECT 1 FROM blocks b WHERE b.blocker_id = $1 AND b.blocked_id = e.organizer_id)
          AND NOT EXISTS(SELECT 1 FROM blocks b WHERE b.blocker_id = e.organizer_id AND b.blocked_id = $1)
        ))
        AND (
          e.visibility = 'public'
          OR e.organizer_id = $1
          OR EXISTS(SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = $1)
          OR EXISTS(SELECT 1 FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = $1)
          OR EXISTS(SELECT 1 FROM event_invitations ei WHERE ei.event_id = e.id AND ei.invited_user_id = $1 AND ei.status IN ('pending','accepted'))
        )
    `

    sql += ` AND e.status NOT IN ('cancelled', 'ended') AND e.cancelled_at IS NULL AND e.ended_at IS NULL`

    if (query) {
      const search = add(`%${query}%`)
      sql += ` AND (
        LOWER(e.title) LIKE ${search}
        OR LOWER(COALESCE(e.description, '')) LIKE ${search}
        OR LOWER(COALESCE(e.category, '')) LIKE ${search}
        OR LOWER(COALESCE(e.type, '')) LIKE ${search}
        OR LOWER(COALESCE(e.location, '')) LIKE ${search}
        OR LOWER(COALESCE(e.address, '')) LIKE ${search}
        OR LOWER(COALESCE(c.name, '')) LIKE ${search}
        OR LOWER(u.username) LIKE ${search}
        OR LOWER(u.full_name) LIKE ${search}
      )`
    }

    if (req.query.type) sql += ` AND e.type = ${add(String(req.query.type))}`
    if (req.query.category) sql += ` AND e.category = ${add(String(req.query.category))}`
    if (req.query.is_online !== undefined) sql += ` AND e.is_online = ${add(asBoolean(req.query.is_online) ? 1 : 0)}`
    if (req.query.status) sql += ` AND e.status = ${add(String(req.query.status))}`
    if (req.query.college_id) sql += ` AND e.college_id = ${add(String(req.query.college_id))}`
    if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))) {
      sql += ` AND e.starts_at >= ${add(String(req.query.date))}::date AND e.starts_at < ${add(String(req.query.date))}::date + INTERVAL '1 day'`
    }
    if (req.query.time_of_day) {
      const slot = String(req.query.time_of_day)
      if (slot === 'morning') sql += ` AND EXTRACT(HOUR FROM e.starts_at) >= 5 AND EXTRACT(HOUR FROM e.starts_at) < 12`
      else if (slot === 'afternoon') sql += ` AND EXTRACT(HOUR FROM e.starts_at) >= 12 AND EXTRACT(HOUR FROM e.starts_at) < 17`
      else if (slot === 'evening') sql += ` AND EXTRACT(HOUR FROM e.starts_at) >= 17 AND EXTRACT(HOUR FROM e.starts_at) < 21`
      else if (slot === 'night') sql += ` AND (EXTRACT(HOUR FROM e.starts_at) >= 21 OR EXTRACT(HOUR FROM e.starts_at) < 5)`
    }

    if (filter === 'today') {
      sql += ` AND e.starts_at >= CURRENT_DATE AND e.starts_at < CURRENT_DATE + INTERVAL '1 day'`
    } else if (filter === 'week') {
      sql += ` AND e.starts_at >= NOW() AND e.starts_at < NOW() + INTERVAL '7 days'`
    } else if (filter === 'my') {
      sql += ` AND (
        e.organizer_id = $1
        OR EXISTS(SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = $1)
        OR EXISTS(SELECT 1 FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = $1 AND ea.status IN ('going','interested'))
      )`
    } else if (filter === 'saved') {
      sql += ` AND EXISTS(SELECT 1 FROM event_saves es WHERE es.event_id = e.id AND es.user_id = $1)`
    } else if (filter === 'popular') {
      sql += ` AND e.starts_at > NOW()`
    } else if (filter === 'near') {
      sql += ` AND ($2::text IS NOT NULL AND e.college_id = $2)`
    } else if (filter === 'live') {
      sql += ` AND e.starts_at <= NOW() AND e.status NOT IN ('cancelled', 'ended')`
    } else if (req.query.upcoming === 'true' || !filter) {
      sql += ` AND e.status = 'upcoming' AND e.starts_at > NOW()`
    }

    const collegePriority = `CASE WHEN $2::text IS NOT NULL AND e.college_id = $2 THEN 0 ELSE 1 END`
    const followedPriority = `CASE WHEN $1::text IS NOT NULL AND EXISTS(
      SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = e.organizer_id AND f.status = 'active'
    ) THEN 0 ELSE 1 END`
    if (filter === 'popular') {
      sql += ` ORDER BY e.attendees_count DESC, ${collegePriority}, e.starts_at ASC`
    } else {
      sql += ` ORDER BY
        CASE WHEN e.starts_at <= NOW() AND e.status = 'upcoming' THEN 0 ELSE 1 END,
        ${collegePriority}, ${followedPriority}, e.starts_at ASC, e.attendees_count DESC`
    }
    sql += ` LIMIT ${add(limit)} OFFSET ${add(offset)}`

    const events = await db.all<any>(sql, params)
    res.json({
      success: true,
      data: events.map(normalizeEvent),
      meta: { page, limit, hasMore: events.length === limit, filter: filter || 'upcoming' },
    })
  } catch (err: any) {
    console.error('[events] list failed:', err?.message || err)
    res.status(500).json({ success: false, error: 'Unable to load events.' })
  }
})

eventsRouter.get('/:id', optionalAuth, async (req, res) => {
  try {
    const event = await fetchEvent(req.params.id, req.user?.userId)
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' })
    res.json({ success: true, data: event })
  } catch (err: any) {
    console.error('[events] detail failed:', err?.message || err)
    res.status(500).json({ success: false, error: 'Unable to load this event.' })
  }
})

eventsRouter.post('/', requireAuth, uploadCover.single('cover'), async (req, res) => {
  try {
    if (await enforceUserRestriction(req, res, 'events')) return
    const body = parseRequestBody(req)
    const schema = z.object({
      title: z.string().min(3).max(100).trim(),
      description: z.string().max(2000).default(''),
      category: z.enum(EVENT_CATEGORIES as [string, ...string[]]).default('Social'),
      type: z.enum(EVENT_TYPES as [string, ...string[]]).default('meetup'),
      visibility: z.enum(['public', 'private']).default('public'),
      location_type: z.enum(['inside', 'outside']).default('inside'),
      location: z.string().max(200).default(''),
      address: z.string().max(300).default(''),
      is_online: z.boolean().default(false),
      meeting_link: z.string().url().optional().or(z.literal('')),
      starts_at: z.string().min(1),
      max_attendees: z.number().int().positive().optional(),
      allow_waitlist: z.boolean().default(false),
      latitude: z.number().finite().optional(),
      longitude: z.number().finite().optional(),
      community_id: z.string().optional(),
      college_id: z.string().max(200).optional().default(''),
      tags: z.array(z.string()).max(20).default([]),
    })
    const parsed = schema.safeParse(body)
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors[0].message })
    const data = parsed.data
    const startsAt = new Date(data.starts_at)
    if (Number.isNaN(startsAt.getTime())) return res.status(400).json({ success: false, error: 'Choose a valid event date.' })
    if (startsAt.getTime() <= Date.now()) return res.status(400).json({ success: false, error: 'Events must start in the future.' })
    const eventCollegeId = await resolveEventCollegeId(req.user!.userId, data.college_id, data.location_type, data.is_online)
    if (!data.is_online && !data.location.trim()) {
      return res.status(400).json({ success: false, error: 'Add a location or mark the event online.' })
    }
    if (!data.is_online && data.location_type === 'outside' && data.address.trim().length < 8) {
      return res.status(400).json({ success: false, error: 'Add the complete outside address, including street or landmark and city.' })
    }
    if (data.is_online && data.meeting_link && !data.meeting_link.startsWith('http')) {
      return res.status(400).json({ success: false, error: 'Meeting link must be a valid URL.' })
    }
    if (req.file) await assertImageMagic(req.file)

    const eventId = uuidv4()
    let coverUrl: string | null = null
    await withTransaction(async (tx) => {
      if (req.file) coverUrl = await storeMediaAsset(tx, req.file, req.user!.userId, 'event_cover', eventId)
      await tx.run(`
        INSERT INTO events
          (id,title,description,type,category,visibility,organizer_id,college_id,community_id,
           location_type,location,address,latitude,longitude,is_online,meeting_link,starts_at,ends_at,
           max_attendees,allow_waitlist,cover_url,tags,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'upcoming')
      `, [
        eventId, data.title, data.description, data.type, data.category, data.visibility,
          req.user!.userId, eventCollegeId, data.community_id || null, data.location_type,
         data.location, data.address, data.latitude ?? null, data.longitude ?? null,
         data.is_online ? 1 : 0, data.meeting_link || null, startsAt.toISOString(), null,
        data.max_attendees || null, data.allow_waitlist ? 1 : 0, coverUrl, JSON.stringify(data.tags),
      ])
      await tx.run('INSERT INTO event_attendees (event_id,user_id,status) VALUES ($1,$2,$3)', [eventId, req.user!.userId, 'going'])
      await tx.run('INSERT INTO event_hosts (event_id,user_id,role) VALUES ($1,$2,$3)', [eventId, req.user!.userId, 'organizer'])
      await tx.run('UPDATE events SET attendees_count = 1 WHERE id = $1', [eventId])
    })

    const event = await fetchEvent(eventId, req.user!.userId)
    res.status(201).json({ success: true, data: event })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    console.error('[events] create failed:', err?.message || err)
    const status = Number(err?.status || 500)
    const message = status === 400 ? 'Invalid event details.' : status === 403 ? 'You are not allowed to publish this event.' : 'Unable to publish event.'
    res.status(status === 400 || status === 403 ? status : 500).json({ success: false, error: message })
  }
})

eventsRouter.post('/:id/rsvp', requireAuth, async (req, res) => {
  try {
    if (await enforceUserRestriction(req, res, 'events')) return
    const requestedStatus = String(req.body?.status || 'going')
    if (!['going', 'interested', 'not_going'].includes(requestedStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid RSVP status.' })
    }
    let status = requestedStatus
    let event: any
    let previousStatus: string | null = null
    await withTransaction(async (tx) => {
      event = await tx.one<any>('SELECT * FROM events WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!event || event.hidden_at) throw Object.assign(new Error('Event not found.'), { status: 404 })
      const state = eventState(event)
      if (state === 'ended' || state === 'cancelled') throw Object.assign(new Error('This event is no longer accepting RSVPs.'), { status: 400 })

      const existing = await tx.one<any>('SELECT status FROM event_attendees WHERE event_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
      previousStatus = existing?.status || null
      const organizer = await tx.one<any>('SELECT is_banned, is_deactivated FROM users WHERE id = $1', [event.organizer_id])
      if (organizer?.is_banned || organizer?.is_deactivated) throw Object.assign(new Error('This event is no longer available.'), { status: 404 })
      const blocked = await tx.one(
        `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
        [req.user!.userId, event.organizer_id],
      )
      if (blocked) throw Object.assign(new Error('You cannot join this event.'), { status: 403 })
      if (event.visibility === 'private' && event.organizer_id !== req.user!.userId && !existing) {
        const invited = await tx.one(
          `SELECT 1 FROM event_hosts WHERE event_id = $1 AND user_id = $2
           UNION ALL
           SELECT 1 FROM event_invitations WHERE event_id = $1 AND invited_user_id = $2 AND status IN ('pending','accepted')
           LIMIT 1`,
          [req.params.id, req.user!.userId],
        )
        if (!invited) throw Object.assign(new Error('This private event requires an invitation.'), { status: 403 })
      }
      if (status === 'going' && event.max_attendees && Number(event.attendees_count || 0) >= Number(event.max_attendees) && existing?.status !== 'going') {
        if (!asBoolean(event.allow_waitlist)) throw Object.assign(new Error('Event is full.'), { status: 400 })
        status = 'waitlist'
        const next = await tx.one<any>('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM event_waitlist WHERE event_id = $1 AND status = $2', [req.params.id, 'waiting'])
        await tx.run(`
          INSERT INTO event_waitlist (event_id,user_id,position,status) VALUES ($1,$2,$3,'waiting')
          ON CONFLICT (event_id,user_id) DO UPDATE SET status = 'waiting', position = EXCLUDED.position
        `, [req.params.id, req.user!.userId, Number(next?.position || 1)])
      } else {
        await tx.run('DELETE FROM event_waitlist WHERE event_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
      }
      await tx.run(`
        INSERT INTO event_attendees (event_id,user_id,status) VALUES ($1,$2,$3)
        ON CONFLICT (event_id,user_id) DO UPDATE SET status = EXCLUDED.status, created_at = NOW()
      `, [req.params.id, req.user!.userId, status])
      await tx.run(`
        UPDATE events SET
          attendees_count = (SELECT COUNT(*) FROM event_attendees WHERE event_id = $1 AND status = 'going'),
          waitlist_count = (SELECT COUNT(*) FROM event_attendees WHERE event_id = $1 AND status = 'waitlist'),
          updated_at = NOW()
        WHERE id = $1
      `, [req.params.id])
    })

    if (status === 'going') {
      await ensureEventChat(req.params.id, req.user!.userId)
      if (previousStatus !== 'going') {
        await createEventNotification(req.user!.userId, 'event_join_confirmation', null, req.params.id, `You're going to ${event.title}`)
      }
      if (event.organizer_id !== req.user!.userId && previousStatus !== 'going') {
        await createEventNotification(event.organizer_id, 'event_join', req.user!.userId, req.params.id, 'joined your event')
      }
    } else if (status === 'waitlist' && previousStatus !== 'waitlist') {
      await createEventNotification(req.user!.userId, 'event_waitlist', null, req.params.id, 'You are on the event waitlist')
    }
    const totals = await db.one<any>(
      `SELECT COUNT(*) FILTER (WHERE status = 'going')::int AS going,
              COUNT(*) FILTER (WHERE status = 'waitlist')::int AS waitlist
       FROM event_attendees WHERE event_id = $1`,
      [req.params.id],
    )
    res.json({ success: true, data: { status, attendees_count: Number(totals?.going || 0), waitlist_count: Number(totals?.waitlist || 0) } })
  } catch (err: any) {
    const statusCode = Number(err?.status || 500)
    if (statusCode !== 500) {
      const message = statusCode === 403 ? 'You are not allowed to update this RSVP.' : 'Unable to update this RSVP.'
      return res.status(statusCode).json({ success: false, error: message })
    }
    console.error('[events] RSVP failed:', err?.message || err)
    res.status(500).json({ success: false, error: 'Unable to update your RSVP.' })
  }
})

eventsRouter.delete('/:id/rsvp', requireAuth, async (req, res) => {
  try {
    let promotedUserId: string | null = null
    let eventTitle = 'your event'
    await withTransaction(async (tx) => {
      const event = await tx.one<any>('SELECT id, title, max_attendees, status FROM events WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!event || event.status === 'cancelled') throw Object.assign(new Error('Event not found.'), { status: 404 })
      eventTitle = event.title
      const existing = await tx.one<any>('SELECT status FROM event_attendees WHERE event_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
      await tx.run('DELETE FROM event_attendees WHERE event_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
      await tx.run('DELETE FROM event_waitlist WHERE event_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
      await removeEventChatAccess(tx, req.params.id, req.user!.userId)
      if (existing?.status === 'going' && event.max_attendees) {
        promotedUserId = await promoteNextWaitlisted(tx, req.params.id)
      }
      await tx.run(`
        UPDATE events SET attendees_count = (SELECT COUNT(*) FROM event_attendees WHERE event_id = $1 AND status = 'going'),
          waitlist_count = (SELECT COUNT(*) FROM event_attendees WHERE event_id = $1 AND status = 'waitlist')
        WHERE id = $1
      `, [req.params.id])
    })
    await evictEventChatSockets(req.params.id, req.user!.userId)
    if (promotedUserId) {
      await ensureEventChat(req.params.id, promotedUserId)
      await createEventNotification(promotedUserId, 'event_waitlist_available', null, req.params.id, `A spot opened for ${eventTitle}`)
    }
    res.json({ success: true })
  } catch (err: any) {
    res.status(Number(err?.status || 500)).json({ success: false, error: err?.message || 'Unable to leave this event.' })
  }
})

eventsRouter.post('/:id/save', requireAuth, async (req, res) => {
  try {
    const event = await db.one<any>(`
      SELECT e.id, e.visibility, e.organizer_id, u.is_banned, u.is_deactivated,
        EXISTS(SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = $2)
          OR EXISTS(SELECT 1 FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = $2)
          OR EXISTS(SELECT 1 FROM event_invitations ei WHERE ei.event_id = e.id AND ei.invited_user_id = $2 AND ei.status IN ('pending','accepted')) AS has_access
      FROM events e JOIN users u ON u.id = e.organizer_id
      WHERE e.id = $1 AND e.hidden_at IS NULL
    `, [req.params.id, req.user!.userId])
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' })
    const blocked = await db.one(
      `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
      [req.user!.userId, event.organizer_id],
    )
    if (event.is_banned || event.is_deactivated || blocked || (event.visibility === 'private' && event.organizer_id !== req.user!.userId && !event.has_access)) {
      return res.status(403).json({ success: false, error: 'You do not have access to this event.' })
    }
    await db.run('INSERT INTO event_saves (event_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.user!.userId])
    res.json({ success: true, data: { is_saved: true } })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to save this event.' })
  }
})

eventsRouter.delete('/:id/save', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM event_saves WHERE event_id = $1 AND user_id = $2', [req.params.id, req.user!.userId])
    res.json({ success: true, data: { is_saved: false } })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to remove this saved event.' })
  }
})

eventsRouter.get('/:id/attendees', optionalAuth, async (req, res) => {
  try {
    const event = await fetchEvent(req.params.id, req.user?.userId)
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' })
    const status = req.query.status ? String(req.query.status) : ''
    if (status === 'waitlist') {
      if (!req.user?.userId || !(await isEventHost(req.params.id, req.user.userId))) {
        return res.status(403).json({ success: false, error: 'Only event hosts can view the waitlist.' })
      }
      const waitlist = await db.all(`
        SELECT u.id, u.username, u.full_name, u.avatar_url, u.college_name,
          ea.status, ew.position, ew.created_at
        FROM event_attendees ea
        JOIN event_waitlist ew ON ew.event_id = ea.event_id AND ew.user_id = ea.user_id
        JOIN users u ON u.id = ea.user_id
        WHERE ea.event_id = $1 AND ea.status = 'waitlist' AND ew.status = 'waiting'
        ORDER BY ew.position ASC, ew.created_at ASC
      `, [req.params.id])
      return res.json({ success: true, data: waitlist, meta: event.counts })
    }
    const attendees = status
      ? event.attendees.filter((attendee: any) => attendee.status === status)
      : event.attendees
    res.json({
      success: true,
      data: attendees,
      meta: event.counts,
    })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to load attendees.' })
  }
})

eventsRouter.post('/:id/attendees/:userId/promote', requireAuth, async (req, res) => {
  try {
    if (!(await isEventHost(req.params.id, req.user!.userId))) return res.status(403).json({ success: false, error: 'Only event hosts can manage attendees.' })
    await withTransaction(async (tx) => {
      const event = await tx.one<any>('SELECT id, max_attendees, status FROM events WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!event || event.status === 'cancelled') throw Object.assign(new Error('Event not found.'), { status: 404 })
      const going = await tx.one<any>("SELECT COUNT(*)::int AS count FROM event_attendees WHERE event_id = $1 AND status = 'going'", [req.params.id])
      if (event.max_attendees && Number(going?.count || 0) >= Number(event.max_attendees)) throw Object.assign(new Error('The event is still full.'), { status: 400 })
      const waiting = await tx.one<any>("SELECT 1 FROM event_attendees WHERE event_id = $1 AND user_id = $2 AND status = 'waitlist'", [req.params.id, req.params.userId])
      if (!waiting) throw Object.assign(new Error('Student is not on this waitlist.'), { status: 404 })
      await tx.run("UPDATE event_attendees SET status = 'going', created_at = NOW() WHERE event_id = $1 AND user_id = $2", [req.params.id, req.params.userId])
      await tx.run("UPDATE event_waitlist SET status = 'promoted' WHERE event_id = $1 AND user_id = $2", [req.params.id, req.params.userId])
      await tx.run(`
        UPDATE events SET attendees_count = (SELECT COUNT(*) FROM event_attendees WHERE event_id = $1 AND status = 'going'),
          waitlist_count = (SELECT COUNT(*) FROM event_attendees WHERE event_id = $1 AND status = 'waitlist'), updated_at = NOW()
        WHERE id = $1
      `, [req.params.id])
    })
    await ensureEventChat(req.params.id, req.params.userId)
    await createEventNotification(req.params.userId, 'event_waitlist_available', req.user!.userId, req.params.id, 'A host moved you from the waitlist to going')
    res.json({ success: true, data: { status: 'going' } })
  } catch (err: any) {
    const code = Number(err?.status || 500)
    res.status(code).json({ success: false, error: err?.message || 'Unable to promote this attendee.' })
  }
})

eventsRouter.delete('/:id/attendees/:userId', requireAuth, async (req, res) => {
  try {
    if (!(await isEventHost(req.params.id, req.user!.userId))) return res.status(403).json({ success: false, error: 'Only event hosts can manage attendees.' })
    let promotedUserId: string | null = null
    let eventTitle = 'your event'
    await withTransaction(async (tx) => {
      const event = await tx.one<any>('SELECT id, title, status FROM events WHERE id = $1 FOR UPDATE', [req.params.id])
      if (!event || event.status === 'cancelled') throw Object.assign(new Error('Event not found.'), { status: 404 })
      eventTitle = event.title
      const existing = await tx.one<any>('SELECT status FROM event_attendees WHERE event_id = $1 AND user_id = $2', [req.params.id, req.params.userId])
      await tx.run('DELETE FROM event_attendees WHERE event_id = $1 AND user_id = $2', [req.params.id, req.params.userId])
      await tx.run('DELETE FROM event_waitlist WHERE event_id = $1 AND user_id = $2', [req.params.id, req.params.userId])
      if (existing?.status === 'going') promotedUserId = await promoteNextWaitlisted(tx, req.params.id)
      await tx.run(`
        UPDATE events SET attendees_count = (SELECT COUNT(*) FROM event_attendees WHERE event_id = $1 AND status = 'going'),
          waitlist_count = (SELECT COUNT(*) FROM event_attendees WHERE event_id = $1 AND status = 'waitlist'), updated_at = NOW()
        WHERE id = $1
      `, [req.params.id])
    })
    if (promotedUserId) {
      await ensureEventChat(req.params.id, promotedUserId)
      await createEventNotification(promotedUserId, 'event_waitlist_available', req.user!.userId, req.params.id, `A spot opened for ${eventTitle}`)
    }
    if (req.params.userId !== req.user!.userId) {
      await createEventNotification(req.params.userId, 'event_host_update', req.user!.userId, req.params.id, 'A host updated your event attendance')
    }
    res.json({ success: true })
  } catch (err: any) {
    res.status(Number(err?.status || 500)).json({ success: false, error: err?.message || 'Unable to remove this attendee.' })
  }
})

eventsRouter.get('/:id/hosts', optionalAuth, async (req, res) => {
  try {
    const event = await fetchEvent(req.params.id, req.user?.userId)
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' })
    res.json({ success: true, data: event.hosts })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to load hosts.' })
  }
})

eventsRouter.patch('/:id', requireAuth, uploadCover.single('cover'), async (req, res) => {
  try {
    if (!(await isEventHost(req.params.id, req.user!.userId))) return res.status(403).json({ success: false, error: 'Only event hosts can edit this event.' })
    const current = await db.one<any>('SELECT * FROM events WHERE id = $1 AND hidden_at IS NULL', [req.params.id])
    if (!current) return res.status(404).json({ success: false, error: 'Event not found.' })
    const rawBody = typeof req.body?.data === 'string' ? parseJson(req.body.data, {}) : (req.body || {})
    const body = parseRequestBody(req)
    const allowed: Record<string, string> = {
      title: 'title', description: 'description', category: 'category', type: 'type',
      visibility: 'visibility', location_type: 'location_type', location: 'location', address: 'address', meeting_link: 'meeting_link',
      starts_at: 'starts_at', max_attendees: 'max_attendees',
      allow_waitlist: 'allow_waitlist', is_online: 'is_online',
    }
    const fields: string[] = []
    const values: any[] = []
    for (const [key, column] of Object.entries(allowed)) {
      if (!Object.prototype.hasOwnProperty.call(rawBody, key)) continue
      let value = body[key]
      if (key === 'allow_waitlist') value = value ? 1 : 0
      if (key === 'is_online') value = value ? 1 : 0
      if (key === 'max_attendees') {
        value = rawBody[key] === '' || rawBody[key] === null ? null : Number(value)
        if (value !== null && (!Number.isInteger(value) || value < 2)) return res.status(400).json({ success: false, error: 'Capacity must be at least 2.' })
      }
      if (key === 'category' && !EVENT_CATEGORIES.includes(String(value))) return res.status(400).json({ success: false, error: 'Invalid event category.' })
      if (key === 'type' && !EVENT_TYPES.includes(String(value))) return res.status(400).json({ success: false, error: 'Invalid event type.' })
      if (key === 'visibility' && !['public', 'private'].includes(String(value))) return res.status(400).json({ success: false, error: 'Invalid event visibility.' })
      if (key === 'location_type' && !['inside', 'outside'].includes(String(value))) return res.status(400).json({ success: false, error: 'Choose an inside or outside location.' })
      if (key === 'starts_at') {
        const parsedDate = new Date(String(value))
        if (Number.isNaN(parsedDate.getTime())) return res.status(400).json({ success: false, error: 'Choose a valid event date.' })
        if (parsedDate.getTime() <= Date.now()) return res.status(400).json({ success: false, error: 'Events must start in the future.' })
        value = parsedDate.toISOString()
      }
      fields.push(`${column} = $${values.push(value)}`)
    }
    const nextStarts = rawBody.starts_at !== undefined ? new Date(String(body.starts_at)) : new Date(current.starts_at)
    const nextOnline = Object.prototype.hasOwnProperty.call(rawBody, 'is_online') ? Boolean(body.is_online) : Boolean(current.is_online)
    const nextLocationType = Object.prototype.hasOwnProperty.call(rawBody, 'location_type') ? String(body.location_type || '') : String(current.location_type || 'inside')
    const nextLocation = Object.prototype.hasOwnProperty.call(rawBody, 'location') ? String(body.location || '') : String(current.location || '')
    const nextAddress = Object.prototype.hasOwnProperty.call(rawBody, 'address') ? String(body.address || '') : String(current.address || '')
    const nextMeetingLink = Object.prototype.hasOwnProperty.call(rawBody, 'meeting_link') ? String(body.meeting_link || '') : String(current.meeting_link || '')
    if (!nextOnline && !nextLocation.trim()) return res.status(400).json({ success: false, error: 'Add a location or mark the event online.' })
    if (!nextOnline && nextLocationType === 'outside' && nextAddress.trim().length < 8) return res.status(400).json({ success: false, error: 'Add the complete outside address, including street or landmark and city.' })
    if (nextOnline && nextMeetingLink && !/^https?:\/\//i.test(nextMeetingLink)) return res.status(400).json({ success: false, error: 'Meeting link must be a valid URL.' })
    if (Object.prototype.hasOwnProperty.call(rawBody, 'max_attendees') && rawBody.max_attendees !== '' && Number(rawBody.max_attendees) < Number(current.attendees_count || 0)) {
      return res.status(400).json({ success: false, error: 'Capacity cannot be lower than the current going count.' })
    }
    const collegeChanged = Object.prototype.hasOwnProperty.call(rawBody, 'location_type')
      || Object.prototype.hasOwnProperty.call(rawBody, 'college_id')
      || Object.prototype.hasOwnProperty.call(rawBody, 'is_online')
    if (collegeChanged) {
      const requestedCollegeId = Object.prototype.hasOwnProperty.call(rawBody, 'college_id') ? body.college_id : current.college_id
      const nextCollegeId = await resolveEventCollegeId(req.user!.userId, requestedCollegeId, nextLocationType, nextOnline)
      fields.push(`college_id = $${values.push(nextCollegeId)}`)
    }
    if (req.file) {
      await assertImageMagic(req.file)
      const coverUrl = await withTransaction(async (tx) => storeMediaAsset(tx, req.file!, req.user!.userId, 'event_cover', req.params.id))
      fields.push(`cover_url = $${values.push(coverUrl)}`)
    }
    if (!fields.length) return res.status(400).json({ success: false, error: 'No event changes supplied.' })
    fields.push('updated_at = NOW()')
    values.push(req.params.id)
    await db.run(`UPDATE events SET ${fields.join(', ')} WHERE id = $${values.length}`, values)
    const event = await fetchEvent(req.params.id, req.user!.userId)
    res.json({ success: true, data: event })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    res.status(400).json({ success: false, error: err?.message || 'Unable to update this event.' })
  }
})

eventsRouter.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    if (!(await isEventHost(req.params.id, req.user!.userId))) return res.status(403).json({ success: false, error: 'Only event hosts can cancel this event.' })
    if (!(await hardDeleteEvent(req.params.id))) return res.status(404).json({ success: false, error: 'Event not found.' })
    res.json({ success: true, data: { deleted: true } })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to cancel this event.' })
  }
})

eventsRouter.post('/:id/end', requireAuth, async (req, res) => {
  try {
    const event = await db.one<any>('SELECT organizer_id, status FROM events WHERE id = $1 AND hidden_at IS NULL', [req.params.id])
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' })
    if (event.organizer_id !== req.user!.userId) return res.status(403).json({ success: false, error: 'Only the main host can end this event.' })
    if (event.status === 'cancelled') return res.status(404).json({ success: false, error: 'Event not found.' })
    if (!(await hardDeleteEvent(req.params.id))) return res.status(404).json({ success: false, error: 'Event not found.' })
    res.json({ success: true, data: { deleted: true } })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to end this event.' })
  }
})

eventsRouter.get('/:id/announcements', optionalAuth, async (req, res) => {
  try {
    const event = await fetchEvent(req.params.id, req.user?.userId)
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' })
    res.json({ success: true, data: event.announcements })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to load announcements.' })
  }
})

eventsRouter.post('/:id/announcements', requireAuth, async (req, res) => {
  try {
    if (!(await isEventHost(req.params.id, req.user!.userId))) return res.status(403).json({ success: false, error: 'Only event hosts can send announcements.' })
    const body = String(req.body?.body || '').trim()
    if (!body || body.length > 1000) return res.status(400).json({ success: false, error: 'Announcement must be 1–1000 characters.' })
    const announcementId = uuidv4()
    await db.run('INSERT INTO event_announcements (id,event_id,author_id,body) VALUES ($1,$2,$3,$4)', [announcementId, req.params.id, req.user!.userId, body])
    const attendees = await db.all<{ user_id: string }>(`SELECT user_id FROM event_attendees WHERE event_id = $1 AND status = 'going' AND user_id <> $2`, [req.params.id, req.user!.userId])
    for (const attendee of attendees) {
      await createEventNotification(attendee.user_id, 'event_announcement', req.user!.userId, req.params.id, body.slice(0, 160))
    }
    const announcement = await db.one<any>(`
      SELECT ea.*, u.username AS author_username, u.full_name AS author_name, u.avatar_url AS author_avatar
      FROM event_announcements ea JOIN users u ON u.id = ea.author_id WHERE ea.id = $1
    `, [announcementId])
    res.status(201).json({ success: true, data: announcement })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to send announcement.' })
  }
})

eventsRouter.post('/:id/invitations', requireAuth, async (req, res) => {
  try {
    if (!(await isEventHost(req.params.id, req.user!.userId))) return res.status(403).json({ success: false, error: 'Only event hosts can invite students.' })
    const inviteIdentifier = String(req.body?.user_id || req.body?.username || '').trim().toLowerCase()
    const invited = await db.one<any>('SELECT id, username FROM users WHERE (id = $1 OR LOWER(username) = $1) AND COALESCE(is_banned,0) = 0 AND COALESCE(is_deactivated,0) = 0', [inviteIdentifier])
    if (!invited) return res.status(404).json({ success: false, error: 'Student not found.' })
    await db.run(`
      INSERT INTO event_invitations (id,event_id,invited_user_id,invited_by)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (event_id,invited_user_id) DO UPDATE SET status = 'pending', responded_at = NULL
    `, [uuidv4(), req.params.id, invited.id, req.user!.userId])
    await createEventNotification(invited.id, 'event_invitation', req.user!.userId, req.params.id, 'invited you to an event')
    res.status(201).json({ success: true, data: { user_id: invited.id, username: invited.username } })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to send the invitation.' })
  }
})

eventsRouter.post('/:id/hosts', requireAuth, async (req, res) => {
  try {
    const event = await db.one<any>('SELECT organizer_id FROM events WHERE id = $1 AND hidden_at IS NULL', [req.params.id])
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' })
    if (event.organizer_id !== req.user!.userId) return res.status(403).json({ success: false, error: 'Only the organizer can manage co-hosts.' })
    const identifier = String(req.body?.user_id || req.body?.username || '').trim().toLowerCase()
    const invited = await db.one<any>('SELECT id, username FROM users WHERE (id = $1 OR LOWER(username) = $1) AND COALESCE(is_banned,0) = 0 AND COALESCE(is_deactivated,0) = 0', [identifier])
    if (!invited) return res.status(404).json({ success: false, error: 'Student not found.' })
    if (invited.id === req.user!.userId) return res.status(400).json({ success: false, error: 'You are already the organizer.' })
    await db.run(`
      INSERT INTO event_hosts (event_id, user_id, role) VALUES ($1,$2,'host')
      ON CONFLICT (event_id,user_id) DO UPDATE SET role = 'host'
    `, [req.params.id, invited.id])
    await createEventNotification(invited.id, 'event_host_update', req.user!.userId, req.params.id, 'You were added as a co-host')
    res.status(201).json({ success: true, data: { user_id: invited.id, username: invited.username, role: 'host' } })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to add this co-host.' })
  }
})

eventsRouter.delete('/:id/hosts/:userId', requireAuth, async (req, res) => {
  try {
    const event = await db.one<any>('SELECT organizer_id FROM events WHERE id = $1 AND hidden_at IS NULL', [req.params.id])
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' })
    if (event.organizer_id !== req.user!.userId || req.params.userId === event.organizer_id) return res.status(403).json({ success: false, error: 'Only the organizer can manage co-hosts.' })
    await db.run('DELETE FROM event_hosts WHERE event_id = $1 AND user_id = $2', [req.params.id, req.params.userId])
    await createEventNotification(req.params.userId, 'event_host_update', req.user!.userId, req.params.id, 'You were removed as a co-host')
    res.json({ success: true })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to remove this co-host.' })
  }
})

eventsRouter.get('/:id/chat', requireAuth, async (req, res) => {
  try {
    const conversationId = await ensureEventChat(req.params.id, req.user!.userId)
    if (!conversationId) return res.status(403).json({ success: false, error: 'Join this event to access its chat.' })
    res.json({ success: true, data: { conversation_id: conversationId } })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to open event chat.' })
  }
})

eventsRouter.post('/:id/report', requireAuth, async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim()
    if (!reason) return res.status(400).json({ success: false, error: 'Report reason required.' })
    const report = await withTransaction((tx) => createReportWithCase(tx, {
      reporterId: req.user!.userId,
      entityId: req.params.id,
      entityType: 'event',
      reason,
      description: req.body?.description,
    }))
    res.status(201).json({ success: true, data: report })
  } catch {
    res.status(500).json({ success: false, error: 'Unable to submit this report.' })
  }
})