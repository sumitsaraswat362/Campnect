import { create } from 'zustand'
import { DEMO_MODE } from '../demo/config'
import client from '../api/client'
import { chatApi } from '../api/chat'
import { getSocket } from '../hooks/useSocket'
import { reconcileFetchedConversationPresence, updateConversationPresence } from './chatPresence'
import { mergeChatMessages, orderChatMessages } from '../utils/chatMessageOrder'

export interface ConversationMember {
  id: string
  username: string
  full_name: string
  avatar_url?: string
  is_college_verified: number
  is_online: number
  last_seen?: string
  role: string
  tag?: string
  admin_rights?: Record<string, boolean>
  joined_at?: string
}

export interface Reaction {
  emoji: string
  count: number
}

export interface ReplyTo {
  id: string
  content?: string
  type: string
  username: string
  full_name: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'gif' | 'sticker' | 'system'
  content?: string
  media_url?: string
  media_type?: string
  reply_to_id?: string
  reply_to?: ReplyTo | null
  is_deleted: number
  is_edited: number
  is_pinned: number
  is_pending?: boolean
  is_failed?: boolean
  username: string
  full_name: string
  avatar_url?: string
  reactions: Reaction[]
  created_at: string
}

export interface Conversation {
  id: string
  type: 'private' | 'group' | 'event'
  name?: string
  description?: string
  avatar_url?: string
  event_id?: string
  event_status?: string
  members: ConversationMember[]
  unread_count: number
  last_message_at?: string
  last_message_preview?: string
  last_message_id?: string
  is_request?: number
  is_muted?: number
  // Group-specific
  created_by?: string
  invite_link?: string
  invite_link_active?: number
  requires_approval?: number
  pinned_message_id?: string
  my_role?: string
  is_blocked?: boolean
  blocked_by_me?: boolean
  blocked_me?: boolean
}

function messagePreview(content?: string | null, type = 'text') {
  if (type === 'text' && content?.startsWith('__POST_SHARE__:')) return 'Shared a post'
  if (type === 'sticker') return 'Sent a sticker'
  if (type === 'gif') return 'Sent a GIF'
  return type === 'text' ? (content || '') : `[${type}]`
}

interface ChatState {
  conversations: Conversation[]
  requests: Conversation[]
  messages: Record<string, Message[]>
  typingUsers: Record<string, string[]>
  onlineUsers: Set<string>
  presenceRevision: number
  presenceByUser: Record<string, { online: boolean; lastSeen?: string }>
  hasMore: Record<string, boolean>
  loading: boolean

  fetchConversations: () => Promise<void>
  fetchRequests: () => Promise<void>
  acceptRequest: (convId: string) => Promise<void>
  declineRequest: (convId: string) => Promise<void>
  blockRequest: (convId: string) => Promise<void>
  fetchMessages: (convId: string, before?: string) => Promise<void>
  sendMessage: (convId: string, text: string, replyToId?: string, senderInfo?: { id: string; username: string; full_name: string; avatar_url?: string }, type?: Message['type']) => Promise<void>
  retrySend: (convId: string, tempId: string) => void
  editMessage: (msgId: string, convId: string, content: string) => Promise<void>
  deleteMessage: (msgId: string, convId: string, forEveryone: boolean) => Promise<void>
  reactToMessage: (msgId: string, convId: string, emoji: string) => Promise<void>
  markRead: (convId: string) => void
  upsertConversation: (conv: Conversation) => void
  createConversation: (memberIds: string[]) => Promise<Conversation>
  removeConversation: (convId: string) => void

  // Socket event handlers
  handleNewMessage: (msg: Message) => void
  handleMessageError: (data: { error?: string }) => void
  handleMessageEdited: (data: { id: string; content: string; is_edited: number }) => void
  handleMessageDeleted: (data: { id: string }) => void
  handleReactions: (data: { messageId: string; reactions: Reaction[] }) => void
  handleMessagePinned: (data: { messageId: string; is_pinned: number }) => void
  setTyping: (convId: string, username: string, isTyping: boolean) => void
  setOnline: (userId: string, online: boolean, lastSeen?: string) => void
  clearOnlinePresence: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  requests: [],
  messages: {},
  typingUsers: {},
  onlineUsers: new Set(),
  presenceRevision: 0,
  presenceByUser: {},
  hasMore: {},
  loading: false,

