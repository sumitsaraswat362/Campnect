// @ts-nocheck
import { v5 as uuidv5 } from 'uuid'
import { db } from '../legacy-db/index.js'
import { emitUserNotification } from '../legacy-socket/io.js'

const MESSAGE_NOTIFICATION_NAMESPACE = '9bd2471e-572b-594d-a4c1-b68e72f4e518'

export function messageNotificationContent(type: string, content?: string | null): string {
  if (type === 'image') return 'sent you an image'
  if (type === 'sticker') return 'sent you a sticker'
  if (type === 'gif') return 'sent you a GIF'
  if (type === 'audio') return 'sent you a voice note'
  if (type === 'video') return 'sent you a video'
  if (type === 'file') return 'sent you a file'
  if (type === 'text' && /(?:https?:\/\/|www\.)[^\s]+/i.test(content || '')) return 'sent you a link'
  const preview = type === 'text'
    ? (content?.startsWith('__POST_SHARE__:') ? 'Shared a post' : (content || '').slice(0, 80))
    : `[${type}]`
  return `sent you a message${preview ? `: ${preview}` : ''}`
}

export function messageNotificationId(messageId: string, recipientId: string): string {
  return uuidv5(`message:${messageId}:recipient:${recipientId}`, MESSAGE_NOTIFICATION_NAMESPACE)
}

export async function dispatchMessageNotifications(
  {
    conversationId,
    messageId,
    senderId,
    sender,
    recipientIds,
    content,
  }: {
    conversationId: string
    messageId: string
    senderId: string
    sender: { username?: string | null, full_name?: string | null, avatar_url?: string | null }
    recipientIds: string[]
    content: string
  },
  dependencies: { database?: typeof db, emit?: typeof emitUserNotification } = {},
): Promise<void> {
  const database = dependencies.database || db
  const emit = dependencies.emit || emitUserNotification
  const recipients = [...new Set(recipientIds.filter((recipientId) => recipientId && recipientId !== senderId))]

  for (const recipientId of recipients) {
    const notification = {
      id: messageNotificationId(messageId, recipientId),
      user_id: recipientId,
      actor_id: senderId,
      actor_username: sender.username || null,
      actor_name: sender.full_name || sender.username || 'Someone',
      actor_avatar: sender.avatar_url || null,
      type: 'message',
      entity_type: 'conversation',
      entity_id: conversationId,
      content,
      is_read: 0,
      extra_data: { message_id: messageId },
    }
    const inserted = await database.one<any>(
      `INSERT INTO notifications (id, user_id, type, actor_id, entity_id, entity_type, content, extra_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        notification.id,
        notification.user_id,
        notification.type,
        notification.actor_id,
        notification.entity_id,
        notification.entity_type,
        notification.content,
        JSON.stringify(notification.extra_data),
      ],
    )
    if (inserted?.id) emit(recipientId, notification)
  }
}