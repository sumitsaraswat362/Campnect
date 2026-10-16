import { create } from 'zustand'
import { notificationsApi } from '../api/notifications'

export interface Notification {
  id: string
  user_id: string
  actor_id?: string
  actor_username?: string
  actor_name?: string
  actor_avatar?: string
  type: string
  entity_type?: string
  entity_id?: string
  content?: string
  is_read: number
  created_at: string
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  loading: boolean

  fetchNotifications: (type?: string) => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  prependNotification: (n: Notification) => void
  refreshUnread: () => Promise<void>
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async (type) => {
    set({ loading: true })
    try {
      const params: Record<string, string | number> = { limit: 50 }
      if (type && type !== 'all') params.type = type
      const res = await notificationsApi.getAll(params)
      const notifications = (res.data.data || []).filter((notification: Notification) => notification.type !== 'message')
      set({
        notifications,
        unreadCount: notifications.filter((notification: Notification) => !notification.is_read).length,
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },

  markRead: async (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, is_read: 1 } : n
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }))
    try { await notificationsApi.markRead(id) } catch {}
  },

  markAllRead: async () => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, is_read: 1 })),
      unreadCount: 0,
    }))
    try { await notificationsApi.markAllRead() } catch {}
  },

  prependNotification: (n) => {
    if (n.type === 'message') return
    set((s) => ({
      notifications: [n, ...s.notifications],
      unreadCount: s.unreadCount + 1,
    }))
  },

  refreshUnread: async () => {
    try {
      const res = await notificationsApi.getAll({ limit: 1 })
      set({ unreadCount: res.data.meta?.unread_count ?? 0 })
    } catch {}
  },
}))