  fetchConversations: async () => {
    const presenceRevisionAtStart = get().presenceRevision
    set({ loading: true })
    try {
      const res = await chatApi.getConversations()
      const conversations = (res.data.data || []).map((conversation: Conversation) => ({
        ...conversation,
        last_message_preview: conversation.last_message_preview || undefined,
      }))
       set((state) => {
         const synchronized = state.presenceRevision === presenceRevisionAtStart
           ? conversations
           : reconcileFetchedConversationPresence(conversations, state.presenceByUser)
         return { conversations: synchronized, loading: false }
       })
    } catch {
      set({ loading: false })
    }
  },

  fetchRequests: async () => {
    try {
      const res = await chatApi.getRequests()
      set({ requests: res.data.data || [] })
    } catch { }
  },

  acceptRequest: async (convId) => {
    const res = await chatApi.acceptRequest(convId)
    const accepted: Conversation = res.data.data
    set((s) => ({
      requests: s.requests.filter((r) => r.id !== convId),
      conversations: [accepted, ...s.conversations.filter((c) => c.id !== convId)],
    }))
  },

  declineRequest: async (convId) => {
    await chatApi.declineRequest(convId)
    set((s) => ({ requests: s.requests.filter((r) => r.id !== convId) }))
  },

  blockRequest: async (convId) => {
    await chatApi.blockRequest(convId)
    set((s) => ({
      requests: s.requests.filter((r) => r.id !== convId),
      conversations: s.conversations.filter((c) => c.id !== convId),
      messages: Object.fromEntries(Object.entries(s.messages).filter(([id]) => id !== convId)),
    }))
  },

  fetchMessages: async (convId, before) => {
    try {
      const res = await chatApi.getMessages(convId, before)
      const newMsgs: Message[] = res.data.data || []
      set((s) => ({
        messages: {
          ...s.messages,
          [convId]: mergeChatMessages(s.messages[convId] || [], newMsgs),
        },
        hasMore: { ...s.hasMore, [convId]: res.data.meta?.hasMore ?? false },
      }))
    } catch { }
  },

