import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, ChevronRight, Clapperboard, ImagePlus, MapPin, Play, Sparkles, Users, Volume2, VolumeX, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { clipsApi } from '../../api/clips'
import { postsApi } from '../../api/posts'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { AlertDialog } from '../../components/shared/AlertDialog'
import { mediaUploadError, VIDEO_MAX_DURATION_SECONDS } from '../../utils/mediaUploadPolicy'

type Stage = 'library' | 'edit' | 'details'
type PreviewStatus = 'loading' | 'ready' | 'unavailable'

const makeKey = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function ClipCreateScreen() {
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const aborter = useRef<AbortController | null>(null)
  const normalizingRef = useRef(false)
  const normalizationAttemptedRef = useRef(false)
  const selectionRef = useRef(0)
  const [stage, setStage] = useState<Stage>('library')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const [caption, setCaption] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'college'>('public')
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [previewMuted, setPreviewMuted] = useState(false)
  const [previewPaused, setPreviewPaused] = useState(false)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 })
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('loading')
  const [normalizing, setNormalizing] = useState(false)
  const preview = useRef<HTMLVideoElement>(null)

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
    aborter.current?.abort()
  }, [url])

  const openPicker = () => {
    if (input.current) {
      input.current.value = ''
      input.current.click()
    }
  }

  const select = async (chosen: File) => {
    if (chosen.type && !chosen.type.startsWith('video/')) {
      setSelectionError('Choose an MP4, MOV, or WebM video.')
      return
    }
    const validationError = await mediaUploadError(chosen, 'video')
    if (validationError) {
      setSelectionError(validationError)
      return
    }
    if (url) URL.revokeObjectURL(url)
    selectionRef.current += 1
    setFile(chosen)
    setUrl(URL.createObjectURL(chosen))
    setKey(makeKey())
    setError(null)
    setPercent(null)
    setPreviewPaused(false)
    setPreviewMuted(false)
    setPreviewZoom(1)
    setPreviewPosition({ x: 0, y: 0 })
    setPreviewStatus('loading')
    normalizingRef.current = false
    normalizationAttemptedRef.current = false
    setNormalizing(false)
    setStage('edit')
  }

  const normalizeUnsupportedVideo = async () => {
    if (!file || normalizingRef.current) return
    if (normalizationAttemptedRef.current) {
      setPreviewStatus('unavailable')
      setError('This video cannot be previewed. Choose another video.')
      return
    }
    normalizationAttemptedRef.current = true
    const selection = selectionRef.current
    normalizingRef.current = true
    setNormalizing(true)
    setPreviewStatus('loading')
    setError(null)
    try {
      const sourceError = await mediaUploadError(file, 'video')
      if (sourceError) throw new Error(sourceError)
      const response = await postsApi.prepareGlimpseVideo(file)
      const blob = response.data
      if (!(blob instanceof Blob) || blob.size <= 0 || !blob.type.startsWith('video/')) {
        throw new Error('The prepared video was empty or invalid.')
      }
      if (selection !== selectionRef.current) return
      const normalized = new File([blob], 'clip.mp4', { type: 'video/mp4' })
      const normalizedError = await mediaUploadError(normalized, 'video')
      if (normalizedError) throw new Error(normalizedError)
      setFile(normalized)
      setUrl(URL.createObjectURL(normalized))
      setPreviewStatus('loading')
      setPreviewPaused(false)
    } catch (cause: any) {
      if (selection !== selectionRef.current) return
      setPreviewStatus('unavailable')
      let message = cause?.response?.data?.error || cause?.message
      if (cause?.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await cause.response.data.text())
          message = payload?.error || message
        } catch {
          // Preserve the normal preparation error when the response isn't JSON.
        }
      }
      setError(message || 'This video cannot be prepared. Choose another video.')
    } finally {
      if (selection === selectionRef.current) {
        normalizingRef.current = false
        setNormalizing(false)
      }
    }
  }

  const clearVideo = () => {
    if (url) URL.revokeObjectURL(url)
    setFile(null)
    setUrl(null)
    setKey('')
    setError(null)
    setPreviewStatus('loading')
    normalizingRef.current = false
    normalizationAttemptedRef.current = false
    setNormalizing(false)
    setStage('library')
  }

  useBackDismiss(stage === 'edit', clearVideo, 150)
  useBackDismiss(stage === 'details', () => setStage('edit'), 160)

  const togglePreview = () => {
    const video = preview.current
    if (!video) return
    if (previewPaused) {
      void video.play().then(() => setPreviewPaused(false))
    } else {
      video.pause()
      setPreviewPaused(true)
    }
  }

  const startPreview = () => {
    const video = preview.current
    if (!video) return
    video.muted = previewMuted
    video.defaultMuted = previewMuted
    if (previewMuted) video.setAttribute('muted', '')
    else video.removeAttribute('muted')
    video.volume = 1
    void video.play()
      .then(() => setPreviewPaused(false))
      .catch(() => setPreviewPaused(true))
  }

  const togglePreviewMute = () => {
    const video = preview.current
    const nextMuted = !previewMuted
    setPreviewMuted(nextMuted)
    if (!video) return
    video.muted = nextMuted
    video.defaultMuted = nextMuted
    if (nextMuted) video.setAttribute('muted', '')
    else video.removeAttribute('muted')
    video.volume = nextMuted ? 0 : 1
    void video.play()
      .then(() => setPreviewPaused(false))
      .catch(() => setPreviewPaused(true))
  }

  async function publish() {
    if (!file || !key) return
    const validationError = await mediaUploadError(file, 'video')
    if (validationError) {
      setError(validationError)
      return
    }
    aborter.current = new AbortController()
    setPercent(0)
    setError(null)
    try {
      const result = await clipsApi.create(file, { caption, visibility, idempotency_key: key }, {
        signal: aborter.current.signal,
        onUploadProgress: e => setPercent(e.total ? Math.round((e.loaded / e.total) * 100) : null),
      })
      setPercent(null)
      toast.success('Clip published')
      navigate(`/app/clips/${result.data.data.id}`, { replace: true })
    } catch (e: any) {
      if (e?.code !== 'ERR_CANCELED') setError(e?.response?.data?.error || 'Upload failed. Your Clip is ready to retry.')
      setPercent(null)
    }
  }

  return (
    <main style={page}>
      <input ref={input} type="file" accept="video/*" hidden onChange={e => { const chosen = e.currentTarget.files?.[0]; if (chosen) void select(chosen); e.currentTarget.value = '' }} />
      <AlertDialog message={selectionError} onClose={() => setSelectionError(null)} />
      {stage === 'library' && (
        <LibraryStage onBack={requestAppBack} onPick={openPicker} />
      )}
      {stage === 'edit' && url && (
        <EditStage
          url={url}
          muted={previewMuted}
          paused={previewPaused}
           zoom={previewZoom}
           position={previewPosition}
          preview={preview}
          onBack={requestAppBack}
           onToggleMute={togglePreviewMute}
          onTogglePlay={togglePreview}
           onZoomChange={setPreviewZoom}
           onPositionChange={setPreviewPosition}
          onChange={openPicker}
          onContinue={() => setStage('details')}
          onPlaying={() => setPreviewPaused(false)}
          previewStatus={previewStatus}
          normalizing={normalizing}
          error={error}
           onPreviewReady={() => {
             setPreviewStatus('ready')
             startPreview()
           }}
          onPreviewError={() => void normalizeUnsupportedVideo()}
        />
      )}
      {stage === 'details' && url && (
        <DetailsStage
          url={url}
          file={file}
          caption={caption}
          visibility={visibility}
          percent={percent}
          error={error}
          onBack={requestAppBack}
          onCaptionChange={setCaption}
          onVisibilityChange={setVisibility}
          onChange={openPicker}
          onPublish={() => void publish()}
          onCancelUpload={() => aborter.current?.abort()}
        />
      )}
    </main>
  )
}

