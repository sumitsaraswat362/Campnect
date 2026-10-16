import { DEMO_MODE } from '../../demo/config'
import toast from 'react-hot-toast'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Search, X, Users, Globe, Calendar, GraduationCap, Filter, Sparkles, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/shared/Avatar'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { VerifiedBadge } from '../../components/shared/VerifiedBadge'
import { CommunityCardsSkeleton, EventCardsSkeleton, PeopleRowsSkeleton } from '../../components/shared/AppSkeletons'
import { searchApi } from '../../api/search'
import { usersApi } from '../../api/users'
import { communitiesApi } from '../../api/communities'
import { colors, typography, radii, motion } from '../../styles/tokens'
import { parseApiDate } from '../../utils/dateTime'
import { useAuthStore } from '../../stores/authStore'
import { getNextIdSuggestionRequestLimit, requestIdSuggestionsInFlight } from './idSuggestions'

type TabType = 'people' | 'communities' | 'events' | 'colleges'

const TABS: { id: TabType; label: string; icon: React.ReactNode; apiType: string }[] = [
  { id: 'people',      label: 'People',      icon: <Users size={15} />,        apiType: 'users' },
  { id: 'communities', label: 'Communities', icon: <Globe size={15} />,        apiType: 'communities' },
  { id: 'events',      label: 'Events',      icon: <Calendar size={15} />,     apiType: 'events' },
  { id: 'colleges',    label: 'Colleges',    icon: <GraduationCap size={15} />, apiType: 'colleges' },
]

const FILTERS = [
  { id: 'same_college', label: 'Same College' },
  { id: 'same_dept',    label: 'Same Dept' },
  { id: 'same_year',    label: 'Same Year' },
  { id: 'verified',     label: 'Verified Only' },
]

