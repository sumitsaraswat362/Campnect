import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { Search, PenSquare, Users, Inbox, X, MoreHorizontal, VolumeX, Volume2, ArrowLeft, MessageSquare } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/shared/Avatar'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { ConversationRowsSkeleton, PeopleRowsSkeleton } from '../../components/shared/AppSkeletons'
import { TimeAgo } from '../../components/shared/TimeAgo'
import { chatApi } from '../../api/chat'

export function ChatListScreen() {
  const navigate   = useNavigate()
  const { user }   = useAuthStore()
  const { conversations, requests, loading, fetchConversations, fetchRequests, createConversation } = useChatStore()
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<any[]>([])
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [openingPerson, setOpeningPerson] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  useBackDismiss(menuId !== null, () => setMenuId(null), 150)

  useEffect(() => { fetchConversations(); fetchRequests() }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      setPeople([])
      setPeopleLoading(false)
      return
    }
    const timer = window.setTimeout(async () => {
      setPeopleLoading(true)
      try {
        const res = await chatApi.searchUsers(query.trim())
        setPeople(res.data.data || [])
      } catch {
        setPeople([])
      } finally {
        setPeopleLoading(false)
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const filtered = useMemo(() =>
    conversations.filter((c) => {
      const other = (c.members || []).find((p: any) => p.id !== user?.id)
      const name  = c.type === 'group' || c.type === 'event' ? (c.name || '') : (other?.full_name || '')
      return name.toLowerCase().includes(query.toLowerCase())
    }), [conversations, query, user])

  function getConvDisplay(c: any) {
    if (c.type === 'group' || c.type === 'event') return {
      name: c.name || 'Group', avatarSrc: c.avatar_url,
      isOnline: false, isGroup: c.type === 'group',
    }
    const other = (c.members || c.participants || []).find((p: any) => p.id !== user?.id)
    return {
      name: other?.full_name || 'Unknown',
      avatarSrc: other?.avatar_url,
      isOnline: Boolean(other?.is_online),
      isGroup: false,
    }
  }

  const isEmpty = !loading && !peopleLoading && filtered.length === 0 && requests.length === 0 && people.length === 0

  async function openPerson(person: any) {
    if (openingPerson) return
    setOpeningPerson(person.id)
    try {
      const conversation = await createConversation([person.id])
      navigate(`/app/chat/${conversation.id}`)
    } finally {
      setOpeningPerson(null)
    }
  }

  async function toggleMute(c: any) {
    const muted = !Boolean(c.is_muted)
    try {
      await chatApi.muteConversation(c.id, muted)
      useChatStore.setState((s) => ({ conversations: s.conversations.map(x => x.id === c.id ? { ...x, is_muted: muted ? 1 : 0 } : x) }))
    } finally { setMenuId(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg)' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
      }}>
        <button
          aria-label="Back"
          onClick={requestAppBack}
          style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </button>
        <div style={{ flex: 1, paddingLeft: 2 }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>
            Messages
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => navigate('/app/chat/requests')}
            aria-label={`Message Requests${requests.length ? `, ${requests.length} pending` : ''}`}
            style={{ position: 'relative', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', height: 36, padding: '0 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--color-text-primary)', fontSize: 11, fontWeight: 700, WebkitTapHighlightColor: 'transparent' }}
          >
            <Inbox size={16} strokeWidth={2} />
            <span>Requests</span>
            {requests.length > 0 && <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, padding: '0 3px', boxSizing: 'border-box', borderRadius: 999, background: 'var(--color-lime)', color: 'var(--color-accent-contrast)', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--color-bg)' }}>{requests.length > 9 ? '9+' : requests.length}</span>}
          </button>
          <button
            onClick={() => navigate('/app/chat/new')}
            aria-label="New message"
            style={{ background: 'var(--color-text-primary)', border: 'none', borderRadius: '12px', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-bg)', WebkitTapHighlightColor: 'transparent' }}
          >
            <PenSquare size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <div style={{ padding: '4px 16px 10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'var(--color-input-bg)',
          border: '1px solid var(--color-input-border)',
          borderRadius: '16px', padding: '0 14px', height: '44px',
        }}>
          <Search size={16} color="var(--color-input-icon)" strokeWidth={2} />
          <input
            type="text"
            placeholder="Search messages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--color-input-text)', fontSize: '15px', fontFamily: 'var(--font-body)', caretColor: 'var(--color-lime)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: 'var(--color-surface-hover)', borderRadius: '50%', width: 22, height: 22, border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }} aria-label="Clear search"><X size={14} strokeWidth={2.5} /></button>
          )}
        </div>
      </div>

      {/* ── Message Requests banner ──────────────────────────────────────── */}
      {requests.length > 0 && (
        <button
          onClick={() => navigate('/app/chat/requests')}
          style={{
            display: 'flex', alignItems: 'center', gap: '14px',
            width: '100%', background: 'var(--color-surface-hover)',
            border: 'none', borderBottom: '1px solid var(--color-border)',
            padding: '12px 16px', cursor: 'pointer', textAlign: 'left',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Inbox size={20} color="var(--color-text-secondary)" strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
              Message Requests
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
              {requests.length} {requests.length === 1 ? 'request' : 'requests'} waiting
            </p>
          </div>
          <div style={{
            minWidth: 22, height: 22, borderRadius: '9999px',
            background: 'var(--color-text-primary)', color: 'var(--color-bg)',
            fontSize: '11px', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 6px', flexShrink: 0,
          }}>
            {requests.length > 99 ? '99+' : requests.length}
          </div>
        </button>
      )}

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {loading && conversations.length === 0 ? (
        <ConversationRowsSkeleton />
      ) : isEmpty ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '0 32px 32px', textAlign: 'center', gap: '20px' }}>
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--color-lime-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={34} color="var(--color-lime)" strokeWidth={1.5} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <p style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
              Your messages
            </p>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
              Send a message to start a conversation with someone.
            </p>
          </div>
          <button
            onClick={() => navigate('/app/chat/new')}
            style={{
              marginTop: '8px',
              padding: '0 28px',
              height: '46px',
              background: 'var(--color-lime)',
              border: 'none',
              borderRadius: '9999px',
              color: 'var(--color-accent-contrast)',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-btn)',
              WebkitTapHighlightColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Send Message
          </button>
        </div>
      ) : query && peopleLoading ? (
        <PeopleRowsSkeleton />
      ) : query && filtered.length === 0 && people.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 32px', gap: '12px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Search size={28} color="var(--color-text-muted)" strokeWidth={1.5} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>No results found</p>
            <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)' }}>We couldn't find anyone matching "{query}"</p>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {query && people.length > 0 && (
            <div>
              <p style={{ margin: '12px 16px 4px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontFamily: 'var(--font-display)' }}>
                People
              </p>
              {people.map((person) => (
                <div
                  key={`person-${person.id}`}
                   data-swipe-ignore
                  onClick={() => openPerson(person)}
                  style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)', WebkitTapHighlightColor: 'transparent' }}
                >
                  <Avatar src={person.avatar_url} name={person.full_name} size={48} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>{person.full_name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>@{person.username?.toLowerCase()}</p>
                  </div>
                  {openingPerson === person.id && <LoadingSpinner size={18} />}
                </div>
              ))}
            </div>
          )}
          {filtered.length > 0 && query && (
            <p style={{ margin: '16px 16px 4px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontFamily: 'var(--font-display)' }}>
              Conversations
            </p>
          )}
          {filtered.map((c) => {
            const { name, avatarSrc, isOnline, isGroup } = getConvDisplay(c)
            const isUnread = c.unread_count > 0
            return (
              <div
                key={c.id}
                 data-swipe-ignore
                 onClick={() => navigate(`/app/chat/${c.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '10px 16px',
                  cursor: 'pointer',
                   borderBottom: '1px solid var(--color-border)',
                  WebkitTapHighlightColor: 'transparent',
                   position: 'relative',
                  willChange: 'transform',
                  transform: 'translateZ(0)',
                  transition: 'background 120ms',
                }}
                onTouchStart={(e) => { e.currentTarget.style.background = 'var(--color-surface)' }}
                onTouchEnd={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar src={avatarSrc} name={name} size={54} />
                  {isOnline && !isGroup && (
                    <div style={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: '#22C55E', border: '2.5px solid var(--color-bg)' }} />
                  )}
                  {isGroup && (
                    <div style={{ position: 'absolute', bottom: 0, right: -2, width: 22, height: 22, borderRadius: '50%', background: 'var(--color-lime)', border: '2px solid var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Users size={11} color="var(--color-accent-contrast)" strokeWidth={2.5} />
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
                    <span style={{
                      fontSize: '16px',
                      fontWeight: isUnread ? 800 : 600,
                      fontFamily: 'var(--font-display)',
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '200px',
                    }}>
                      {name}
                    </span>
                    <span style={{ fontSize: '12px', color: isUnread ? 'var(--color-text-secondary)' : 'var(--color-text-muted)', flexShrink: 0, marginLeft: '8px', fontFamily: 'var(--font-body)', fontWeight: isUnread ? 600 : 400 }}>
                      {c.last_message_at ? <TimeAgo date={c.last_message_at} /> : ''}
                    </span>
                  </div>
                  <p style={{
                    margin: 0, fontSize: '14px', fontFamily: 'var(--font-body)',
                    color: isUnread ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    fontWeight: isUnread ? 600 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.is_blocked
                      ? 'Blocked · Chat history is still available'
                      : c.last_message_preview || (isGroup ? 'No messages yet' : `Say hi to ${name.split(' ')[0]}!`)}
                  </p>
                </div>

                <button
                  aria-label={c.is_muted ? 'Unmute chat' : 'Mute chat'}
                  onClick={(e) => { e.stopPropagation(); setMenuId(menuId === c.id ? null : c.id) }}
                  style={{ background: 'none', border: 'none', color: c.is_muted ? 'var(--color-lime)' : 'var(--color-text-muted)', padding: 6, cursor: 'pointer', display: 'flex' }}
                >
                  <MoreHorizontal size={18} />
                </button>
                {menuId === c.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleMute(c) }}
                    style={{ position: 'absolute', right: 16, marginTop: 72, zIndex: 20, display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 10, background: 'var(--color-navbar-bg)', border: '1px solid var(--color-border-strong)', color: 'var(--color-text-primary)', cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}
                  >
                    {c.is_muted ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    {c.is_muted ? 'Unmute chat' : 'Mute chat'}
                  </button>
                )}
                {isUnread && (
                  <div style={{
                    minWidth: 22, height: 22, borderRadius: '9999px',
                    background: 'var(--color-lime)', color: 'var(--color-accent-contrast)',
                    fontSize: '11px', fontWeight: 800,
                    fontFamily: 'var(--font-display)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 6px', flexShrink: 0,
                    marginLeft: '4px',
                  }}>
                    {c.unread_count > 99 ? '99+' : c.unread_count}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