  sendMessage: async (convId, text, replyToId, senderInfo, type = 'text') => {
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`
    if (senderInfo) {
      const tempMsg: Message = {
        id: tempId,
        conversation_id: convId,
        sender_id: senderInfo.id,
        type,
        content: text,
        reply_to_id: replyToId,
        reply_to: null,
        is_deleted: 0,
        is_edited: 0,
        is_pinned: 0,
        is_pending: true,
        username: senderInfo.username,
        full_name: senderInfo.full_name,
        avatar_url: senderInfo.avatar_url,
        reactions: [],
        created_at: '',
      }
      set((s) => ({
        messages: { ...s.messages, [convId]: orderChatMessages([...(s.messages[convId] || []), tempMsg]) },
        conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, last_message_preview: messagePreview(text, type), last_message_at: tempMsg.created_at } : c
        ),
      }))
    }

    // Use the authenticated REST endpoint as the source of truth for sends.
    // Socket.IO is still used for realtime delivery, but it has no reliable
    // acknowledgement for the sender: a connected socket can accept an emit
    // and then fail server-side without telling the client. REST gives us a
    // concrete response and also handles native token refresh consistently.
    const fd = new FormData()
    fd.append('type', type)
    fd.append('content', text)
    if (replyToId) fd.append('reply_to_id', replyToId)
    try {
      const res = await chatApi.sendMessage(convId, fd)
      const sent: Message = res.data.data
      set((s) => {
        const current = s.messages[convId] || []
        const nextMessages = orderChatMessages([
          ...current.filter((m) => m.id !== tempId && m.id !== sent.id),
          sent,
        ])
        return {
          messages: { ...s.messages, [convId]: nextMessages },
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? { ...c, last_message_preview: messagePreview(sent.content, sent.type), last_message_at: sent.created_at }
              : c
          ),
        }
      })
    } catch {
      set((s) => ({
        messages: {
          ...s.messages,
          [convId]: (s.messages[convId] || []).map((m) =>
            m.id === tempId ? { ...m, is_pending: false, is_failed: true } : m
          ),
        },
      }))
    }
  },

  retrySend: (convId, tempId) => {
    const pending = (get().messages[convId] || []).find((m) => m.id === tempId)
    if (!pending) return
    set((s) => ({
      messages: { ...s.messages, [convId]: (s.messages[convId] || []).filter((m) => m.id !== tempId) },
    }))
    void get().sendMessage(convId, pending.content || '', pending.reply_to_id, {
      id: pending.sender_id,
      username: pending.username,
      full_name: pending.full_name,
      avatar_url: pending.avatar_url,
    }, pending.type)
  },

  editMessage: async (msgId, convId, content) => {
    await chatApi.editMessage(msgId, content)
    set((s) => ({
      messages: {
        ...s.messages,
        [convId]: (s.messages[convId] || []).map((m) =>
          m.id === msgId ? { ...m, content, is_edited: 1 } : m
        ),
      },
    }))
  },

  deleteMessage: async (msgId, convId, forEveryone) => {
    await chatApi.deleteMessage(msgId, forEveryone)
    set((s) => ({
      messages: {
        ...s.messages,
        [convId]: forEveryone
          ? (s.messages[convId] || []).map((m) => m.id === msgId ? { ...m, is_deleted: 1, content: undefined } : m)
          : (s.messages[convId] || []).filter((m) => m.id !== msgId),
      },
    }))
    await get().fetchConversations()
  },

  reactToMessage: async (msgId, _convId, emoji) => {
    const socket = getSocket()
    if (socket?.connected) {
      socket.emit('message:react', { messageId: msgId, emoji })
    } else {
      const res = await chatApi.reactToMessage(msgId, emoji)
      get().handleReactions({ messageId: msgId, reactions: res.data.data })
    }
  },

  markRead: (convId) => {
    if (DEMO_MODE) void client.get(`/chat/conversations/${convId}/messages`, { params: { limit: 1 } })
    const socket = getSocket()
    if (socket?.connected) socket.emit('message:read', { conversationId: convId })
    set((s) => ({
      conversations: s.conversations.map((c) => c.id === convId ? { ...c, unread_count: 0 } : c),
    }))
  },

  upsertConversation: (conv) => {
    set((s) => {
      const idx = s.conversations.findIndex((c) => c.id === conv.id)
      const previous = idx >= 0 ? s.conversations[idx] : undefined
      // Conversation updates from sockets and partial API responses should not
      // erase an already-known group avatar when that response omits it.
      const next = previous
        ? { ...previous, ...conv, avatar_url: conv.avatar_url ?? previous.avatar_url }
        : conv
      const updated = idx >= 0
        ? s.conversations.map((c, i) => (i === idx ? next : c))
        : [next, ...s.conversations]
      return { conversations: updated }
    })
  },

  removeConversation: (convId) => {
    set((s) => ({ conversations: s.conversations.filter((c) => c.id !== convId) }))
  },

  createConversation: async (memberIds) => {
    const targetId = memberIds[0]
    const res = await chatApi.createDM(targetId)
    const conv: Conversation = res.data.data
    set((s) => {
      const idx = s.conversations.findIndex((c) => c.id === conv.id)
      const updated = idx >= 0
        ? s.conversations.map((c, i) => (i === idx ? conv : c))
        : [conv, ...s.conversations]
      return { conversations: updated }
    })
    return conv
  },

  // ─── Socket event handlers ─────────────────────────────────────────────────
  handleNewMessage: (msg) => {
    set((s) => {
      const convMsgs = s.messages[msg.conversation_id] || []
      if (convMsgs.some((m) => m.id === msg.id)) return s
      // Socket delivery confirms the optimistic message we inserted locally.
      // Replace that pending row instead of appending a second copy.
      const pendingIndex = convMsgs.findIndex((m) =>
        m.is_pending &&
        m.sender_id === msg.sender_id &&
        m.type === msg.type &&
        m.content === msg.content &&
        (m.reply_to_id || null) === (msg.reply_to_id || null)
      )
      if (pendingIndex >= 0) {
        const next = [...convMsgs]
        next[pendingIndex] = msg
        return {
          messages: { ...s.messages, [msg.conversation_id]: orderChatMessages(next) },
          conversations: s.conversations.map((c) =>
            c.id === msg.conversation_id
              ? { ...c, last_message_preview: messagePreview(msg.content, msg.type), last_message_at: msg.created_at }
              : c
          ),
        }
      }
      return {
        messages: { ...s.messages, [msg.conversation_id]: orderChatMessages([...convMsgs, msg]) },
        conversations: s.conversations.map((c) =>
          c.id === msg.conversation_id
            ? { ...c, last_message_preview: messagePreview(msg.content, msg.type), last_message_at: msg.created_at }
            : c
        ),
      }
    })
  },

  handleMessageError: () => {
    // The most recently sent-but-unconfirmed pending message across all open
    // conversations is the one this error refers to (the socket protocol
    // doesn't echo a client correlation id back).
    set((s) => {
      let convId: string | null = null
      let latest: Message | null = null
      for (const [cid, msgs] of Object.entries(s.messages)) {
        for (const m of msgs) {
          if (m.is_pending && (!latest || m.created_at > latest.created_at)) {
            latest = m
            convId = cid
          }
        }
      }
      if (!convId || !latest) return s
      return {
        messages: {
          ...s.messages,
          [convId]: s.messages[convId].map((m) =>
            m.id === latest!.id ? { ...m, is_pending: false, is_failed: true } : m
          ),
        },
      }
    })
  },

  handleMessageEdited: (data) => {
    const id = (data as any).messageId ?? (data as any).id
    const content = (data as any).content
    const is_edited = (data as any).is_edited ?? 1
    set((s) => {
      const updated: Record<string, Message[]> = {}
      for (const [convId, msgs] of Object.entries(s.messages)) {
        updated[convId] = msgs.map((m) => (m.id === id ? { ...m, content, is_edited } : m))
      }
      return { messages: updated }
    })
  },

  handleMessageDeleted: (data) => {
    const id = (data as any).messageId ?? (data as any).id
    set((s) => {
      const updated: Record<string, Message[]> = {}
      for (const [convId, msgs] of Object.entries(s.messages)) {
        updated[convId] = msgs.map((m) => (m.id === id ? { ...m, is_deleted: 1, content: undefined } : m))
      }
      return { messages: updated }
    })
    void get().fetchConversations()
  },

  handleReactions: ({ messageId, reactions }) => {
    set((s) => {
      const updated: Record<string, Message[]> = {}
      for (const [convId, msgs] of Object.entries(s.messages)) {
        updated[convId] = msgs.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      }
      return { messages: updated }
    })
  },

  handleMessagePinned: ({ messageId, is_pinned }) => {
    set((s) => {
      const updated: Record<string, Message[]> = {}
      for (const [convId, msgs] of Object.entries(s.messages)) {
        updated[convId] = msgs.map((m) => (m.id === messageId ? { ...m, is_pinned } : m))
      }
      return { messages: updated }
    })
  },

  setTyping: (convId, username, isTyping) => {
    set((s) => {
      const current = s.typingUsers[convId] || []
      const next = isTyping
        ? current.includes(username) ? current : [...current, username]
        : current.filter((u) => u !== username)
      return { typingUsers: { ...s.typingUsers, [convId]: next } }
    })
  },

  setOnline: (userId, online, lastSeen) => {
    set((s) => {
      const next = new Set(s.onlineUsers)
      online ? next.add(userId) : next.delete(userId)
      return {
        onlineUsers: next,
        presenceRevision: s.presenceRevision + 1,
        presenceByUser: { ...s.presenceByUser, [userId]: { online, ...(lastSeen ? { lastSeen } : {}) } },
        conversations: updateConversationPresence(s.conversations, userId, online, lastSeen),
        requests: updateConversationPresence(s.requests, userId, online, lastSeen),
      }
    })
  },

  clearOnlinePresence: () => {
    set((s) => ({
      onlineUsers: new Set(),
    }))
  },
}))
