import { DEMO_MODE } from '../../demo/config'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bookmark, Clapperboard, Heart, LoaderCircle, MessageCircle, MoreHorizontal, Pause, Play, Plus, RotateCcw, Share2, Sparkles, Volume2, VolumeX } from 'lucide-react'
import toast from 'react-hot-toast'
import { clipsApi, type Clip } from '../../api/clips'
import { postsApi } from '../../api/posts'
import { usersApi } from '../../api/users'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../../components/shared/AuthenticatedVideo'
import { Avatar } from '../../components/shared/Avatar'
import { CommentSheet } from '../../components/feed/CommentSheet'
import { ShareSheet } from '../../components/feed/ShareSheet'
import { navigateToAppRoot } from '../../navigation/appSectionNavigation'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { PromptDialog } from '../../components/shared/PromptDialog'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { useAuthStore } from '../../stores/authStore'
import { ClipsLoadingSkeleton } from '../../components/shared/AppSkeletons'
import { clipMountedWindow, useClipPlayback } from '../../hooks/useClipPlayback'
import { useClipPreloadScheduler } from '../../hooks/useClipPreloadScheduler'
import { appendCachedClips, loadCachedClip, loadInitialClips, patchCachedClip, readCachedContent, type ClipFeedCache } from '../../cache/contentCache'

const unique = (items: Clip[]) => [...new Map(items.map(x => [x.id, x])).values()]