export function SearchScreen() {
  const navigate = useNavigate()
  const currentUserId = useAuthStore((state) => state.user?.id ?? null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<TabType>('people')
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set())
  const [joiningInProgress, setJoiningInProgress] = useState<Set<string>>(new Set())
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsAccountId, setSuggestionsAccountId] = useState<string | null>(null)
  const suggestionRequestRef = useRef({ accountId: null as string | null, loadedLimit: 0, loadingLimit: 0 })
  const hasActiveFollow = (user: any) =>
    followingIds.has(user.id)
    || user.is_following === true
    || user.is_following === 1
    || user.is_following === '1'

  const fetchIdSuggestions = useCallback((expanded: boolean, accountId: string) => {
    const request = suggestionRequestRef.current
    if (request.accountId !== accountId) return
    const limit = getNextIdSuggestionRequestLimit({
      expanded,
      loadedLimit: request.loadedLimit,
      loadingLimit: request.loadingLimit,
    })
    if (limit === null) return

    request.loadingLimit = limit
    setSuggestionsLoading(true)
    requestIdSuggestionsInFlight(accountId, limit, () => usersApi.getIdSuggestions(limit))
      .then((res) => {
        if (suggestionRequestRef.current !== request || useAuthStore.getState().user?.id !== accountId) return
        setSuggestions(res.data.data || [])
        request.loadedLimit = Math.max(request.loadedLimit, limit)
      })
      .catch(() => {
        if (suggestionRequestRef.current === request && useAuthStore.getState().user?.id === accountId && request.loadedLimit === 0) {
          setSuggestions([])
        }
      })
      .finally(() => {
        if (suggestionRequestRef.current === request && request.loadingLimit === limit) {
          request.loadingLimit = 0
          setSuggestionsLoading(false)
        }
      })
  }, [])

  useEffect(() => {
    suggestionRequestRef.current = { accountId: currentUserId, loadedLimit: 0, loadingLimit: 0 }
    setSuggestionsAccountId(currentUserId)
    setSuggestions([])
    if (currentUserId) fetchIdSuggestions(false, currentUserId)
  }, [currentUserId, fetchIdSuggestions])

  const doSearch = useCallback(async (q: string, t: TabType) => {
    if (!q.trim() && t === 'communities') {
      setLoading(true)
      try {
        const res = await communitiesApi.getAll({ limit: 30, page: 1 })
        setResults({ communities: res.data.data || [] })
      } catch {
        setResults({ communities: [] })
      } finally {
        setLoading(false)
      }
      return
    }
    if (!q.trim() && t !== 'colleges') { setResults(null); setLoading(false); return }
    setLoading(true)
    try {
      // Map UI tab id → backend type param
      const apiType = TABS.find((tb) => tb.id === t)?.apiType ?? t
      const res = await searchApi.search(q, apiType)
      setResults(res.data.data || {})
    } catch { setResults(null) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query, tab), 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, tab, doSearch])

  // Auto-focus when screen mounts
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])

  const toggleFilter = (id: string) => {
    setActiveFilters((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const handleFollow = async (userId: string, isFollowing: boolean) => {
    if (DEMO_MODE) {
      try {
        const current = (await usersApi.getProfile(userId)).data.data
        const response = ['active', 'pending'].includes(current.follow_status) ? await usersApi.unfollow(userId) : await usersApi.follow(userId)
        const updated = response.data.data
        setFollowingIds(prev => { const next = new Set(prev); updated.is_following ? next.add(userId) : next.delete(userId); return next })
        setResults((prev: any) => prev ? { ...prev, users: prev.users?.map((u: any) => u.id === userId ? { ...u, ...updated } : u) } : prev)
        setSuggestions(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u))
      } catch (e: any) { toast.error(e.message) }
      return
    }
    setFollowingIds((prev) => { const n = new Set(prev); isFollowing ? n.delete(userId) : n.add(userId); return n })
    setResults((previous: any) => previous
      ? {
          ...previous,
          users: previous.users?.map((user: any) => user.id === userId
            ? { ...user, is_following: !isFollowing, follow_status: !isFollowing ? 'active' : null }
            : user),
        }
      : previous)
    try {
      if (isFollowing) await usersApi.unfollow(userId)
      else await usersApi.follow(userId)
    } catch {
      setFollowingIds((prev) => { const n = new Set(prev); isFollowing ? n.add(userId) : n.delete(userId); return n })
      setResults((previous: any) => previous
        ? {
            ...previous,
            users: previous.users?.map((user: any) => user.id === userId
              ? { ...user, is_following: isFollowing, follow_status: isFollowing ? 'active' : null }
              : user),
          }
        : previous)
    }
  }

  const applyFilters = (items: any[]) => {
    if (!activeFilters.size || !items) return items
    return items.filter((u: any) => {
      const me = useAuthStore.getState().user
      if (DEMO_MODE && activeFilters.has('same_college') && u.college_id !== me?.college_id) return false
      if (DEMO_MODE && activeFilters.has('same_dept') && u.department !== me?.department) return false
      if (DEMO_MODE && activeFilters.has('same_year') && u.year !== me?.year) return false
      if (activeFilters.has('verified') && !u.is_college_verified) return false
      return true
    })
  }

  const people      = applyFilters(results?.users || [])
  const communities = results?.communities || []
  const events      = results?.events || []
  const colleges    = results?.colleges || []
  const visibleSuggestions = suggestionsAccountId === currentUserId ? suggestions : []

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: colors.bg, overflowY: 'hidden' }}>
      {/* Search bar */}
      <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'var(--color-surface)', borderRadius: radii.pill,
          padding: '0 14px', border: `1px solid ${colors.border}`,
        }}>
          <Search size={18} color={colors.textMuted} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, communities, events…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: colors.textPrimary, fontSize: '15px', padding: '12px 0',
              fontFamily: typography.fontFamily,
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, display: 'flex' }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Tab row */}
      <div className="search-tabs-scroll" style={{ display: 'flex', padding: '12px 16px 0', gap: '8px', flexShrink: 0, overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
              padding: '9px 16px', borderRadius: radii.pill, border: `1px solid ${tab === t.id ? '#111114' : colors.border}`, cursor: 'pointer',
              fontSize: '13.5px', fontWeight: 700, fontFamily: typography.fontDisplay,
              transition: `all ${motion.base} ${motion.easeSmooth}`,
              background: tab === t.id ? '#111114' : colors.surface,
              color: tab === t.id ? '#fff' : colors.textSecondary,
            }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Filter chips (people only) */}
      {tab === 'people' && query && (
        <div style={{ display: 'flex', padding: '8px 16px 0', gap: '6px', flexShrink: 0, overflowX: 'auto' }}>
          <Filter size={14} color={colors.textMuted} style={{ flexShrink: 0, marginTop: 6 }} />
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => toggleFilter(f.id)}
              style={{
                padding: '5px 12px', borderRadius: radii.pill, border: '1px solid',
                borderColor: activeFilters.has(f.id) ? '#18181B' : 'var(--color-border)',
                background: activeFilters.has(f.id) ? '#18181B' : 'transparent',
                color: activeFilters.has(f.id) ? '#FFFFFF' : 'var(--color-text-secondary)',
                fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: activeFilters.has(f.id) ? 600 : 400,
                transition: `all ${motion.fast} ${motion.easeSmooth}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {!query && tab === 'people' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '14px 16px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <Sparkles size={16} color="#18181B" />
                <span style={{ color: colors.textPrimary, fontWeight: 800, fontSize: '15px', fontFamily: typography.fontDisplay }}>ID suggestions</span>
                <span style={{ color: colors.textMuted, fontSize: '12px', whiteSpace: 'nowrap' }}>People you may know</span>
              </div>
              {visibleSuggestions.length > 0 && (
                <button onClick={() => navigate('/app/search/id-suggestions')} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: colors.textPrimary, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                  View all <ChevronRight size={14} />
                </button>
              )}
            </div>
            {suggestionsLoading && visibleSuggestions.length === 0
              ? <PeopleRowsSkeleton count={5} />
              : visibleSuggestions.length > 0
                ? <>
                  {visibleSuggestions.map(u => (
                    <PersonRow
                      key={u.id}
                      user={u}
                      isFollowing={DEMO_MODE ? hasActiveFollow(u) : followingIds.has(u.id)}
                        onFollow={() => handleFollow(u.id, followingIds.has(u.id))}
                      onPress={() => navigate(`/app/profile/${u.username}`)}
                    />
                  ))}
                  <DiscoverPeopleCard onExplore={() => navigate('/app/communities')} />
                </>
                : <EmptyPrompt />}
          </>
        )}

        {!query && tab !== 'people' && tab !== 'colleges' && tab !== 'communities' && (
          <EmptyPrompt label={`Search ${tab}`} />
        )}

        {loading && (
          tab === 'people' || tab === 'colleges'
            ? <PeopleRowsSkeleton count={5} action={tab === 'people'} />
            : tab === 'communities'
              ? <CommunityCardsSkeleton count={4} />
              : <EventCardsSkeleton count={4} />
        )}

        {query && !loading && tab === 'people' && (
          people.length === 0
            ? <EmptyResult label="No people found" />
            : people.map((u: any) => (
                <PersonRow key={u.id} user={u} isFollowing={hasActiveFollow(u)} onFollow={() => handleFollow(u.id, hasActiveFollow(u))} onPress={() => navigate(`/app/profile/${u.username}`)} />
              ))
        )}

        {!loading && tab === 'communities' && (
          communities.length === 0
            ? <EmptyResult label="No communities found" />
            : communities.map((c: any) => (
                <CommunityRow key={c.id} community={c} isJoined={joinedIds.has(c.id) || c.is_member} onJoin={async () => {
          if (joiningInProgress.has(c.id)) return
          const isJoined = joinedIds.has(c.id) || c.is_member
          setJoiningInProgress((p) => { const n = new Set(p); n.add(c.id); return n })
          setJoinedIds((prev) => { const n = new Set(prev); isJoined ? n.delete(c.id) : n.add(c.id); return n })
          try {
            if (isJoined) await communitiesApi.leave(c.id)
            else await communitiesApi.join(c.id)
          } catch {
            setJoinedIds((prev) => { const n = new Set(prev); isJoined ? n.add(c.id) : n.delete(c.id); return n })
          } finally {
            setJoiningInProgress((p) => { const n = new Set(p); n.delete(c.id); return n })
          }
        }} onPress={() => navigate(`/app/community/${c.slug || c.id}`)} />
              ))
        )}

        {query && !loading && tab === 'events' && (
          events.length === 0
            ? <EmptyResult label="No events found" />
            : events.map((e: any) => (
                <EventRow key={e.id} event={e} onPress={() => navigate(`/app/events/${e.id}`)} />
              ))
        )}

        {!loading && tab === 'colleges' && (
          colleges.length === 0
            ? <EmptyResult label={query ? 'No colleges found' : 'No colleges with registered accounts yet'} />
            : colleges.map((c: any) => (
                <CollegeRow key={c.id} college={c} />
              ))
        )}
      </div>
    </div>
  )
}

function EmptyPrompt({ label = 'Search for people, communities, events and colleges' }: { label?: string }) {
  return (
    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
      <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(24,24,27,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Search size={26} color={colors.blueLight} />
      </div>
      <p style={{ color: colors.textPrimary, fontWeight: 700, fontSize: '16px', margin: '0 0 6px', fontFamily: 'var(--font-display)' }}>
        Discover Campnect
      </p>
      <p style={{ color: colors.textMuted, fontSize: '14px', margin: 0, lineHeight: 1.6 }}>
         {label}
      </p>
    </div>
  )
}

function PersonRow({ user, isFollowing, onFollow, onPress }: { user: any; isFollowing: boolean; onFollow: () => void; onPress: () => void }) {
  return (
    <div onClick={onPress} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '13px', cursor: 'pointer' }}>
      <Avatar src={user.avatar_url} name={user.full_name} size={52} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.full_name}</span>
          {(Boolean(user.is_college_verified) || ['ceo', 'cmo'].includes(user.username?.toLowerCase() || '')) ? <VerifiedBadge size={13} /> : null}
        </div>
        <p style={{ margin: '2px 0 0', fontSize: '13px', color: colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          @{user.username?.toLowerCase()}
        </p>
        {user.college_name && (
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.college_name}
          </p>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onFollow() }}
        style={{
          padding: '9px 18px', borderRadius: radii.pill, border: isFollowing ? `1px solid ${colors.border}` : 'none',
          background: isFollowing ? 'transparent' : '#111114',
          color: isFollowing ? colors.textPrimary : '#fff', fontSize: '13px', fontWeight: 700, fontFamily: typography.fontDisplay, cursor: 'pointer', flexShrink: 0,
          transition: `all ${motion.fast} ${motion.easeSmooth}`,
        }}
      >
        {DEMO_MODE && user.follow_status === 'pending' ? 'Requested' : isFollowing ? 'Following' : 'Follow'}
      </button>
    </div>
  )
}

function DiscoverPeopleCard({ onExplore }: { onExplore: () => void }) {
  return (
    <div style={{ margin: '14px 16px 4px', padding: '20px', borderRadius: 22, background: colors.surface, border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: 84, height: 76, flexShrink: 0 }}>
        {[{ l: 4, t: 14, s: 34 }, { l: 30, t: 0, s: 44 }, { l: 54, t: 18, s: 32 }].map((c, i) => (
          <span key={i} style={{ position: 'absolute', left: c.l, top: c.t, width: c.s, height: c.s, borderRadius: '50%', background: 'linear-gradient(155deg, #f4f4f5, #e2e2e6)', border: '1px solid rgba(17,17,20,0.06)' }} />
        ))}
        <span style={{ position: 'absolute', left: 6, top: 4, fontSize: 10, color: 'rgba(17,17,20,0.28)' }}>✦</span>
        <span style={{ position: 'absolute', right: 2, top: 10, fontSize: 8, color: 'rgba(17,17,20,0.22)' }}>✦</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: colors.textPrimary, fontFamily: typography.fontDisplay }}>Discover people</h3>
        <p style={{ margin: '6px 0 14px', fontSize: 12.5, lineHeight: 1.5, color: colors.textSecondary }}>Find and connect with amazing people from your campus.</p>
        <button onClick={onExplore} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 38, padding: '0 14px', border: 0, borderRadius: radii.pill, background: '#111114', color: '#fff', fontWeight: 700, fontSize: 12.5, fontFamily: typography.fontDisplay, cursor: 'pointer' }}>
          Explore communities <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}

function CommunityRow({ community, isJoined, onJoin, onPress }: { community: any; isJoined: boolean; onJoin: () => void; onPress: () => void }) {
  return (
    <div onClick={onPress} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', gap: '12px', cursor: 'pointer' }}>
      <div style={{ width: 46, height: 46, borderRadius: radii.md, background: 'linear-gradient(135deg, #18181B, #3F3F46)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {community.avatar_url
          ? <AuthenticatedImage src={community.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Globe size={20} color="#fff" />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{community.name}</p>
        <p style={{ margin: 0, fontSize: '13px', color: colors.textMuted }}>{community.category} · {community.members_count?.toLocaleString()} members</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onJoin() }}
        style={{
          padding: '9px 18px', borderRadius: radii.pill, border: isJoined ? `1px solid ${colors.border}` : 'none',
          background: isJoined ? 'transparent' : '#111114',
          color: isJoined ? colors.textPrimary : '#fff', fontSize: '13px', fontWeight: 700, fontFamily: typography.fontDisplay, cursor: 'pointer', flexShrink: 0,
        }}
      >
        {isJoined ? 'Joined' : 'Join'}
      </button>
    </div>
  )
}

function EventRow({ event, onPress }: { event: any; onPress: () => void }) {
  const date = parseApiDate(event.starts_at)
  return (
    <div onClick={onPress} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', gap: '12px', cursor: 'pointer' }}>
      <div style={{ width: 46, height: 46, borderRadius: radii.md, background: 'rgba(24,24,27,0.18)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '11px', color: colors.blueLight, fontWeight: 700, lineHeight: 1 }}>{date.toLocaleString('default', { month: 'short' }).toUpperCase()}</span>
        <span style={{ fontSize: '18px', color: 'var(--color-text-primary)', fontWeight: 800, lineHeight: 1 }}>{date.getDate()}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</p>
        <p style={{ margin: 0, fontSize: '13px', color: colors.textMuted }}>{event.location || (event.is_online ? 'Online' : 'TBD')} · {event.attendees_count} going</p>
      </div>
      {event.is_attending && (
        <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: radii.pill, background: 'rgba(34,197,94,0.15)', color: '#22C55E', fontWeight: 600 }}>Going</span>
      )}
    </div>
  )
}

function CollegeRow({ college }: { college: any }) {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate(`/app/college/${college.id}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '10px 16px', gap: '12px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
      <div style={{ width: 46, height: 46, borderRadius: radii.md, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {college.logo_url
          ? <AuthenticatedImage src={college.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }} />
          : <GraduationCap size={20} color={colors.textMuted} />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{college.name}</p>
        <p style={{ margin: 0, fontSize: '13px', color: colors.textMuted }}>
          {[college.city, college.country].filter(Boolean).join(', ') || 'Campus community'}
          {college.member_count ? ` · ${college.member_count.toLocaleString()} ${college.member_count === 1 ? 'member' : 'members'}` : ''}
        </p>
      </div>
    </button>
  )
}

function EmptyResult({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <Search size={40} color={colors.textMuted} style={{ marginBottom: '12px' }} />
      <p style={{ color: colors.textMuted, fontSize: '15px', margin: 0 }}>{label}</p>
    </div>
  )
}
