import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send, Eye, ChevronUp, Volume2, VolumeX, MoreHorizontal, Pencil, Trash2, Share2 } from 'lucide-react'
import { ShareSheet } from '../../components/feed/ShareSheet'
import { Avatar } from '../../components/shared/Avatar'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../../components/shared/AuthenticatedVideo'
import { TimeAgo } from '../../components/shared/TimeAgo'
import { storiesApi } from '../../api/stories'
import { StoryGroup } from '../../stores/storiesStore'
import { useAuthStore } from '../../stores/authStore'
import { useStoriesStore } from '../../stores/storiesStore'
import { mediaUrl as resolveMediaUrl } from '../../utils/mediaUrl'
import toast from 'react-hot-toast'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

interface StoriesViewerProps {
  groups: StoryGroup[]
  initialGroupIndex: number
  onClose: () => void
}

const STORY_DURATION = 5000  // ms per story

export function StoriesViewer({ groups, initialGroupIndex, onClose }: StoriesViewerProps) {
  const { user: me } = useAuthStore()

  const [groupIdx,   setGroupIdx]   = useState(initialGroupIndex)
  const [storyIdx,   setStoryIdx]   = useState(0)
  const [progress,   setProgress]   = useState(0)      // 0–100
  const [paused,     setPaused]     = useState(false)
  const [replyText,  setReplyText]  = useState('')
  const [replySent,  setReplySent]  = useState(false)
  const [muted,      setMuted]      = useState(false)
  const [closing,    setClosing]    = useState(false)

  // Swipe-down to dismiss
  const [translateY, setTranslateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  // Viewer list (for own stories)
  const [showViewers,   setShowViewers]   = useState(false)
  const [viewers,       setViewers]       = useState<any[]>([])
  const [viewersLoading, setViewersLoading] = useState(false)

  // Edit / delete own story
  const [showStoryMenu,   setShowStoryMenu]   = useState(false)
  const [showEditCaption, setShowEditCaption] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editCaption, setEditCaption] = useState('')
  const [actionSaving, setActionSaving] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [liveViews, setLiveViews] = useState<number | undefined>(undefined)

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const progStartRef  = useRef(0)
  const holdTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isHolding     = useRef(false)
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const replyInputRef = useRef<HTMLInputElement>(null)
  const videoRef      = useRef<HTMLVideoElement>(null)

  const group = groups[groupIdx]
  const story = group?.stories[storyIdx]
  const isOwnStory = story?.user_id === me?.id || group?.user_id === me?.id

  useBackDismiss(true, handleClose, 100)
  useBackDismiss(showViewers, () => { setShowViewers(false); setPaused(false) }, 200)
  useBackDismiss(showStoryMenu, () => { setShowStoryMenu(false); setPaused(false) }, 200)
  useBackDismiss(showEditCaption, () => { setShowEditCaption(false); setPaused(false) }, 300)
  useBackDismiss(showDeleteConfirm, () => { setShowDeleteConfirm(false); setPaused(false) }, 300)

  /* ── Progress timer ── */
  const goNext = useCallback(() => {
    const g = groups[groupIdx]
    if (storyIdx < (g?.stories?.length ?? 1) - 1) {
      setStoryIdx(i => i + 1)
      setProgress(0)
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(i => i + 1)
      setStoryIdx(0)
      setProgress(0)
    } else {
      handleClose()
    }
  }, [groupIdx, storyIdx, groups])

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx(i => i - 1)
      setProgress(0)
    } else if (groupIdx > 0) {
      setGroupIdx(i => i - 1)
      setStoryIdx(0)
      setProgress(0)
    }
  }, [groupIdx, storyIdx])

  useEffect(() => {
    // Reset state when story changes
    setProgress(0)
    setReplySent(false)
    setLiveViews(story?.views_count)
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [groupIdx, storyIdx])

  useEffect(() => {
    if (paused || showViewers) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    const isVideoStory = story?.type === 'video'
    if (isVideoStory && videoRef.current) {
      // For videos, rely on video timeupdate
      const vid = videoRef.current
      const onTimeUpdate = () => {
        const pct = (vid.currentTime / (vid.duration || STORY_DURATION / 1000)) * 100
        setProgress(Math.min(pct, 99.9))
        if (pct >= 99) goNext()
      }
      vid.addEventListener('timeupdate', onTimeUpdate)
      return () => vid.removeEventListener('timeupdate', onTimeUpdate)
    }

    // Image timer
    progStartRef.current = Date.now() - (progress / 100) * STORY_DURATION
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - progStartRef.current
      const pct = Math.min((elapsed / STORY_DURATION) * 100, 100)
      setProgress(pct)
      if (pct >= 100) {
        if (timerRef.current) clearInterval(timerRef.current)
        goNext()
      }
    }, 50)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [story, paused, showViewers, goNext])

  /* ── Mark as viewed ── */
  const { markViewed } = useStoriesStore()
  useEffect(() => {
    if (!story?.id) return
    storiesApi.viewStory(story.id)
      .then((res) => {
        const viewsCount = res.data?.data?.views_count
        setLiveViews(viewsCount)
        markViewed(groupIdx, story.id, viewsCount)
      })
      .catch(() => markViewed(groupIdx, story.id))
  }, [story?.id, groupIdx])

  /* ── Viewer list ── */
  async function loadViewers() {
    if (!story?.id) return
    setViewersLoading(true)
    try {
      const res = await storiesApi.getViewers(story.id)
      setViewers(res.data.data || [])
    } catch {}
    finally { setViewersLoading(false) }
  }

  function toggleViewers() {
    if (!showViewers) loadViewers()
    setShowViewers(v => !v)
    setPaused(p => !p)
  }

  /* ── Close ── */
  function handleClose() {
    setClosing(true)
    setTimeout(onClose, 220)
  }

  /* ── Reply ── */
  async function sendReply() {
    if (!replyText.trim() || !story) return
    try {
      await storiesApi.replyStory(story.id, replyText.trim())
      setReplyText('')
      setReplySent(true)
      replyInputRef.current?.blur()
      setPaused(false)
      setTimeout(() => setReplySent(false), 2500)
      toast.success('Reply sent!')
    } catch {
      toast.error('Could not send reply')
    }
  }

  /* ── Pointer / Touch handling ──────────────────────
     Hold > 200ms → pause
     Quick tap left 33% → prev
     Quick tap right 67% → next
     Drag down > 80px → dismiss
  ── */
  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('.story-ui')) return
    touchStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
    isHolding.current = false
    holdTimer.current = setTimeout(() => {
      isHolding.current = true
      setPaused(true)
    }, 180)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!touchStartRef.current) return
    const dy = e.clientY - touchStartRef.current.y
    const dx = Math.abs(e.clientX - touchStartRef.current.x)
    if (dy > 10 && dy > dx) {
      // Dragging down
      if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
      setIsDragging(true)
      setTranslateY(Math.max(0, dy))
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
    if (!touchStartRef.current) return

    const dx   = e.clientX - touchStartRef.current.x
    const dy   = e.clientY - touchStartRef.current.y
    const dt   = Date.now() - touchStartRef.current.t
    touchStartRef.current = null

    // If was dragging down
    if (isDragging) {
      setIsDragging(false)
      if (translateY > 90) {
        handleClose()
      } else {
        setTranslateY(0)
        setPaused(false)
      }
      return
    }

    // Was a hold — just resume
    if (isHolding.current) {
      isHolding.current = false
      setPaused(false)
      return
    }

    // Quick tap — navigate
    if (dt < 300 && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      const w = (e.currentTarget as HTMLElement).clientWidth
      if (e.clientX < w * 0.33) {
        goPrev()
      } else {
        goNext()
      }
    }
  }

  if (!group || !story) return null

  const mediaUrl = resolveMediaUrl(story.media_url)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: '#000',
        transform: `translateY(${translateY}px)`,
        transition: isDragging ? 'none' : closing ? 'transform 220ms ease, opacity 220ms ease' : 'transform 200ms ease',
        opacity: closing ? 0 : Math.max(0, 1 - translateY / 300),
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* ─── Phone-sized viewer frame ─── */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: 430, height: '100%', margin: '0 auto',
        overflow: 'hidden', background: '#000',
        boxShadow: '0 0 0 1px rgba(255,255,255,.08), 0 0 80px rgba(24,24,27,.18)',
      }}>
      {/* ─── Media ─── */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {story.type === 'video' ? (
          <AuthenticatedVideo
            ref={videoRef}
            src={mediaUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            autoPlay
            playsInline
            muted={muted}
            loop={false}
          />
        ) : (
          <AuthenticatedImage
            src={mediaUrl}
            alt="story"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            draggable={false}
          />
        )}
        {/* Gradient vignettes */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.50) 0%, transparent 22%, transparent 65%, rgba(0,0,0,0.72) 100%)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* ─── Segmented progress bars ─── */}
      <div
        className="story-ui"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '10px 10px 0',
          paddingTop: 'calc(10px + env(safe-area-inset-top))',
          display: 'flex', gap: '3px',
          zIndex: 10,
        }}
      >
        {group.stories.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1, height: '2.5px', borderRadius: '9999px',
              background: 'rgba(255,255,255,0.35)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                background: '#fff',
                borderRadius: '9999px',
                width: i < storyIdx ? '100%'
                     : i === storyIdx ? `${progress}%`
                     : '0%',
                transition: i === storyIdx ? 'none' : undefined,
              }}
            />
          </div>
        ))}
      </div>

      {/* ─── Header ─── */}
      <div
        className="story-ui"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '28px 14px 0',
          paddingTop: 'calc(28px + env(safe-area-inset-top))',
          display: 'flex', alignItems: 'center', gap: '10px',
          zIndex: 10,
        }}
      >
        <Avatar src={group.avatar_url} name={group.full_name} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {group.full_name}
            </span>
            <TimeAgo date={story.created_at} style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', flexShrink: 0 }} />
          </div>
        </div>
        {/* Mute (for video) */}
        {story.type === 'video' && (
          <button
            className="story-ui"
            onClick={e => { e.stopPropagation(); setMuted(m => !m) }}
            style={headerBtnStyle}
          >
            {muted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
          </button>
        )}
        {/* ⋯ for own story */}
        {isOwnStory && (
          <button
            className="story-ui"
            onClick={e => { e.stopPropagation(); setPaused(true); setShowStoryMenu(true) }}
            style={headerBtnStyle}
          >
            <MoreHorizontal size={20} color="#fff" />
          </button>
        )}
        {/* Share */}
        <button
          className="story-ui"
          onClick={e => { e.stopPropagation(); setPaused(true); setShowShare(true) }}
          style={headerBtnStyle}
        >
          <Share2 size={18} color="#fff" />
        </button>
        {/* Close */}
        <button
          className="story-ui"
          onClick={e => { e.stopPropagation(); handleClose() }}
          style={headerBtnStyle}
        >
          <X size={20} color="#fff" />
        </button>
      </div>

      {/* ─── Caption ─── */}
      {story.caption && (
        <div style={{
          position: 'absolute', bottom: '100px', left: 0, right: 0,
          padding: '0 20px',
          zIndex: 5, pointerEvents: 'none',
        }}>
          <p style={{
            margin: 0, fontSize: '15px', color: '#fff', fontFamily: 'var(--font-body)',
            lineHeight: 1.5, textShadow: '0 1px 8px rgba(0,0,0,0.8)',
            textAlign: 'center',
          }}>
            {story.caption}
          </p>
        </div>
      )}

      {/* ─── Bottom: viewer count (own story) + reply input ─── */}
      <div
        className="story-ui"
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '12px 14px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          zIndex: 10,
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}
      >
        {/* Viewer count row — only for own story */}
        {isOwnStory && (
          <button
            className="story-ui"
            onClick={e => { e.stopPropagation(); toggleViewers() }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 0', alignSelf: 'flex-start',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Eye size={16} color="rgba(255,255,255,0.75)" />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-body)' }}>
              {liveViews || 0} {liveViews === 1 ? 'viewer' : 'viewers'}
            </span>
            <ChevronUp size={14} color="rgba(255,255,255,0.6)" style={{ transform: showViewers ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
          </button>
        )}

        {/* Reply input row */}
        {!isOwnStory && (
          <div
            className="story-ui"
            style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
          >
            <input
              ref={replyInputRef}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onFocus={e => { e.stopPropagation(); setPaused(true) }}
              onBlur={() => setPaused(false)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Enter') sendReply() }}
              placeholder={replySent ? '✓ Reply sent!' : `Reply to ${group.full_name.split(' ')[0]}…`}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.14)',
                border: '1px solid rgba(255,255,255,0.28)',
                borderRadius: '9999px', padding: '11px 18px',
                color: '#fff', fontSize: '14px',
                fontFamily: 'var(--font-body)', outline: 'none',
                backdropFilter: 'blur(10px)',
                caretColor: 'var(--color-lime)',
              }}
            />
            {replyText.trim() && (
              <button
                onClick={e => { e.stopPropagation(); sendReply() }}
                style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #18181B, #C44DCC)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Send size={16} color="#fff" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Viewer list slide-up panel ─── */}
      {showViewers && (
        <div
          className="story-ui"
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(13,11,18,0.96)',
            borderRadius: '20px 20px 0 0',
            zIndex: 40,
            maxHeight: '55vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.10)',
            animation: 'slideUp 250ms cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <style>{`
            @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          `}</style>
          {/* Handle */}
          <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 36, height: 4, borderRadius: '9999px', background: 'rgba(255,255,255,0.2)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={16} color="var(--color-lime)" />
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)' }}>
                  Viewers ({viewers.length})
                </span>
              </div>
              <button
                onClick={toggleViewers}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 24px' }}>
            {viewersLoading ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.4)', fontSize: '14px', fontFamily: 'var(--font-body)' }}>
                Loading…
              </div>
            ) : viewers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <Eye size={32} color="rgba(255,255,255,0.15)" style={{ marginBottom: '10px' }} />
                <p style={{ margin: 0, fontSize: '14px', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}>
                  No viewers yet
                </p>
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-body)' }}>
                  Share your story to get views
                </p>
              </div>
            ) : (
              viewers.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <Avatar src={v.avatar_url} name={v.full_name} size={40} />
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-display)' }}>
                      {v.full_name}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}>
                      @{v.username?.toLowerCase()}
                    </p>
                  </div>
                  <TimeAgo date={v.viewed_at} style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }} />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── Own story: ⋯ menu ─── */}
      {showStoryMenu && (
        <div className="story-ui" onClick={e => e.stopPropagation()} style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => { setShowStoryMenu(false); setPaused(false) }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(13,11,22,0.97)', borderRadius: '20px 20px 0 0',
            border: '1px solid rgba(255,255,255,0.10)',
            paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
            animation: 'slideUp 220ms cubic-bezier(0.34,1.2,0.64,1)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: '9999px', background: 'rgba(255,255,255,0.2)' }} />
            </div>
            <button onClick={() => { setShowStoryMenu(false); setEditCaption(story?.caption || ''); setShowEditCaption(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 20px', color: 'rgba(255,255,255,0.85)', fontSize: '15px', fontWeight: 500, textAlign: 'left' }}>
              <Pencil size={18} style={{ opacity: 0.7 }} /> Edit caption
            </button>
            <button onClick={() => { setShowStoryMenu(false); setShowDeleteConfirm(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 20px', color: '#EF4444', fontSize: '15px', fontWeight: 500, textAlign: 'left' }}>
              <Trash2 size={18} style={{ opacity: 0.7 }} /> Delete story
            </button>
          </div>
        </div>
      )}
      </div>

      {/* ─── Edit caption sheet ─── */}
      {showEditCaption && (
        <div className="story-ui" onClick={e => e.stopPropagation()} style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={() => { setShowEditCaption(false); setPaused(false) }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(13,11,22,0.98)', borderRadius: '20px 20px 0 0',
            border: '1px solid rgba(255,255,255,0.10)',
            padding: '16px 16px calc(28px + env(safe-area-inset-bottom))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#fff' }}>Edit caption</h3>
              <button onClick={() => { setShowEditCaption(false); setPaused(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex' }}><X size={20} /></button>
            </div>
            <textarea
              value={editCaption}
              onChange={e => setEditCaption(e.target.value)}
              placeholder="Add a caption…"
              rows={3}
              maxLength={500}
              autoFocus
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px', padding: '12px 14px', color: '#fff', fontSize: '15px', fontFamily: 'var(--font-body)', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: '12px' }}
            />
            <button
              onClick={async () => {
                if (!story) return
                setActionSaving(true)
                try {
                  await storiesApi.updateStory(story.id, editCaption)
                  toast.success('Caption updated')
                  setShowEditCaption(false)
                  setPaused(false)
                } catch { toast.error('Could not update caption') }
                finally { setActionSaving(false) }
              }}
              disabled={actionSaving}
              style={{ width: '100%', padding: '13px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #18181B, #C44DCC)', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', opacity: actionSaving ? 0.7 : 1 }}
            >
              {actionSaving ? 'Saving…' : 'Save caption'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Share sheet ─── */}
      {showShare && (
        <ShareSheet
          url={`${window.location.origin}/app/profile/${group.username}`}
          title={`${group.full_name}'s Story`}
          onClose={() => { setShowShare(false); setPaused(false) }}
        />
      )}

      {/* ─── Delete story confirmation ─── */}
      {showDeleteConfirm && (
        <div className="story-ui" onClick={e => e.stopPropagation()} style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={() => { setShowDeleteConfirm(false); setPaused(false) }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(13,11,22,0.98)', borderRadius: '20px 20px 0 0',
            border: '1px solid rgba(239,68,68,0.25)',
            padding: '20px 16px calc(32px + env(safe-area-inset-bottom))',
            textAlign: 'center',
          }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Trash2 size={22} color="#EF4444" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700, color: '#fff' }}>Delete story?</h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>This can't be undone.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setShowDeleteConfirm(false); setPaused(false) }} style={{ flex: 1, padding: '13px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={async () => {
                  if (!story) return
                  setActionSaving(true)
                  try {
                    await storiesApi.deleteStory(story.id)
                    // Remove from store and close
                    const { removeStory } = useStoriesStore.getState()
                    removeStory?.(story.id)
                    toast.success('Story deleted')
                    handleClose()
                  } catch { toast.error('Could not delete story'); setActionSaving(false) }
                }}
                disabled={actionSaving}
                style={{ flex: 1, padding: '13px', borderRadius: '14px', border: 'none', background: '#DC2626', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', opacity: actionSaving ? 0.7 : 1 }}
              >
                {actionSaving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const headerBtnStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)',
  border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
  WebkitTapHighlightColor: 'transparent',
}
