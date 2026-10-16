import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { ImageIcon, Play, Search, Share2, Sparkles, Trash2, UserRound, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { glimpsesApi, type Glimpse, type GlimpseInsights } from '../../api/glimpses'
import { postsApi } from '../../api/posts'
import { CommentSheet } from '../../components/feed/CommentSheet'
import { ShareSheet } from '../../components/feed/ShareSheet'
import { GlimpsePreviewCard } from '../../components/feed/GlimpsePreviewCard'
import { GlimpseStory } from '../../components/feed/GlimpseStory'
import { GlimpseGridSkeleton } from '../../components/shared/AppSkeletons'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { PromptDialog } from '../../components/shared/PromptDialog'
import { Avatar } from '../../components/shared/Avatar'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { useAuthStore } from '../../stores/authStore'
import { loadCachedGlimpses, patchCachedGlimpse, removeCachedGlimpse, readCachedContent } from '../../cache/contentCache'

interface GlimpseGroup {
  user_id: string
  username: string
  full_name: string
  avatar_url?: string | null
  items: Glimpse[]
}

export function GlimpseScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const userId = user?.id ?? ''
  const [searchParams] = useSearchParams()
  const requestedGlimpseId = searchParams.get('open')?.trim() || ''
  const requestedProfileId = searchParams.get('profile')?.trim() || ''
  const requestedReturnTo = searchParams.get('returnTo')?.trim() || ''
  const returnTo = /^\/app\/profile\/[^/?#]+$/.test(requestedReturnTo) ? requestedReturnTo : ''
  const glimpseCaptureRef = useRef<HTMLInputElement>(null)
  const openGlimpseCamera = () => {
    // Android needs the CameraX activity in CreateGlimpseScreen. Sending a
    // combined image/video capture input straight to the device camera lets
    // some Android camera apps choose video mode with no photo-mode control.
    if (Capacitor.isNativePlatform()) {
      navigate('/app/glimpse/create')
      return
    }
    glimpseCaptureRef.current?.click()
  }
  const receiveGlimpseCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const capture = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (capture) navigate('/app/glimpse/create', { state: { capture } })
  }
  const openedRequestedGlimpse = useRef(false)
  const [allGlimpses, setAllGlimpses] = useState<Glimpse[]>([])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insights, setInsights] = useState<GlimpseInsights | null>(null)
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => new Set())

  const [activeGlimpseId, setActiveGlimpseId] = useState<string | null>(null)
  useBackDismiss(searchOpen, () => setSearchOpen(false), 120)
  useBackDismiss(menuOpen, () => setMenuOpen(false), 240)
  useBackDismiss(reportOpen, () => setReportOpen(false), 260)
  useBackDismiss(insightsOpen, () => setInsightsOpen(false), 280)

  const load = useCallback(async (term = '', force = false) => {
    if (!userId) return
    const resource = `glimpses:${term.trim().toLowerCase() || 'initial'}`
    const cached = readCachedContent<Glimpse[]>(userId, resource)?.value
    if (cached) {
      setAllGlimpses(cached)
      setViewedIds(new Set(cached.filter(item => item.is_viewed).map(item => item.id)))
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const items = await loadCachedGlimpses(userId, term, force)
      setAllGlimpses(items)
      setViewedIds(new Set(items.filter(item => item.is_viewed).map(item => item.id)))
    } catch {
      // Keep backend/database details out of the regular user experience.
      setError('Glimpses are temporarily unavailable. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    setQuery('')
    openedRequestedGlimpse.current = false
    void load('', true)
  }, [load])

  useEffect(() => {
    const refresh = () => { void load('', true) }
    window.addEventListener('campnect:glimpse-refresh', refresh)
    const interval = window.setInterval(refresh, 30_000)
    return () => {
      window.removeEventListener('campnect:glimpse-refresh', refresh)
      window.clearInterval(interval)
    }
  }, [load])

  // Group glimpses by author, story-style — most recently posted author first.
  const groups = useMemo<GlimpseGroup[]>(() => {
    const order: string[] = []
    const map = new Map<string, GlimpseGroup>()
    for (const item of allGlimpses) {
      if (!map.has(item.user_id)) {
        order.push(item.user_id)
        map.set(item.user_id, { user_id: item.user_id, username: item.username, full_name: item.full_name, avatar_url: item.avatar_url, items: [] })
      }
      map.get(item.user_id)!.items.push(item)
    }
    return order.map(id => map.get(id)!)
  }, [allGlimpses])

  const storyItems = useMemo(() => groups.flatMap(group => group.items), [groups])
  const requestedProfileGroup = requestedProfileId
    ? groups.find(group => group.user_id === requestedProfileId) || null
    : null
  const viewerItems = requestedProfileId && requestedProfileGroup
    ? requestedProfileGroup.items
    : storyItems
  const activeStoryIndex = activeGlimpseId
    ? viewerItems.findIndex(item => item.id === activeGlimpseId)
    : -1
  const glimpse = activeStoryIndex >= 0 ? viewerItems[activeStoryIndex] : null

  useEffect(() => {
    if (!requestedGlimpseId || openedRequestedGlimpse.current || groups.length === 0) return
    if (viewerItems.some(item => item.id === requestedGlimpseId)) {
      openedRequestedGlimpse.current = true
      setActiveGlimpseId(requestedGlimpseId)
    } else if (!requestedProfileId || requestedProfileGroup) {
      openedRequestedGlimpse.current = true
      navigate('/app/glimpse', { replace: true })
    }
  }, [groups.length, location.pathname, navigate, requestedGlimpseId, requestedProfileGroup, requestedProfileId, viewerItems])

  useEffect(() => {
    if (requestedGlimpseId) return
    openedRequestedGlimpse.current = false
    setActiveGlimpseId(null)
    setMenuOpen(false)
  }, [requestedGlimpseId])

  useEffect(() => {
    if (!activeGlimpseId || viewerItems.some(item => item.id === activeGlimpseId)) return
    setActiveGlimpseId(null)
    navigate('/app/glimpse', { replace: true })
  }, [activeGlimpseId, location.pathname, navigate, viewerItems])

  useEffect(() => {
    if (allGlimpses.length === 0) return
    const expiresAt = Math.min(...allGlimpses.map(item => new Date(item.created_at).getTime() + (24 * 60 * 60 * 1000)))
    const delay = Math.max(0, expiresAt - Date.now() + 25)
    const timer = window.setTimeout(() => {
      const now = Date.now()
      setAllGlimpses(current => current.filter(item => new Date(item.created_at).getTime() + (24 * 60 * 60 * 1000) > now))
    }, delay)
    return () => window.clearTimeout(timer)
  }, [allGlimpses])

  function openStory(glimpseId: string, profileId?: string) {
    const sequence = profileId
      ? groups.find(group => group.user_id === profileId)?.items || []
      : storyItems
    if (!sequence.some(item => item.id === glimpseId)) return
    setActiveGlimpseId(glimpseId)
    setMenuOpen(false)
    const params = new URLSearchParams({ open: glimpseId })
    if (profileId) params.set('profile', profileId)
    navigate(`/app/glimpse?${params.toString()}`)
  }

  function toggleSearch() {
    const nextOpen = !searchOpen
    setSearchOpen(nextOpen)
    if (!nextOpen && query) {
      setQuery('')
      void load('')
    }
  }

  function closeStory() {
    setActiveGlimpseId(null)
    setMenuOpen(false)
    setShareOpen(false)
    setCommentOpen(false)
    setReportOpen(false)
    setDeleteOpen(false)
    setInsightsOpen(false)
    // The viewer is an overlay on the root Glimpse tab. Do not dispatch the
    // app-wide back action here: the coordinator intentionally exits Android
    // when that action is requested from a root tab. Clear the overlay query
    // directly so both the close button and the final story advance return to
    // the Glimpse list without leaving the app.
    const destination = returnTo || '/app/glimpse'
    navigate(destination, { replace: true })
  }

  // Treat the active story as a dismissible transient surface. This keeps the
  // Android back button consistent with the visible close button and prevents
  // the root-tab exit fallback from running while the viewer is open.
  useBackDismiss(Boolean(glimpse), closeStory, 80)

  function move(direction: 1 | -1) {
    if (activeStoryIndex < 0) return
    const nextIndex = activeStoryIndex + direction
    if (nextIndex >= 0 && nextIndex < viewerItems.length) {
      setActiveGlimpseId(viewerItems[nextIndex].id)
      setMenuOpen(false)
      return
    }
    if (direction === 1) {
      closeStory()
    }
  }

  useEffect(() => {
    if (!glimpse) return
    setViewedIds(current => current.has(glimpse.id) ? current : new Set(current).add(glimpse.id))
    setAllGlimpses(current => current.map(item => item.id === glimpse.id ? { ...item, is_viewed: true } : item))
    patchCachedGlimpse(userId, glimpse.id, { is_viewed: true })
    void glimpsesApi.view(glimpse.id).catch(() => {})
  }, [glimpse?.id])

  async function toggleLike() {
    if (!glimpse) return
    const liked = !glimpse.is_liked
    patchCurrent({ is_liked: liked, likes_count: Math.max(0, glimpse.likes_count + (liked ? 1 : -1)) })
    try {
      if (liked) await postsApi.likePost(glimpse.id)
      else await postsApi.unlikePost(glimpse.id)
    } catch {
      patchCurrent({ is_liked: !liked, likes_count: glimpse.likes_count })
    }
  }

  async function toggleSave() {
    if (!glimpse) return
    const saved = !glimpse.is_saved
    patchCurrent({ is_saved: saved, saves_count: Math.max(0, glimpse.saves_count + (saved ? 1 : -1)) })
    try {
      if (saved) await postsApi.savePost(glimpse.id)
      else await postsApi.unsavePost(glimpse.id)
    } catch {
      patchCurrent({ is_saved: !saved })
    }
  }

  async function openInsights() {
    if (!glimpse || glimpse.user_id !== user?.id) return
    setInsightsOpen(true)
    setInsightsLoading(true)
    try {
      const response = await glimpsesApi.getInsights(glimpse.id)
      setInsights(response.data.data)
    } catch {
      setInsights(null)
      toast.error('Could not load Glimpse activity')
    } finally {
      setInsightsLoading(false)
    }
  }

  function patchCurrent(patch: Partial<Glimpse>) {
    if (!glimpse) return
    setAllGlimpses(current => current.map(item => item.id === glimpse.id ? { ...item, ...patch } : item))
    patchCachedGlimpse(userId, glimpse.id, patch)
  }

  async function report(reason: string) {
    if (!glimpse) return
    try {
      await glimpsesApi.report(glimpse.id, reason)
      toast.success('Thanks — we’ll review this Glimpse.')
      setReportOpen(false)
      setMenuOpen(false)
    } catch {
      toast.error('Could not send the report')
    }
  }

  async function deleteCurrentGlimpse() {
    if (!glimpse || glimpse.user_id !== user?.id || deleting) return
    const glimpseId = glimpse.id
    setDeleting(true)
    try {
      await glimpsesApi.delete(glimpseId)
      setAllGlimpses(current => current.filter(item => item.id !== glimpseId))
      removeCachedGlimpse(userId, glimpseId)
      setDeleteOpen(false)
      setMenuOpen(false)
      toast.success('Glimpse deleted')
      closeStory()
    } catch {
      toast.error('Could not delete this Glimpse')
    } finally {
      setDeleting(false)
    }
  }

  const renderHeader = () => (
    <header style={header}>
      <div style={headerRow}>
        <div>
          <h1 style={headerTitle}>Glimpses</h1>
          <p style={headerSubtitle}>Tap a moment to watch</p>
        </div>
        <div style={headerActions}>
          <button onClick={openGlimpseCamera} style={topCreateButton}><Sparkles size={15} /> Create</button>
          <button aria-label={searchOpen ? 'Close Glimpse search' : 'Search Glimpses'} onClick={toggleSearch} style={backIconButton}><Search size={18} /></button>
        </div>
      </div>
    </header>
  )

  if (loading) return <div style={page}>{renderHeader()}<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 22px' }}><GlimpseGridSkeleton count={4} /></div></div>
  if (error) return <div style={page}>{renderHeader()}<LightCentered><p style={{ color: 'var(--color-text-secondary)', marginBottom: 16, textAlign: 'center' }}>{error}</p><button onClick={() => void load()} style={lightPrimaryButton}>Try again</button></LightCentered></div>

  if (glimpse) {
    return (
      <div style={page}>
        <GlimpseStory
          glimpse={glimpse}
          position={activeStoryIndex + 1}
            total={viewerItems.length}
          onClose={closeStory}
            onPrevious={() => move(-1)}
            onNext={() => move(1)}
          onProfile={() => navigate(`/app/profile/${glimpse.username}`)}
          onLike={() => void toggleLike()}
          onComment={() => setCommentOpen(true)}
          onShare={() => { void glimpsesApi.share(glimpse.id).catch(() => {}); setShareOpen(true) }}
          onSave={() => void toggleSave()}
          onMenu={() => setMenuOpen(open => !open)}
          onInsights={glimpse.user_id === user?.id ? () => void openInsights() : undefined}
          liked={Boolean(glimpse.is_liked)}
          saved={Boolean(glimpse.is_saved)}
        />

        {menuOpen && (
          <div style={menu}>
            <button onClick={() => navigate(`/app/profile/${glimpse.username}`)} style={menuItem}><UserRound size={16} /> Open profile</button>
            <button onClick={() => { setShareOpen(true); setMenuOpen(false) }} style={menuItem}><Share2 size={16} /> Share Glimpse</button>
            {glimpse.user_id === user?.id ? (
              <button onClick={() => { setDeleteOpen(true); setMenuOpen(false) }} style={{ ...menuItem, color: '#ff9b9b' }}><Trash2 size={16} /> Delete Glimpse</button>
            ) : (
              <button onClick={() => { setReportOpen(true); setMenuOpen(false) }} style={{ ...menuItem, color: '#ff9fb8' }}>Report Glimpse</button>
            )}
          </div>
        )}

        {shareOpen && <ShareSheet url={`${window.location.origin}/app/glimpse/${glimpse.id}`} title={glimpse.content || 'A Glimpse from campus'} postMeta={{ postId: glimpse.id, thumbnail: glimpse.cover_url || glimpse.media[0], thumbnailType: glimpse.cover_url ? 'image' : (Boolean(glimpse.duration) || /\.(mp4|mov|webm|m4v)(?:\?|$)/i.test(glimpse.media[0] || '') ? 'video' : 'image'), authorName: glimpse.full_name, authorAvatar: glimpse.avatar_url || undefined, caption: glimpse.content }} onClose={() => setShareOpen(false)} />}
        {insightsOpen && <GlimpseActivitySheet insights={insights} loading={insightsLoading} onClose={() => setInsightsOpen(false)} />}
        {commentOpen && <CommentSheet postId={glimpse.id} commentsCount={glimpse.comments_count} onClose={() => setCommentOpen(false)} onCommentAdded={() => patchCurrent({ comments_count: glimpse.comments_count + 1 })} />}
        <PromptDialog open={reportOpen} title="Report Glimpse" message="Tell us what’s wrong with this campus moment. Our team will review the caption and media." placeholder="Share any details that will help our safety team." submitLabel="Submit report" onCancel={() => setReportOpen(false)} onSubmit={(reason) => report(reason)} />
        <ConfirmDialog
          open={deleteOpen}
          title="Delete Glimpse?"
          message="This Glimpse will be removed from your profile and campus stories."
          confirmLabel="Delete"
          cancelLabel="Keep it"
          destructive
          busy={deleting}
          onCancel={() => { if (!deleting) setDeleteOpen(false) }}
          onConfirm={() => void deleteCurrentGlimpse()}
        />
      </div>
    )
  }

  return (
    <div style={page}>
      <input ref={glimpseCaptureRef} type="file" accept="image/*,video/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={receiveGlimpseCapture} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      {renderHeader()}

      {searchOpen && (
        <form onSubmit={(event) => { event.preventDefault(); void load(query) }} style={lightSearchBar}>
          <button type="submit" aria-label="Search Glimpses" style={searchSubmitButton}><Search size={16} color="var(--color-text-muted)" /></button>
          <input autoFocus autoComplete="off" spellCheck={false} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by username…" aria-label="Search Glimpse by username" style={glimpseSearchInput} />
          {query && <button type="button" aria-label="Clear Glimpse search" onClick={() => { setQuery(''); void load('') }} style={lightClearButton}><X size={15} /></button>}
        </form>
      )}

      {groups.length === 0 ? (
        <div style={emptyCard}>
          <EmptyGlimpseIllustration />
          <h3 style={emptyTitle}>{query ? 'No matching Glimpses' : 'No glimpses yet'}</h3>
          <p style={emptySubtitle}>{query ? 'Try another username.' : <>Be the first to share a moment<br />from your campus.</>}</p>
          {!query && <button onClick={openGlimpseCamera} style={lightPrimaryButton}><Sparkles size={16} /> Create a Glimpse</button>}
        </div>
      ) : (
        <>
          <section style={storyFeed} aria-labelledby="active-stories-title">
            <div style={storyFeedHeader}>
              <div>
                <h2 id="active-stories-title" style={storyFeedTitle}>Campus stories</h2>
                <p style={storyFeedSubtitle}>{groups.length} {groups.length === 1 ? 'profile' : 'profiles'} · {storyItems.length} active {storyItems.length === 1 ? 'moment' : 'moments'}</p>
              </div>
              <button type="button" onClick={() => openStory(storyItems[0].id)} style={watchAllButton}>
                <Play size={14} fill="currentColor" /> Watch all
              </button>
            </div>
            <div style={storyGrid}>
              {groups.map(group => {
                const item = group.items[0]
                return (
                <GlimpsePreviewCard
                  key={group.user_id}
                  glimpse={item}
                  viewed={viewedIds.has(item.id)}
                  onOpen={() => openStory(item.id, group.user_id)}
                />
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function GlimpseActivitySheet({ insights, loading, onClose }: { insights: GlimpseInsights | null; loading: boolean; onClose: () => void }) {
  const viewers = insights?.viewers || []
  const likes = insights?.likes || []
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Glimpse activity" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,.62)', backdropFilter: 'blur(7px)' }}>
      <section onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxHeight: 'min(74dvh, 620px)', overflowY: 'auto', boxSizing: 'border-box', padding: '10px 20px max(26px, calc(18px + var(--sab)))', borderRadius: '24px 24px 0 0', background: 'var(--color-surface)', color: 'var(--color-text-primary)', boxShadow: '0 -14px 40px rgba(0,0,0,.35)', animation: 'glimpseActivitySheetUp 260ms cubic-bezier(0.34,1.2,0.64,1)' }}>
        <div style={{ width: 42, height: 4, margin: '0 auto 18px', borderRadius: 4, background: 'var(--color-border-strong)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div><h2 style={{ margin: 0, fontSize: 18 }}>Glimpse activity</h2><p style={{ margin: '3px 0 0', color: 'var(--color-text-muted)', fontSize: 12 }}>Only you can see this</p></div>
          <button onClick={onClose} style={activityDoneButton}>Done</button>
        </div>
        {loading ? (
          <p style={{ padding: '24px 0', margin: 0, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>Loading activity…</p>
        ) : (
          <div style={{ display: 'grid', gap: 22 }}>
            <ActivityList title={`Viewers (${viewers.length})`} empty="No viewers yet" users={viewers} />
            <ActivityList title={`Likes (${likes.length})`} empty="No likes yet" users={likes} />
          </div>
        )}
      </section>
    </div>,
    document.body,
  )
}

function ActivityList({ title, empty, users }: { title: string; empty: string; users: GlimpseInsights['viewers'] }) {
  return (
    <section>
      <h3 style={{ margin: '0 0 9px', fontSize: 13, fontWeight: 850 }}>{title}</h3>
      {users.length === 0 ? <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 13 }}>{empty}</p> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {users.map((person) => (
            <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar src={person.avatar_url} name={person.full_name} size={38} />
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5 }}>{person.full_name}</strong>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>@{person.username}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ReportSheet({ onClose, onSelect }: { onClose: () => void; onSelect: (reason: string) => void }) {
  const reasons = [['spam', 'Spam'], ['harassment', 'Harassment'], ['nudity', 'Nudity / sexual content'], ['violence', 'Violence'], ['hate', 'Hate or bullying'], ['other', 'Other']]
  return <div style={sheetBackdrop} onClick={onClose}><div style={sheet} onClick={event => event.stopPropagation()}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><strong>Report Glimpse</strong><button onClick={onClose} style={iconButton}><X size={16} /></button></div><p style={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>What’s wrong with this campus moment?</p><div style={reasonGrid}>{reasons.map(([value, label]) => <button key={value} onClick={() => onSelect(value)} style={reasonButton}>{label}</button>)}</div></div></div>
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>{children}</div>
}

function LightCentered({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, color: 'var(--color-text-primary)' }}>{children}</div>
}

function EmptyGlimpseIllustration() {
  return (
    <div style={illustrationWrap}>
      <div style={illustrationGlow} />
      <span style={{ ...sparkle, top: 6, left: 10, fontSize: 13 }}>✦</span>
      <span style={{ ...sparkle, top: 46, right: 4, fontSize: 10 }}>✦</span>
      <span style={{ ...sparkle, bottom: 10, left: 30, fontSize: 9 }}>✦</span>
      <div style={illustrationCard}>
        <ImageIcon size={40} strokeWidth={1.6} color="var(--color-text-muted)" />
      </div>
    </div>
  )
}

const page = { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' as const, background: 'var(--color-bg)', color: 'var(--color-text-primary)', overflow: 'hidden' }
const activityDoneButton = { border: 0, borderRadius: 999, padding: '8px 12px', background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }
const header = { display: 'flex', flexDirection: 'column' as const, gap: 10, padding: '14px 20px 4px', flexShrink: 0 }
const headerRow = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }
const headerActions = { display: 'flex', alignItems: 'center', gap: 8 }
const topCreateButton = { minHeight: 38, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 14px', border: 0, borderRadius: 999, background: 'var(--color-lime)', color: 'var(--color-on-lime)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 800, cursor: 'pointer', boxShadow: 'var(--shadow-btn)' }
const headerTitle = { margin: 0, fontFamily: 'var(--font-display)', fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--color-text-primary)' }
const headerSubtitle = { margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }
const backIconButton = { width: 38, height: 38, flexShrink: 0, display: 'grid', placeItems: 'center', border: '1px solid var(--color-border)', borderRadius: '50%', background: 'var(--color-surface)', color: 'var(--color-text-primary)', boxShadow: '0 3px 12px rgba(0,0,0,.06)', cursor: 'pointer' }
const iconButton = { width: 36, height: 36, display: 'grid', placeItems: 'center', border: '1px solid rgba(255,255,255,.13)', borderRadius: 12, background: 'rgba(255,255,255,.07)', color: '#fff', cursor: 'pointer' }
const lightSearchBar: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, margin: '4px 20px 8px', padding: '0 12px', minHeight: 42, boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 14, background: 'var(--color-surface)' }
const searchSubmitButton: React.CSSProperties = { display: 'grid', placeItems: 'center', flexShrink: 0, padding: 0, border: 0, outline: 'none', background: 'transparent', cursor: 'pointer' }
const glimpseSearchInput: React.CSSProperties = { flex: 1, minWidth: 0, height: 40, padding: 0, border: 0, outline: 'none', boxShadow: 'none', background: 'transparent', color: 'var(--color-text-primary)', fontFamily: 'var(--font-body)', fontSize: 14 }
const lightClearButton: React.CSSProperties = { border: 0, outline: 'none', background: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 4 }
const searchBar = { display: 'flex', alignItems: 'center', gap: 8, margin: '0 14px 8px', padding: '0 11px', minHeight: 40, border: '1px solid rgba(255,255,255,.13)', borderRadius: 13, background: 'rgba(255,255,255,.07)' }
const clearButton = { border: 0, background: 'none', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }
const lightTabs = { display: 'flex', gap: 6, margin: '8px 20px 14px', padding: 5, borderRadius: 999, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }
const lightTab = (active: boolean) => ({ flex: 1, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 999, border: 0, background: active ? '#141416' : 'transparent', color: active ? '#fff' : 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: 700, fontSize: 13.5, fontFamily: 'var(--font-display)', transition: 'background 180ms ease, color 180ms ease' })
const emptyCard = { flex: 1, minHeight: 0, margin: '0 20px 18px', padding: '48px 24px', borderRadius: 26, background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, overflowY: 'auto' as const }
const emptyTitle = { margin: '22px 0 0', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)' }
const emptySubtitle = { margin: '8px 0 22px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-text-secondary)' }
const lightPrimaryButton = { display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 46, padding: '0 22px', border: 0, borderRadius: 999, background: '#141416', color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-display)', cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,.14)' }
const illustrationWrap = { position: 'relative' as const, width: 176, height: 150, display: 'grid', placeItems: 'center' }
const illustrationGlow = { position: 'absolute' as const, inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, rgba(17,17,20,.06), transparent 70%)' }
const illustrationCard = { position: 'relative' as const, width: 92, height: 92, borderRadius: 22, background: 'linear-gradient(155deg, #ffffff, #eeeef0)', border: '1px solid var(--color-border)', boxShadow: '0 18px 34px rgba(20,20,24,.10), inset 0 1px 0 rgba(255,255,255,.8)', display: 'grid', placeItems: 'center', transform: 'rotate(-4deg)' }
const sparkle = { position: 'absolute' as const, color: 'var(--color-text-muted)', opacity: .55 }
const tab = (active: boolean) => ({ flex: 1, minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: active ? '1px solid rgba(187,255,0,.42)' : '1px solid rgba(255,255,255,.11)', borderRadius: 12, background: active ? 'rgba(187,255,0,.14)' : 'rgba(255,255,255,.04)', color: active ? '#e5ff9a' : 'rgba(255,255,255,.58)', cursor: 'pointer', fontWeight: 800, fontSize: 12 })
const count = { opacity: .6, fontSize: 10 }
const menu = { position: 'absolute' as const, zIndex: 20, top: 56, right: 14, width: 190, padding: 7, border: '1px solid rgba(255,255,255,.14)', borderRadius: 15, background: 'rgba(27,18,39,.96)', boxShadow: '0 12px 40px rgba(0,0,0,.45)' }
const menuItem = { width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '11px 9px', border: 0, background: 'none', color: '#fff', cursor: 'pointer', textAlign: 'left' as const, fontSize: 12, fontWeight: 700 }
const sheetBackdrop = { position: 'fixed' as const, inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,.7)' }
const sheet = { width: '100%', maxWidth: 430, margin: '0 auto', padding: '18px 16px calc(18px + env(safe-area-inset-bottom, 0px))', borderRadius: '24px 24px 0 0', background: '#191225', color: '#fff' }
const reasonGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }
const reasonButton = { minHeight: 42, border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, background: 'rgba(255,255,255,.05)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700 }
const primaryButton = { minHeight: 42, padding: '0 18px', border: 0, borderRadius: 99, background: 'var(--color-lime)', color: '#101507', fontWeight: 900, cursor: 'pointer' }
const storyFeed: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 22px', WebkitOverflowScrolling: 'touch' }
const storyFeedHeader: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }
const storyFeedTitle: React.CSSProperties = { margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 850, letterSpacing: '-.02em', color: 'var(--color-text-primary)' }
const storyFeedSubtitle: React.CSSProperties = { margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: 12.5 }
const watchAllButton: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, minHeight: 36, padding: '0 13px', border: 0, borderRadius: 999, background: '#141416', color: '#fff', fontFamily: 'var(--font-display)', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', boxShadow: '0 5px 14px rgba(0,0,0,.16)' }
const storyGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, paddingBottom: 4 }