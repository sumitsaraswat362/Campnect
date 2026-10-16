import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Search, X, Users, Globe, ChevronRight } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/shared/Avatar'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { PeopleRowsSkeleton } from '../../components/shared/AppSkeletons'
import { chatApi } from '../../api/chat'
import { requestAppBack } from '../../navigation/appBackRequest'

export function NewMessageScreen() {
  const navigate = useNavigate()
  const { user }  = useAuthStore()
  const { createConversation, conversations } = useChatStore()

  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [opening, setOpening] = useState<number | null>(null)

  // Suggested: people already in existing DMs, deduplicated
  const suggested = conversations
    .filter((c) => c.type !== 'group')
    .flatMap((c) => (c.members || []).filter((m: any) => m.id !== user?.id))
    .filter((u: any, i: number, arr: any[]) => arr.findIndex((x) => x.id === u.id) === i)
    .slice(0, 12)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await chatApi.searchUsers(query)
        setResults((res.data.data || []).filter((u: any) => u.id !== user?.id))
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 280)
    return () => clearTimeout(t)
  }, [query])

  async function openDM(target: any) {
    setOpening(target.id)
    try {
      const res = await createConversation([target.id])
      const convId = (res as any)?.id || (res as any)?.data?.id
      if (convId) navigate(`/app/chat/${convId}`, { replace: true })
      else navigate('/app/chat', { replace: true })
    } catch {
      setOpening(null)
    }
  }

  const listToShow = query.length >= 2 ? results : suggested
  const isEmpty    = listToShow.length === 0 && !loading

  return (
    <div className="route-viewport" style={{
      display: 'flex', flexDirection: 'column',
      background: 'var(--color-bg)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '10px 12px 10px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        backdropFilter: 'blur(20px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={requestAppBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-primary)', display: 'flex', padding: '8px',
            borderRadius: '9999px', WebkitTapHighlightColor: 'transparent',
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={24} />
        </button>
        <h2 style={{
          margin: 0, fontSize: '18px', fontWeight: 700,
          color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)', flex: 1,
        }}>
          New Message
        </h2>
      </div>

      {/* ── Search bar ──────────────────────────────────────── */}
      <div style={{ padding: '14px 16px 10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'var(--color-surface)',
          border: '1.5px solid var(--color-input-border)',
          borderRadius: '14px', padding: '0 16px', height: '50px',
          transition: 'border-color 150ms',
        }}
          onFocusCapture={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-strong)')}
          onBlurCapture={(e) => (e.currentTarget.style.borderColor = 'var(--color-input-border)')}
        >
          <Search size={17} color="var(--color-input-icon)" strokeWidth={2} />
          <input
            autoFocus
            type="text"
            placeholder="Search by name or username…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--color-text-primary)', fontSize: '15px', fontFamily: 'var(--font-body)',
              caretColor: 'var(--color-lime)',
            }}
          />
          {query.length > 0 && (
            <button
              onClick={() => setQuery('')}
              style={{
                background: 'var(--color-surface-hover)', border: 'none',
                borderRadius: '9999px', width: 20, height: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, padding: 0,
                color: 'var(--color-text-secondary)',
              }}
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* ── Creation shortcuts ───────────────────────────────── */}
      {!query && (
        <div style={{ display: 'grid', gap: '8px', padding: '0 16px 14px' }}>
          <button
            type="button"
            onClick={() => navigate('/app/chat/new-group')}
            style={{
              width: '100%', minHeight: 52, padding: '8px 12px',
              display: 'flex', alignItems: 'center', gap: 12,
              border: '1px solid var(--color-border)', borderRadius: 14,
              background: 'var(--color-surface)', color: 'var(--color-text-primary)',
              cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--color-lime)', color: 'var(--color-accent-contrast)', flexShrink: 0 }}>
              <Users size={18} strokeWidth={2.3} />
            </span>
            <span style={{ flex: 1 }}>
              <strong style={{ display: 'block', fontSize: 14, fontFamily: 'var(--font-display)' }}>Create group</strong>
              <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--color-text-muted)' }}>Start a private group conversation</span>
            </span>
            <ChevronRight size={18} color="var(--color-text-muted)" />
          </button>

          <button
            type="button"
            onClick={() => navigate('/app/communities/create')}
            style={{
              width: '100%', minHeight: 52, padding: '8px 12px',
              display: 'flex', alignItems: 'center', gap: 12,
              border: '1px solid var(--color-border)', borderRadius: 14,
              background: 'var(--color-surface)', color: 'var(--color-text-primary)',
              cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--color-purple-core)', color: '#fff', flexShrink: 0 }}>
              <Globe size={18} strokeWidth={2.2} />
            </span>
            <span style={{ flex: 1 }}>
              <strong style={{ display: 'block', fontSize: 14, fontFamily: 'var(--font-display)' }}>Create community</strong>
              <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--color-text-muted)' }}>Build a space around a shared interest</span>
            </span>
            <ChevronRight size={18} color="var(--color-text-muted)" />
          </button>
        </div>
      )}

      {/* ── Section label ───────────────────────────────────── */}
      {!query && suggested.length > 0 && (
        <p style={{
          margin: '0 0 6px', padding: '0 16px',
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-display)',
        }}>
          Suggested
        </p>
      )}

      {/* ── Results ─────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))' }}>
        {loading && (
          <PeopleRowsSkeleton />
        )}

        {!loading && query.length >= 2 && results.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '64px 32px', gap: '12px', textAlign: 'center',
          }}>
            <Search size={36} color="var(--color-text-muted)" />
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-text-muted)', fontFamily: 'var(--font-display)' }}>
              No results for "{query}"
            </p>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
              Try a different name or username
            </p>
          </div>
        )}

        {!loading && !query && isEmpty && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '64px 32px', gap: '12px', textAlign: 'center',
          }}>
            <span style={{ fontSize: '48px' }}>💬</span>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-text-muted)', fontFamily: 'var(--font-display)' }}>
              Search for someone
            </p>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
              Type a name or username above to find people
            </p>
          </div>
        )}

        {!loading && listToShow.map((u: any) => (
          <div
            key={u.id}
            onClick={() => opening === null && openDM(u)}
            style={{
              display: 'flex', alignItems: 'center', gap: '13px',
              padding: '12px 16px',
              cursor: opening === null ? 'pointer' : 'default',
              WebkitTapHighlightColor: 'transparent',
              transition: 'background 100ms',
              background: opening === u.id ? 'var(--color-surface-hover)' : 'transparent',
            }}
            onTouchStart={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onTouchEnd={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <Avatar src={u.avatar_url} name={u.full_name} size={50} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: 0, fontSize: '15px', fontWeight: 600,
                color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {u.full_name}
              </p>
              <p style={{
                margin: '2px 0 0', fontSize: '13px',
                color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)',
              }}>
                @{u.username?.toLowerCase()}
                {u.college_name ? ` · ${u.college_name}` : ''}
              </p>
            </div>
            {opening === u.id && (
              <LoadingSpinner size={18} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
