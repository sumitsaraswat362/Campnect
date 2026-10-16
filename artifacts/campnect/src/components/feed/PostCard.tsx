import { useDemoPost } from '../../demo/useDemoPost'
import React, { useState, useRef, useCallback, useEffect, memo } from 'react'
import { createPortal } from 'react-dom'
import { Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, ChevronLeft, ChevronRight, Pencil, Trash2, Flag, X, ArrowLeft, Volume2, VolumeX, UserRound } from 'lucide-react'
import { ShareSheet } from './ShareSheet'
import { Avatar } from '../shared/Avatar'
import { AuthenticatedImage } from '../shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../shared/AuthenticatedVideo'
import { TemporaryPinchZoom } from '../shared/TemporaryPinchZoom'
import { VerifiedBadge } from '../shared/VerifiedBadge'
import { TimeAgo } from '../shared/TimeAgo'
import { Post } from '../../stores/feedStore'
import { useNavigate } from 'react-router-dom'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useFeedAudioStore } from '../../stores/feedAudioStore'

interface PostCardProps {
  post: Post
  onLike: () => void
  onUnlike: () => void
  onSave: () => void
  onUnsave: () => void
  onCommentPress: () => void
  onReport?: () => void
  onEdit?: (patch: { content: string; visibility: string }) => Promise<void>
  onDelete?: () => Promise<void>
}

