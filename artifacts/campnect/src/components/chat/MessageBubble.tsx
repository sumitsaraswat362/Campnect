import React from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Pause, Phone, PhoneOff, Play, Reply, Video, Volume2 } from 'lucide-react'
import { Message, ReplyTo } from '../../stores/chatStore'
import { Avatar } from '../shared/Avatar'
import { AuthenticatedImage } from '../shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../shared/AuthenticatedVideo'
import { TemporaryPinchZoom } from '../shared/TemporaryPinchZoom'
import { AuthenticatedFileLink } from '../shared/AuthenticatedFileLink'
import { TimeAgo } from '../shared/TimeAgo'
import { formatDeviceDate, parseApiDate } from '../../utils/dateTime'
import { formatChatDateDivider } from '../../utils/chatTimestamp'
import { useAuthMedia } from '../../hooks/useAuthMedia'
import { postsApi } from '../../api/posts'
import { SharedPostReplyPreview } from './SharedPostReplyPreview'
import { parseSharedPostPayload } from './sharedPostPayload'
import { TextWithLinks } from './TextWithLinks'
import { LinkPreviewCard } from './LinkPreviewCard'
import { findFirstUrl } from '../../utils/linkify'
import { findOpenMojiSticker, OPENMOJI_EMOJIS, openMojiAssetUrl, parseOpenMojiSticker } from '../../features/openmoji/catalog'
import { parseGiphySelection } from '../../features/giphy/provider'

// Module-level cache so re-rendering the same shared-post card (e.g. on
// scroll) doesn't re-check the post's existence every time.
const postExistsCache = new Map<string, boolean>()
const SWIPE_REPLY_THRESHOLD = 48
const MESSAGE_REPLY_SWIPE_IGNORE_SELECTOR = 'button,input,textarea,select,[contenteditable],[draggable="true"],[data-chat-reply-reference]'

export function getReplySwipeDistance(deltaX: number, isOwn: boolean) {
  return isOwn ? -deltaX : deltaX
}

function SharedPostCard({
  sharedPost, sharedPostUrl, onNavigate, isOwn, isRead, msg, bubbleRadius, onRetry,
}: {
  sharedPost: { postId?: string; postUrl?: string; thumbnail?: string; thumbnailType?: 'image' | 'video'; authorName?: string; authorAvatar?: string; caption?: string }
  sharedPostUrl?: string
  onNavigate: () => void
  isOwn: boolean
  isRead?: boolean
  msg: Message
  bubbleRadius: string
  onRetry?: (msg: Message) => void
}) {
  const [deleted, setDeleted] = React.useState(() => sharedPost.postId ? postExistsCache.get(sharedPost.postId) === false : false)
  const [thumbnailType, setThumbnailType] = React.useState<'image' | 'video'>(() => (
    sharedPost.thumbnailType
      || (/\.(mp4|mov|webm|m4v)(?:\?|$)/i.test(sharedPost.thumbnail || '') ? 'video' : 'image')
  ))

  React.useEffect(() => {
    if (!sharedPost.postId || postExistsCache.has(sharedPost.postId)) return
    let cancelled = false
    postsApi.getPost(sharedPost.postId)
      .then((response) => {
        if (cancelled) return
        postExistsCache.set(sharedPost.postId!, true)
        const post = response.data?.data
        if (!sharedPost.thumbnailType && (post?.type === 'video' || post?.type === 'reel')) {
          setThumbnailType(post?.cover_url ? 'image' : 'video')
        }
      })
      .catch((err) => {
        if (err?.response?.status !== 404) return
        postExistsCache.set(sharedPost.postId!, false)
        if (!cancelled) setDeleted(true)
      })
    return () => { cancelled = true }
  }, [sharedPost.postId])

  if (deleted) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '7px',
        background: isOwn ? 'var(--chat-own-bubble)' : 'var(--chat-received-bubble)',
        border: isOwn ? '1px solid var(--chat-own-border)' : '1px solid var(--chat-received-border)',
        borderRadius: bubbleRadius,
        padding: '10px 12px 7px',
        width: '220px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} color={isOwn ? 'var(--chat-own-meta)' : 'var(--chat-received-meta)'} style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: '13px', fontStyle: 'italic', color: isOwn ? 'var(--chat-own-meta)' : 'var(--chat-received-meta)' }}>This post was deleted</p>
        </div>
        <SharedMessageMeta msg={msg} isOwn={isOwn} isRead={isRead} onRetry={onRetry} />
      </div>
    )
  }

  return (
    <div style={{
      background: isOwn ? 'var(--chat-own-bubble)' : 'var(--chat-received-bubble)',
      backdropFilter: 'blur(12px)',
      border: isOwn ? '1px solid var(--chat-own-border)' : '1px solid var(--chat-received-border)',
      borderRadius: bubbleRadius,
      overflow: 'hidden',
      width: 'min(100%, 260px)',
      cursor: sharedPostUrl ? 'pointer' : 'default',
      boxShadow: isOwn ? 'var(--chat-own-shadow)' : 'var(--chat-received-shadow)',
    }}
    onClick={() => sharedPostUrl && onNavigate()}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '9px 10px',
        borderBottom: '1px solid var(--chat-divider)',
      }}>
        <Avatar src={sharedPost.authorAvatar} name={sharedPost.authorName || 'Campus user'} size={28} />
        <div style={{ minWidth: 0 }}>
          <p style={{
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '12px',
            fontWeight: 800,
            color: isOwn ? 'var(--chat-own-text)' : 'var(--chat-received-text)',
          }}>
            {sharedPost.authorName || 'Campus user'}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '10px', color: isOwn ? 'var(--chat-own-meta)' : 'var(--chat-received-meta)' }}>Shared post</p>
        </div>
      </div>
      {sharedPost.thumbnail && (
        <div style={{
          width: '100%',
          aspectRatio: '1 / 1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: 'var(--chat-media-bg)',
        }}>
          {thumbnailType === 'video' ? (
            <AuthenticatedVideo
              src={sharedPost.thumbnail}
              muted
              playsInline
              preload="metadata"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <AuthenticatedImage
              src={sharedPost.thumbnail}
              alt="shared post"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              placeholderStyle={{ width: '100%', height: '100%' }}
            />
          )}
        </div>
      )}
      <div style={{ padding: '9px 10px 7px' }}>
        {sharedPost.caption && (
          <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.4, color: isOwn ? 'var(--chat-own-text)' : 'var(--chat-received-text)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
            {sharedPost.caption}
          </p>
        )}
      </div>
      <div style={{ padding: '0 10px 7px' }}>
        <SharedMessageMeta msg={msg} isOwn={isOwn} isRead={isRead} onRetry={onRetry} />
      </div>
    </div>
  )
}