function Header({title, onBack, close = false}: {title: string; onBack: () => void; close?: boolean}) {
  return (
    <header style={header}>
      <button aria-label={close ? 'Close' : 'Back'} onClick={onBack} style={headerIcon}>
        {close ? <X size={22} /> : <ArrowLeft size={21} />}
      </button>
      <h1 style={headerTitle}>{title}</h1>
      <span style={{ width: 40 }} />
    </header>
  )
}

function LibraryStage({onBack, onPick}: {onBack: () => void; onPick: () => void}) {
  return (
    <>
      <Header title="Create Clip" onBack={onBack} close />
      <section style={libraryContent}>
        <div style={libraryTopline}>
          <div>
            <p style={eyebrow}>CAMPNECT STUDIO</p>
            <h2 style={sectionTitle}>Bring a moment to life</h2>
            <p style={sectionCopy}>Choose a vertical video from your device to start creating.</p>
          </div>
          <span style={studioMark}><Sparkles size={19} /></span>
        </div>
        <button onClick={onPick} style={mediaPicker}>
          <span style={pickerIcon}><ImagePlus size={28} /></span>
          <span>
            <strong style={pickerTitle}>Choose from gallery</strong>
            <small style={pickerCopy}>MP4, MOV, or WebM · up to {VIDEO_MAX_DURATION_SECONDS} seconds</small>
          </span>
          <ChevronRight size={20} style={{ marginLeft: 'auto', opacity: .6 }} />
        </button>
      </section>
    </>
  )
}

