import React from 'react'
import { Bookmark, CalendarDays, Heart, Image as ImageIcon, MessageCircle, MoreHorizontal, Play, Share2, Volume2, VolumeX, X } from 'lucide-react'
import { Avatar } from '../shared/Avatar'
import { AuthenticatedImage } from '../shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../shared/AuthenticatedVideo'
import { useTemporaryPinchZoom } from '../shared/TemporaryPinchZoom'
import { mediaUrl } from '../../utils/mediaUrl'
import type { Glimpse } from '../../api/glimpses'

function isVideo(glimpse: Glimpse) {
  const source = glimpse.media?.[0] || ''
  return Boolean(glimpse.duration) || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(source)
}

interface GlimpseStoryProps {
  glimpse: Glimpse
  position: number
  total: number
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
  onProfile: () => void
  onLike: () => void
  onComment: () => void
  onShare: () => void
  onSave: () => void
  onMenu: () => void
  onInsights?: () => void
  liked: boolean
  saved: boolean
}

export function GlimpseStory({
  glimpse, position, total, onClose, onPrevious, onNext,
  onProfile, onLike, onComment, onShare, onSave, onMenu, onInsights, liked, saved
}: GlimpseStoryProps) {
  const source = mediaUrl(glimpse.media?.[0])
  // Never use the video itself as an image poster/backdrop. Video posts without
  // a generated image cover should render against the neutral story background.
  const cover = mediaUrl(glimpse.cover_url)
  const video = isVideo(glimpse)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = React.useState(false)
  const [muted, setMuted] = React.useState(true)
  const [videoError, setVideoError] = React.useState(false)
  const zoom = useTemporaryPinchZoom()

  React.useEffect(() => {
    setPaused(false)
    setMuted(true)
    setVideoError(false)
  }, [source])

  function togglePlayback() {
    const element = videoRef.current
    if (!element) return
    if (element.paused) {
      void element.play().catch(() => {})
    } else {
      element.pause()
    }
  }

  function toggleMute() {
    const element = videoRef.current
    if (!element) return
    element.muted = !element.muted
    setMuted(element.muted)
  }

  return (
    <div style={{ ...storyRoot, ...zoom.interactionStyle }} {...zoom.interactionProps}>
      <div style={blurredBackdrop}>
        {video ? (
          cover ? <AuthenticatedImage src={cover} style={backdropMedia} alt="" /> : null
        ) : (
          <AuthenticatedImage src={source} style={backdropMedia} alt="" />
        )}
      </div>

      <div style={mediaContainer}>
        {video ? (
          videoError ? (
            <div style={mediaUnavailable}><ImageIcon size={30} /><span>Video unavailable</span></div>
          ) : source ? (
            <AuthenticatedVideo
              ref={videoRef}
              key={source}
              src={source}
              poster={cover || undefined}
              autoPlay
              muted={muted}
              loop
              playsInline
              preload="metadata"
              loadingVariant="post"
              onPlay={() => setPaused(false)}
              onPause={() => setPaused(true)}
              onError={() => setVideoError(true)}
              style={{ ...mediaElement, ...zoom.mediaStyle }}
            />
          ) : (
            <div style={mediaUnavailable}><ImageIcon size={30} /><span>Video unavailable</span></div>
          )
        ) : (
          <AuthenticatedImage
            key={source}
            src={source}
            alt={glimpse.content || 'Campus Glimpse'}
            style={{ ...mediaElement, ...zoom.mediaStyle }}
            placeholderStyle={{ width: '100%', height: '100%' }}
            placeholderVariant="glimpse"
            placeholderLabel="Loading Glimpse"
            errorPlaceholderLabel="Glimpse unavailable"
          />
        )}
        {glimpse.event && (
          <div style={eventBadge}>
            <CalendarDays size={13} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{glimpse.event.title}</span>
          </div>
        )}
      </div>

      <div style={topOverlay}>
        <div style={progressContainer}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={progressTrack}>
              <div style={{ ...progressFill, width: i <= position - 1 ? '100%' : '0%', transition: 'width 200ms linear' }} />
            </div>
          ))}
        </div>
        <div style={storyHeaderRow}>
          <button onClick={onProfile} style={profileBtn}>
            <Avatar src={glimpse.avatar_url} name={glimpse.full_name} size={38} />
            <div style={profileInfo}>
              <span style={profileName}>{glimpse.full_name}</span>
              <span style={profileUser}>@{glimpse.username}</span>
            </div>
          </button>
          <button aria-label="More options" onClick={onMenu} style={iconBtn}><MoreHorizontal size={20} /></button>
          <button aria-label="Close" onClick={onClose} style={iconBtn}><X size={20} /></button>
        </div>
      </div>

      <div style={tapZoneContainer}>
        {onPrevious && <button type="button" aria-label="Previous Glimpse" onClick={onPrevious} style={tapLeft} />}
        {video && source && !videoError && (
          <button
            type="button"
            aria-label={paused ? 'Play video' : 'Pause video'}
            onClick={togglePlayback}
            style={tapCenter}
          >
            <span style={{ ...playbackHint, opacity: paused ? 1 : 0 }} aria-hidden="true"><Play size={24} fill="currentColor" /></span>
          </button>
        )}
        {onNext && <button type="button" aria-label="Next Glimpse" onClick={onNext} style={tapRight} />}
      </div>

      {video && source && !videoError && (
        <button
          type="button"
          aria-label={muted ? 'Unmute video' : 'Mute video'}
          onClick={toggleMute}
          style={muteButton}
        >
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
      )}

      <div style={bottomOverlay}>
        {glimpse.content && <p style={captionText}>{glimpse.content}</p>}
        <div style={actionsRow}>
          <button onClick={onComment} style={commentInputAffordance}>
            <MessageCircle size={18} />
            <span style={{ flex: 1, textAlign: 'left' }}>Add a comment...</span>
            {glimpse.comments_count > 0 && <span style={commentBadge}>{glimpse.comments_count}</span>}
          </button>
          <div style={actionGroupRight}>
            <Action icon={<Heart size={26} fill={liked ? '#ff3b7a' : 'none'} color={liked ? '#ff3b7a' : '#fff'} />} count={glimpse.likes_count} onClick={onLike} />
            <Action icon={<Bookmark size={26} fill={saved ? '#fff' : 'none'} color="#fff" />} onClick={onSave} />
            <Action icon={<Share2 size={26} />} onClick={onShare} />
          </div>
        </div>
        {onInsights ? (
          <button type="button" onClick={onInsights} style={viewsButton}>
            {glimpse.views_count} {glimpse.views_count === 1 ? 'view' : 'views'} · See activity
          </button>
        ) : (
          <div style={viewsRow}>{glimpse.views_count} {glimpse.views_count === 1 ? 'view' : 'views'} · Fresh from campus</div>
        )}
      </div>
    </div>
  )
}