export function PostCard({ post: initialPost, onLike, onUnlike, onSave, onUnsave, onCommentPress, onReport, onEdit, onDelete }: PostCardProps) {
  const post = useDemoPost(initialPost)
  const navigate = useNavigate()
  const [heartBurst, setHeartBurst] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showEditSheet, setShowEditSheet] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editContent, setEditContent] = useState(post.content || '')
  const [editVisibility, setEditVisibility] = useState(post.visibility || 'public')
  const [editSaving, setEditSaving] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showTaggedPeople, setShowTaggedPeople] = useState(false)
  const [captionExpanded, setCaptionExpanded] = useState(false)
  const lastTapRef = useRef(0)
  const singleTapTimerRef = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoViewportRef = useRef<HTMLDivElement>(null)
  const fullscreenVideoRef = useRef<HTMLVideoElement>(null)
  const videoVisibleRef = useRef(false)
  const videoMuted = useFeedAudioStore((state) => state.muted)
  const toggleFeedAudio = useFeedAudioStore((state) => state.toggleMuted)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)

  const mediaUrls: string[] = Array.isArray(post.media) ? post.media : []
  const taggedUsers = Array.isArray(post.tagged_users) ? post.tagged_users : []
  const pollOptions: string[] = Array.isArray(post.poll_options) ? post.poll_options : []

  useBackDismiss(showMenu, () => setShowMenu(false), 240)
  useBackDismiss(showEditSheet, () => setShowEditSheet(false), 250)
  useBackDismiss(showDeleteConfirm && !deleteSaving, () => setShowDeleteConfirm(false), 300)
  useBackDismiss(showTaggedPeople, () => setShowTaggedPeople(false), 310)

  const isLong = (post.content?.length || 0) > 90 || (post.content?.split(/\r?\n/).length || 0) > 2

  const handleMediaTap = useCallback(() => {
    const now = Date.now()
    if (now - lastTapRef.current < 350) {
      if (singleTapTimerRef.current !== null) window.clearTimeout(singleTapTimerRef.current)
      lastTapRef.current = 0
      triggerHeart()
      if (!post.is_liked) onLike()
      return
    }
    lastTapRef.current = now
    if (post.type === 'video') {
      singleTapTimerRef.current = window.setTimeout(() => {
        singleTapTimerRef.current = null
        lastTapRef.current = 0
        videoRef.current?.pause()
        setFullscreenOpen(true)
      }, 360)
    }
  }, [post.is_liked, post.type, onLike])

  const handleFullscreenTap = useCallback(() => {
    const now = Date.now()
    if (now - lastTapRef.current < 350) {
      lastTapRef.current = 0
      triggerHeart()
      if (!post.is_liked) onLike()
      return
    }
    lastTapRef.current = now
  }, [post.is_liked, onLike])

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current !== null) window.clearTimeout(singleTapTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!fullscreenOpen) return
    fullscreenVideoRef.current?.play().catch(() => {})
  }, [fullscreenOpen])

  const closeFullscreen = useCallback(() => {
    fullscreenVideoRef.current?.pause()
    setFullscreenOpen(false)
    if (videoVisibleRef.current) {
      window.requestAnimationFrame(() => videoRef.current?.play().catch(() => {}))
    }
  }, [])
  useBackDismiss(fullscreenOpen, closeFullscreen, 320)

  function triggerHeart() {
    setHeartBurst(true)
    setTimeout(() => setHeartBurst(false), 800)
  }

  useEffect(() => {
    const viewport = videoViewportRef.current
    if (!viewport) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isActive = entry.isIntersecting && entry.intersectionRatio >= 0.6
        videoVisibleRef.current = isActive
        if (isActive && !fullscreenOpen) {
          videoRef.current?.play().catch(() => {})
        } else {
          videoRef.current?.pause()
        }
      },
      { threshold: [0, 0.6] }
    )
    observer.observe(viewport)
    return () => {
      observer.disconnect()
      videoRef.current?.pause()
    }
  }, [fullscreenOpen])

  return (
    <article
      className="post-card-anim campus-post-card"
      style={{
         background:   'var(--color-surface)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
         borderBottom: '1px solid var(--color-border)',
        willChange:   'transform',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 8px', gap: '10px' }}>
        <Avatar
          src={post.avatar_url}
          name={post.full_name}
          size={38}
          onClick={() => navigate(`/app/profile/${post.username}`)}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              onClick={() => navigate(`/app/profile/${post.username}`)}
              style={{
                fontSize: '14px', fontWeight: 600,
                color: 'var(--color-text-primary)',
                cursor: 'pointer', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontFamily: 'var(--font-display)',
              }}
            >
              {post.full_name}
            </span>
            {(Boolean(post.is_college_verified) || ['ceo', 'cmo'].includes(post.username?.toLowerCase() || '')) && <VerifiedBadge size={13} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              @{post.username?.toLowerCase()}
            </span>
            {post.college_name && (
              <>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>·</span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{post.college_name}</span>
              </>
            )}
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>·</span>
            <TimeAgo date={post.created_at} />
          </div>
        </div>
        <button
          onClick={() => setShowMenu((m) => !m)}
          style={{
             background:   'var(--color-surface-hover)',
             border:       '1px solid var(--color-border)',
            borderRadius: '8px',
            cursor:       'pointer',
            color:        'var(--color-text-muted)',
            padding:      '5px',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            transition:   'background 150ms ease',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {/* Caption */}
      {post.content && (
        <div style={{ padding: '0 14px 8px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-primary)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...(captionExpanded ? {} : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }) }}>
            {post.content}
          </p>
          {isLong && (
            <button
              onClick={() => setCaptionExpanded((expanded) => !expanded)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '13px', padding: '4px 0 0', fontWeight: 700 }}
            >
              {captionExpanded ? 'Show less' : '… Learn more'}
            </button>
          )}
        </div>
      )}

      {taggedUsers.length > 0 && (
        <div style={{ padding: post.content ? '0 14px 8px' : '0 14px 10px' }}>
          <button
            onClick={() => setShowTaggedPeople(true)}
            aria-label={`View ${taggedUsers.length} tagged ${taggedUsers.length === 1 ? 'person' : 'people'}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 30,
              border: '1px solid var(--color-border)', borderRadius: 9999,
              background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)',
              padding: '4px 10px', cursor: 'pointer', fontSize: 12.5, fontWeight: 650,
              fontFamily: 'var(--font-body)',
            }}
          >
            <UserRound size={15} />
            {taggedUsers.length === 1
              ? `@${taggedUsers[0].username.toLowerCase()}`
              : `${taggedUsers.length} people tagged`}
          </button>
        </div>
      )}

      {/* Media */}
      {post.type === 'photo' && mediaUrls[0] && (
        <div style={{ position: 'relative', width: '100%', overflow: 'hidden', background: '#08090d' }} onClick={handleMediaTap}>
          <TemporaryPinchZoom>
            <AuthenticatedImage
              src={mediaUrls[0]}
              alt="post"
              placeholderVariant="post"
              style={{ width: '100%', height: 'auto', maxHeight: 480, objectFit: 'contain', display: 'block' }}
              placeholderStyle={{ width: '100%', minHeight: 260 }}
            />
          </TemporaryPinchZoom>
          {heartBurst && <HeartBurstOverlay />}
        </div>
      )}

      {post.type === 'carousel' && mediaUrls.length > 0 && (
        <CarouselMedia urls={mediaUrls} onDoubleTap={handleMediaTap} heartBurst={heartBurst} />
      )}

      {post.type === 'video' && mediaUrls[0] && (
        <div ref={videoViewportRef} style={{ position: 'relative', background: '#000' }} onClick={handleMediaTap}>
          <TemporaryPinchZoom>
            <AuthenticatedVideo
              ref={videoRef}
              src={mediaUrls[0]}
              loadingVariant="post"
              data-feed-video={post.id}
              onPlay={(event) => {
                document.querySelectorAll<HTMLVideoElement>('[data-feed-video]').forEach((video) => {
                  if (video !== event.currentTarget) video.pause()
                })
              }}
              onCanPlay={(event) => {
                if (videoVisibleRef.current) event.currentTarget.play().catch(() => {})
              }}
              style={{ width: '100%', maxHeight: '480px', objectFit: 'contain', display: 'block' }}
              muted={videoMuted} loop playsInline
            />
          </TemporaryPinchZoom>
          <div style={{ position: 'absolute', left: 12, bottom: 16, zIndex: 3 }}>
            <VideoSoundButton
              muted={videoMuted}
              onToggle={() => {
                const nextMuted = !videoMuted
                toggleFeedAudio()
                if (!nextMuted) {
                  document.querySelectorAll<HTMLVideoElement>('[data-feed-video]').forEach((video) => {
                    if (video !== videoRef.current) video.pause()
                  })
                  if (videoVisibleRef.current) videoRef.current?.play().catch(() => {})
                }
              }}
            />
          </div>
          {heartBurst && <HeartBurstOverlay />}
        </div>
      )}

      {post.type === 'reel' && mediaUrls[0] && (
        <div
          ref={videoViewportRef}
          role="button"
          tabIndex={0}
          aria-label={`Watch ${post.full_name}'s Clip`}
          onClick={() => navigate(`/app/clips/${post.id}`)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              navigate(`/app/clips/${post.id}`)
            }
          }}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '4 / 5',
            maxHeight: 'min(68dvh, 620px)',
            overflow: 'hidden',
            background: '#08090d',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <AuthenticatedVideo
            ref={videoRef}
            src={mediaUrls[0]}
            data-feed-video={post.id}
            poster={post.cover_url || undefined}
            autoPlay
            muted={videoMuted}
            loop
            playsInline
            preload="metadata"
            onPlay={(event) => {
              document.querySelectorAll<HTMLVideoElement>('[data-feed-video]').forEach((video) => {
                if (video !== event.currentTarget) video.pause()
              })
            }}
            onCanPlay={(event) => {
              if (videoVisibleRef.current) event.currentTarget.play().catch(() => {})
              else event.currentTarget.pause()
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
              display: 'block',
            }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 54%,rgba(0,0,0,.55))', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 13, right: 13, zIndex: 2 }}>
            <VideoSoundButton
              muted={videoMuted}
              onToggle={() => {
                const nextMuted = !videoMuted
                toggleFeedAudio()
                if (!nextMuted) {
                  document.querySelectorAll<HTMLVideoElement>('[data-feed-video]').forEach((video) => {
                    if (video !== videoRef.current) video.pause()
                  })
                  if (videoVisibleRef.current) videoRef.current?.play().catch(() => {})
                }
              }}
            />
          </div>
          <span style={{ position: 'absolute', left: 13, bottom: 13, padding: '7px 10px', borderRadius: 999, background: 'rgba(20,20,24,.72)', color: '#fff', fontSize: 12, fontWeight: 750, backdropFilter: 'blur(8px)' }}>
            Tap to watch
          </span>
        </div>
      )}

      {/* Poll */}
      {post.type === 'poll' && pollOptions.length > 0 && (
        <div style={{ padding: '0 14px 8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pollOptions.map((option: string, i: number) => (
            <div key={i} style={{
              padding:       '12px 16px',
              background:    'rgba(24,24,27,0.10)',
              backdropFilter:'blur(8px)',
              border:        '1px solid rgba(24,24,27,0.28)',
              borderRadius:  '12px',
              fontSize:      '14px',
              color:         'var(--color-text-primary)',
              cursor:        'pointer',
              transition:    'background 150ms ease',
            }}>
              {option}
            </div>
          ))}
        </div>
      )}

      {/* Interaction bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: '18px' }}>
        <ActionBtn
          icon={
            <Heart
              size={21}
              fill={post.is_liked ? '#FF3B7A' : 'none'}
              color={post.is_liked ? '#FF3B7A' : 'var(--color-icon-inactive)'}
              strokeWidth={2}
            />
          }
          label={post.is_liked ? "Unlike post" : "Like post"}
          count={post.likes_count}
          active={post.is_liked}
          onClick={post.is_liked ? onUnlike : onLike}
          activeColor="#FF3B7A"
        />
        <ActionBtn
          icon={<MessageCircle size={21} color="var(--color-icon-inactive)" strokeWidth={2} />}
          label="Comment on post"
          count={post.comments_count}
          onClick={onCommentPress}
        />
        <ActionBtn
          icon={<Share2 size={21} color="var(--color-icon-inactive)" strokeWidth={2} />}
          label="Share post"
          onClick={() => setShowShare(true)}
        />
        <div style={{ flex: 1 }} />
        <ActionBtn
          icon={
            <Bookmark
              size={21}
              fill={post.is_saved ? 'var(--color-lime)' : 'none'}
              color={post.is_saved ? 'var(--color-lime)' : 'var(--color-icon-inactive)'}
              strokeWidth={2}
            />
          }
          label={post.is_saved ? "Unsave post" : "Save post"}
          onClick={post.is_saved ? onUnsave : onSave}
        />
      </div>

      {/* Likes summary */}
      {post.likes_count > 0 && (
        <div style={{ padding: '0 14px 6px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
            {post.likes_count >= 1000 ? `${(post.likes_count / 1000).toFixed(1)}k` : post.likes_count} likes
          </span>
        </div>
      )}

      {showTaggedPeople && createPortal(
        <>
          <div
            onClick={() => setShowTaggedPeople(false)}
            style={{
              position: 'fixed', top: 'var(--native-safe-top, 0px)', right: 0,
              bottom: 'var(--native-safe-bottom, 0px)', left: 0, zIndex: 108,
              background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(8px)',
            }}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="People tagged in this post"
            style={{
              position: 'fixed', bottom: 'var(--native-safe-bottom, 0px)',
              left: '50%', transform: 'translateX(-50%)', zIndex: 109,
              width: '100%', maxWidth: 480, maxHeight: '70vh', overflowY: 'auto',
              borderRadius: '22px 22px 0 0', border: '1px solid var(--color-border-strong)',
              borderBottom: 'none', background: 'var(--glass-2)',
              backdropFilter: 'blur(36px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(36px) saturate(1.8)',
              boxShadow: '0 -8px 48px rgba(0,0,0,0.45)',
              paddingBottom: 'calc(14px + max(var(--native-safe-bottom, 0px), env(safe-area-inset-bottom, 0px)))',
              animation: 'sheetUp 240ms cubic-bezier(0.34,1.2,0.64,1)',
            }}
          >
            <div style={{ padding: '11px 0 5px', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--color-border-strong)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 10px', borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 16, fontFamily: 'var(--font-display)', fontWeight: 750 }}>Tagged people</h3>
                <p style={{ margin: '3px 0 0', color: 'var(--color-text-muted)', fontSize: 12 }}>{taggedUsers.length} {taggedUsers.length === 1 ? 'person' : 'people'}</p>
              </div>
              <button
                onClick={() => setShowTaggedPeople(false)}
                aria-label="Close tagged people"
                style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={17} />
              </button>
            </div>
            {taggedUsers.map((taggedUser) => (
              <button
                key={taggedUser.id}
                onClick={() => {
                  setShowTaggedPeople(false)
                  navigate(`/app/profile/${encodeURIComponent(taggedUser.username)}`)
                }}
                style={{
                  width: '100%', minHeight: 62, display: 'flex', alignItems: 'center',
                  gap: 11, padding: '9px 16px', border: 0,
                  borderBottom: '1px solid var(--color-border)', background: 'transparent',
                  color: 'var(--color-text-primary)', textAlign: 'left', cursor: 'pointer',
                }}
              >
                <Avatar src={taggedUser.avatar_url} name={taggedUser.full_name} size={42} />
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontFamily: 'var(--font-display)' }}>{taggedUser.full_name}</strong>
                  <span style={{ display: 'block', marginTop: 2, color: 'var(--color-text-muted)', fontSize: 12 }}>@{taggedUser.username.toLowerCase()}</span>
                </span>
              </button>
            ))}
          </section>
        </>,
        document.body,
      )}

      {/* ⋯ Bottom sheet menu */}
      {showMenu && createPortal(
        <>
          <div
            style={{ position: 'fixed', top: 'var(--native-safe-top, 0px)', right: 0, bottom: 'var(--native-safe-bottom, 0px)', left: 0, zIndex: 98, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }}
            onClick={() => setShowMenu(false)}
          />
          <div style={{
            position:    'fixed', bottom: 'var(--native-safe-bottom, 0px)', left: '50%', transform: 'translateX(-50%)',
            width:       '100%', maxWidth: '480px',
            background:  'var(--glass-2)',
            backdropFilter: 'blur(36px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(36px) saturate(1.8)',
            borderRadius: '22px 22px 0 0',
            border:       '1px solid var(--color-border-strong)',
            borderBottom: 'none',
            boxShadow:    '0 -8px 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.09)',
            zIndex:       99,
            paddingBottom:'calc(16px + max(var(--native-safe-bottom, 0px), env(safe-area-inset-bottom, 0px)))',
            animation:    'sheetUp 260ms cubic-bezier(0.34,1.2,0.64,1)',
          }}>
            <div style={{ padding: '12px 0 6px', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 36, height: 4, borderRadius: '9999px', background: 'var(--color-border-strong)' }} />
            </div>
            {onEdit && (
              <MenuRow icon={<Pencil size={18} />} label="Edit post" onClick={() => { setShowMenu(false); setEditContent(post.content || ''); setEditVisibility(post.visibility || 'public'); setShowEditSheet(true) }} />
            )}
            {onDelete && (
              <MenuRow icon={<Trash2 size={18} />} label="Delete post" danger onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }} />
            )}
            {!onEdit && !onDelete && (
              <>
                <MenuRow icon={<Flag size={18} />} label="Report post" danger onClick={() => { onReport?.(); setShowMenu(false) }} />
                <MenuRow icon={<X size={18} />} label="Not interested" onClick={() => setShowMenu(false)} />
              </>
            )}
            <MenuRow icon={<Share2 size={18} />} label="Copy link" onClick={() => { navigator.clipboard?.writeText(window.location.origin + `/app/post/${post.id}`); setShowMenu(false) }} />
          </div>
        </>,
        document.body,
      )}

      {/* Edit sheet */}
      {showEditSheet && createPortal(
        <>
          <div style={{ position: 'fixed', top: 'var(--native-safe-top, 0px)', right: 0, bottom: 'var(--native-safe-bottom, 0px)', left: 0, zIndex: 98, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }} onClick={() => setShowEditSheet(false)} />
          <div style={{
            position: 'fixed', bottom: 'var(--native-safe-bottom, 0px)', left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: '480px',
            background: 'var(--glass-2)',
            backdropFilter: 'blur(36px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(36px) saturate(1.8)',
            borderRadius: '22px 22px 0 0',
            border: '1px solid var(--color-border-strong)',
            borderBottom: 'none',
            boxShadow: '0 -8px 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.09)',
            zIndex: 99,
            padding: '16px 16px calc(24px + max(var(--native-safe-bottom, 0px), env(safe-area-inset-bottom, 0px)))',
            animation: 'sheetUp 260ms cubic-bezier(0.34,1.2,0.64,1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>Edit post</h3>
              <button onClick={() => setShowEditSheet(false)} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: '8px', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', padding: '5px' }}>
                <X size={18} />
              </button>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="What's on your mind?"
              rows={4}
              maxLength={5000}
              autoFocus
              style={{ width: '100%', background: 'var(--color-surface)', backdropFilter: 'blur(8px)', border: '1.5px solid var(--color-input-border)', borderRadius: '14px', padding: '12px 14px', color: 'var(--color-text-primary)', fontSize: '15px', fontFamily: 'var(--font-body)', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: '12px', transition: 'border-color 200ms' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              {(['public', 'friends', 'college'] as const).map((v) => (
                <button key={v} onClick={() => setEditVisibility(v)} style={{
                  padding: '7px 14px', borderRadius: '9999px', fontSize: '13px', cursor: 'pointer',
                  fontWeight: editVisibility === v ? 600 : 400,
                  border: `1px solid ${editVisibility === v ? 'var(--color-lime)' : 'var(--color-border-strong)'}`,
                  background: editVisibility === v ? 'var(--color-lime-dim)' : 'var(--color-surface)',
                  color: editVisibility === v ? 'var(--color-lime)' : 'var(--color-text-secondary)',
                  textTransform: 'capitalize',
                  transition: 'all 180ms ease',
                }}>
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={async () => {
                if (!onEdit) return
                setEditSaving(true)
                try { await onEdit({ content: editContent, visibility: editVisibility }); setShowEditSheet(false) }
                catch {} finally { setEditSaving(false) }
              }}
              disabled={editSaving}
              style={{ width: '100%', padding: '14px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #18181B, #C44DCC)', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', opacity: editSaving ? 0.65 : 1, fontFamily: 'var(--font-display)', boxShadow: '0 4px 20px rgba(24,24,27,0.40)' }}
            >
              {editSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </>,
        document.body,
      )}

      {/* Share sheet */}
      {showShare && (
        <ShareSheet
          url={post.type === 'reel'
            ? `${window.location.origin}/app/clips/${post.id}`
            : `https://campnect.perinol.com/p/${post.id}`}
          title={post.content?.slice(0, 80)}
          postMeta={{
            postId: post.id,
            thumbnail: post.cover_url || mediaUrls[0],
            thumbnailType: post.cover_url ? 'image' : post.type === 'video' || post.type === 'reel' ? 'video' : 'image',
            authorName: post.full_name,
            authorAvatar: post.avatar_url,
            caption: post.content?.slice(0, 180),
          }}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && createPortal(
        <>
          <div style={{ position: 'fixed', top: 'var(--native-safe-top, 0px)', right: 0, bottom: 'var(--native-safe-bottom, 0px)', left: 0, zIndex: 98, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }} onClick={() => !deleteSaving && setShowDeleteConfirm(false)} />
          <div style={{
            position: 'fixed', bottom: 'var(--native-safe-bottom, 0px)', left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: '480px',
            background: 'var(--glass-2)',
            backdropFilter: 'blur(36px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(36px) saturate(1.8)',
            borderRadius: '22px 22px 0 0',
            border: '1px solid rgba(239,68,68,0.20)',
            borderBottom: 'none',
            boxShadow: '0 -8px 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)',
            zIndex: 99,
            padding: '20px 16px calc(32px + max(var(--native-safe-bottom, 0px), env(safe-area-inset-bottom, 0px)))',
            textAlign: 'center',
            animation: 'sheetUp 260ms cubic-bezier(0.34,1.2,0.64,1)',
          }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Trash2 size={22} color="#EF4444" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>Delete post?</h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>This can't be undone. The post will be removed for everyone.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: '13px', borderRadius: '14px', border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)' }}>Cancel</button>
              <button
                onClick={async () => {
                  if (!onDelete) return
                  setDeleteSaving(true)
                  try { await onDelete(); setShowDeleteConfirm(false) }
                  catch {} finally { setDeleteSaving(false) }
                }}
                disabled={deleteSaving}
                style={{ flex: 1, padding: '13px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #B91C1C, #EF4444)', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', opacity: deleteSaving ? 0.65 : 1, fontFamily: 'var(--font-display)' }}
              >
                {deleteSaving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}

      {fullscreenOpen && mediaUrls[0] && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen video"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: '#000', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <TemporaryPinchZoom>
            <AuthenticatedVideo
              ref={fullscreenVideoRef}
              src={mediaUrls[0]}
              autoPlay
              loop
              muted={videoMuted}
              playsInline
              onClick={handleFullscreenTap}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </TemporaryPinchZoom>
          <button
            type="button"
            aria-label="Back"
            onClick={requestAppBack}
            style={{
              position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', left: 14, zIndex: 2,
              width: 34, height: 34, borderRadius: '9999px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(255,255,255,0.24)',
              background: 'rgba(0,0,0,0.52)', color: '#fff',
              backdropFilter: 'blur(8px)', cursor: 'pointer',
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ position: 'absolute', left: 14, bottom: 'calc(30px + env(safe-area-inset-bottom, 0px))', zIndex: 2 }}>
            <VideoSoundButton
              muted={videoMuted}
              onToggle={() => {
                const nextMuted = !videoMuted
                toggleFeedAudio()
                if (!nextMuted) fullscreenVideoRef.current?.play().catch(() => {})
              }}
            />
          </div>
          {heartBurst && <HeartBurstOverlay />}
        </div>,
        document.body,
      )}
    </article>
  )
}

function VideoSoundButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={muted ? 'Turn video sound on' : 'Mute video'}
      title={muted ? 'Turn sound on' : 'Mute'}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      style={{
        width: 32, height: 32, borderRadius: '9999px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(255,255,255,0.24)',
        background: 'rgba(0,0,0,0.58)', color: '#fff',
        backdropFilter: 'blur(8px)', cursor: 'pointer',
      }}
    >
      {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
    </button>
  )
}

function MenuRow({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  const [pressed, setPressed] = React.useState(false)
  return (
    <button
      aria-label={label}
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        width: '100%', background: pressed ? 'rgba(255,255,255,0.05)' : 'none',
        border: 'none', cursor: 'pointer',
        padding: '14px 20px',
        color: danger ? '#EF4444' : 'var(--color-text-primary)',
        fontSize: '15px', fontWeight: 500, textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
        transition: 'background 120ms ease',
      }}
    >
      <span style={{ opacity: 0.75, display: 'flex' }}>{icon}</span>
      {label}
    </button>
  )
}

function ActionBtn({ label, icon, count, onClick, active, activeColor }: {
  label?: string; icon: React.ReactNode; count?: number; onClick?: () => void; active?: boolean; activeColor?: string
}) {
  const [pressed, setPressed] = React.useState(false)
  return (
    <button
      aria-label={label}
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '5px', padding: '4px',
        WebkitTapHighlightColor: 'transparent',
        transform: pressed ? 'scale(0.82)' : 'scale(1)',
        transition: 'transform 130ms var(--ease-spring)',
        willChange: 'transform',
      }}
    >
      {icon}
      {count !== undefined && count > 0 && (
        <span style={{
          fontSize: '13px', fontWeight: 500,
          color: active && activeColor ? activeColor : 'var(--color-text-secondary)',
          fontFamily: 'var(--font-body)',
        }}>
          {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
        </span>
      )}
    </button>
  )
}

const CarouselMedia = memo(function CarouselMedia({
  urls, onDoubleTap, heartBurst,
}: { urls: string[]; onDoubleTap: () => void; heartBurst: boolean }) {
  const [idx, setIdx] = useState(0)
  const [controlsVisible, setControlsVisible] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const controlsTimerRef = useRef<number | null>(null)

  const revealControls = useCallback(() => {
    setControlsVisible(true)
    if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false)
      controlsTimerRef.current = null
    }, 2500)
  }, [])

  useEffect(() => {
    if (urls.length > 1) revealControls()
    return () => {
      if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current)
    }
  }, [urls.length, revealControls])

  function scrollTo(nextIdx: number) {
    const el = scrollRef.current
    if (!el) return
    revealControls()
    setIdx(nextIdx)
    el.scrollTo({ left: nextIdx * el.offsetWidth, behavior: 'smooth' })
  }

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    revealControls()
    setIdx(Math.round(el.scrollLeft / el.offsetWidth))
  }

  const controlVisibilityStyle: React.CSSProperties = {
    opacity: controlsVisible ? 1 : 0,
    pointerEvents: controlsVisible ? 'auto' : 'none',
    transition: 'opacity 220ms ease',
  }

  return (
    <div
      style={{ position: 'relative', background: '#111318' }}
      onClick={() => {
        revealControls()
        onDoubleTap()
      }}
      role="region"
      aria-label={`Photo carousel, slide ${idx + 1} of ${urls.length}`}
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          aspectRatio: '4 / 5',
          overscrollBehaviorX: 'contain',
        }}
      >
        {urls.map((url, i) => (
          <div
            key={i}
            style={{
              position: 'relative',
              flex: '0 0 100%',
              height: '100%',
              scrollSnapAlign: 'start',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              background: '#111318',
            }}
          >
            <TemporaryPinchZoom>
              <AuthenticatedImage
                src={url}
                alt={`Slide ${i + 1} of ${urls.length}`}
                placeholderVariant="post"
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                placeholderStyle={{ minHeight: 260, width: '100%', height: '100%' }}
              />
            </TemporaryPinchZoom>
          </div>
        ))}
      </div>
      {urls.length > 1 && (
        <div style={{
          ...controlVisibilityStyle,
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(15,17,22,0.44)', backdropFilter: 'blur(8px)',
          borderRadius: '9999px', padding: '4px 9px',
          fontSize: '12px', lineHeight: 1, fontWeight: 700, color: '#FFFFFF',
          border: '1px solid rgba(255,255,255,0.28)',
          boxShadow: '0 3px 10px rgba(0,0,0,0.16)',
          letterSpacing: '0.02em',
        }}>
          {idx + 1} / {urls.length}
        </div>
      )}
      {urls.length > 1 && (
        <>
          {idx > 0 && (
            <button
              type="button"
              aria-label="Previous slide"
              tabIndex={controlsVisible ? 0 : -1}
              onClick={(e) => { e.stopPropagation(); scrollTo(idx - 1) }}
              style={{
                ...controlVisibilityStyle,
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.34)', backdropFilter: 'blur(6px)',
                border: '1px solid rgba(255,255,255,0.42)', borderRadius: '9999px',
                width: '34px', height: '34px', padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#FFFFFF', boxShadow: '0 3px 10px rgba(0,0,0,0.18)',
              }}
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {idx < urls.length - 1 && (
            <button
              type="button"
              aria-label="Next slide"
              tabIndex={controlsVisible ? 0 : -1}
              onClick={(e) => { e.stopPropagation(); scrollTo(idx + 1) }}
              style={{
                ...controlVisibilityStyle,
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.34)', backdropFilter: 'blur(6px)',
                border: '1px solid rgba(255,255,255,0.42)', borderRadius: '9999px',
                width: '34px', height: '34px', padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#FFFFFF', boxShadow: '0 3px 10px rgba(0,0,0,0.18)',
              }}
            >
              <ChevronRight size={18} />
            </button>
          )}
          <div
            style={{
              ...controlVisibilityStyle,
              position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '3px 6px', borderRadius: '9999px',
              background: 'rgba(15,17,22,0.28)', backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.14)',
            }}
            aria-label="Choose slide"
          >
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === idx ? 'true' : undefined}
                tabIndex={controlsVisible ? 0 : -1}
                onClick={(e) => { e.stopPropagation(); scrollTo(i) }}
                style={{
                  width: i === idx ? '18px' : '7px', height: '7px',
                  padding: 0, border: 0, borderRadius: '9999px',
                  background: i === idx ? 'var(--color-lime)' : 'rgba(255,255,255,0.58)',
                  boxShadow: i === idx ? '0 0 8px var(--color-lime-glow, rgba(187,255,0,0.60))' : 'none',
                  cursor: 'pointer', transition: 'all 200ms var(--ease-spring)',
                }}
              />
            ))}
          </div>
        </>
      )}
      {heartBurst && <HeartBurstOverlay />}
    </div>
  )
})

function HeartBurstOverlay() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <Heart
        size={80}
        fill="#FF3B7A"
        color="#FF3B7A"
        style={{
          filter: 'drop-shadow(0 0 20px rgba(255,59,122,0.70))',
          animation: 'heartBurst 700ms ease forwards',
        }}
      />
    </div>
  )
}