function EditStage({
  url, muted, paused, zoom, position, preview, previewStatus, normalizing, error,
  onBack, onToggleMute, onTogglePlay, onZoomChange, onPositionChange, onChange, onContinue, onPlaying, onPreviewReady, onPreviewError,
}: {
  url: string
  muted: boolean
  paused: boolean
  zoom: number
  position: { x: number; y: number }
  preview: React.RefObject<HTMLVideoElement | null>
  previewStatus: PreviewStatus
  normalizing: boolean
  error: string | null
  onBack: () => void
  onToggleMute: () => void
  onTogglePlay: () => void
  onZoomChange: (zoom: number) => void
  onPositionChange: (position: { x: number; y: number }) => void
  onChange: () => void
  onContinue: () => void
  onPlaying: () => void
  onPreviewReady: () => void
  onPreviewError: () => void
}) {
  const pinch = useRef(new Map<number, { x: number; y: number }>())
  const pinchStartDistance = useRef(0)
  const pinchStartZoom = useRef(zoom)
  const dragStart = useRef<{ x: number; y: number; position: { x: number; y: number } } | null>(null)
  const clampZoom = (value: number) => Math.min(3, Math.max(1, value))
  const clampPosition = (next: { x: number; y: number }, frame: HTMLDivElement) => {
    const bounds = frame.getBoundingClientRect()
    const maxX = (bounds.width * (zoom - 1)) / 2
    const maxY = (bounds.height * (zoom - 1)) / 2
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    }
  }

  const updatePinch = () => {
    const points = [...pinch.current.values()]
    if (points.length !== 2 || pinchStartDistance.current <= 0) return
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
    onZoomChange(clampZoom(pinchStartZoom.current * (distance / pinchStartDistance.current)))
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pinch.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)
    if (pinch.current.size === 1) {
      dragStart.current = { x: event.clientX, y: event.clientY, position }
    }
    if (pinch.current.size === 2) {
      const points = [...pinch.current.values()]
      pinchStartDistance.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      pinchStartZoom.current = zoom
      dragStart.current = null
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pinch.current.has(event.pointerId)) return
    pinch.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinch.current.size === 2) {
      updatePinch()
      return
    }
    if (pinch.current.size === 1 && dragStart.current) {
      onPositionChange(clampPosition({
        x: dragStart.current.position.x + event.clientX - dragStart.current.x,
        y: dragStart.current.position.y + event.clientY - dragStart.current.y,
      }, event.currentTarget))
    }
  }

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pinch.current.delete(event.pointerId)
    if (pinch.current.size < 2) {
      pinchStartDistance.current = 0
      const remaining = [...pinch.current.values()][0]
      if (remaining) dragStart.current = { x: remaining.x, y: remaining.y, position }
      else dragStart.current = null
    }
  }

  return (
    <section style={immersiveEditor}>
      <div
        style={videoFrame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
          {previewStatus !== 'ready' && (
            <ClipPreviewSkeleton
              unavailable={previewStatus === 'unavailable'}
              label={previewStatus === 'unavailable' ? (error || 'Video unavailable') : (normalizing ? 'Preparing video…' : 'Loading preview…')}
            />
          )}
          <video
            ref={preview}
            src={url}
            autoPlay
            muted={muted}
            playsInline
            loop
            onPlaying={onPlaying}
            onCanPlay={onPreviewReady}
            onLoadedData={onPreviewReady}
            onError={onPreviewError}
            onClick={onTogglePlay}
            style={{ ...videoPreview, opacity: previewStatus === 'ready' ? 1 : 0, transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})` }}
          />
          {previewStatus === 'ready' && <div style={videoShade} />}
          <span style={previewBadge}>Preview</span>
          {previewStatus === 'ready' && <button
            type="button"
            aria-label={muted ? 'Unmute preview' : 'Mute preview'}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation()
              onToggleMute()
            }}
            style={previewSound}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>}
          {previewStatus === 'ready' && paused && <button aria-label="Play preview" onClick={onTogglePlay} style={previewPlay}><Play size={27} fill="currentColor" /></button>}
        <header style={immersiveHeader}>
          <span aria-hidden="true" />
          <h1 style={immersiveHeaderTitle}>Edit Clip</h1>
          <button aria-label="Change video" onClick={onChange} style={immersiveTextButton}>Change</button>
        </header>
      </div>
      <footer style={immersiveFooter}>
        <button onClick={onBack} style={footerSecondary}>Back</button>
        <button onClick={onContinue} disabled={previewStatus !== 'ready'} style={{ ...footerPrimary, opacity: previewStatus === 'ready' ? 1 : .55 }}>Continue <ChevronRight size={18} /></button>
      </footer>
    </section>
  )
}

function ClipPreviewSkeleton({ unavailable, label }: { unavailable?: boolean; label: string }) {
  return (
    <div style={previewSkeleton} role="status" aria-live="polite">
      <span style={previewSkeletonIcon}><Clapperboard size={27} strokeWidth={1.7} /></span>
      {!unavailable && <span style={previewSkeletonBar} />}
      <span style={previewSkeletonLabel}>{label}</span>
    </div>
  )
}

function DetailsStage({
  url, file, caption, visibility, percent, error, onBack, onCaptionChange, onVisibilityChange, onChange, onPublish, onCancelUpload,
}: {
  url: string
  file: File | null
  caption: string
  visibility: 'public' | 'friends' | 'college'
  percent: number | null
  error: string | null
  onBack: () => void
  onCaptionChange: (value: string) => void
  onVisibilityChange: (value: 'public' | 'friends' | 'college') => void
  onChange: () => void
  onPublish: () => void
  onCancelUpload: () => void
}) {
  return (
    <>
      <Header title="New Clip" onBack={onBack} />
      <section style={detailsContent}>
        <div style={detailsPreview}>
          <ClipDetailsVideo url={url} />
          <span style={detailsBadge}>Your preview</span>
          <button onClick={onChange} style={detailsChange}>Change</button>
        </div>
        <div style={captionBlock}>
          <label htmlFor="clip-caption" style={fieldLabel}>Caption</label>
          <textarea
            id="clip-caption"
            value={caption}
            onChange={e => onCaptionChange(e.target.value)}
            maxLength={5000}
            rows={3}
            placeholder="Add something to the moment…"
            style={textarea}
          />
          <span style={characterCount}>{caption.length}/5000</span>
        </div>
        <div style={quickActions}>
          <span style={quickAction}><Users size={16} /> Tag people</span>
          <span style={quickAction}><MapPin size={16} /> Add place</span>
        </div>
        <div style={settingRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={settingIcon}><Clapperboard size={17} /></span>
            <span><strong style={{ display: 'block', fontSize: 14 }}>Who can watch</strong><small style={{ color: 'var(--color-text-secondary)' }}>{file?.name || 'Your campus'}</small></span>
          </div>
          <select value={visibility} onChange={e => onVisibilityChange(e.target.value as typeof visibility)} style={visibilitySelect} aria-label="Clip visibility">
            <option value="public">Everyone</option>
            <option value="friends">Friends</option>
            <option value="college">College</option>
          </select>
        </div>
        {error && <p role="alert" style={errorText}>{error}</p>}
        {percent !== null && (
          <div style={progressWrap}>
            <div style={progressTrack}><span style={{ ...progressBar, width: `${percent}%` }} /></div>
            <span>{percent < 100 ? `Uploading ${percent}%` : 'Processing your Clip…'}</span>
            <button onClick={onCancelUpload} style={cancelUpload}>Cancel</button>
          </div>
        )}
      </section>
      <footer style={creatorFooter}>
        <button onClick={onBack} disabled={percent !== null} style={footerSecondary}>Back</button>
        <button onClick={onPublish} disabled={percent !== null} style={footerPrimary}>{percent === null ? 'Publish Clip' : 'Publishing…'}</button>
      </footer>
    </>
  )
}

function ClipDetailsVideo({ url }: { url: string }) {
  const [ready, setReady] = useState(false)
  return (
    <>
      {!ready && <ClipPreviewSkeleton label="Loading preview…" />}
      <video
        src={url}
        muted
        playsInline
        loop
        autoPlay
        onCanPlay={() => setReady(true)}
        onLoadedData={() => setReady(true)}
        onError={() => setReady(false)}
        style={{ ...detailsVideo, opacity: ready ? 1 : 0 }}
      />
    </>
  )
}

const page: CSSProperties = {
  minHeight: '100%',
  background: 'var(--color-bg)',
  color: 'var(--color-text-primary)',
  paddingBottom: 'max(88px, calc(24px + env(safe-area-inset-bottom)))',
  boxSizing: 'border-box',
}
const header: CSSProperties = {
  height: 64,
  padding: 'max(10px, env(safe-area-inset-top)) 16px 0',
  display: 'grid',
  gridTemplateColumns: '40px 1fr 40px',
  alignItems: 'center',
  boxSizing: 'border-box',
}
const headerIcon: CSSProperties = {
  width: 40, height: 40, border: '1px solid var(--color-border)', borderRadius: 20, background: 'var(--color-surface-hover)',
  color: 'var(--color-text-primary)', display: 'grid', placeItems: 'center', cursor: 'pointer',
}
const headerTitle: CSSProperties = { margin: 0, textAlign: 'center', fontSize: 18, fontWeight: 800, letterSpacing: '-.2px' }
const libraryContent: CSSProperties = { padding: '54px 18px 24px', maxWidth: 480, margin: '0 auto' }
const libraryTopline: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }
const eyebrow: CSSProperties = { margin: '0 0 9px', color: 'var(--color-text-accent)', fontSize: 11, fontWeight: 800, letterSpacing: '.16em' }
const sectionTitle: CSSProperties = { margin: 0, fontSize: 28, lineHeight: 1.12, letterSpacing: '-.8px' }
const sectionCopy: CSSProperties = { margin: '10px 0 0', color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.55 }
const studioMark: CSSProperties = { width: 42, height: 42, borderRadius: 15, display: 'grid', placeItems: 'center', color: 'var(--color-text-accent)', background: 'var(--color-lime-dim)', border: '1px solid var(--color-border-strong)', flexShrink: 0 }
const mediaPicker: CSSProperties = { width: '100%', marginTop: 34, padding: 18, display: 'flex', alignItems: 'center', gap: 13, textAlign: 'left', color: 'var(--color-text-primary)', background: 'var(--color-surface-hover)', border: '1px solid var(--color-border-strong)', borderRadius: 18, cursor: 'pointer', boxShadow: 'var(--shadow-card)' }
const pickerIcon: CSSProperties = { width: 48, height: 48, borderRadius: 15, display: 'grid', placeItems: 'center', color: 'var(--color-text-accent)', background: 'var(--color-lime-dim)' }
const pickerTitle: CSSProperties = { display: 'block', fontSize: 15 }
const pickerCopy: CSSProperties = { display: 'block', marginTop: 4, color: 'var(--color-text-secondary)', fontSize: 12 }
const immersiveEditor: CSSProperties = { position: 'fixed', inset: 0, zIndex: 30, overflow: 'hidden', color: '#FFFFFF', background: '#050505', touchAction: 'none' }
const videoFrame: CSSProperties = { position: 'absolute', inset: 0, overflow: 'hidden', background: '#050505' }
const videoPreview: CSSProperties = { position: 'absolute', inset: 0, zIndex: 1, width: '100%', height: '100%', objectFit: 'cover', transformOrigin: 'center', transition: 'opacity 160ms ease, transform 120ms ease' }
const previewSkeleton: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 13, padding: 28, boxSizing: 'border-box', color: 'var(--color-text-secondary)', background: 'linear-gradient(145deg,var(--color-surface-hover),var(--color-surface))' }
const previewSkeletonIcon: CSSProperties = { width: 58, height: 58, display: 'grid', placeItems: 'center', borderRadius: 18, color: 'var(--color-text-muted)', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }
const previewSkeletonBar: CSSProperties = { width: 112, height: 8, overflow: 'hidden', borderRadius: 999, background: 'linear-gradient(90deg,var(--color-border),var(--color-surface-hover),var(--color-border))', backgroundSize: '200% 100%', animation: 'shimmer 1.35s linear infinite' }
const previewSkeletonLabel: CSSProperties = { maxWidth: 220, textAlign: 'center', fontSize: 12, fontWeight: 700, lineHeight: 1.45 }
const videoShade: CSSProperties = { position: 'absolute', zIndex: 2, inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg,rgba(0,0,0,.35),transparent 38%,rgba(0,0,0,.65))' }
const previewBadge: CSSProperties = { position: 'absolute', zIndex: 3, top: 86, left: 16, padding: '8px 13px', borderRadius: 10, background: 'rgba(30,31,34,.75)', backdropFilter: 'blur(10px)', fontSize: 14, fontWeight: 800 }
const previewSound: CSSProperties = { position: 'absolute', zIndex: 4, top: 88, right: 16, width: 42, height: 42, border: '1px solid rgba(255,255,255,.2)', borderRadius: 21, display: 'grid', placeItems: 'center', color: '#FFFFFF', background: 'rgba(0,0,0,.55)', cursor: 'pointer' }
const previewPlay: CSSProperties = { position: 'absolute', zIndex: 4, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 64, height: 64, border: 0, borderRadius: 32, display: 'grid', placeItems: 'center', color: '#FFFFFF', background: 'rgba(25,27,32,.78)', cursor: 'pointer' }
const immersiveHeader: CSSProperties = { position: 'absolute', zIndex: 3, top: 0, left: 0, right: 0, height: 72, padding: 'max(10px, env(safe-area-inset-top)) 16px 0', display: 'grid', gridTemplateColumns: '42px 1fr 64px', alignItems: 'center', boxSizing: 'border-box', background: 'linear-gradient(180deg,rgba(0,0,0,.6),transparent)' }
const immersiveHeaderTitle: CSSProperties = { margin: 0, textAlign: 'center', color: '#FFFFFF', fontSize: 18, fontWeight: 800 }
const immersiveTextButton: CSSProperties = { justifySelf: 'end', border: 0, color: '#FFFFFF', background: 'transparent', fontSize: 13, fontWeight: 800, cursor: 'pointer' }
const creatorFooter: CSSProperties = { position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', gap: 10, padding: '12px 18px max(14px, env(safe-area-inset-bottom))', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', backdropFilter: 'blur(18px)', zIndex: 5 }
const immersiveFooter: CSSProperties = { ...creatorFooter, zIndex: 4, background: 'linear-gradient(0deg,rgba(0,0,0,.82),rgba(0,0,0,.48))', borderTop: '1px solid rgba(255,255,255,.14)' }
const footerSecondary: CSSProperties = { flex: 1, padding: '14px 16px', border: '1px solid var(--color-border-strong)', borderRadius: 14, color: 'var(--color-text-primary)', background: 'var(--color-surface-hover)', fontSize: 14, fontWeight: 800, cursor: 'pointer' }
const footerPrimary: CSSProperties = { flex: 1.45, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px 16px', border: 0, borderRadius: 14, color: 'var(--color-accent-contrast)', background: 'var(--color-lime)', fontSize: 14, fontWeight: 900, cursor: 'pointer' }
const detailsContent: CSSProperties = { maxWidth: 480, margin: '0 auto', padding: '18px 18px 28px' }
const detailsPreview: CSSProperties = { position: 'relative', width: 128, height: 190, margin: '0 auto 30px', overflow: 'hidden', borderRadius: 20, background: 'var(--color-surface-hover)', boxShadow: 'var(--shadow-card)' }
const detailsVideo: CSSProperties = { position: 'relative', zIndex: 1, width: '100%', height: '100%', objectFit: 'cover', transition: 'opacity 160ms ease' }
const detailsBadge: CSSProperties = { position: 'absolute', top: 10, left: 10, padding: '6px 8px', borderRadius: 8, color: '#FFFFFF', background: 'rgba(20,21,24,.75)', fontSize: 10, fontWeight: 800 }
const detailsChange: CSSProperties = { position: 'absolute', bottom: 10, left: 10, padding: '7px 9px', border: 0, borderRadius: 8, color: '#FFFFFF', background: 'rgba(20,21,24,.75)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }
const captionBlock: CSSProperties = { borderBottom: '1px solid var(--color-border)', paddingBottom: 16 }
const fieldLabel: CSSProperties = { display: 'block', marginBottom: 9, color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em' }
const textarea: CSSProperties = { width: '100%', boxSizing: 'border-box', resize: 'none', padding: 0, border: 0, outline: 0, color: 'var(--color-text-primary)', background: 'transparent', font: 'inherit', fontSize: 18, lineHeight: 1.45 }
const characterCount: CSSProperties = { display: 'block', marginTop: 6, color: 'var(--color-text-muted)', fontSize: 11, textAlign: 'right' }
const quickActions: CSSProperties = { display: 'flex', gap: 8, margin: '18px 0', overflowX: 'auto' }
const quickAction: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '9px 11px', borderRadius: 10, color: 'var(--color-text-primary)', background: 'var(--color-surface-hover)', fontSize: 12, fontWeight: 700 }
const settingRow: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 0', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }
const settingIcon: CSSProperties = { width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', color: 'var(--color-text-accent)', background: 'var(--color-lime-dim)' }
const visibilitySelect: CSSProperties = { maxWidth: 110, padding: '9px 8px', border: '1px solid var(--color-border-strong)', borderRadius: 10, color: 'var(--color-text-primary)', background: 'var(--color-surface)', fontSize: 12 }
const errorText: CSSProperties = { margin: '16px 0 0', padding: 12, borderRadius: 10, color: '#b42318', background: 'rgba(239,68,68,.12)', fontSize: 13 }
const progressWrap: CSSProperties = { position: 'relative', display: 'grid', gap: 8, marginTop: 18, color: 'var(--color-text-secondary)', fontSize: 12 }
const progressTrack: CSSProperties = { height: 5, overflow: 'hidden', borderRadius: 999, background: 'var(--color-border)' }
const progressBar: CSSProperties = { display: 'block', height: '100%', borderRadius: 999, background: 'var(--color-lime)', transition: 'width 180ms ease' }
const cancelUpload: CSSProperties = { position: 'absolute', top: -4, right: 0, border: 0, color: 'var(--color-text-primary)', background: 'transparent', fontSize: 12, cursor: 'pointer' }