function Action({ icon, count, onClick }: { icon: React.ReactNode; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={actionItem}>
      {icon}
      {count !== undefined && count > 0 && <span style={actionCount}>{count}</span>}
    </button>
  )
}

const storyRoot: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 0,
  flex: '1 1 auto',
  position: 'relative',
  background: '#040406',
  overflow: 'hidden'
}

const blurredBackdrop: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  opacity: 0.35,
  pointerEvents: 'none'
}

const backdropMedia: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  filter: 'blur(44px) saturate(1.25)',
  transform: 'scale(1.2)'
}

const mediaContainer: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)'
}

const mediaElement: React.CSSProperties = {
  width: '100%',
  height: '100%',
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  objectPosition: 'center center'
}

const mediaUnavailable: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 9,
  color: 'rgba(255,255,255,.68)',
  fontSize: 12,
  fontWeight: 700
}

const eventBadge: React.CSSProperties = {
  position: 'absolute',
  left: 14,
  bottom: 'max(14px, env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  maxWidth: 'calc(100% - 28px)',
  padding: '8px 12px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.65)',
  border: '1px solid rgba(187,255,0,0.35)',
  color: '#e6ff9a',
  fontSize: 11,
  fontWeight: 800,
  zIndex: 10,
  backdropFilter: 'blur(8px)'
}

const topOverlay: React.CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, right: 0,
  zIndex: 10,
  padding: 'calc(14px + env(safe-area-inset-top, 0px)) 12px 24px',
  background: 'linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
  pointerEvents: 'none'
}