export function ClipsScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const profileUsername = searchParams.get('profile')?.trim().toLowerCase() || ''
  const userId = useAuthStore((state) => state.user?.id ?? '')
  const root = useRef<HTMLDivElement>(null)
  const appending = useRef(false)
  const loadGeneration = useRef(0)
  const scrollSettleTimer = useRef<number | null>(null)
  const scrollSettleFrame = useRef(0)
  const activeRef = useRef(0)
  const touchActive = useRef(false)
  const supportsScrollEnd = useRef(false)
  const pendingAlignment = useRef<number | null>(null)

  const [clips, setClips] = useState<Clip[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [more, setMore] = useState(true)
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [globalAudioMuted, setGlobalAudioMuted] = useState(false)
  const [playbackEnabled, setPlaybackEnabled] = useState(() => document.visibilityState !== 'hidden')
  const [autoplayBlockedClip, setAutoplayBlockedClip] = useState<string | null>(null)
  const [playbackFailureClip, setPlaybackFailureClip] = useState<string | null>(null)
  const handleAutoplayBlocked = useCallback((clipId: string) => setAutoplayBlockedClip(clipId), [])
  const handlePlayFailure = useCallback((clipId: string) => setPlaybackFailureClip(clipId), [])
  const handlePlaybackStarted = useCallback((clipId: string) => {
    setAutoplayBlockedClip(current => current === clipId ? null : current)
    setPlaybackFailureClip(current => current === clipId ? null : current)
  }, [])
  const playback = useClipPlayback({
    muted: globalAudioMuted,
    enabled: playbackEnabled,
    onAutoplayBlocked: handleAutoplayBlocked,
    onPlayFailure: handlePlayFailure,
    onPlaybackStarted: handlePlaybackStarted,
  })
  const preloadScheduler = useClipPreloadScheduler(clips, active)

  const commitActive = useCallback((index: number) => {
    activeRef.current = index
    setActive(index)
  }, [])

  const load = useCallback(async () => {
    if (!userId) return
    const generation = ++loadGeneration.current
    appending.current = false
    pendingAlignment.current = null
    commitActive(0)
    setClips([])
    setCursor(null)
    setMore(!profileUsername)
    setLoading(true)
    setError('')

    try {
      if (profileUsername) {
        const profileResponse = await clipsApi.getUserClips(profileUsername)
        if (generation !== loadGeneration.current) return

        const profileClips = unique(profileResponse.data.data || [])
        const selectedIndex = id ? profileClips.findIndex((clip) => clip.id === id) : 0
        if (id && selectedIndex < 0) {
          throw new Error('This Clip is no longer available on this profile.')
        }

        setClips(profileClips)
        setCursor(null)
        setMore(false)
        commitActive(Math.max(0, selectedIndex))
        pendingAlignment.current = Math.max(0, selectedIndex)
        return
      }

      const cached = !id ? readCachedContent<ClipFeedCache>(userId, 'clips:initial')?.value : null
      if (cached) {
        setClips(cached.clips)
        setCursor(cached.nextCursor)
        setMore(cached.hasMore)
        setLoading(false)
      }

      const [selected, feed] = await Promise.all([
        id ? loadCachedClip(userId, id) : Promise.resolve(null),
        loadInitialClips(userId),
      ])
      if (generation !== loadGeneration.current) return
      const all = unique([...(selected ? [selected] : []), ...feed.clips])
      const selectedIndex = Math.max(0, selected ? all.findIndex(x => x.id === id) : 0)
      setClips(all)
      setCursor(feed.nextCursor)
      setMore(feed.hasMore)
      commitActive(selectedIndex)
      pendingAlignment.current = selectedIndex
    } catch (e: any) {
      if (generation !== loadGeneration.current) return
      setError(e?.response?.data?.error || 'Unable to load Clips.')
    } finally {
      if (generation === loadGeneration.current) setLoading(false)
    }
  }, [commitActive, id, profileUsername, userId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const syncVisibility = () => setPlaybackEnabled(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', syncVisibility)
    window.addEventListener('pageshow', syncVisibility)
    window.addEventListener('pagehide', syncVisibility)
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility)
      window.removeEventListener('pageshow', syncVisibility)
      window.removeEventListener('pagehide', syncVisibility)
    }
  }, [])

  useEffect(() => () => {
    if (scrollSettleTimer.current !== null) window.clearTimeout(scrollSettleTimer.current)
    window.cancelAnimationFrame(scrollSettleFrame.current)
  }, [])

  useLayoutEffect(() => {
    const index = pendingAlignment.current
    const el = root.current
    if (index === null || !el || loading || !clips.length) return
    pendingAlignment.current = null
    el.scrollTop = index * el.clientHeight
  }, [clips.length, loading])

  const append = useCallback(async () => {
    if (profileUsername || !userId || appending.current || !more || !cursor) return
    appending.current = true
    try {
      const next = await appendCachedClips(userId)
      setClips(next.clips)
      setCursor(next.nextCursor)
      setMore(next.hasMore)
    } catch {} finally {
      appending.current = false
    }
  }, [cursor, more, profileUsername, userId])

  // Keep enough list metadata ahead for a seamless next-page swipe without
  // preparing a large run of upcoming video media.
  useEffect(() => {
    if (!profileUsername && clips.length - active - 1 < 10) void append()
  }, [active, append, clips.length, profileUsername])

  useEffect(() => {
    playback.activate(clips[active]?.id || null)
  }, [active, clips[active]?.id, playback.activate])

  // Root-tab transitions can preserve this screen in the app shell instead of
  // unmounting it immediately. Explicitly pause all mounted Clips before Home
  // (or any other tab) becomes visible, rather than leaving audio playing.
  useEffect(() => {
    if (!location.pathname.startsWith('/app/clips')) playback.deactivate()
  }, [location.pathname, playback.deactivate])

  const settleScroll = useCallback(() => {
    const el = root.current
    if (!el || !el.clientHeight) return
    const index = Math.max(0, Math.min(clips.length - 1, Math.round(el.scrollTop / el.clientHeight)))
    const exactTop = index * el.clientHeight
    pendingAlignment.current = null

    // Native snap owns the gesture. This is only a post-gesture guard for
    // WebViews that occasionally stop a few pixels between snap points.
    if (Math.abs(el.scrollTop - exactTop) > 1) el.scrollTo({ top: exactTop, behavior: 'auto' })
    if (index !== activeRef.current) commitActive(index)
    if (index >= clips.length - 2) void append()
  }, [append, clips.length, commitActive])

  useEffect(() => {
    const el = root.current
    if (!el) return
    supportsScrollEnd.current = 'onscrollend' in el
    if (!supportsScrollEnd.current) return
    el.addEventListener('scrollend', settleScroll)
    return () => el.removeEventListener('scrollend', settleScroll)
  }, [clips.length, settleScroll])

  useEffect(() => {
    const el = root.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let previousHeight = el.clientHeight
    let frame = 0
    const observer = new ResizeObserver(() => {
      const nextHeight = el.clientHeight
      if (!nextHeight || Math.abs(nextHeight - previousHeight) < 1) return
      previousHeight = nextHeight
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (touchActive.current) {
          pendingAlignment.current = activeRef.current
          return
        }
        el.scrollTop = activeRef.current * el.clientHeight
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [clips.length])

  const scheduleFallbackSettle = useCallback(() => {
    if (supportsScrollEnd.current) return
    if (scrollSettleTimer.current !== null) window.clearTimeout(scrollSettleTimer.current)
    window.cancelAnimationFrame(scrollSettleFrame.current)
    scrollSettleTimer.current = window.setTimeout(() => {
      const el = root.current
      if (!el || touchActive.current) return
      let lastTop = el.scrollTop
      let stationaryFrames = 0
      const confirmStationary = () => {
        const current = root.current
        if (!current || touchActive.current) return
        const nextTop = current.scrollTop
        if (Math.abs(nextTop - lastTop) < 0.5) {
          stationaryFrames += 1
        } else {
          stationaryFrames = 0
          lastTop = nextTop
        }
        if (stationaryFrames >= 8) {
          settleScroll()
          return
        }
        scrollSettleFrame.current = window.requestAnimationFrame(confirmStationary)
      }
      scrollSettleFrame.current = window.requestAnimationFrame(confirmStationary)
    }, 120)
  }, [settleScroll])

  const onScroll = () => {
    const el = root.current
    if (!el || !el.clientHeight) return
    const candidate = Math.max(0, Math.min(clips.length - 1, Math.round(el.scrollTop / el.clientHeight)))
    if (candidate !== activeRef.current) commitActive(candidate)
    scheduleFallbackSettle()
  }

  const handleDeleted = useCallback((deletedId: string) => {
    setClips(current => {
      const activeId = current[activeRef.current]?.id
      const deletedIndex = current.findIndex(clip => clip.id === deletedId)
      const remaining = current.filter(clip => clip.id !== deletedId)
      const nextIndex = activeId && activeId !== deletedId
        ? Math.max(0, remaining.findIndex(clip => clip.id === activeId))
        : Math.max(0, Math.min(deletedIndex, remaining.length - 1))
      commitActive(nextIndex)
      pendingAlignment.current = nextIndex
      return remaining
    })
  }, [commitActive])

  if (loading) return <ClipsLoadingSkeleton />
  if (error) return <State mode="error" text={error} action={load} actionLabel="Try again" showBack={Boolean(id)} />
  if (!clips.length) return <State mode="empty" text="No Clips yet. Be the first to share one." action={() => navigate('/app/clips/create')} actionLabel="Create a Clip" showBack={Boolean(id)} />

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      minHeight: 0,
      background: '#000',
      overflow: 'hidden',
      // The Clips root ends immediately above AppShell's shared BottomNav, so
      // it only needs a small caption-to-nav gap. A direct Clip viewer has no
      // shared nav and keeps its larger immersive safe area.
      ['--clips-bottom-clearance' as string]: id
        ? 'max(clamp(56px, 8dvh, 88px), calc(24px + var(--sab)))'
        : 'max(14px, var(--sab))'
    }}>
      <header style={{
        position: 'absolute',
        top: 'max(12px, var(--sat))',
        left: 12,
        right: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 20,
        pointerEvents: 'none'
      }}>
        {id ? (
          <button aria-label="Back" onClick={requestAppBack} style={{ ...circle, pointerEvents: 'auto' }}>
            <ArrowLeft size={19} />
          </button>
        ) : <span aria-hidden style={{ width: 35, height: 35 }} />}
        <b style={{ fontSize: 16, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>Clips</b>
        <button aria-label="Create Clip" onClick={() => navigate('/app/clips/create')} style={{ ...circle, pointerEvents: 'auto' }}>
          <Plus size={19} />
        </button>
      </header>

      <div
        ref={root}
        onScroll={onScroll}
        onTouchStart={() => {
          touchActive.current = true
          if (scrollSettleTimer.current !== null) window.clearTimeout(scrollSettleTimer.current)
          window.cancelAnimationFrame(scrollSettleFrame.current)
        }}
        onTouchEnd={() => {
          touchActive.current = false
          scheduleFallbackSettle()
        }}
        onTouchCancel={() => {
          touchActive.current = false
          scheduleFallbackSettle()
        }}
        style={{
          height: '100%',
          minHeight: 0,
          width: '100%',
          overflowY: 'scroll',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          scrollSnapType: 'y mandatory',
          scrollSnapStop: 'always',
          overscrollBehaviorY: 'contain',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y'
        }}
      >
        {clips.map((clip, i) => (
          <ClipItem
            key={clip.id}
            clip={clip}
            active={i === active}
            mounted={clipMountedWindow(active, clips.length).includes(i)}
            preloadMode={i === active || i === active + 1 ? 'auto' : 'metadata'}
            globalAudioMuted={globalAudioMuted}
            onAudioMutedChange={setGlobalAudioMuted}
            playback={playback}
            autoplayBlocked={autoplayBlockedClip === clip.id}
            controllerPlayFailed={playbackFailureClip === clip.id}
            prepared={preloadScheduler.prepared.has(clip.id)}
            onPrepared={preloadScheduler.settle}
            onRefresh={async () => {
              const refreshed = await loadCachedClip(userId, clip.id)
              patchCachedClip(userId, clip.id, refreshed)
              setClips(items => items.map(item => item.id === clip.id ? refreshed : item))
            }}
            onDeleted={() => handleDeleted(clip.id)}
          />
        ))}
      </div>
    </div>
  )
}

function State({ mode, text, action, actionLabel, showBack = false }: { mode: 'loading' | 'error' | 'empty'; text: string; action?: () => void; actionLabel?: string; showBack?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const empty = mode === 'empty'
  const title = empty ? 'Your campus, in motion.' : mode === 'error' ? 'Clips are taking a moment.' : 'Loading your Clips'
  const description = empty
    ? text
    : mode === 'error'
      ? 'We couldn’t load the feed right now. Check your connection and try again.'
      : 'Finding the latest moments from your campus.'

  return (
    <main style={{
      height: '100%',
      minHeight: 420,
      position: 'relative',
      overflow: 'hidden',
      background: 'var(--color-bg)',
      backgroundImage: 'var(--gradient-radial-bg), var(--gradient-radial-mid)',
      color: 'var(--color-text-primary)',
      textAlign: 'center',
      padding: 'max(18px, var(--sat)) 18px max(28px, var(--sab))',
      boxSizing: 'border-box'
    }}>
      <div aria-hidden="true" style={{ position: 'absolute', top: '22%', left: '50%', width: 260, height: 260, transform: 'translateX(-50%)', borderRadius: '50%', background: 'var(--color-lime-dim)', filter: 'blur(18px)', pointerEvents: 'none' }} />
      <header style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%', maxWidth: 430, margin: '0 auto', textAlign: 'left' }}>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          {showBack && <button aria-label="Back" onClick={requestAppBack} style={stateBack}><ArrowLeft size={20} /></button>}
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 1.1, letterSpacing: '-.8px' }}>Clips</h1>
            <p style={{ margin: '5px 0 0', color: 'var(--color-text-secondary)', fontSize: 13 }}>Tap a moment to watch</p>
          </div>
        </div>
        <button aria-label="Create Clip" onClick={() => navigate('/app/clips/create')} style={stateCreate}><Plus size={17} /><span>Create</span></button>
      </header>
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 350, margin: 'clamp(72px, 18vh, 150px) auto 0' }}>
        <div style={stateIcon}>
          {mode === 'loading' ? <Sparkles size={34} /> : <Clapperboard size={38} />}
        </div>
        <div style={{ marginTop: 24, color: 'var(--color-text-accent)', fontSize: 11, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase' }}>Campus moments</div>
        <h1 style={{ margin: '10px 0 10px', fontFamily: 'var(--font-display)', fontSize: 'clamp(25px, 7vw, 34px)', lineHeight: 1.12, letterSpacing: '-.8px' }}>{title}</h1>
        <p style={{ margin: '0 auto', maxWidth: 300, color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{description}</p>
        {action && <button onClick={action} style={stateCta}>{actionLabel || 'Continue'}</button>}
        {empty && <button onClick={() => navigateToAppRoot(navigate, location.pathname, '/app/feed')} style={stateSecondary}>Explore Home</button>}
      </section>
    </main>
  )
}

function ClipItem({ clip, active, mounted, preloadMode, globalAudioMuted, onAudioMutedChange, playback, autoplayBlocked, controllerPlayFailed, prepared, onPrepared, onRefresh, onDeleted }: {
  clip: Clip
  active: boolean
  mounted: boolean
  preloadMode: 'auto' | 'metadata'
  globalAudioMuted: boolean
  onAudioMutedChange: (muted: boolean) => void
  playback: ReturnType<typeof useClipPlayback>
  autoplayBlocked: boolean
  controllerPlayFailed: boolean
  prepared: boolean
  onPrepared: (id: string, failed?: boolean) => void
  onRefresh: () => Promise<void>
  onDeleted: () => void
}) {
  const navigate = useNavigate()
  const me = useAuthStore(s => s.user)
  const recoveryTimer = useRef<number | null>(null)
  const recoveryAttempts = useRef(0)
  const signedUrlRefreshAttempted = useRef(false)

  const [liked, setLiked] = useState(!!clip.is_liked)
  const [saved, setSaved] = useState(!!clip.is_saved)
  const [likes, setLikes] = useState(clip.likes_count || 0)
  const [commentCount, setCommentCount] = useState(clip.comments_count || 0)
  const [following, setFollowing] = useState(!!clip.is_following_author)
  const [paused, setPaused] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [playError, setPlayError] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const [comments, setComments] = useState(false)
  const [share, setShare] = useState(false)
  const [menu, setMenu] = useState(false)
  const [remove, setRemove] = useState(false)
  const [report, setReport] = useState(false)
  const [captionSheet, setCaptionSheet] = useState(false)
  const [progress, setProgress] = useState(0)
  const registerVideo = useCallback((node: HTMLVideoElement | null) => playback.register(clip.id, node), [clip.id, playback.register])

  useBackDismiss(menu, () => setMenu(false), 210)
  useBackDismiss(captionSheet, () => setCaptionSheet(false), 320)

  const retryVideo = useCallback(() => {
    if (recoveryTimer.current !== null) window.clearTimeout(recoveryTimer.current)
    setPlayError(false)
    setBuffering(true)
    setPaused(false)
    setRetryToken(value => value + 1)
  }, [])

  const handleMediaFailure = useCallback(() => {
    if (!active || !playback.isActive(clip.id)) {
      onPrepared(clip.id, true)
      return
    }
    if (recoveryAttempts.current < 2) {
      const delay = 700 * (recoveryAttempts.current + 1)
      recoveryAttempts.current += 1
      if (recoveryTimer.current !== null) window.clearTimeout(recoveryTimer.current)
      recoveryTimer.current = window.setTimeout(retryVideo, delay)
      return
    }
    if (!signedUrlRefreshAttempted.current) {
      signedUrlRefreshAttempted.current = true
      recoveryAttempts.current = 0
      void onRefresh().then(() => {
        if (!playback.isActive(clip.id)) return
        retryVideo()
        playback.retry(clip.id)
      }).catch(() => {
        if (playback.isActive(clip.id)) {
          setBuffering(false)
          setPlayError(true)
        }
      })
      return
    }
    setBuffering(false)
    setPlayError(true)
  }, [active, clip.id, onPrepared, onRefresh, playback, retryVideo])

  useEffect(() => {
    if (active) void clipsApi.recordView(clip.id)
  }, [active, clip.id])

  useEffect(() => {
    if (active && controllerPlayFailed) {
      setBuffering(false)
      setPlayError(true)
    }
  }, [active, controllerPlayFailed])

  useEffect(() => {
    if (!active && recoveryTimer.current !== null) {
      window.clearTimeout(recoveryTimer.current)
      recoveryTimer.current = null
    }
    if (!active) {
      setComments(false)
      setShare(false)
      setMenu(false)
      setRemove(false)
      setReport(false)
    }
  }, [active])

  useEffect(() => () => {
    if (recoveryTimer.current !== null) window.clearTimeout(recoveryTimer.current)
  }, [])

  const optimistic = async (kind: 'like' | 'save') => {
    const yes = kind === 'like' ? liked : saved
    const update = kind === 'like' ? (v: boolean) => setLiked(v) : (v: boolean) => setSaved(v)
    update(!yes)
    if (kind === 'like') setLikes(n => Math.max(0, n + (yes ? -1 : 1)))
    try {
      await (kind === 'like' ? (yes ? postsApi.unlikePost(clip.id) : postsApi.likePost(clip.id)) : (yes ? postsApi.unsavePost(clip.id) : postsApi.savePost(clip.id)))
    } catch {
      update(yes)
      if (kind === 'like') setLikes(n => Math.max(0, n + (yes ? 1 : -1)))
      toast.error('Could not update Clip')
    }
  }

  const owner = clip.user_id === me?.id

  return (
    <article style={{ height: '100%', minHeight: '100%', flex: '0 0 100%', position: 'relative', scrollSnapAlign: 'start', scrollSnapStop: 'always', overflow: 'hidden', background: '#000', color: '#fff', contain: 'layout paint size' }}>
      {mounted && clip.cover_url && <AuthenticatedImage src={clip.cover_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px)', opacity: .48, transform: 'scale(1.12)' }} />}

      {mounted ? (
        <AuthenticatedVideo
          ref={registerVideo}
            // Only the active Clip and its prepared immediate successor receive
            // a source. `preload="metadata"` is not a byte-transfer guarantee
            // across browsers, so mounted neighbors deliberately have no src.
            src={active || (preloadMode === 'auto' && prepared) ? clip.media?.[0] : undefined}
          poster={clip.cover_url}
          // Clip APIs return viewer-bound signed media capabilities. Unlike
          // ordinary protected videos, Clips must be given directly to the
          // browser so it can request byte ranges while buffering and seeking.
          streamDirectly
          retryToken={retryToken}
          muted={globalAudioMuted}
          playsInline
          loop
          preload={preloadMode}
          onWaiting={event => { if (playback.isCurrent(clip.id, event.currentTarget)) setBuffering(true) }}
          onLoadedMetadata={() => onPrepared(clip.id)}
          onCanPlay={event => {
            onPrepared(clip.id)
            if (!playback.isCurrent(clip.id, event.currentTarget)) return
            setBuffering(false); setPlayError(false); playback.onCanPlay(clip.id, event.currentTarget)
          }}
          onPlay={event => {
            if (!playback.onPlay(clip.id, event.currentTarget)) return
            setPaused(false)
          }}
          onPause={event => { if (playback.isCurrent(clip.id, event.currentTarget)) setPaused(true) }}
          onPlaying={event => {
            if (!playback.isCurrent(clip.id, event.currentTarget)) return
            playback.onPlaying(clip.id, event.currentTarget)
            recoveryAttempts.current = 0; setBuffering(false); setPlayError(false)
          }}
          onMediaFailure={handleMediaFailure}
          onTimeUpdate={e => { const v = e.currentTarget; setProgress(v.duration ? 100 * v.currentTime / v.duration : 0) }}
          onClick={() => playback.toggle(clip.id)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: active ? 'auto' : 'none' }}
        />
      ) : null}

      {/* Video States Overlay */}
      {buffering && active && !playError && !paused && (
        <div aria-label="Loading video" style={loadingPill}>
          <LoaderCircle className="clip-loading-spinner" size={17} />
          <span>Loading clip</span>
        </div>
      )}
       {active && (paused || autoplayBlocked) && !playError && (
         <button aria-label="Play Clip" onClick={() => playback.toggle(clip.id)} style={playButton}>
          <Play size={29} fill="currentColor" />
        </button>
      )}
       {active && !paused && !buffering && !playError && !autoplayBlocked && (
         <button aria-label="Pause Clip" onClick={() => playback.toggle(clip.id)} style={{ ...audioButton, position: 'absolute', top: 'max(58px, calc(var(--sat) + 46px))', right: 54, zIndex: 12 }}>
           <Pause size={16} fill="currentColor" />
         </button>
       )}
       {active && (
         <button aria-label={globalAudioMuted ? 'Unmute' : 'Mute'} onClick={() => onAudioMutedChange(!globalAudioMuted)} style={{ ...audioButton, position: 'absolute', top: 'max(58px, calc(var(--sat) + 46px))', right: 12, zIndex: 12 }}>
           {globalAudioMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      )}

      {/* Bottom Gradient and Content Safe Zone */}
      {active && <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, transparent 15%, transparent 60%, rgba(0,0,0,0.85) 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '0 12px var(--clips-bottom-clearance) 16px',
        zIndex: 2
      }}>
        {/* Retry Card inside flow so it doesn't overlap text */}
        {active && playError && (
          <div role="alert" style={{ ...retryCard, position: 'relative', bottom: 'auto', left: 'auto', right: 'auto', marginBottom: 20, pointerEvents: 'auto' }}>
            <div style={{ minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 13 }}>Clip paused loading</b>
              <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: 'rgba(255,255,255,.7)' }}>Tap retry to reconnect the video.</span>
            </div>
            <button aria-label="Retry video" onClick={async () => {
              recoveryAttempts.current = 0; signedUrlRefreshAttempted.current = false; setBuffering(true); setPlayError(false)
              try { await onRefresh() } catch {}
              retryVideo()
              playback.retry(clip.id)
            }} style={retryButton}>
              <RotateCcw size={15} /><span>Retry</span>
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, pointerEvents: 'auto' }}>
          {/* Left Column (Creator & Caption) */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <button aria-label={`Open ${clip.username}'s profile`} onClick={() => navigate(`/app/profile/${clip.username}`)} style={{ ...plain, padding: 0, borderRadius: '50%' }}>
                <Avatar src={clip.avatar_url} name={clip.full_name} size={38} />
              </button>
              <button onClick={() => navigate(`/app/profile/${clip.username}`)} style={{ ...plain, fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                @{clip.username}
              </button>
              {!owner && (
                <button onClick={async () => {
                  const was = following; setFollowing(!was)
                  try { await (was ? usersApi.unfollow(clip.user_id) : usersApi.follow(clip.user_id)) }
                  catch { setFollowing(was); toast.error('Could not update follow') }
                }} style={small}>
                  {following ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
            {clip.content && (
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.4, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                  {clip.content}
                </p>
                {isLongCaption(clip.content) && (
                  <button onClick={() => setCaptionSheet(true)} style={{ ...plain, display: 'inline', padding: '4px 0 0', fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,.84)', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
                    … Learn more
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right Column (Actions) */}
          <div style={{ display: 'grid', gap: 'clamp(12px, 2dvh, 18px)', justifyItems: 'center', paddingBottom: 4 }}>
            <Action icon={<Heart fill={liked ? '#ef4444' : 'none'} color={liked ? '#ef4444' : '#fff'} size={28} strokeWidth={2} />} label={likes} onClick={() => void optimistic('like')} />
            <Action icon={<MessageCircle size={28} strokeWidth={2} />} label={commentCount} onClick={() => setComments(true)} />
            <Action icon={<Bookmark fill={saved ? '#fff' : 'none'} size={28} strokeWidth={2} />} onClick={() => void optimistic('save')} />
            <Action icon={<Share2 size={28} strokeWidth={2} />} onClick={() => setShare(true)} />
            <button aria-label="More Clip options" onClick={() => setMenu(true)} style={{ ...plain, padding: 4 }}>
              <MoreHorizontal size={28} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>}

      {active && <div style={{ position: 'absolute', bottom: 0, left: 0, height: 3, width: `${progress}%`, background: 'var(--color-lime)', zIndex: 10, transition: 'width 100ms linear' }} />}

      {/* Sheets & Dialogs */}
      {active && comments && <CommentSheet postId={clip.id} commentsCount={commentCount} onClose={() => setComments(false)} onCommentAdded={() => setCommentCount(count => count + 1)} onCommentDeleted={() => setCommentCount(count => Math.max(0, count - 1))} />}
      {active && share && <ShareSheet onClose={() => setShare(false)} url={`${window.location.origin}/app/clips/${clip.id}`} title="Clip on Campnect" postMeta={{ postId: clip.id, thumbnail: clip.cover_url || undefined, thumbnailType: 'image', authorName: clip.full_name, authorAvatar: clip.avatar_url, caption: clip.content }} />}
      {active && menu && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,.48)', display: 'flex', alignItems: 'end' }} onClick={() => setMenu(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: '#202026', padding: '20px 16px max(20px, calc(16px + var(--sab)))', borderRadius: '20px 20px 0 0' }}>
            {owner ? (
              <button style={menuButton} onClick={() => { setMenu(false); setRemove(true) }}>Delete Clip</button>
            ) : (
              <button style={menuButton} onClick={() => { setMenu(false); setReport(true) }}>Report Clip</button>
            )}
          </div>
        </div>
      )}
      {active && captionSheet && <ClipCaptionSheet caption={clip.content || ''} onClose={() => setCaptionSheet(false)} />}
      {active && <ConfirmDialog open={remove} title="Delete Clip?" message="This cannot be undone." confirmLabel="Delete" cancelLabel="Keep Clip" destructive onCancel={() => setRemove(false)} onConfirm={async () => { try { await clipsApi.delete(clip.id); onDeleted() } catch { toast.error('Could not delete Clip') } }} />}
      {active && <PromptDialog open={report} title="Report Clip" message="Tell us why this Clip should be reviewed." placeholder="Share any details that will help our safety team." defaultValue="harassment" submitLabel="Submit report" onCancel={() => setReport(false)} onSubmit={async (reason, description) => { try { await clipsApi.report(clip.id, reason, description); toast.success(DEMO_MODE ? 'Report saved to local demo intake. No moderation team is contacted.' : 'Report submitted'); setReport(false) } catch { toast.error('Could not submit report') } }} />}
    </article>
  )
}

function isLongCaption(caption: string) {
  return caption.length > 90 || caption.split(/\r?\n/).length > 2
}

function ClipCaptionSheet({ caption, onClose }: { caption: string; onClose: () => void }) {
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Full clip caption" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,.62)', backdropFilter: 'blur(5px)' }}>
      <style>{`
        @keyframes clip-caption-sheet-in {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
      <section onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxHeight: 'min(70dvh, 580px)', overflowY: 'auto', boxSizing: 'border-box', padding: '10px 20px max(28px, calc(20px + var(--sab)))', borderRadius: '24px 24px 0 0', background: '#18171e', color: '#fff', boxShadow: '0 -12px 38px rgba(0,0,0,.3)', animation: 'clip-caption-sheet-in 220ms ease-out' }}>
        <div style={{ width: 42, height: 4, margin: '0 auto 18px', borderRadius: 4, background: 'rgba(255,255,255,.36)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Caption</h2>
          <button onClick={onClose} style={{ ...plain, borderRadius: 999, padding: '7px 11px', background: 'rgba(255,255,255,.1)', fontSize: 13, fontWeight: 800 }}>Done</button>
        </div>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'rgba(255,255,255,.9)', fontSize: 15, lineHeight: 1.55 }}>{caption}</p>
      </section>
    </div>,
    document.body,
  )
}

function Action({ icon, label, onClick }: { icon: ReactNode; label?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...plain, display: 'grid', gap: 3, justifyItems: 'center', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
      {icon}
      {label !== undefined && <small style={{ fontWeight: 700, fontSize: 13 }}>{label}</small>}
    </button>
  )
}

const plain: CSSProperties = { background: 'none', border: 0, color: '#fff', padding: 2, cursor: 'pointer' }
const circle: CSSProperties = { width: 35, height: 35, borderRadius: 18, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(0,0,0,.4)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }
const small: CSSProperties = { border: '1px solid rgba(255,255,255,.5)', borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 800, background: 'rgba(255,255,255,.12)', color: '#fff', whiteSpace: 'nowrap', cursor: 'pointer', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }
const audioButton: CSSProperties = { width: 34, height: 34, borderRadius: 17, border: 0, background: 'rgba(32,32,38,.76)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,.28)', padding: 0 }
const playButton: CSSProperties = { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 66, height: 66, border: 0, borderRadius: 33, background: 'rgba(32,32,38,.74)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 8px 28px rgba(0,0,0,.3)' }
const loadingPill: CSSProperties = { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, background: 'rgba(17,17,20,.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', fontSize: 12, fontWeight: 700, boxShadow: '0 8px 28px rgba(0,0,0,.24)' }
const retryCard: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 11px 11px 14px', border: '1px solid rgba(255,255,255,.16)', borderRadius: 16, background: 'rgba(21,21,25,.86)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 12px 32px rgba(0,0,0,.3)' }
const retryButton: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, border: 0, borderRadius: 999, padding: '9px 12px', background: 'var(--color-lime)', color: 'var(--color-accent-contrast)', fontSize: 12, fontWeight: 850, cursor: 'pointer' }
const stateBack: CSSProperties = { width: 40, height: 40, borderRadius: 20, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', display: 'grid', placeItems: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }
const stateCreate: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 999, padding: '11px 15px', background: 'var(--color-lime)', color: 'var(--color-accent-contrast)', fontSize: 13, fontWeight: 800, boxShadow: 'var(--shadow-btn)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }
const stateIcon: CSSProperties = { width: 84, height: 84, margin: '0 auto', borderRadius: 28, display: 'grid', placeItems: 'center', color: 'var(--color-text-accent)', background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', boxShadow: 'var(--shadow-card)' }
const stateCta: CSSProperties = { display: 'block', width: '100%', marginTop: 28, padding: '14px 20px', border: 0, borderRadius: 14, background: 'var(--color-lime)', color: 'var(--color-accent-contrast)', fontSize: 15, fontWeight: 800, boxShadow: 'var(--shadow-btn)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }
const stateSecondary: CSSProperties = { marginTop: 14, padding: '10px 18px', border: 0, background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }
const menuButton: CSSProperties = { display: 'block', width: '100%', padding: 14, border: 0, borderRadius: 10, background: 'transparent', color: '#fff', textAlign: 'left', fontSize: 16 }
