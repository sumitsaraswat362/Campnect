// @ts-nocheck
import { db } from '../legacy-db/index.js'

const ONESIGNAL_APP_ID = '2b238093-c625-4a5b-9825-364c8001de61'

const preferenceForType: Record<string, string> = {
  like: 'likes',
  comment: 'comments',
  follow: 'follows',
  mention: 'mentions',
  community: 'community_activity',
  community_post: 'community_activity',
  community_announcement: 'community_activity',
  group: 'group_activity',
  message: 'group_activity',
  message_request: 'group_activity',
  message_request_accepted: 'group_activity',
  message_request_declined: 'group_activity',
  message_reaction: 'group_activity',
  event: 'college_notices',
  system: 'college_notices',
  alumni_request: 'college_notices',
}

function parsePreferences(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return {
      ...parsed,
      group_activity: parsed.group_activity ?? parsed.groupActivity,
      community_activity: parsed.community_activity ?? parsed.communityActivity,
      college_notices: parsed.college_notices ?? parsed.collegeNotices,
    }
  } catch {
    return {}
  }
}

function buildNotificationPath(notification: Record<string, unknown>): string {
  const entityType = String(notification.entity_type || '')
  const entityId = typeof notification.entity_id === 'string' ? notification.entity_id : ''
  const type = String(notification.type || '')

  if (type === 'follow' && notification.actor_username) return `/app/profile/${encodeURIComponent(String(notification.actor_username))}`
  if (['like', 'comment', 'mention'].includes(type) && entityId) {
    if (entityType === 'glimpse') return `/app/glimpse/${encodeURIComponent(entityId)}`
    if (entityType === 'clip') return `/app/clips/${encodeURIComponent(entityId)}`
    return `/app/post/${encodeURIComponent(entityId)}`
  }
  if (type === 'message' && entityType === 'conversation' && entityId) {
    return `/app/chat/${encodeURIComponent(entityId)}`
  }
  if (type.startsWith('message_request')) return '/app/chat'
  if (entityType === 'event' && entityId) return `/app/events/${encodeURIComponent(entityId)}`
  return '/app/notifications'
}

function buildTitle(notification: Record<string, unknown>): string {
  const actor = String(notification.actor_name || 'Someone')
  const entityType = String(notification.entity_type || '')
  const contentLabel = entityType === 'glimpse' ? 'Glimpse' : entityType === 'clip' ? 'Clip' : 'post'
  switch (notification.type) {
    case 'message': return `${actor} sent you a message`
    case 'message_request': return `${actor} sent you a message request`
    case 'message_reaction': return `${actor} reacted to your message`
    case 'follow': return `${actor} started following you`
    case 'like': return `${actor} liked your ${contentLabel}`
    case 'comment': return `${actor} commented on your ${contentLabel}`
    case 'mention': return `${actor} mentioned you`
    default: return 'New Campnect notification'
  }
}

export async function sendOneSignalNotification(notification: Record<string, unknown>): Promise<void> {
  const recipientId = String(notification.user_id || '')
  if (!recipientId) return

  try {
    const preferenceKey = preferenceForType[String(notification.type || '')]
    if (preferenceKey) {
      const preferences = await db.one<any>(
        'SELECT notification_prefs FROM users WHERE id = $1',
        [recipientId],
      )
      const parsed = parsePreferences(preferences?.notification_prefs)
      if (parsed[preferenceKey] === false) return
    }

    const apiKey = process.env.ONESIGNAL_REST_API_KEY
    if (!apiKey) {
      return
    }
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        target_channel: 'push',
        include_aliases: { external_id: [recipientId] },
        headings: { en: buildTitle(notification) },
        contents: { en: String(notification.content || 'Open Campnect to see what happened.') },
        data: {
          path: buildNotificationPath(notification),
          notificationId: notification.id || null,
          notificationType: notification.type || null,
          conversationId: notification.entity_type === 'conversation' ? notification.entity_id || null : null,
          actorName: notification.actor_name || notification.actor_username || null,
          actorAvatar: notification.actor_avatar || null,
          preview: notification.content || null,
        },
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.warn('OneSignal push delivery failed.', response.status, detail.slice(0, 300))
    }
  } catch (error: any) {
    // Push delivery must never delay or fail the underlying Campnect action.
    console.warn('OneSignal push delivery was unavailable.', error?.message || error)
  }
}