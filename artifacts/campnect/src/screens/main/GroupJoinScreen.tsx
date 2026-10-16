import { useState, useEffect } from 'react'
import { useLocation, useParams, useNavigate } from 'react-router-dom'
import { Users, Lock, LogIn } from 'lucide-react'
import { Avatar } from '../../components/shared/Avatar'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { DetailPageSkeleton } from '../../components/shared/AppSkeletons'
import { chatApi } from '../../api/chat'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { navigateToAppRoot } from '../../navigation/appSectionNavigation'

export function GroupJoinScreen() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const upsertConversation = useChatStore((s) => s.upsertConversation)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [preview, setPreview] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    // Public endpoint — works even when not logged in
    chatApi.previewJoin(token)
      .then((res) => setPreview(res.data.data))
      .catch(() => setError('This invite link is invalid or has expired.'))
      .finally(() => setLoading(false))
  }, [token])

  async function handleJoin() {
    if (!isAuthenticated) {
      // Redirect to login with return URL so they come back here after signing in
      navigate(`/login?return=${encodeURIComponent(`/join/${token}`)}`)
      return
    }
    if (!token) return
    setJoining(true)
    setError('')
    try {
      const res = await chatApi.joinViaLink(token)
      if (res.data.requested) {
        setRequested(true)
      } else {
        if (res.data.data) upsertConversation(res.data.data)
        if (res.data.data?.id) {
          navigate(`/app/chat/${res.data.data.id}`, { replace: true })
        } else {
          setJoined(true)
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to join group.')
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="route-viewport route-scroll" style={{ background: 'var(--color-bg)' }}>
        <DetailPageSkeleton kind="group" />
      </div>
    )
  }

  if (error && !preview) {
    return (
      <div className="route-viewport route-scroll" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: '32px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔗</div>
        <h2 style={{ color: 'var(--color-text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)', textAlign: 'center' }}>Invalid Invite Link</h2>
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', fontSize: '14px', lineHeight: 1.5, margin: '0 0 24px' }}>{error}</p>
        <button
          onClick={() => navigate(isAuthenticated ? '/app/chat' : '/login')}
          style={{ padding: '12px 28px', background: 'var(--color-lime)', border: 'none', borderRadius: '10px', color: '#0D0B12', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-display)' }}
        >
          {isAuthenticated ? 'Go to Messages' : 'Sign In'}
        </button>
      </div>
    )
  }

  return (
    <div className="route-viewport route-scroll" style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', alignItems: 'center', justifyContent: 'center', padding: 'calc(32px + var(--sat)) 24px calc(32px + var(--sab))' }}>
      {/* App branding */}
      <div style={{ marginBottom: '28px', textAlign: 'center' }}>
        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--color-lime)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>Campnect</div>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>Campus Social Network</p>
      </div>

      {/* Group card */}
      <div style={{ width: '100%', maxWidth: '360px', background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: '24px', padding: '32px 24px', textAlign: 'center' }}>
        <Avatar src={preview?.avatar_url} name={preview?.name} size={80} />
        <h2 style={{ margin: '16px 0 4px', color: 'var(--color-text-primary)', fontSize: '20px', fontFamily: 'var(--font-display)' }}>{preview?.name}</h2>
        {preview?.description && (
          <p style={{ margin: '0 0 12px', color: 'var(--color-text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>{preview.description}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--color-text-muted)', fontSize: '13px', marginBottom: '24px' }}>
          <Users size={14} />
          <span>{preview?.members_count} members</span>
          {preview?.requires_approval ? (
            <><span>·</span><Lock size={13} /><span>Approval required</span></>
          ) : null}
        </div>

        {joined && (
          <div style={{ padding: '12px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '12px', color: '#22C55E', fontSize: '14px', marginBottom: '16px' }}>
            ✅ You've joined the group!
          </div>
        )}

        {requested && (
          <div style={{ padding: '12px', background: 'rgba(24,24,27,0.12)', border: '1px solid rgba(24,24,27,0.22)', borderRadius: '12px', color: 'rgba(210,210,215,0.90)', fontSize: '14px', marginBottom: '16px' }}>
            ✅ Join request sent! Waiting for admin approval.
          </div>
        )}

        {error && (
          <div style={{ padding: '10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', color: '#EF4444', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {!joined && !requested && (
          <button
            onClick={handleJoin}
            disabled={joining}
            style={{ width: '100%', padding: '14px', background: 'var(--color-lime)', border: 'none', borderRadius: '12px', color: '#0D0B12', fontSize: '15px', fontWeight: 800, cursor: joining ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: joining ? 0.7 : 1 }}
          >
            {joining ? <LoadingSpinner size={16} /> : !isAuthenticated ? <LogIn size={16} /> : null}
            {joining
              ? 'Joining…'
              : !isAuthenticated
              ? 'Sign in to Join'
              : preview?.requires_approval ? 'Request to Join' : 'Join Group'}
          </button>
        )}

        <button
          onClick={() => {
            const destination = isAuthenticated ? (joined || requested ? '/app/chat' : '/app/feed') : '/login'
            if (destination === '/app/feed') navigateToAppRoot(navigate, location.pathname, destination)
            else navigate(destination)
          }}
          style={{ marginTop: '10px', width: '100%', padding: '12px', background: 'transparent', border: '1px solid var(--color-border-strong)', borderRadius: '12px', color: 'var(--color-text-secondary)', fontSize: '14px', cursor: 'pointer' }}
        >
          {joined || requested ? 'Go to Messages' : isAuthenticated ? 'Not now' : 'Sign In Instead'}
        </button>
      </div>
    </div>
  )
}