function SharedMessageMeta({ msg, isOwn, isRead, onRetry }: { msg: Message; isOwn: boolean; isRead?: boolean; onRetry?: (msg: Message) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
      {!!msg.is_edited && (
        <span style={{ fontSize: '10px', color: isOwn ? 'var(--chat-own-meta)' : 'var(--chat-received-meta)', fontStyle: 'italic' }}>edited</span>
      )}
      <TimeAgo date={msg.created_at} mode="clock" style={{ fontSize: '10px', color: isOwn ? 'var(--chat-own-meta)' : 'var(--chat-received-meta)' }} />
      {isOwn && msg.is_failed && (
        <span
          onClick={(event) => { event.stopPropagation(); onRetry?.(msg) }}
          role="button"
          style={{ fontSize: '10px', fontWeight: 700, color: '#FFD9D9', lineHeight: 1, cursor: 'pointer', textDecoration: 'underline' }}
        >
          Not sent · Retry
        </span>
      )}
      {isOwn && !msg.is_failed && (
        <span style={{ fontSize: '11px', color: isRead ? 'var(--chat-own-text)' : 'var(--chat-own-meta)', lineHeight: 1 }}>
          {isRead ? '✓✓' : msg.is_pending ? '○' : '✓'}
        </span>
      )}
    </div>
  )
}

function formatAudioDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainder}`
}

function AudioMessagePlayer({ src: rawSrc, isOwn }: { src: string; isOwn: boolean }) {
  const { src, error: loadError } = useAuthMedia(rawSrc)
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const [duration, setDuration] = React.useState(0)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    setPlaying(false)
    setLoaded(false)
    setDuration(0)
    setCurrentTime(0)
    setError(false)
    audio.pause()
    audio.currentTime = 0

    const onLoadedMetadata = () => {
      setLoaded(true)
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    }
    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => {
      setPlaying(false)
      setCurrentTime(0)
    }
    const onError = () => {
      setPlaying(false)
      setError(true)
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('durationchange', onLoadedMetadata)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    audio.load()
    return () => {
      audio.pause()
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('durationchange', onLoadedMetadata)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [src])

  const combinedError = error || loadError

  async function togglePlayback(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    const audio = audioRef.current
    if (!audio || combinedError) return
    try {
      if (audio.paused) {
        if (audio.ended) audio.currentTime = 0
        await audio.play()
      } else {
        audio.pause()
      }
    } catch {
      setError(true)
      setPlaying(false)
    }
  }

  function seek(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    const audio = audioRef.current
    if (!audio || !duration) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    audio.currentTime = ratio * duration
    setCurrentTime(audio.currentTime)
  }

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const foreground = isOwn ? 'var(--chat-own-text)' : 'var(--chat-received-text)'
  const secondary = isOwn ? 'var(--chat-own-meta)' : 'var(--chat-received-meta)'
  const track = isOwn ? 'rgba(255,255,255,0.25)' : 'var(--chat-divider)'

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: 'min(100%, 250px)', maxWidth: '100%', minWidth: 0,
         padding: '9px 11px', boxSizing: 'border-box', borderRadius: '18px',
        background: isOwn ? 'var(--chat-own-bubble)' : 'var(--chat-received-bubble)',
        border: isOwn ? '1px solid var(--chat-own-border)' : '1px solid var(--chat-received-border)',
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src ?? undefined} preload="metadata" aria-hidden="true" style={{ display: 'none' }} />
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        style={{
          width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center',
          border: 0, borderRadius: '50%', background: isOwn ? '#fff' : 'var(--chat-accent-soft)',
          color: isOwn ? 'var(--chat-accent)' : 'var(--chat-accent)', cursor: combinedError ? 'not-allowed' : 'pointer',
        }}
      >
        {combinedError ? <AlertCircle size={16} /> : playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={seek}
          aria-label="Seek in voice note"
          style={{ display: 'block', width: '100%', height: 18, padding: '6px 0', border: 0, background: 'transparent', cursor: duration ? 'pointer' : 'default' }}
        >
          <span style={{ display: 'block', position: 'relative', height: 4, borderRadius: 99, background: track, overflow: 'hidden' }}>
            <span style={{ position: 'absolute', inset: '0 auto 0 0', width: `${progress}%`, borderRadius: 99, background: isOwn ? '#fff' : 'var(--chat-accent)', transition: 'width 100ms linear' }} />
          </span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, color: secondary, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
          <span>{combinedError ? 'Audio unavailable' : loaded ? formatAudioDuration(currentTime) : 'Loading audio…'}</span>
          <span>{loaded ? formatAudioDuration(duration) : '—'}</span>
        </div>
      </div>
      <Volume2 size={15} color={secondary} style={{ flexShrink: 0 }} />
    </div>
  )
}

function ImageMessage({ src: rawSrc, isOwn, onPress }: { src: string; isOwn: boolean; onPress: () => void }) {
  return (
    <div
      onClick={onPress}
      style={{
        borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
        border: '1px solid var(--chat-received-border)',
        boxShadow: isOwn ? 'var(--chat-own-shadow)' : 'var(--chat-received-shadow)',
        width: 'min(72vw, 300px)', height: 'min(72vw, 300px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--chat-media-bg)',
      }}
    >
      <TemporaryPinchZoom>
        <AuthenticatedImage
          src={rawSrc}
          alt="attachment"
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </TemporaryPinchZoom>
    </div>
  )
}

function GiphyMessage({ payload, isOwn, onPress }: { payload: ReturnType<typeof parseGiphySelection>; isOwn: boolean; onPress?: () => void }) {
  const [loading, setLoading] = React.useState(true)
  const [failed, setFailed] = React.useState(false)
  if (!payload) return null
  return (
    <div
      onClick={onPress}
      style={{
        maxWidth: 'min(72vw, 300px)', padding: 6, borderRadius: 14,
        background: isOwn ? 'var(--chat-own-bubble)' : 'var(--chat-received-bubble)',
        border: isOwn ? '1px solid var(--chat-own-border)' : '1px solid var(--chat-received-border)',
        cursor: onPress ? 'pointer' : 'default',
      }}
    >
      {failed ? (
        <span style={{ display: 'block', padding: '20px 16px', color: isOwn ? 'var(--chat-own-text)' : 'var(--chat-received-text)', fontSize: 13 }}>GIPHY media unavailable</span>
      ) : (
        <TemporaryPinchZoom>
          <div style={{ position: 'relative', minWidth: 120, minHeight: 76 }}>
            {loading && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--chat-text-muted)', fontSize: 12 }}>Loading…</span>}
            <img
              src={payload.renditionUrl}
              alt={payload.altText}
              loading="lazy"
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setFailed(true) }}
              style={{ display: 'block', width: '100%', maxWidth: 288, maxHeight: 260, objectFit: 'contain', borderRadius: 9, opacity: loading ? 0 : 1 }}
            />
          </div>
        </TemporaryPinchZoom>
      )}
      {payload.creatorName && (payload.creatorUrl ? (
        <a href={payload.creatorUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} style={{ display: 'block', margin: '5px 3px 0', color: isOwn ? 'var(--chat-own-meta)' : 'var(--chat-received-meta)', fontSize: 10, textDecoration: 'underline' }}>@{payload.creatorName} · GIPHY</a>
      ) : (
        <span style={{ display: 'block', margin: '5px 3px 0', color: isOwn ? 'var(--chat-own-meta)' : 'var(--chat-received-meta)', fontSize: 10 }}>@{payload.creatorName} · GIPHY</span>
      ))}
    </div>
  )
}

function VideoMessage({ src: rawSrc, isOwn }: { src: string; isOwn: boolean }) {
  return (
    <div style={{
      borderRadius: '14px', overflow: 'hidden',
      border: '1px solid var(--chat-received-border)',
      boxShadow: isOwn ? 'var(--chat-own-shadow)' : 'var(--chat-received-shadow)',
      width: 240, minHeight: 120, display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: 'var(--chat-media-bg)',
    }}>
      <TemporaryPinchZoom>
        <AuthenticatedVideo
          controls
          src={rawSrc}
          preload="metadata"
          style={{ display: 'block', width: '240px', minHeight: '120px', maxHeight: '240px', objectFit: 'contain' }}
        />
      </TemporaryPinchZoom>
    </div>
  )
}

// ── DateSeparator — shown between messages on different days ────────────────
export function DateSeparator({ date }: { date: string }) {
  const label = formatChatDateDivider(date)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px' }}>
       <div style={{ flex: 1, height: '1px', background: 'var(--chat-divider)' }} />
      <span style={{
        fontSize:      '11px',
        fontWeight:    600,
        color:         'var(--chat-text-muted)',
        padding:       '3px 10px',
        borderRadius:  '9999px',
        background:    'var(--chat-soft-surface)',
        border:        '1px solid var(--chat-divider)',
        whiteSpace:    'nowrap',
        fontFamily:    'var(--font-display)',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '1px', background: 'var(--chat-divider)' }} />
    </div>
  )
}

// ── MessageBubble ───────────────────────────────────────────────────────────
interface MessageBubbleProps {
  /** The full chat store message object */
  msg: Message
  isOwn: boolean
  showAvatar?: boolean
  isGrouped?: boolean
  isLastInGroup?: boolean
  /** Whether the other participant has read this message (shown as read receipt) */
  isRead?: boolean
  onLongPress?: (msg: Message) => void
  onTap?: (msg: Message) => void
  onReplyPress?: () => void
  onReplyNavigate?: (reply: ReplyTo) => void
  onImagePress?: (url: string | null) => void
  onCallJoin?: () => void
  callJoinable?: boolean
  senderTag?: string
  senderRole?: string
  onRetry?: (msg: Message) => void
}

export function MessageBubble({
  msg,
  isOwn,
  showAvatar = true,
  isGrouped = false,
  isLastInGroup = true,
  isRead,
  onLongPress,
  onTap,
  onReplyPress,
  onReplyNavigate,
  onImagePress,
  onCallJoin,
  callJoinable = false,
  senderTag,
  senderRole,
  onRetry,
}: MessageBubbleProps) {
  const navigate = useNavigate()
  const pressTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastTapRef   = React.useRef<number>(0)
  const suppressClickUntilRef = React.useRef(0)
  const gestureRef = React.useRef<{
    pointerId: number
    startX: number
    startY: number
    currentX: number
    intent: 'pending' | 'horizontal' | 'vertical'
    longPressFired: boolean
  } | null>(null)
  const [pressing, setPressing] = React.useState(false)
  const [swipeX, setSwipeX] = React.useState(0)
  const [swiping, setSwiping] = React.useState(false)

  function clearPress() {
    setPressing(false)
    clearTimeout(pressTimerRef.current)
  }

  function resetSwipe() {
    gestureRef.current = null
    setSwiping(false)
    setSwipeX(0)
    clearPress()
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest(MESSAGE_REPLY_SWIPE_IGNORE_SELECTOR)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: 0,
      intent: 'pending',
      longPressFired: false,
    }
    setPressing(true)
    pressTimerRef.current = setTimeout(() => {
      const gesture = gestureRef.current
      if (!gesture || gesture.pointerId !== event.pointerId || gesture.intent !== 'pending') return
      gesture.longPressFired = true
      suppressClickUntilRef.current = Date.now() + 450
      onLongPress?.(msg)
    }, 450)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    const replyDistance = getReplySwipeDistance(dx, isOwn)
    if (gesture.intent === 'pending') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return
      clearPress()
      if (Math.abs(dy) > Math.abs(dx) * 1.25 || replyDistance <= -10) {
        gesture.intent = 'vertical'
        setSwipeX(0)
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        return
      }
      // Do not permanently reject an inward swipe because of one ambiguous
      // diagonal sample. Wait for a clearly horizontal movement.
      if (replyDistance <= 0 || Math.abs(dx) < Math.abs(dy) * 0.9) return
      gesture.intent = 'horizontal'
      setSwiping(true)
    }
    if (gesture.intent !== 'horizontal') return
    event.preventDefault()
    gesture.currentX = Math.min(82, Math.max(0, replyDistance))
    setSwipeX(gesture.currentX)
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) {
      clearPress()
      return
    }
    const shouldReply = gesture.intent === 'horizontal' && gesture.currentX >= SWIPE_REPLY_THRESHOLD
    const consumedGesture = gesture.intent === 'horizontal' || gesture.longPressFired
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resetSwipe()
    if (consumedGesture) suppressClickUntilRef.current = Date.now() + 450
    if (shouldReply) {
      onReplyPress?.()
    }
  }

  /** Double-tap triggers reply (≤300 ms between taps) */
  function handleTap() {
    if (Date.now() < suppressClickUntilRef.current) return
    onTap?.(msg)
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      onReplyPress?.()
      lastTapRef.current = 0
    } else {
      lastTapRef.current = now
    }
  }

  // ── deleted message ───────────────────────────────────────────────────────
  if (msg.is_deleted) {
    return (
      <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', padding: '2px 12px' }}>
        <span style={{
          fontSize: '13px', color: 'var(--chat-text-muted)', fontStyle: 'italic',
          padding: '6px 12px', background: 'var(--chat-soft-surface)',
          border: '1px solid var(--chat-divider)', borderRadius: '12px',
        }}>
          Message deleted
        </span>
      </div>
    )
  }

  // ── system message ────────────────────────────────────────────────────────
  if (msg.type === 'system') {
    const callContent = msg.content || ''
    const isVideoCall = callContent.toLowerCase().includes('video')
    const isEnded = callContent.toLowerCase().includes('ended') || callContent.toLowerCase().includes('missed') || callContent.toLowerCase().includes('no answer')
    const isCall = callContent.toLowerCase().includes('call')
    if (isCall) {
      const title = isEnded
        ? `${isVideoCall ? 'Video' : 'Audio'} call ended`
        : `${isVideoCall ? 'Video' : 'Audio'} call`
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '3px 12px' }}>
          <div style={{
            boxSizing: 'border-box', width: 'min(100%, 220px)', padding: '9px 10px', borderRadius: '18px 18px 6px 18px',
            background: 'var(--chat-received-bubble)', border: '1px solid var(--chat-received-border)',
            boxShadow: 'var(--chat-received-shadow)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
                background: isEnded ? '#4B5563' : '#18D66B', color: '#fff', flexShrink: 0,
              }}>
                {isEnded ? <PhoneOff size={19} /> : isVideoCall ? <Video size={19} /> : <Phone size={20} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--chat-received-text)', fontSize: 14, lineHeight: 1.15, fontWeight: 800, whiteSpace: 'nowrap' }}>{title}</div>
                <div style={{ color: 'var(--chat-received-meta)', fontSize: 10, marginTop: 3 }}>{formatDeviceDate(parseApiDate(msg.created_at), { hour: 'numeric', minute: '2-digit' })}</div>
              </div>
            </div>
            {callJoinable && !isEnded && (
              <button onClick={(event) => { event.stopPropagation(); onCallJoin?.() }} style={{
                width: '100%', marginTop: 7, height: 34, border: 0, borderRadius: 9,
                 background: 'var(--chat-accent)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}>
                Join
              </button>
            )}
          </div>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 16px' }}>
        <span style={{
          fontSize: '12px', color: 'var(--chat-text-muted)',
          background: 'var(--chat-soft-surface)', padding: '4px 12px', borderRadius: '9999px',
          border: '1px solid var(--chat-divider)',
        }}>
           {msg.content?.includes('call') ? `☎ ${msg.content}` : msg.content}
        </span>
      </div>
    )
  }

  // Corner radius: flat corners where consecutive messages "stack", rounded elsewhere
  // Own (right-aligned): tail is top-right; grouped mid = flat top-right; single/last = rounded top-left
  // Received (left-aligned): tail is top-left; grouped mid = flat top-left; single/last = rounded top-right
  const bubbleRadius = isOwn
    ? (isGrouped && !isLastInGroup ? '18px 4px 4px 18px' : '18px 4px 18px 18px')
    : (isGrouped && !isLastInGroup ? '4px 18px 18px 4px' : '4px 18px 18px 18px')
  // ── Post-share payload (backward-compat with __POST_SHARE__:<json> format) ─
  let sharedPost = parseSharedPostPayload(msg.content)
  if (!sharedPost && (msg as any).shared_post) {
    sharedPost = (msg as any).shared_post
  }
  const sharedPostUrl = sharedPost?.postId ? `/app/post/${encodeURIComponent(sharedPost.postId)}` : undefined
  const isLegacyShare = msg.content?.startsWith('__POST_SHARE__:')
  const displayContent = sharedPost ? '' : isLegacyShare ? 'Shared post' : msg.content

  const isImage = msg.type === 'image' && msg.media_url
  const isVideo = msg.type === 'video' && msg.media_url
  const isAudio = msg.type === 'audio' && msg.media_url
  const isFile  = msg.type === 'file'  && msg.media_url
  const stickerPayload = msg.type === 'sticker' ? parseOpenMojiSticker(msg.content) : null
  const sticker = stickerPayload ? findOpenMojiSticker(stickerPayload.stickerId) : null
  const giphyPayload = (msg.type === 'gif' || msg.type === 'sticker') ? parseGiphySelection(msg.content) : null
  const isGiphyMedia = Boolean(giphyPayload)
  const isSticker = msg.type === 'sticker'
  const messageLinkUrl = !sharedPost && msg.type === 'text' ? findFirstUrl(displayContent) : null

  return (
    <div
      id={`msg-${msg.id}`}
      className="chat-message-swipe-row"
      style={{
        display: 'flex',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        alignItems: 'flex-end',
        gap: '8px',
        padding: `${isGrouped ? 2 : 4}px 12px`,
      }}
    >
      <div
          className={`chat-message-reply-indicator${isOwn ? ' own' : ''}${swipeX >= SWIPE_REPLY_THRESHOLD ? ' ready' : ''}`}
        aria-hidden="true"
          style={{ opacity: Math.min(1, swipeX / 42), transform: `translate3d(${isOwn ? -Math.min(22, swipeX / 3) : Math.min(22, swipeX / 3)}px, -50%, 0) scale(${0.78 + Math.min(0.22, swipeX / 250)})` }}
      >
        <Reply size={18} strokeWidth={2.4} />
      </div>
      {/* Avatar for received messages — shown at the last bubble in each group (showAvatar=true) */}
      {!isOwn && (
        <div style={{ width: 28, flexShrink: 0, alignSelf: 'flex-end' }}>
          {showAvatar && (
            <Avatar src={msg.avatar_url} name={msg.full_name} size={28} />
          )}
        </div>
      )}

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={resetSwipe}
        onLostPointerCapture={() => {
          if (gestureRef.current?.intent === 'horizontal') resetSwipe()
        }}
        onClick={handleTap}
        className={`chat-message-swipe-surface${swiping ? ' swiping' : ''}`}
        style={{
          maxWidth: '78%', display: 'flex', flexDirection: 'column',
          alignItems: isOwn ? 'flex-end' : 'flex-start', gap: '2px',
          transform: `translate3d(${isOwn ? -swipeX : swipeX}px, 0, 0) scale(${pressing ? 0.97 : 1})`,
        }}
      >
        {/* Group sender label and optional role/custom tag */}
        {senderTag && (
          <span style={{ alignSelf: isOwn ? 'flex-end' : 'flex-start', fontSize: '10px', color: senderRole === 'owner' ? 'var(--color-lime)' : '#D4D4D8', fontWeight: 700, marginLeft: 4, marginBottom: 1 }}>
            {senderTag}
          </span>
        )}

        {/* Reply preview */}
        {msg.reply_to && (
          <div
            role="button"
            tabIndex={0}
            data-chat-reply-reference
            aria-label={`View original message from ${msg.reply_to.full_name}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onReplyNavigate?.(msg.reply_to!)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              event.stopPropagation()
              onReplyNavigate?.(msg.reply_to!)
            }}
            style={{
            padding: '6px 10px',
             background: 'var(--chat-soft-surface)',
            backdropFilter: 'blur(8px)',
             border: '1px solid var(--chat-divider)',
             borderLeft: '3px solid var(--chat-accent)',
            borderRadius: '10px',
            marginBottom: '2px',
            maxWidth: '100%',
            cursor: 'pointer',
          }}>
            {parseSharedPostPayload(msg.reply_to.content) ? (
              <SharedPostReplyPreview content={msg.reply_to.content} fallbackAuthor={msg.reply_to.full_name} />
            ) : (
              <>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: 'var(--chat-text-secondary)', marginBottom: '1px' }}>
                  {msg.reply_to.full_name}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--chat-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                  {msg.reply_to.content ?? '📎 Attachment'}
                </p>
              </>
            )}
          </div>
        )}

        {/* Shared post card — handles both server shared_post shape and __POST_SHARE__ legacy format */}
        {sharedPost && (
          <SharedPostCard
            sharedPost={sharedPost}
            sharedPostUrl={sharedPostUrl}
            onNavigate={() => sharedPostUrl && navigate(sharedPostUrl)}
            isOwn={isOwn}
            isRead={isRead}
            msg={msg}
            bubbleRadius={bubbleRadius}
            onRetry={onRetry}
          />
        )}

        {/* Image message */}
        {isImage && (
          <ImageMessage src={msg.media_url!} isOwn={isOwn} onPress={() => onImagePress?.(msg.media_url!)} />
        )}

        {/* Video message */}
        {isVideo && (
          <VideoMessage src={msg.media_url!} isOwn={isOwn} />
        )}

        {/* Audio message */}
        {isAudio && (
          <AudioMessagePlayer src={msg.media_url!} isOwn={isOwn} />
        )}

        {/* File message */}
        {isFile && (
          <AuthenticatedFileLink
            src={msg.media_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', borderRadius: bubbleRadius,
              background: isOwn ? 'var(--chat-own-bubble)' : 'var(--chat-received-bubble)',
              backdropFilter: isOwn ? 'none' : 'blur(12px)',
              border: isOwn ? '1px solid var(--chat-own-border)' : '1px solid var(--chat-received-border)',
              color: isOwn ? 'var(--chat-own-text)' : 'var(--chat-received-text)',
              textDecoration: 'none', fontSize: '13px', fontWeight: 600,
            }}
          >
            📎 {msg.media_url?.split('/').pop() ?? 'File'}
          </AuthenticatedFileLink>
        )}

        {isSticker && giphyPayload && (
          <GiphyMessage payload={giphyPayload} isOwn={isOwn} />
        )}

        {isSticker && !giphyPayload && (
          <div style={{ maxWidth: 144, padding: 8, borderRadius: bubbleRadius, background: isOwn ? 'var(--chat-own-bubble)' : 'var(--chat-received-bubble)', border: isOwn ? '1px solid var(--chat-own-border)' : '1px solid var(--chat-received-border)' }}>
            {sticker ? <>
              <img src={openMojiAssetUrl(sticker.id)} alt={sticker.name} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.removeAttribute('hidden') }} style={{ display: 'block', width: 120, height: 120, objectFit: 'contain' }} />
              <span hidden style={{ fontSize: 72, lineHeight: 1 }} aria-label={`${sticker.name} sticker`}>{sticker.emoji}</span>
            </> : <span style={{ display: 'block', padding: '14px 10px', color: isOwn ? 'var(--chat-own-text)' : 'var(--chat-received-text)', fontSize: 13 }}>✨ Sticker</span>}
          </div>
        )}

        {msg.type === 'gif' && giphyPayload && (
          <GiphyMessage payload={giphyPayload} isOwn={isOwn} onPress={() => onImagePress?.(giphyPayload.renditionUrl)} />
        )}

        {/* Text bubble */}
        {!sharedPost && !isSticker && !isGiphyMedia && (msg.type === 'text' || msg.type === 'gif' || (!isImage && !isAudio && !isFile && displayContent)) && (
          <div style={{
            padding: '9px 14px 8px',
            borderRadius: bubbleRadius,
            background: isOwn
              ? 'var(--chat-own-bubble)'
              : 'var(--chat-received-bubble)',
            backdropFilter: isOwn ? 'none' : 'blur(12px) saturate(1.4)',
            WebkitBackdropFilter: isOwn ? 'none' : 'blur(12px) saturate(1.4)',
            border: isOwn
              ? '1px solid var(--chat-own-border)'
              : '1px solid var(--chat-received-border)',
            boxShadow: isOwn
              ? 'var(--chat-own-shadow)'
              : 'var(--chat-received-shadow)',
            maxWidth: '100%',
            opacity: msg.is_pending ? 0.65 : 1,
          }}>
            {msg.type === 'gif' && msg.media_url ? (
              <TemporaryPinchZoom>
                <AuthenticatedImage
                  src={msg.media_url}
                  alt="gif"
                  style={{ display: 'block', maxWidth: '200px', borderRadius: '8px' }}
                  placeholderStyle={{ width: 200, minHeight: 110, borderRadius: '8px' }}
                />
              </TemporaryPinchZoom>
            ) : (
              <>
                <p style={{
                  margin: '0 0 3px', fontSize: '15px', lineHeight: '1.50',
                  color: isOwn ? 'var(--chat-own-text)' : 'var(--chat-received-text)',
                  wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                }}>
                  <TextWithLinks text={displayContent || ''} color={isOwn ? 'var(--chat-own-text)' : 'var(--chat-received-text)'} />
                </p>
                {messageLinkUrl && <LinkPreviewCard url={messageLinkUrl} isOwn={isOwn} />}
              </>
            )}
            {/* Timestamp + read receipt + edited — rendered inside the bubble, bottom-right */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px',
              marginTop: '1px',
            }}>
              {!!msg.is_edited && (
                <span style={{ fontSize: '10px', color: isOwn ? 'var(--chat-own-meta)' : 'var(--chat-received-meta)', fontStyle: 'italic' }}>edited</span>
              )}
              <TimeAgo date={msg.created_at} mode="clock" style={{ fontSize: '10px', color: isOwn ? 'var(--chat-own-meta)' : 'var(--chat-received-meta)' }} />
              {isOwn && msg.is_failed && (
                <span
                  onClick={(e) => { e.stopPropagation(); onRetry?.(msg) }}
                  role="button"
                  style={{ fontSize: '10px', fontWeight: 700, color: '#FFD9D9', lineHeight: 1, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Not sent · Retry
                </span>
              )}
              {isOwn && !msg.is_failed && (
                <span style={{ fontSize: '11px', color: isRead ? 'var(--chat-own-text)' : 'var(--chat-own-meta)', lineHeight: 1 }}>
                  {isRead ? '✓✓' : msg.is_pending ? '○' : '✓'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Reactions */}
        {msg.reactions && msg.reactions.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
            {msg.reactions.map((r) => {
              const reactionArtwork = OPENMOJI_EMOJIS.find((asset) => asset.emoji === r.emoji)
              return (
              <div key={r.emoji} style={{
                display: 'flex', alignItems: 'center', gap: '3px',
                padding: '3px 8px', borderRadius: '9999px',
                background: 'var(--chat-accent-soft)',
                border: '1px solid var(--chat-accent-border)',
                fontSize: '12px', cursor: 'pointer',
              }}>
                {reactionArtwork ? <>
                  <img src={openMojiAssetUrl(reactionArtwork.id)} alt={r.emoji} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.removeAttribute('hidden') }} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                  <span hidden>{r.emoji}</span>
                </> : <span>{r.emoji}</span>}
                <span style={{ color: 'var(--chat-text-secondary)', fontWeight: 600 }}>{r.count}</span>
              </div>
              )
            })}
          </div>
        )}

        {/* Timestamp + read receipt + edited — only for bubble types that don't already render it inline (image/video/audio/file) */}
        {!sharedPost && (isGiphyMedia || !(msg.type === 'text' || msg.type === 'gif' || (!isImage && !isAudio && !isFile && displayContent))) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            paddingLeft: isOwn ? 0 : '2px', paddingRight: isOwn ? '2px' : 0,
          }}>
            {!!msg.is_edited && (
              <span style={{ fontSize: '10px', color: 'var(--chat-text-muted)', fontStyle: 'italic' }}>edited</span>
            )}
            <TimeAgo date={msg.created_at} mode="clock" style={{ fontSize: '10px', color: 'var(--chat-text-muted)' }} />
            {isOwn && msg.is_failed && (
              <span
                onClick={(e) => { e.stopPropagation(); onRetry?.(msg) }}
                role="button"
                style={{ fontSize: '10px', fontWeight: 700, color: '#FFD9D9', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Not sent · Retry
              </span>
            )}
            {isOwn && !msg.is_failed && (
              <span style={{ fontSize: '10px', color: isRead ? 'var(--chat-accent)' : 'var(--chat-text-muted)' }}>
                {isRead ? '✓✓' : msg.is_pending ? '○' : '✓'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
