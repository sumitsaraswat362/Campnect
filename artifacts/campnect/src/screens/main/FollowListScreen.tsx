import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, Search, X, UserMinus } from 'lucide-react'
import { usersApi } from '../../api/users'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/shared/Avatar'
import { VerifiedBadge } from '../../components/shared/VerifiedBadge'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { PeopleRowsSkeleton } from '../../components/shared/AppSkeletons'
import { EmptyState } from '../../components/shared/EmptyState'
import toast from 'react-hot-toast'
import client from '../../api/client'
import { requestAppBack } from '../../navigation/appBackRequest'

/** Remove a follower: DELETE /api/users/me/followers/:followerId */
async function removeFollower(followerId: string) {
  return client.delete(`/users/me/followers/${followerId}`)
}

export function FollowListScreen({ mode }: { mode: 'followers' | 'following' }) {
  const { username } = useParams<{ username: string }>()
  const navigate     = useNavigate()
  const { user: me } = useAuthStore()
  const isOwner      = me?.username === username

  const [users,   setUsers]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [query,   setQuery]   = useState('')
  // track follow state per user: id → 'following' | 'not_following' | 'loading' | 'removed'
  const [followState, setFollowState] = useState<Record<string, 'following' | 'not_following' | 'loading' | 'removed'>>({})

  useEffect(() => {
    if (!username) return
    setLoading(true)
    setFollowState({})
    usersApi.getProfile(username)
      .then((profileRes) => {
        const profileId = profileRes.data.data?.id
        if (!profileId) throw new Error('Profile not found')
        const fn = mode === 'followers' ? usersApi.getFollowers : usersApi.getFollowing
        return fn(profileId)
      })
      .then((res) => {
        const data = res.data.data || []
        setUsers(data)
        const init: Record<string, any> = {}
        data.forEach((u: any) => {
          if (u.id === me?.id) return
          const apiSaysFollowing = u.is_following === true || u.is_following === 1 || u.is_following === '1'
          const isFollowing = (isOwner && mode === 'following') || apiSaysFollowing
          init[u.id] = isFollowing ? 'following' : 'not_following'
        })
        setFollowState(init)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [username, mode, me?.id])

  const filtered = useMemo(() =>
    users.filter((u) => {
      if (followState[u.id] === 'removed') return false
      const q = query.toLowerCase()
      return !q || u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q)
    }),
    [users, query, followState]
  )

  async function toggleFollow(u: any) {
    const current = followState[u.id]
    if (current === 'loading') return
    setFollowState((s) => ({ ...s, [u.id]: 'loading' }))
    try {
      if (current === 'following') {
        await usersApi.unfollow(u.id)
        setFollowState((s) => ({ ...s, [u.id]: 'not_following' }))
      } else {
        await usersApi.follow(u.id)
        setFollowState((s) => ({ ...s, [u.id]: 'following' }))
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Action failed')
      setFollowState((s) => ({ ...s, [u.id]: current! }))
    }
  }

  async function handleRemoveFollower(u: any) {
    setFollowState((s) => ({ ...s, [u.id]: 'loading' }))
    try {
      await removeFollower(u.id)
      setFollowState((s) => ({ ...s, [u.id]: 'removed' }))
      toast.success(`Removed @${u.username}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not remove follower')
      setFollowState((s) => ({ ...s, [u.id]: 'not_following' }))
    }
  }

  const title = mode === 'followers' ? 'Followers' : 'Following'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 6,
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 16px',
        background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <button
          type="button"
          aria-label={`Back from ${title}`}
          onClick={requestAppBack}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '36px', height: '36px', padding: 0,
            border: '1px solid var(--color-border)',
            borderRadius: '50%',
            background: 'var(--color-surface)',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <h1 style={{
          margin: 0, fontSize: '17px', fontWeight: 700,
          color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)',
        }}>
          {title}
        </h1>
      </div>

      {loading && <PeopleRowsSkeleton count={6} />}

      {/* Search bar */}
      {!loading && <div style={{ padding: '12px 16px 8px', position: 'sticky', top: '57px', background: 'var(--color-bg)', zIndex: 5, borderBottom: '1px solid var(--color-border)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'var(--color-input-bg)',
          border: '1.5px solid var(--color-input-border)',
          borderRadius: '12px', padding: '0 14px', height: '42px',
        }}>
          <Search size={15} color="var(--color-input-icon)" />
          <input
            type="text"
            placeholder={`Search ${mode}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--color-text-primary)', fontSize: '14px', fontFamily: 'var(--font-body)', caretColor: 'var(--color-lime)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: '2px' }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      }

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={<Users size={28} color="var(--color-lime)" strokeWidth={1.6} />}
          title={query ? 'No results' : mode === 'followers' ? 'No followers yet' : 'Not following anyone'}
          description={query ? 'Try a different name or username' : undefined}
        />
      )}

      {!loading && filtered.map((u) => {
        const state = followState[u.id]
        const isSelf = u.id === me?.id
        return (
          <div
            key={u.id}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            {/* Tappable avatar + name area */}
            <div
              onClick={() => navigate(`/app/profile/${u.username}`)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              <Avatar src={u.avatar_url} name={u.full_name} size={46} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    fontWeight: 600, fontSize: '15px',
                    fontFamily: 'var(--font-display)',
                    color: 'var(--color-text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {u.full_name}
                  </span>
                  {(Boolean(u.is_college_verified) || ['ceo', 'cmo'].includes(u.username?.toLowerCase() || '')) && <VerifiedBadge size={13} />}
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  @{u.username?.toLowerCase()}{u.college_name ? ` · ${u.college_name}` : ''}
                </p>
              </div>
            </div>

            {/* Action buttons — only for non-self */}
            {!isSelf && (
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {/* Remove button: only owner's followers list */}
                {isOwner && mode === 'followers' && (
                  <button
                    onClick={() => handleRemoveFollower(u)}
                    disabled={state === 'loading'}
                    title="Remove follower"
                    style={{
                      padding: '6px 10px', borderRadius: '9px', border: '1.5px solid var(--color-border-strong)',
                      background: 'rgba(239,68,68,0.08)', color: '#F87171',
                      fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-display)',
                      cursor: state === 'loading' ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: '4px',
                      opacity: state === 'loading' ? 0.5 : 1,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {state === 'loading' ? <LoadingSpinner size={12} /> : <UserMinus size={12} strokeWidth={2} />}
                    Remove
                  </button>
                )}

                {/* Follow / Following / Unfollow button */}
                <button
                  onClick={() => toggleFollow(u)}
                  disabled={state === 'loading'}
                  style={{
                    padding: '7px 16px', borderRadius: '9px',
                    border: state === 'following' ? '1.5px solid var(--color-border-strong)' : 'none',
                    background: state === 'following'
                      ? 'var(--color-surface-hover)'
                      : state === 'loading'
                        ? 'rgba(187,255,0,0.5)'
                        : 'var(--color-lime)',
                    color: state === 'following' ? 'var(--color-text-primary)' : 'var(--color-on-lime)',
                    fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-display)',
                    cursor: state === 'loading' ? 'not-allowed' : 'pointer',
                    minWidth: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'all 150ms',
                  }}
                >
                  {state === 'loading' ? <LoadingSpinner size={14} /> : state === 'following' ? 'Following' : 'Follow'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
