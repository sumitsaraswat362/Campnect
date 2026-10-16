import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, MessageCircle, PenLine, ShieldAlert, Trash2, Ban } from 'lucide-react'
import { useChatStore, Conversation, Message } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/shared/Avatar'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../../components/shared/AuthenticatedVideo'
import { TimeAgo } from '../../components/shared/TimeAgo'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { MessageRequestsSkeleton } from '../../components/shared/AppSkeletons'
import { EmptyState } from '../../components/shared/EmptyState'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import toast from 'react-hot-toast'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

export function MessageRequestsScreen() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { requests, messages, fetchRequests, fetchMessages, acceptRequest, declineRequest, blockRequest } = useChatStore()
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)
  const [blockTarget, setBlockTarget] = useState<{ id: string; name: string } | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<Conversation | null>(null)
  const [activeTab, setActiveTab] = useState<'people' | 'spam'>('people')
  const [detailLoading, setDetailLoading] = useState(false)
  useBackDismiss(selectedRequest !== null, () => setSelectedRequest(null), 150)
  useBackDismiss(blockTarget !== null, () => setBlockTarget(null), 200)

  useEffect(() => {
    fetchRequests().finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedRequest) return
    setDetailLoading(true)
    fetchMessages(selectedRequest.id).finally(() => setDetailLoading(false))
  }, [selectedRequest?.id])

  function getOtherPerson(conv: Conversation) {
    return (conv.members || []).find((m) => m.id !== user?.id)
  }

  async function handleAccept(convId: string) {
    setActioning(convId + ':accept')
    try {
      await acceptRequest(convId)
      navigate(`/app/chat/${convId}`)
    } catch { toast.error('Could not accept this request') }
    finally { setActioning(null) }
  }

  async function handleDecline(convId: string) {
    setActioning(convId + ':decline')
    try {
      await declineRequest(convId)
      setSelectedRequest(null)
      toast.success('Request removed')
    }
    catch { toast.error('Could not decline this request') }
    finally { setActioning(null) }
  }

  async function handleBlock(convId: string) {
    setActioning(convId + ':block')
    try {
      await blockRequest(convId)
      setBlockTarget(null)
      setSelectedRequest(null)
      toast.success('User blocked')
    }
    catch { toast.error('Could not block this user') }
    finally { setActioning(null) }
  }

  function getMessagePreview(conv: Conversation, message?: Message) {
    if (!message) return conv.last_message_preview || 'Sent you a message'
    if (message.type === 'image' || message.type === 'gif') return 'Sent a photo'
    if (message.type === 'video') return 'Sent a video'
    if (message.type === 'audio') return 'Sent a voice note'
    if (message.type === 'file') return 'Sent a file'
    if (message.content?.startsWith('__POST_SHARE__:')) return 'Shared a post'
    return message.content || 'Sent you a message'
  }

  function renderRequestMedia(message?: Message) {
    if (!message?.media_url) return null
    if (message.type === 'image' || message.type === 'gif') {
      return (
        <AuthenticatedImage
          src={message.media_url}
          alt="Message attachment"
          style={{ display: 'block', width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 16 }}
          placeholderStyle={{ width: '100%', height: 190, borderRadius: 16 }}
          placeholderVariant="post"
        />
      )
    }
    if (message.type === 'video') {
      return (
        <AuthenticatedVideo
          src={message.media_url}
          muted
          playsInline
          controls
          preload="metadata"
          style={{ display: 'block', width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 16 }}
        />
      )
    }
    return null
  }

  const selectedPerson = selectedRequest ? getOtherPerson(selectedRequest) : undefined
  const selectedMessages = selectedRequest ? messages[selectedRequest.id] || [] : []
  const latestMessage = selectedMessages.filter((message) => !message.is_deleted).at(-1)
  const visibleRequests = activeTab === 'people' ? requests : []

  return (
    <div className="message-requests-screen" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--chat-page-bg)', color: 'var(--chat-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: 'calc(8px + var(--sat)) 14px 8px', background: 'var(--chat-soft-surface)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--chat-divider)', flexShrink: 0 }}>
        <button onClick={requestAppBack} aria-label={selectedRequest ? 'Back to requests' : 'Back to messages'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chat-text)', display: 'flex', padding: '11px', marginLeft: '-11px', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={22} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--chat-text)', fontFamily: 'var(--font-display)' }}>
            {selectedRequest ? 'Message request' : 'Requests'}
          </h2>
          {!selectedRequest && (
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--chat-text-muted)', fontFamily: 'var(--font-body)' }}>
              {requests.length ? `${requests.length} waiting for your response` : 'Choose who can reach you'}
            </p>
          )}
        </div>
        {!selectedRequest && (
          <button onClick={() => navigate('/app/chat/new')} aria-label="Start a new message" style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--chat-divider)', background: 'var(--chat-soft-surface)', color: 'var(--chat-text)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <PenLine size={18} />
          </button>
        )}
      </div>

      {selectedRequest ? (
        <RequestDetail
          person={selectedPerson}
          request={selectedRequest}
          messages={selectedMessages}
          latestMessage={latestMessage}
          loading={detailLoading}
          actioning={actioning}
          previewText={getMessagePreview(selectedRequest, latestMessage)}
          renderMedia={renderRequestMedia(latestMessage)}
          onAccept={() => void handleAccept(selectedRequest.id)}
          onDelete={() => void handleDecline(selectedRequest.id)}
          onBlock={() => setBlockTarget({ id: selectedRequest.id, name: selectedPerson?.full_name || 'this user' })}
        />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '12px 16px 8px', borderBottom: '1px solid var(--chat-divider)' }} role="tablist" aria-label="Request categories">
            {([
              { id: 'people' as const, label: 'People you may know', count: requests.length },
              { id: 'spam' as const, label: 'Filtered', count: 0 },
            ]).map((tab) => {
              const selected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  style={{ minHeight: 42, padding: '0 10px', borderRadius: 13, border: selected ? '1px solid var(--chat-accent-border)' : '1px solid transparent', background: selected ? 'var(--chat-soft-surface-strong)' : 'transparent', color: selected ? 'var(--chat-text)' : 'var(--chat-text-muted)', fontSize: 12, fontWeight: selected ? 800 : 650, cursor: 'pointer' }}
                >
                  {tab.label}{tab.count ? ` · ${tab.count}` : ''}
                </button>
              )
            })}
          </div>
          <div style={{ padding: '15px 18px 13px', borderBottom: '1px solid var(--chat-divider)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <ShieldAlert size={17} color="var(--chat-accent)" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--chat-text-secondary)' }}>
                Messages from people outside your inbox appear here. Open one to preview it before deciding what happens next.
              </p>
            </div>
          </div>
          {loading ? (
            <MessageRequestsSkeleton count={3} />
          ) : visibleRequests.length === 0 ? (
            <EmptyState
              icon={<MessageCircle size={28} color="var(--chat-accent)" strokeWidth={1.6} />}
              title={activeTab === 'spam' ? 'Nothing filtered' : 'No requests right now'}
              description={activeTab === 'spam' ? 'Potentially unwanted messages will be placed here.' : 'New requests will show up here when someone outside your inbox reaches out.'}
            />
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <p style={{ margin: '17px 18px 5px', color: 'var(--chat-text-muted)', fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Recent requests</p>
              {visibleRequests.map((conv) => {
                const other = getOtherPerson(conv)
                const preview = messages[conv.id]?.filter((message) => !message.is_deleted).at(-1)
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedRequest(conv)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 18px', border: 0, borderBottom: '1px solid var(--chat-divider)', background: 'transparent', color: 'var(--chat-text)', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <Avatar src={other?.avatar_url} name={other?.full_name || '?'} size={52} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-display)' }}>{other?.full_name || 'Unknown'}</strong>
                        {conv.last_message_at && <TimeAgo date={conv.last_message_at} style={{ flexShrink: 0, color: 'var(--chat-text-muted)', fontSize: 11 }} />}
                      </span>
                      <span style={{ display: 'block', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--chat-text-secondary)', fontSize: 12 }}>
                        @{other?.username?.toLowerCase() || 'campus-user'} · {getMessagePreview(conv, preview)}
                      </span>
                    </span>
                    <ChevronRight size={17} color="var(--chat-text-muted)" style={{ flexShrink: 0 }} />
                  </button>
                )
              })}
              {activeTab === 'people' && requests.length > 0 && (
                <p style={{ margin: '18px 18px 24px', color: 'var(--chat-text-muted)', fontSize: 12, lineHeight: 1.45 }}>
                  Review each request before accepting. You can remove or block a sender without opening a conversation.
                </p>
              )}
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={Boolean(blockTarget)}
        title="Block this user?"
        message={blockTarget ? `${blockTarget.name} won't be able to message you or find you in messaging.` : ''}
        confirmLabel="Block user"
        cancelLabel="Keep request"
        destructive
        busy={Boolean(blockTarget && actioning === blockTarget.id + ':block')}
        onCancel={() => { if (!actioning) setBlockTarget(null) }}
        onConfirm={() => { if (blockTarget) void handleBlock(blockTarget.id) }}
      />
    </div>
  )
}