const progressContainer: React.CSSProperties = {
  display: 'flex', gap: 4, marginBottom: 16
}
const progressTrack: React.CSSProperties = {
  flex: 1, height: 2.5, background: 'rgba(255,255,255,0.25)', borderRadius: 99
}
const progressFill: React.CSSProperties = {
  height: '100%', background: 'var(--color-lime)', borderRadius: 99
}

const storyHeaderRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12
}
const profileBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, flex: 1,
  background: 'none', border: 0, padding: 0, color: '#fff',
  textAlign: 'left', cursor: 'pointer', pointerEvents: 'auto'
}
const profileInfo: React.CSSProperties = {
  display: 'flex', flexDirection: 'column'
}
const profileName: React.CSSProperties = {
  fontSize: 14.5, fontWeight: 800, fontFamily: 'var(--font-display)',
  lineHeight: 1.2, textShadow: '0 1px 4px rgba(0,0,0,0.6)'
}
const profileUser: React.CSSProperties = {
  fontSize: 12.5, color: 'rgba(255,255,255,0.85)',
  lineHeight: 1.2, marginTop: 2, textShadow: '0 1px 3px rgba(0,0,0,0.6)'
}
const iconBtn: React.CSSProperties = {
  width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '50%', color: '#fff', cursor: 'pointer', pointerEvents: 'auto',
  backdropFilter: 'blur(8px)'
}

const tapZoneContainer: React.CSSProperties = {
  position: 'absolute', inset: '120px 0 160px', zIndex: 5, pointerEvents: 'none'
}
const tapLeft: React.CSSProperties = { position: 'absolute', inset: 0, right: '66%', cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent', background: 'transparent', border: 0, pointerEvents: 'auto' }
const tapCenter: React.CSSProperties = { position: 'absolute', inset: '0 33%', cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent', background: 'transparent', border: 0, color: '#fff', pointerEvents: 'auto' }
const tapRight: React.CSSProperties = { position: 'absolute', inset: '0 0 0 66%', cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent', background: 'transparent', border: 0, pointerEvents: 'auto' }
const playbackHint: React.CSSProperties = { position: 'absolute', left: '50%', top: '50%', display: 'grid', placeItems: 'center', width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,0,0,.38)', opacity: 0, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }
const muteButton: React.CSSProperties = { position: 'absolute', left: 16, bottom: 'calc(190px + env(safe-area-inset-bottom, 0px))', zIndex: 12, width: 34, height: 34, display: 'grid', placeItems: 'center', padding: 0, border: '1px solid rgba(255,255,255,.22)', borderRadius: '50%', background: 'rgba(0,0,0,.42)', color: '#fff', cursor: 'pointer', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }

const bottomOverlay: React.CSSProperties = {
  position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
  padding: '64px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
  background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 65%, transparent 100%)',
  pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 16
}

const captionText: React.CSSProperties = {
  fontSize: 15, fontWeight: 500, lineHeight: 1.45, color: '#fff',
  margin: 0, textShadow: '0 1px 4px rgba(0,0,0,0.7)',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word', pointerEvents: 'auto'
}

const actionsRow: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-end', gap: 16
}
const commentInputAffordance: React.CSSProperties = {
  flex: 1, height: 46, display: 'flex', alignItems: 'center', gap: 10,
  padding: '0 18px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 999, color: 'rgba(255,255,255,0.9)', fontSize: 14, cursor: 'pointer',
  pointerEvents: 'auto', backdropFilter: 'blur(12px)'
}
const commentBadge: React.CSSProperties = {
  background: 'var(--color-lime)', color: 'var(--color-accent-contrast)', fontSize: 11, fontWeight: 800,
  padding: '2px 7px', borderRadius: 99, marginLeft: 'auto'
}
const actionGroupRight: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-end', gap: 16
}
const actionItem: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
  background: 'none', border: 0, padding: 0, color: '#fff', cursor: 'pointer',
  pointerEvents: 'auto', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))'
}
const actionCount: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.7)'
}

const viewsRow: React.CSSProperties = {
  fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 500,
  textShadow: '0 1px 2px rgba(0,0,0,0.6)'
}
const viewsButton: React.CSSProperties = {
  ...viewsRow,
  padding: 0,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  pointerEvents: 'auto',
}
