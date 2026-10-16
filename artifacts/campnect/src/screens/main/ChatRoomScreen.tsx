import { DEMO_MODE } from '../../demo/config'
import { useCallStore } from '../../stores/callStore'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { Pin, X, ChevronDown, Info, Users, ChevronLeft, MoreHorizontal, Ban, UserRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { useChatStore, Conversation, Message } from '../../stores/chatStore'
import { isConversationMemberOnline } from '../../stores/chatPresence'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/shared/Avatar'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { TemporaryPinchZoom } from '../../components/shared/TemporaryPinchZoom'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { ChatMessagesSkeleton, PeopleRowsSkeleton } from '../../components/shared/AppSkeletons'
import { MessageBubble, DateSeparator } from '../../components/chat/MessageBubble'
import { TypingIndicator } from '../../components/chat/TypingIndicator'
import { ComposerBar } from '../../components/chat/ComposerBar'
import type { GiphyKind, GiphySelection } from '../../features/giphy/provider'
import { MessageActionsSheet } from '../../components/chat/MessageActionsSheet'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { PromptDialog } from '../../components/shared/PromptDialog'
import { useSocket } from '../../hooks/useSocket'
import { chatApi } from '../../api/chat'
import { usersApi } from '../../api/users'
import { parseApiDate } from '../../utils/dateTime'
import { formatChatLastSeen, getChatLocalDateKey } from '../../utils/chatTimestamp'
import { requestAppBack } from '../../navigation/appBackRequest'
import { shouldAnchorLatestMessage } from '../../utils/keyboardViewport'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { getReplyReferenceDestination } from '../../components/chat/replyReferenceNavigation'
import { mediaUploadError } from '../../utils/mediaUploadPolicy'

/** Messages from the same sender within this many ms are grouped (no date sep between them) */
const GROUP_GAP_MS = 3 * 60 * 1000

export function ChatRoomScreen() {
  const { id: convId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const {
    conversations, messages: allMessages, typingUsers, onlineUsers, upsertConversation,
    fetchConversations, fetchMessages, sendMessage, retrySend, editMessage, deleteMessage,
    reactToMessage, markRead, handleNewMessage, handleMessageEdited,
    handleMessageDeleted, handleReactions, handleMessagePinned, setTyping,
  } = useChatStore()
  const { socket } = useSocket()
  const [conv, setConv] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingMsg, setEditingMsg] = useState<Message | null>(null)
  const [editText, setEditText] = useState('')
  const [actionsMsg, setActionsMsg] = useState<Message | null>(null)
  const [reportMessage, setReportMessage] = useState<Message | null>(null)
  const [pinnedMsg, setPinnedMsg] = useState<Message | null>(null)
  const [showPinned, setShowPinned] = useState(true)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [showScrollDown, setShowScrollDown] = useState(false)
  /** ISO timestamp of when the other participant last read this conversation */
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null)
  const [seenByMessage, setSeenByMessage] = useState<Message | null>(null)
  const [seenBy, setSeenBy] = useState<any[]>([])
  const [seenByLoading, setSeenByLoading] = useState(false)
  const [chatOptionsOpen, setChatOptionsOpen] = useState(false)
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false)
  const [updatingBlock, setUpdatingBlock] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const hasMore = useChatStore((s) => s.hasMore[convId || ''] ?? false)
  /** Auto-clear typing indicator per username if typing:stop never arrives */
  const typingClearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const msgs = allMessages[convId || ''] || []
  const typingNames = (typingUsers[convId || ''] || []).filter((u) => u !== user?.username)
  useBackDismiss(chatOptionsOpen, () => setChatOptionsOpen(false), 200)
  useBackDismiss(Boolean(editingMsg), () => { setEditingMsg(null); setEditText('') }, 200)
  useBackDismiss(Boolean(seenByMessage), () => setSeenByMessage(null), 300)
  useBackDismiss(Boolean(lightboxUrl), () => setLightboxUrl(null), 400)
  useBackDismiss(Boolean(replyTo), () => setReplyTo(null), 200)

  function scrollToLatest(behavior: ScrollBehavior = 'smooth') {
    const list = listRef.current
    if (!list) return
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({ top: list.scrollHeight, behavior })
    } else {
      list.scrollTop = list.scrollHeight
    }
  }

  function openReplyReference(reply: NonNullable<Message['reply_to']>) {
    const destination = getReplyReferenceDestination({
      messageId: reply.id,
      content: reply.content,
    })
    if (destination.kind === 'post') {
      navigate(`/app/post/${encodeURIComponent(destination.postId)}`)
      return
    }

    requestAnimationFrame(() => {
      const message = document.getElementById(`msg-${destination.messageId}`)
      if (!message) {
        toast.error('The original message is no longer loaded.')
        return
      }
      message.scrollIntoView({ behavior: 'smooth', block: 'center' })
      message.classList.remove('chat-message-reply-target')
      requestAnimationFrame(() => message.classList.add('chat-message-reply-target'))
      window.setTimeout(() => message.classList.remove('chat-message-reply-target'), 1400)
    })
  }

  // A growing textarea, reply preview, or recording banner changes the
  // composer height. Keep the newest message visible unless the user has
  // intentionally scrolled away from the bottom.
  useEffect(() => {
    const composer = composerRef.current
    if (!composer || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(composer.getBoundingClientRect().height)
      stageRef.current?.style.setProperty('--chat-composer-height', `${height}px`)
      if (!showScrollDown) requestAnimationFrame(() => scrollToLatest('auto'))
    })
    observer.observe(composer)
    const height = Math.ceil(composer.getBoundingClientRect().height)
    stageRef.current?.style.setProperty('--chat-composer-height', `${height}px`)
    return () => observer.disconnect()
  }, [showScrollDown, convId])

  // The stable message viewport does not resize with the keyboard. If the user
  // was already following the latest message, re-anchor once after the shared
  // keyboard layer increases bottom clearance. Never disturb older history.
  useEffect(() => {
    let anchorFrame = 0
    const handleKeyboardVisibility = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail
      const list = listRef.current
      if (!detail?.open || !list || !shouldAnchorLatestMessage(list)) return
      cancelAnimationFrame(anchorFrame)
      anchorFrame = requestAnimationFrame(() => scrollToLatest('auto'))
    }
    window.addEventListener('campnect:keyboard-visibility', handleKeyboardVisibility)
    return () => {
      cancelAnimationFrame(anchorFrame)
      window.removeEventListener('campnect:keyboard-visibility', handleKeyboardVisibility)
    }
  }, [convId])

  const isGroup = conv?.type === 'group'
  const isEventChat = conv?.type === 'event'
  const myRole = conv?.my_role || conv?.members?.find((m) => m.id === user?.id)?.role || 'member'
  const canPin = isGroup ? ['owner', 'admin', 'moderator'].includes(myRole) : true
  // Load conversation + messages
  useEffect(() => {
    if (!convId) return
    const existing = conversations.find((c) => c.id === convId)
    if (existing) setConv(existing)
    const init = async () => {
      // Conversation members may be an older list snapshot. Refresh presence
      // on room entry; the API resolves online status from the live socket set.
      await fetchConversations()
      await fetchMessages(convId)
      setLoading(false)
      markRead(convId)
      setTimeout(() => scrollToLatest('auto'), 50)
    }
    init()
  }, [convId])

  useEffect(() => {
    const c = conversations.find((c) => c.id === convId)
    if (c) {
      setConv(c)
      // Initialise other member's last_read_at for read receipts
      const o = c.members.find((m) => m.id !== user?.id)
      if ((o as any)?.last_read_at) setOtherLastReadAt((o as any).last_read_at)
    }
  }, [conversations, convId])

  // Find pinned message
  useEffect(() => {
    const pinned = msgs.find((m) => m.is_pinned && !m.is_deleted)
    setPinnedMsg(pinned || null)
    if (pinned) setShowPinned(true)
  }, [msgs])

  // Socket room join / event handlers
  useEffect(() => {
    if (!socket || !convId) return
    socket.emit('join:conversation', convId)

    // Socket.IO server-side room membership does not survive a reconnect —
    // it belongs to the old connection, not the new one. Without re-joining
    // here, a network blip, app backgrounding, or dev-server restart leaves
    // this screen silently unsubscribed from the conversation's realtime
    // events until the user leaves and reopens the chat.
    const rejoinOnReconnect = () => { socket.emit('join:conversation', convId) }
    socket.on('connect', rejoinOnReconnect)

    const handleRoomMessageNew = (msg: Message) => {
      handleNewMessage(msg)
      if (msg.conversation_id === convId) {
        markRead(convId)
        setTimeout(() => scrollToLatest('smooth'), 30)
      }
    }
    const handleTypingStart = ({ conversationId, username }: any) => {
      if (conversationId !== convId || !username) return
      setTyping(convId, username, true)
      // Auto-clear after 3 seconds in case typing:stop is missed
      const existing = typingClearTimers.current.get(username)
      if (existing) clearTimeout(existing)
      typingClearTimers.current.set(username, setTimeout(() => {
        setTyping(convId, username, false)
        typingClearTimers.current.delete(username)
      }, 3000))
    }
    const handleTypingStop = ({ conversationId, username }: any) => {
      if (conversationId !== convId || !username) return
      setTyping(convId, username, false)
      const existing = typingClearTimers.current.get(username)
      if (existing) { clearTimeout(existing); typingClearTimers.current.delete(username) }
    }
    const handleMemberRemoved = ({ conversationId, userId: removedId }: any) => {
      if (conversationId === convId && removedId === user?.id) navigate('/app/chat', { replace: true })
    }
    const handleGroupDeleted = ({ conversationId }: any) => {
      if (conversationId === convId) navigate('/app/chat', { replace: true })
    }
    const handleGroupUpdated = (updated: Conversation) => {
      if (updated?.id !== convId) return
      upsertConversation(updated)
      setConv(updated)
    }
    const handleTagChanged = ({ conversationId, userId, tag }: any) => {
      if (conversationId !== convId) return
      setConv((current) => {
        if (!current) return current
        const updated = { ...current, members: current.members.map((member) => member.id === userId ? { ...member, tag } : member) }
        upsertConversation(updated)
        return updated
      })
    }
    const handleRoleChanged = ({ conversationId, userId, role, admin_rights }: any) => {
      if (conversationId !== convId) return
      setConv((current) => {
        if (!current) return current
        const updated = { ...current, members: current.members.map((member) => member.id === userId ? { ...member, role, admin_rights: admin_rights || {} } : member) }
        upsertConversation(updated)
        return updated
      })
    }
    // Read receipts — fired when the OTHER user reads our messages
    const handleMessageRead = ({ conversationId: cid, userId: readerId }: any) => {
      if (cid === convId && readerId !== user?.id) {
        setOtherLastReadAt(new Date().toISOString())
      }
    }
    socket.on('message:new', handleRoomMessageNew)
    socket.on('message:edit', handleMessageEdited)
    socket.on('message:delete', handleMessageDeleted)
    socket.on('message:reactions', handleReactions)
    socket.on('message:pinned', handleMessagePinned)
    socket.on('typing:start', handleTypingStart)
    socket.on('typing:stop', handleTypingStop)
    socket.on('group:member_removed', handleMemberRemoved)
    socket.on('group:deleted', handleGroupDeleted)
    socket.on('group:updated', handleGroupUpdated)
    socket.on('group:tag_changed', handleTagChanged)
    socket.on('group:role_changed', handleRoleChanged)
    socket.on('message:read', handleMessageRead)

    return () => {
      socket.emit('leave:conversation', convId)
      socket.off('connect', rejoinOnReconnect)
      socket.off('message:new', handleRoomMessageNew)
      socket.off('message:edit', handleMessageEdited)
      socket.off('message:delete', handleMessageDeleted)
      socket.off('message:reactions', handleReactions)
      socket.off('message:pinned', handleMessagePinned)
      socket.off('typing:start', handleTypingStart)
      socket.off('typing:stop', handleTypingStop)
      socket.off('group:member_removed', handleMemberRemoved)
      socket.off('group:deleted', handleGroupDeleted)
      socket.off('group:updated', handleGroupUpdated)
      socket.off('group:tag_changed', handleTagChanged)
      socket.off('group:role_changed', handleRoleChanged)
      socket.off('message:read', handleMessageRead)
    }
  }, [socket, convId])

  function handleScroll() {
    const el = listRef.current
    if (!el) return
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollDown(fromBottom > 220)
    if (el.scrollTop < 80 && hasMore && !loadingMore) loadOlder()
  }

  async function loadOlder() {
    if (!convId || !msgs[0]) return
    setLoadingMore(true)
    const prevScrollHeight = listRef.current?.scrollHeight || 0
    await fetchMessages(convId, msgs[0].created_at)
    setLoadingMore(false)
    requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight - prevScrollHeight
    })
  }

  function handleTypingChange(isTyping: boolean) {
    if (!convId) return
    socket?.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId: convId })
  }

  async function handleSend(text: string, replyToId?: string) {
    if (!convId) return
    await sendMessage(convId, text, replyToId, user ? {
      id: user.id, username: user.username, full_name: user.full_name, avatar_url: user.avatar_url,
    } : undefined)
    setTimeout(() => scrollToLatest('smooth'), 30)
  }

  async function handleSendGiphy(selection: GiphySelection, kind: GiphyKind) {
    if (!convId) return
    await sendMessage(convId, JSON.stringify(selection), undefined, user ? {
      id: user.id, username: user.username, full_name: user.full_name, avatar_url: user.avatar_url,
    } : undefined, kind)
    setTimeout(() => scrollToLatest('smooth'), 30)
  }

  async function handleSendMedia(file: File, type: 'image' | 'video' | 'audio') {
    if (!convId) return
    if (type === 'image' || type === 'video') {
      const policyError = await mediaUploadError(file, type)
      if (policyError) {
        toast.error(policyError)
        return
      }
    }
    const fd = new FormData()
    fd.append('type', type)
    fd.append('media', file)
    try {
      const res = await chatApi.sendMessage(convId, fd)
      handleNewMessage(res.data.data)
      setTimeout(() => scrollToLatest('smooth'), 60)
    } catch (error: any) {
      toast.error(error?.response?.data?.error || (type === 'audio' ? 'Voice note could not be sent. Try recording again.' : 'Attachment could not be sent.'))
    }
  }

  async function openSeenBy(msg: Message) {
    if (!isGroup || msg.sender_id !== user?.id) return
    setSeenByMessage(msg)
    setSeenBy([])
    setSeenByLoading(true)
    try {
      const res = await chatApi.getMessageSeenBy(msg.id)
      setSeenBy(res.data.data?.seen_by || [])
    } catch {
      setSeenBy([])
    } finally {
      setSeenByLoading(false)
    }
  }

  function handleLongPress(msg: Message) { setActionsMsg(msg) }

  async function handleDelete(forEveryone: boolean) {
    if (!actionsMsg || !convId) return
    await deleteMessage(actionsMsg.id, convId, forEveryone)
  }

  async function handleEdit() {
    if (!actionsMsg) return
    setEditingMsg(actionsMsg)
    setEditText(actionsMsg.content || '')
  }

  async function commitEdit() {
    if (!editingMsg || !convId) return
    await editMessage(editingMsg.id, convId, editText)
    setEditingMsg(null)
    setEditText('')
  }

  async function handlePin(msg: Message) {
    if (!convId) return
    const pin = !msg.is_pinned
    try {
      if (socket?.connected) {
        socket.emit('message:pin', { messageId: msg.id, pin })
      } else {
        if (pin) await chatApi.pinMessage(msg.id)
        else await chatApi.unpinMessage(msg.id)
        handleMessagePinned({ messageId: msg.id, is_pinned: pin ? 1 : 0 })
      }
    } catch {}
  }

  /**
   * Build the message list with:
   *  - Date separators when date changes
   *  - Consecutive grouping: messages from same sender within GROUP_GAP_MS share bubble corners
   *  - System messages centered
   *  - Avatar shown only on the last message of each received group
   */
  function renderMessages() {
    const items: React.JSX.Element[] = []
    let lastDate = ''

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]
      const prev = msgs[i - 1]
      const next = msgs[i + 1]

      const dateKey = getChatLocalDateKey(msg.created_at)
      if (dateKey && dateKey !== lastDate) {
        items.push(<DateSeparator key={`sep-${dateKey}`} date={msg.created_at} />)
        lastDate = dateKey
      }

      // Non-call system messages stay centered. Call events are rendered by
      // MessageBubble so they can use the interactive call-card treatment.
      const isCallSystemMessage = msg.type === 'system' && msg.content?.toLowerCase().includes('call')
      if (msg.type === 'system' && !isCallSystemMessage) {
        items.push(
          <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', padding: '4px 16px' }}>
            <span style={{ fontSize: '11px', color: 'var(--chat-text-muted)', background: 'var(--chat-soft-surface-strong)', padding: '3px 12px', borderRadius: '9999px', fontFamily: 'var(--font-body)' }}>
              {msg.content}
            </span>
          </div>
        )
        continue
      }

      const isOwn = msg.sender_id === user?.id

      // Grouping: same sender + within GROUP_GAP_MS of previous
      const prevSame = prev && prev.type !== 'system'
        && prev.sender_id === msg.sender_id
        && parseApiDate(msg.created_at).getTime() - parseApiDate(prev.created_at).getTime() < GROUP_GAP_MS
      const nextSame = next && next.type !== 'system'
        && next.sender_id === msg.sender_id
        && parseApiDate(next.created_at).getTime() - parseApiDate(msg.created_at).getTime() < GROUP_GAP_MS

      const isGrouped = Boolean(prevSame)
      const isLastInGroup = !nextSame

      // For received msgs: show avatar on the last message of a group
      const showAvatar = !isOwn && isLastInGroup

      // For group chats: show sender name above the first message in a received group
      const showSenderName = isGroup && !isOwn && !isGrouped
      const senderMember = isGroup ? conv?.members.find((member) => member.id === msg.sender_id) : undefined
      const senderTag = senderMember?.tag || (senderMember?.role === 'owner' ? 'Owner' : senderMember?.role === 'admin' ? 'Admin' : senderMember?.role === 'moderator' ? 'Mod' : '')

      items.push(
        <div key={msg.id}>
          {showSenderName && (
            <div style={{ paddingLeft: '52px', marginBottom: '2px', marginTop: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--chat-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                {msg.full_name}
              </span>
            </div>
          )}
          <MessageBubble
            msg={msg}
            isOwn={isOwn}
            onLongPress={(m) => handleLongPress(m)}
            onTap={(m) => { if (isGroup && isOwn) openSeenBy(m) }}
            onReplyPress={() => setReplyTo(msg)}
            onReplyNavigate={openReplyReference}
            onImagePress={setLightboxUrl}
            isRead={
              isOwn &&
              !isGroup &&
              Boolean(otherLastReadAt) &&
              parseApiDate(msg.created_at) <= parseApiDate(otherLastReadAt!)
            }
            showAvatar={showAvatar}
            isGrouped={isGrouped}
            isLastInGroup={isLastInGroup}
            senderTag={senderTag || undefined}
            senderRole={senderMember?.role}
            onRetry={(m) => convId && retrySend(convId, m.id)}
          />
        </div>
      )
    }
    return items
  }

  const other = conv?.members.find((m) => m.id !== user?.id)
  const isPrivateChat = conv?.type === 'private'
  const blockedByMe = Boolean(conv?.blocked_by_me)
  const blockedMe = Boolean(conv?.blocked_me)
  const isBlocked = Boolean(conv?.is_blocked)
  const convName = isGroup || isEventChat ? (conv?.name || (isEventChat ? 'Event chat' : 'Group')) : (other?.full_name || '…')
  const isOtherOnline = isConversationMemberOnline(other, onlineUsers)
  const convSubtitle = isBlocked
    ? blockedByMe ? 'Blocked' : 'Messaging unavailable'
    : isEventChat
    ? 'Event chat'
    : isGroup
    ? `${conv?.members?.length || 0} members`
    : isOtherOnline
      ? 'Active now'
      : other?.last_seen
        ? formatChatLastSeen(other.last_seen)
        : ''

  // Typing indicator avatar — use the first typer's avatar
  const firstTyper = conv?.members.find((m) => m.username === typingNames[0])

  function updateConversationBlockState(patch: Pick<Conversation, 'is_blocked' | 'blocked_by_me' | 'blocked_me'>) {
    setConv((current) => current ? { ...current, ...patch } : current)
    if (!convId) return
    useChatStore.setState((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === convId ? { ...conversation, ...patch } : conversation
      ),
    }))
  }

  async function toggleBlockFromChat() {
    if (!other || updatingBlock) return
    setChatOptionsOpen(false)
    setBlockConfirmOpen(true)
  }

  async function confirmBlockChange() {
    if (!other || updatingBlock) return
    const shouldUnblock = blockedByMe
    setUpdatingBlock(true)
    try {
      if (shouldUnblock) {
        await usersApi.unblock(other.id)
        updateConversationBlockState({
          blocked_by_me: false,
          blocked_me: blockedMe,
          is_blocked: blockedMe,
        })
        toast.success('Account unblocked')
      } else {
        await usersApi.block(other.id)
        updateConversationBlockState({
          blocked_by_me: true,
          blocked_me: blockedMe,
          is_blocked: true,
        })
        toast.success('Account blocked. Chat history was kept.')
      }
      setBlockConfirmOpen(false)
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Could not update block setting')
    } finally {
      setUpdatingBlock(false)
    }
  }

  return (
    <div className="app-viewport route-viewport chat-room" style={{
      display: 'flex', flexDirection: 'column', position: 'absolute',
      top: 0, right: 0, left: 0,
      zIndex: 50,
      background: 'var(--chat-page-bg)',
      overflow: 'hidden',
      overscrollBehavior: 'none',
    }}>
      <ConfirmDialog
        open={blockConfirmOpen}
        title={blockedByMe ? `Unblock @${other?.username || 'this account'}?` : `Block @${other?.username || 'this account'}?`}
        message={blockedByMe
          ? 'You will be able to message each other again. Your existing chat history will stay here.'
          : 'You will unfollow each other, they will not be able to view your profile, and this chat history will stay here.'}
        confirmLabel={blockedByMe ? 'Unblock' : 'Block account'}
        cancelLabel="Cancel"
        busy={updatingBlock}
        destructive={!blockedByMe}
        onConfirm={() => void confirmBlockChange()}
        onCancel={() => !updatingBlock && setBlockConfirmOpen(false)}
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        paddingTop: 'calc(10px + var(--sat))',
        paddingBottom: '10px', paddingLeft: '6px', paddingRight: '10px',
        background: 'transparent',
        flexShrink: 0,
      }}>
        {/* Back */}
        <button
          onClick={requestAppBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chat-text)', display: 'flex', padding: '8px', borderRadius: '9999px', WebkitTapHighlightColor: 'transparent' }}
        >
          <ChevronLeft size={24} />
        </button>

        {/* Avatar + name — tappable for group info */}
        <div
          data-swipe-ignore
          onClick={() => {
            if (isGroup) navigate(`/app/chat/${convId}/info`)
            else if (!isEventChat && other?.username) navigate(`/app/profile/${encodeURIComponent(other.username)}`)
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            if (isGroup) navigate(`/app/chat/${convId}/info`)
            else if (!isEventChat && other?.username) navigate(`/app/profile/${encodeURIComponent(other.username)}`)
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, cursor: 'pointer' }}
        >
          {isGroup || isEventChat ? (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Avatar src={conv?.avatar_url} name={convName} size={38} />
              {isGroup && <div style={{ position: 'absolute', bottom: -1, right: -1, width: 16, height: 16, borderRadius: '50%', background: 'var(--color-lime-dim)', border: '1.5px solid rgba(187,255,0,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={8} color="var(--color-lime)" />
              </div>}
            </div>
          ) : (
            <Avatar src={other?.avatar_url} name={convName} size={38} online={isOtherOnline} />
          )}
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--chat-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)' }}>
              {convName}
            </p>
            {convSubtitle && (
              <p style={{ margin: 0, fontSize: '12px', color: isOtherOnline && !isGroup ? '#22C55E' : 'var(--chat-text-muted)', fontFamily: 'var(--font-body)' }}>
                {convSubtitle}
              </p>
            )}
          </div>
        </div>

        {DEMO_MODE && !isBlocked && <><button aria-label="Voice call preview" onClick={() => useCallStore.getState().setActiveCall({ conversationId: convId!, callId: crypto.randomUUID(), type: 'voice', fromName: convName, fromAvatar: other?.avatar_url })} style={{ border: 0, background: 'transparent', color: 'var(--chat-text)', cursor: 'pointer', padding: 6 }}>☎</button><button aria-label="Video call preview" onClick={() => useCallStore.getState().setActiveCall({ conversationId: convId!, callId: crypto.randomUUID(), type: 'video', fromName: convName, fromAvatar: other?.avatar_url })} style={{ border: 0, background: 'transparent', color: 'var(--chat-text)', cursor: 'pointer', padding: 6 }}>▣</button></>}
        {/* Conversation actions */}
        {isGroup ? (
          <>
            <button onClick={() => navigate(`/app/chat/${convId}/info`)} aria-label="Group info" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chat-text-secondary)', display: 'flex', padding: '8px', WebkitTapHighlightColor: 'transparent' }}>
              <Info size={20} />
            </button>
          </>
        ) : isPrivateChat ? (
          <button
            type="button"
            onClick={() => setChatOptionsOpen(true)}
            aria-label="Chat options"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chat-text-secondary)', display: 'flex', padding: '8px', borderRadius: '50%', WebkitTapHighlightColor: 'transparent' }}
          >
            <MoreHorizontal size={22} />
          </button>
        ) : null}
      </div>

      {chatOptionsOpen && createPortal(
        <div
          role="presentation"
          onClick={() => !updatingBlock && setChatOptionsOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.68)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '16px max(12px, var(--sar)) max(16px, var(--sab)) max(12px, var(--sal))' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Chat options"
            onClick={(event) => event.stopPropagation()}
            style={{ width: '100%', maxWidth: 430, borderRadius: 24, background: 'var(--chat-overlay-surface)', border: '1px solid var(--chat-divider)', boxShadow: 'var(--chat-overlay-shadow)', overflow: 'hidden' }}
          >
            <div style={{ padding: '18px 18px 14px', textAlign: 'center', borderBottom: '1px solid var(--chat-divider)' }}>
              <Avatar src={other?.avatar_url} name={convName} size={52} />
              <p style={{ margin: '10px 0 2px', color: 'var(--chat-text)', fontSize: 16, fontWeight: 800 }}>{convName}</p>
              <p style={{ margin: 0, color: 'var(--chat-text-muted)', fontSize: 12 }}>Chat history is kept when an account is blocked.</p>
            </div>
            {!isBlocked && other?.username && (
              <button
                type="button"
                onClick={() => {
                  setChatOptionsOpen(false)
                  navigate(`/app/profile/${encodeURIComponent(other.username)}`)
                }}
                style={{ width: '100%', minHeight: 52, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 12, border: 0, borderBottom: '1px solid var(--chat-divider)', background: 'transparent', color: 'var(--chat-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                <UserRound size={19} />
                View profile
              </button>
            )}
            <button
              type="button"
              disabled={updatingBlock}
              onClick={() => void toggleBlockFromChat()}
              style={{ width: '100%', minHeight: 52, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 12, border: 0, borderBottom: '1px solid var(--chat-divider)', background: 'transparent', color: blockedByMe ? 'var(--chat-text)' : '#ff5e72', fontSize: 14, fontWeight: 800, cursor: updatingBlock ? 'wait' : 'pointer', opacity: updatingBlock ? 0.65 : 1 }}
            >
              <Ban size={19} />
              {updatingBlock ? 'Updating…' : blockedByMe ? 'Unblock account' : 'Block account'}
            </button>
            <button
              type="button"
              disabled={updatingBlock}
              onClick={() => setChatOptionsOpen(false)}
              style={{ width: '100%', minHeight: 52, border: 0, background: 'transparent', color: 'var(--chat-text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Pinned message banner ──────────────────────────────────────── */}
      {pinnedMsg && showPinned && (
        <div
          data-swipe-ignore
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'var(--chat-accent-soft)', borderBottom: '1px solid var(--chat-accent-border)', cursor: 'pointer' }}
          onClick={() => {
            const el = document.getElementById(`msg-${pinnedMsg.id}`)
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
        >
          <Pin size={13} color="rgba(255,180,140,0.90)" />
          <span style={{ flex: 1, fontSize: '12px', color: 'var(--chat-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--chat-accent)', fontWeight: 600 }}>Pinned: </span>
            {pinnedMsg.content || `[${pinnedMsg.type}]`}
          </span>
          <button onClick={(e) => { e.stopPropagation(); setShowPinned(false); handlePin(pinnedMsg) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chat-text-muted)', display: 'flex', padding: '2px' }}>
            <X size={13} />
          </button>
        </div>
      )}

      <div ref={stageRef} className="chat-stage">
        {/* ── Message list: the conversation's only vertical scroller ─── */}
        <div
          ref={listRef}
          className="chat-message-viewport"
          onScroll={handleScroll}
          style={{
            display: 'flex', flexDirection: 'column',
            paddingTop: '12px',
            overscrollBehaviorY: 'contain',
            overflowAnchor: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {loadingMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px' }}>
              <LoadingSpinner size={18} />
            </div>
          )}
          {loading
            ? <ChatMessagesSkeleton />
            : renderMessages()
          }
          <TypingIndicator names={typingNames} avatarUrl={firstTyper?.avatar_url} />
          <div ref={bottomRef} style={{ height: 24, flexShrink: 0 }} />
        </div>

        {/* ── Scroll-to-bottom FAB ────────────────────────────────────── */}
        {showScrollDown && (
          <button
            className="chat-scroll-to-latest"
            onClick={() => scrollToLatest('smooth')}
            style={{
              position: 'absolute', right: 14,
              width: 36, height: 36, borderRadius: '9999px',
              background: 'var(--chat-own-bubble)',
              border: '1px solid var(--chat-own-border)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 14px rgba(0,0,0,0.5)',
              WebkitTapHighlightColor: 'transparent',
              zIndex: 2,
            }}
          >
            <ChevronDown size={17} color="#fff" />
          </button>
        )}

        {/* ── Composer overlay: independent from message viewport flow ── */}
        <div ref={composerRef} className="chat-composer-overlay">
          {isBlocked ? (
            <div style={{ padding: '10px max(12px, var(--sar)) max(12px, var(--sab)) max(12px, var(--sal))' }}>
              <div style={{ borderRadius: 18, padding: '13px 14px', background: 'var(--chat-soft-surface)', border: '1px solid var(--chat-divider)', textAlign: 'center' }}>
                <p style={{ margin: 0, color: 'var(--chat-text)', fontSize: 13, fontWeight: 800 }}>
                  {blockedByMe ? `You blocked @${other?.username}.` : 'You cannot message this account.'}
                </p>
                <p style={{ margin: '4px 0 0', color: 'var(--chat-text-muted)', fontSize: 11, lineHeight: 1.45 }}>
                  Your chat history remains available. {blockedByMe ? 'Unblock them to send new messages.' : ''}
                </p>
                {blockedByMe && (
                  <button
                    type="button"
                    disabled={updatingBlock}
                    onClick={() => void toggleBlockFromChat()}
                    style={{ marginTop: 10, minHeight: 36, padding: '0 18px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.18)', background: '#fff', color: '#171315', fontSize: 12, fontWeight: 900, cursor: updatingBlock ? 'wait' : 'pointer' }}
                  >
                    {updatingBlock ? 'Updating…' : 'Unblock'}
                  </button>
                )}
              </div>
            </div>
          ) : editingMsg ? (
            <div className="chat-edit-composer" style={{ background: 'var(--color-navbar-bg)', borderTop: '1px solid var(--color-border)', padding: '10px 12px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '11px', color: '#93C5FD', margin: '0 0 4px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                  Editing message
                </p>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                  style={{ width: '100%', background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', borderRadius: '14px', padding: '10px 14px', color: 'var(--color-input-text)', fontSize: '15px', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)', caretColor: 'var(--color-lime)' }}
                  rows={2}
                />
              </div>
              <div className="chat-edit-actions" style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                <button onClick={commitEdit} style={{ padding: '8px 14px', background: 'linear-gradient(135deg,#18181B,#C44DCC)', border: 'none', borderRadius: '10px', color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-display)' }}>
                  Save
                </button>
                <button onClick={() => { setEditingMsg(null); setEditText('') }} style={{ padding: '8px 14px', background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', borderRadius: '10px', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '13px', fontFamily: 'var(--font-display)' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <ComposerBar
              onSend={handleSend}
              onSendGiphy={handleSendGiphy}
              onSendMedia={handleSendMedia}
              onTypingChange={handleTypingChange}
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
            />
          )}
        </div>
      </div>

      {/* ── Message actions sheet ─────────────────────────────────────── */}
      {actionsMsg && (
        <MessageActionsSheet
          msg={actionsMsg}
          isOwn={actionsMsg.sender_id === user?.id}
          onClose={() => setActionsMsg(null)}
          onReply={() => { setReplyTo(actionsMsg); setActionsMsg(null) }}
          onEdit={actionsMsg.sender_id === user?.id ? handleEdit : undefined}
          onDelete={actionsMsg.sender_id === user?.id ? handleDelete : undefined}
          onCopy={() => navigator.clipboard?.writeText(actionsMsg.content || '')}
          onReact={(emoji) => convId && reactToMessage(actionsMsg.id, convId, emoji)}
          onPin={canPin ? async () => { await handlePin(actionsMsg); setActionsMsg(null) } : undefined}
          onReport={() => setReportMessage(actionsMsg)}
        />
      )}
      <PromptDialog
        open={Boolean(reportMessage)}
        title="Report message"
        message="Tell us why this message should be reviewed. Our team will review the complete reported message and attachment."
        placeholder="Reason for this report"
        submitLabel="Submit report"
        onCancel={() => setReportMessage(null)}
        onSubmit={async (reason, description) => {
          if (!reportMessage) return
          try {
            await chatApi.reportMessage(reportMessage.id, reason, description)
            toast.success(DEMO_MODE ? 'Report saved to local demo intake. No moderation team is contacted.' : 'Report submitted. Thank you for helping keep Campnect safe.')
            setReportMessage(null)
          } catch {
            toast.error('Could not submit the report. Please try again.')
          }
        }}
      />

      {seenByMessage && (
        <div
          onClick={() => setSeenByMessage(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '16px max(16px, var(--sar)) max(16px, var(--sab)) max(16px, var(--sal))' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, maxHeight: 'min(68dvh, calc(100% - 32px))', overflowY: 'auto', background: 'var(--color-navbar-bg)', border: '1px solid var(--color-border-strong)', borderRadius: '22px', padding: '18px 16px', boxShadow: '0 18px 60px rgba(0,0,0,0.55)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <p style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: '17px', fontWeight: 700, fontFamily: 'var(--font-display)' }}>Seen by</p>
                <p style={{ margin: '3px 0 0', color: 'var(--color-text-muted)', fontSize: '12px', fontFamily: 'var(--font-body)' }}>
                  {seenByLoading ? 'Checking viewers…' : `${seenBy.length} member${seenBy.length === 1 ? '' : 's'} viewed this message`}
                </p>
              </div>
              <button onClick={() => setSeenByMessage(null)} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            {seenByLoading ? (
              <PeopleRowsSkeleton count={3} action={false} compact />
            ) : seenBy.length === 0 ? (
              <p style={{ margin: '18px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', fontFamily: 'var(--font-body)' }}>No one else has seen it yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {seenBy.map((member) => (
                  <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 4px' }}>
                    <Avatar src={member.avatar_url} name={member.full_name} size={36} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.full_name}</p>
                      <p style={{ margin: '2px 0 0', color: 'var(--color-text-muted)', fontSize: '11px', fontFamily: 'var(--font-body)' }}>@{member.username?.toLowerCase()}</p>
                    </div>
                    <span style={{ color: 'var(--color-lime)', fontSize: '11px', fontFamily: 'var(--font-body)' }}>Seen</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Image lightbox ───────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
           <TemporaryPinchZoom>
             <AuthenticatedImage
               src={lightboxUrl}
               alt="Expanded image"
               onClick={(event) => event.stopPropagation()}
               style={{ maxWidth: '95%', maxHeight: '90dvh', borderRadius: '10px', objectFit: 'contain' }}
               placeholderStyle={{ width: 'min(88vw, 420px)', height: 'min(70vh, 420px)', borderRadius: '10px' }}
             />
           </TemporaryPinchZoom>
          <button
             type="button"
             aria-label="Close image"
            onClick={() => setLightboxUrl(null)}
             style={{ position: 'absolute', top: 'calc(14px + var(--sat))', right: 14, zIndex: 2, background: '#FFFFFF', color: '#17171A', border: '1px solid rgba(255,255,255,0.70)', boxShadow: '0 4px 18px rgba(0,0,0,0.45)', borderRadius: '9999px', width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
             <X size={20} color="currentColor" strokeWidth={2.4} />
          </button>
        </div>
      )}
    </div>
  )
}