function RequestDetail({
  person,
  request,
  messages,
  latestMessage,
  loading,
  actioning,
  previewText,
  renderMedia,
  onAccept,
  onDelete,
  onBlock,
}: {
  person?: Conversation['members'][number]
  request: Conversation
  messages: Message[]
  latestMessage?: Message
  loading: boolean
  actioning: string | null
  previewText: string
  renderMedia: React.ReactNode
  onAccept: () => void
  onDelete: () => void
  onBlock: () => void
}) {
  const messageDate = latestMessage?.created_at || request.last_message_at
  const busy = Boolean(actioning)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 18px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Avatar src={person?.avatar_url} name={person?.full_name || 'Campus user'} size={76} />
          <h1 style={{ margin: '12px 0 3px', color: 'var(--chat-text)', fontSize: 20, fontWeight: 850, fontFamily: 'var(--font-display)' }}>{person?.full_name || 'Campus user'}</h1>
          <p style={{ margin: 0, color: 'var(--chat-text-muted)', fontSize: 12 }}>@{person?.username?.toLowerCase() || 'campus-user'}</p>
          <p style={{ margin: '10px 0 0', color: 'var(--chat-text-secondary)', fontSize: 12 }}>This person is not in your inbox yet</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 16px' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--chat-divider)' }} />
          <span style={{ color: 'var(--chat-text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {messageDate ? <TimeAgo date={messageDate} /> : 'New request'}
          </span>
          <span style={{ flex: 1, height: 1, background: 'var(--chat-divider)' }} />
        </div>

        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 140 }}>
            <LoadingSpinner size={24} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ maxWidth: '88%', padding: renderMedia ? 8 : '13px 15px', borderRadius: '18px 18px 18px 5px', background: 'var(--chat-received-bubble)', border: '1px solid var(--chat-received-border)', boxShadow: 'var(--chat-received-shadow)' }}>
              {renderMedia}
              {(!renderMedia || previewText !== 'Sent a photo' && previewText !== 'Sent a video') && (
                <p style={{ margin: renderMedia ? '8px 6px 4px' : 0, color: 'var(--chat-received-text)', fontSize: 15, lineHeight: 1.45, wordBreak: 'break-word' }}>{previewText}</p>
              )}
            </div>
            {messages.length > 1 && (
              <span style={{ marginLeft: 4, color: 'var(--chat-text-muted)', fontSize: 11 }}>Plus {messages.length - 1} earlier message{messages.length === 2 ? '' : 's'}</span>
            )}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, padding: '13px 16px max(14px, var(--sab))', background: 'var(--chat-soft-surface-strong)', borderTop: '1px solid var(--chat-divider)', backdropFilter: 'blur(16px)' }}>
        <p style={{ margin: '0 0 10px', color: 'var(--chat-text-secondary)', fontSize: 11, lineHeight: 1.4, textAlign: 'center' }}>
          Accepting lets this person message you again and see your read status.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.25fr', gap: 8 }}>
          <button type="button" onClick={onBlock} disabled={busy} style={{ minHeight: 44, borderRadius: 13, border: '1px solid rgba(226,77,105,0.30)', background: 'rgba(226,77,105,0.10)', color: '#E24D69', fontSize: 13, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            <Ban size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Block
          </button>
          <button type="button" onClick={onDelete} disabled={busy} style={{ minHeight: 44, borderRadius: 13, border: '1px solid var(--chat-divider)', background: 'transparent', color: 'var(--chat-text-secondary)', fontSize: 13, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {actioning?.endsWith(':decline') ? <LoadingSpinner size={14} /> : <><Trash2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Remove</>}
          </button>
          <button type="button" onClick={onAccept} disabled={busy} style={{ minHeight: 44, borderRadius: 13, border: '1px solid var(--chat-own-border)', background: 'var(--chat-own-bubble)', color: 'var(--chat-own-text)', fontSize: 13, fontWeight: 850, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, boxShadow: 'var(--chat-own-shadow)' }}>
            {actioning?.endsWith(':accept') ? <LoadingSpinner size={14} /> : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
