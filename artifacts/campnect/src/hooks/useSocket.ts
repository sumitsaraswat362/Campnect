import { DEMO_MODE } from '../demo/config'
import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import { useChatStore } from '../stores/chatStore'
import { API_ORIGIN } from '../api/client'

// Track current socket + the token it was authenticated with
let globalSocket: Socket | null = null
let globalSocketToken: string | null = null

// Normalize and validate a socket notification:new payload before storing
function handleNotificationNew(raw: any) {
  if (!raw || typeof raw !== 'object' || !raw.type) return
  if (raw.type === 'message') {
    dispatchMessagePreview(raw)
    return
  }
  const notif = {
    id:             raw.id             ?? `rt-${Date.now()}-${Math.random()}`,
    user_id:        raw.user_id        ?? '',
    actor_id:       raw.actor_id       ?? null,
    actor_name:     raw.actor_name     ?? null,
    actor_username: raw.actor_username ?? null,
    actor_avatar:   raw.actor_avatar   ?? null,
    type:           raw.type,
    entity_type:    raw.entity_type    ?? null,
    entity_id:      raw.entity_id      ?? null,
    content:        raw.content        ?? null,
    is_read:        raw.is_read        ?? 0,
    created_at:     raw.created_at     ?? new Date().toISOString(),
  }
  useNotificationStore.getState().prependNotification(notif)

  // Surface incoming events outside the notification screen while the app is
  // open. Native closed-app push remains a Firebase/FCM concern; browsers and
  // supported WebViews can still show a system notification here.
  if (
    raw.type === 'message' &&
    typeof window !== 'undefined' &&
    document.visibilityState !== 'visible' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    try {
      new Notification(raw.actor_name ? `${raw.actor_name} sent you a message` : 'New Campnect message', {
        body: raw.content || 'Open Campnect to read it.',
        tag: `campnect-message-${raw.entity_id || raw.id}`,
      })
    } catch {}
  }
}

function dispatchMessagePreview(raw: any) {
  if (!raw || typeof raw !== 'object' || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('campnect:message-preview', {
    detail: {
      id: raw.id ?? `message-${Date.now()}-${Math.random()}`,
      conversationId: raw.conversation_id ?? raw.entity_id ?? null,
      actorName: raw.actor_name ?? raw.actor_username ?? 'New message',
      actorAvatar: raw.actor_avatar ?? null,
      preview: formatMessageNotificationPreview(raw.content, raw.message_type),
    },
  }))
}

function formatMessageNotificationPreview(content: unknown, messageType: unknown): string {
  if (messageType === 'image') return 'sent you an image'
  if (messageType === 'audio') return 'sent you a voice note'
  if (messageType === 'video') return 'sent you a video'
  if (messageType === 'file') return 'sent you a file'

  if (typeof content !== 'string' || !content.trim()) return 'sent you a message'
  const normalized = content.trim()
  if (/^sent you an image$/i.test(normalized) || /\[image\]/i.test(normalized)) return 'sent you an image'
  if (/^sent you a voice note$/i.test(normalized) || /\[audio\]/i.test(normalized)) return 'sent you a voice note'
  if (/^sent you a video$/i.test(normalized) || /\[video\]/i.test(normalized)) return 'sent you a video'
  if (/^sent you a file$/i.test(normalized) || /\[file\]/i.test(normalized)) return 'sent you a file'
  if (/^sent you a link$/i.test(normalized)) return 'sent you a link'

  const preview = normalized.replace(/^sent you a message\s*:?\s*/i, '').trim()
  if (containsExternalLink(preview)) return 'sent you a link'
  return preview || 'sent you a message'
}

function containsExternalLink(value: string): boolean {
  return /(?:https?:\/\/|www\.)[^\s]+/i.test(value)
}

function handleMessageNew(raw: any) {
  if (!raw || typeof raw !== 'object' || !raw.conversation_id) return
  useChatStore.getState().handleNewMessage(raw)
}

function handleMessageError(raw: any) {
  useChatStore.getState().handleMessageError(raw || {})
}

function dispatchGlimpseRefresh() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('campnect:glimpse-refresh'))
}

function createSocket(token: string): Socket {
  // Disconnect any stale socket before creating a new one
  if (globalSocket) {
    globalSocket.off('notification:new', handleNotificationNew)
    globalSocket.off('message:preview', dispatchMessagePreview)
    globalSocket.off('message:new', handleMessageNew)
    globalSocket.off('message:error', handleMessageError)
    globalSocket.off('glimpse:refresh', dispatchGlimpseRefresh)
    globalSocket.disconnect()
    globalSocket = null
    globalSocketToken = null
  }

  const socket = io(API_ORIGIN || '/', {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  })

  // Attach app-level socket events once per socket instance
  socket.on('notification:new', handleNotificationNew)
  socket.on('message:preview', dispatchMessagePreview)
  socket.on('message:new', handleMessageNew)
  socket.on('message:error', handleMessageError)
  socket.on('glimpse:refresh', dispatchGlimpseRefresh)
  socket.on('presence:update', ({ userId, online, lastSeen }: { userId: string; online: boolean; lastSeen?: string }) => {
    if (!userId || typeof online !== 'boolean') return
    useChatStore.getState().setOnline(userId, online, lastSeen)
  })

  globalSocket = socket
  globalSocketToken = token
  return socket
}

export function useSocket() {
  const token = useAuthStore((s) => s.token)
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (DEMO_MODE) return
    if (!token) {
      // Logged out — disconnect existing socket
      if (globalSocket) {
        globalSocket.off('notification:new', handleNotificationNew)
        globalSocket.off('message:preview', dispatchMessagePreview)
        globalSocket.off('message:new', handleMessageNew)
        globalSocket.off('message:error', handleMessageError)
        globalSocket.off('glimpse:refresh', dispatchGlimpseRefresh)
        globalSocket.disconnect()
        globalSocket = null
        globalSocketToken = null
      }
      socketRef.current = null
      setIsConnected(false)
      return
    }

    // Reuse only if the token matches the connected socket's token —
    // notification:new is already registered on the global socket from createSocket()
    if (globalSocket?.connected && globalSocketToken === token) {
      socketRef.current = globalSocket
      setIsConnected(true)
      return
    }

    // Token changed or no socket yet — create fresh (registers notification:new inside)
    const socket = createSocket(token)
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      void useChatStore.getState().fetchConversations()
    })
    socket.on('disconnect', () => {
      setIsConnected(false)
      useChatStore.getState().clearOnlinePresence()
      useChatStore.getState().fetchConversations()
    })
    socket.on('connect_error', () => setIsConnected(false))

    return () => {
      // notification:new lives on the global socket and must not be removed here —
      // it outlives any single component mount
    }
  }, [token])

  return { socket: socketRef.current, isConnected }
}

/** Get the global socket without subscribing to auth changes */
export function getSocket(): Socket | null {
  return globalSocket
}
