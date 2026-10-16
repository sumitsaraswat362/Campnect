import { DEMO_MODE } from '../../demo/config'
import { useEffect, useMemo, useState } from 'react'
import { Search, Sparkles, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { usersApi } from '../../api/users'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/shared/Avatar'
import { VerifiedBadge } from '../../components/shared/VerifiedBadge'
import { EmptyState } from '../../components/shared/EmptyState'
import { PeopleRowsSkeleton } from '../../components/shared/AppSkeletons'
import { useNavigate } from 'react-router-dom'
import { colors, radii, typography } from '../../styles/tokens'
import { EXPANDED_ID_SUGGESTIONS_LIMIT, requestIdSuggestionsInFlight } from './idSuggestions'

type FollowState = 'requested' | 'following' | 'not_following' | 'loading'

function isFollowing(user: any) {
  return user.is_following === true || user.is_following === 1 || user.is_following === '1' || user.follow_status === 'active'
}

export function IdSuggestionsScreen() {
  const navigate = useNavigate()
  const currentUserId = useAuthStore((state) => state.user?.id ?? null)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [followState, setFollowState] = useState<Record<string, FollowState>>({})

  useEffect(() => {
    if (!currentUserId) return
    let current = true
    setLoading(true)
    setSuggestions([])
    setFollowState({})
    requestIdSuggestionsInFlight(currentUserId, EXPANDED_ID_SUGGESTIONS_LIMIT, () => usersApi.getIdSuggestions(EXPANDED_ID_SUGGESTIONS_LIMIT))
      .then((response) => {
        if (!current) return
        const users = response.data.data || []
        setSuggestions(users)
        setFollowState(Object.fromEntries(users.map((user: any) => [
          user.id,
          DEMO_MODE && user.follow_status === 'pending' ? 'requested' : isFollowing(user) ? 'following' : 'not_following',
        ])))
      })
      .catch(() => {
        if (current) toast.error('Could not load ID suggestions')
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => { current = false }
  }, [currentUserId])

  const filteredSuggestions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return suggestions
    return suggestions.filter((user) => [
      user.full_name,
      user.username,
      user.college_name,
      user.course,
      user.department,
    ].some((value) => String(value || '').toLowerCase().includes(needle)))
  }, [query, suggestions])

  async function toggleFollow(user: any) {
    const previous = followState[user.id] || (DEMO_MODE && user.follow_status === 'pending' ? 'requested' : isFollowing(user) ? 'following' : 'not_following')
    if (previous === 'loading') return
    const wasFollowing = previous === 'following' || previous === 'requested'
    setFollowState((current) => ({ ...current, [user.id]: 'loading' }))
    try {
      if (wasFollowing) await usersApi.unfollow(user.id)
      else {
        const response = await usersApi.follow(user.id)
        if (DEMO_MODE && response.data.data.status === 'pending') { setFollowState(current => ({ ...current, [user.id]: 'requested' })); return }
      }
      setFollowState((current) => ({ ...current, [user.id]: wasFollowing ? 'not_following' : 'following' }))
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Could not update follow')
      setFollowState((current) => ({ ...current, [user.id]: previous }))
    }
  }

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: colors.bg }}>
      <div style={{ padding: '14px 16px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <Sparkles size={18} color="#18181B" />
          <div>
            <h1 style={{ margin: 0, color: colors.textPrimary, fontFamily: typography.fontDisplay, fontSize: 18, fontWeight: 800 }}>ID suggestions</h1>
            <p style={{ margin: '2px 0 0', color: colors.textMuted, fontSize: 13 }}>People you may know</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 14px', background: 'var(--color-surface)', border: `1px solid ${colors.border}`, borderRadius: radii.pill }}>
          <Search size={18} color={colors.textMuted} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search suggestions"
            aria-label="Search ID suggestions"
            style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: colors.textPrimary, fontFamily: typography.fontFamily, fontSize: 15 }}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" style={{ display: 'flex', padding: 2, border: 0, background: 'transparent', color: colors.textMuted, cursor: 'pointer' }}>
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 20 }}>
        {loading ? <PeopleRowsSkeleton count={7} /> : filteredSuggestions.length === 0 ? (
          <EmptyState
            icon={<Search size={28} color="var(--color-lime)" strokeWidth={1.6} />}
            title={query ? 'No suggestions found' : 'No suggestions yet'}
            description={query ? 'Try a different name, username, college, or course.' : 'Check back after more people join Campnect.'}
          />
        ) : filteredSuggestions.map((user) => {
          const state = followState[user.id] || (DEMO_MODE && user.follow_status === 'pending' ? 'requested' : isFollowing(user) ? 'following' : 'not_following')
          const following = state === 'following'
          return (
            <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 16px', borderBottom: `1px solid ${colors.border}` }}>
              <button
                type="button"
                onClick={() => navigate(`/app/profile/${user.username}`)}
                style={{ display: 'flex', flex: 1, minWidth: 0, alignItems: 'center', gap: 13, padding: 0, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
              >
                <Avatar src={user.avatar_url} name={user.full_name} size={52} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: colors.textPrimary, fontFamily: typography.fontDisplay, fontSize: 15, fontWeight: 700 }}>{user.full_name}</span>
                    {(Boolean(user.is_college_verified) || ['ceo', 'cmo'].includes(user.username?.toLowerCase() || '')) && <VerifiedBadge size={13} />}
                  </span>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2, color: colors.textMuted, fontSize: 13 }}>@{user.username?.toLowerCase()}</span>
                  {user.college_name && <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2, color: colors.textMuted, fontSize: 13 }}>{user.college_name}</span>}
                </span>
              </button>
              <button
                type="button"
                onClick={() => { void toggleFollow(user) }}
                disabled={state === 'loading'}
                style={{ minWidth: 88, padding: '9px 14px', borderRadius: radii.pill, border: following ? `1px solid ${colors.border}` : 'none', background: following ? 'transparent' : '#111114', color: following ? colors.textPrimary : '#fff', fontFamily: typography.fontDisplay, fontSize: 13, fontWeight: 700, cursor: state === 'loading' ? 'wait' : 'pointer', opacity: state === 'loading' ? 0.65 : 1 }}
              >
                {state === 'loading' ? 'Saving…' : state === 'requested' ? 'Requested' : following ? 'Following' : 'Follow'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}