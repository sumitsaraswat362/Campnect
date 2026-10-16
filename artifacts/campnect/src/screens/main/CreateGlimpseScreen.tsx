import { DEMO_MODE } from '../../demo/config'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, CalendarDays, Camera, Check, ChevronDown, Image as ImageIcon, Loader2, RotateCcw, Sparkles, Square, SwitchCamera, Video, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { createLocalMediaPreview, disposeLocalMediaPreview } from '../../utils/localMediaPreview'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { eventsApi } from '../../api/events'
import { requestCameraPermission, requestMicrophonePermission } from '../../utils/permissions'
import { glimpsesApi, type GlimpseQuota } from '../../api/glimpses'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { TemporaryPinchZoom } from '../../components/shared/TemporaryPinchZoom'
import { AlertDialog } from '../../components/shared/AlertDialog'
import { navigateToAppRoot } from '../../navigation/appSectionNavigation'
import { Capacitor } from '@capacitor/core'
import { GlimpseCamera } from '../../capacitor/plugins'
import {
  mediaUploadError,
  uploadMediaKind,
  VIDEO_MAX_DURATION_SECONDS,
} from '../../utils/mediaUploadPolicy'

type CampusEvent = { id: string; title: string; starts_at?: string; cover_url?: string | null }

const MAX_VIDEO_SECONDS = VIDEO_MAX_DURATION_SECONDS
const DEFAULT_CAMERA_ZOOM = 1
const FALLBACK_CAMERA_MAX_ZOOM = 1

type CameraZoomState = {
  nativeSupported: boolean
  min: number
  max: number
  value: number
}

export function CreateGlimpseScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const incomingCaptureRef = useRef<File | null>(
    (location.state as { capture?: unknown } | null)?.capture instanceof File
      ? (location.state as { capture: File }).capture
      : null,
  )
  const preparingIncomingCaptureRef = useRef(false)
  const cameraRef = useRef<HTMLVideoElement>(null)
  const nativePhotoInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cameraZoomRef = useRef<CameraZoomState>({
    nativeSupported: false,
    min: DEFAULT_CAMERA_ZOOM,
    max: FALLBACK_CAMERA_MAX_ZOOM,
    value: DEFAULT_CAMERA_ZOOM,
  })
  const cameraZoomGestureStartRef = useRef(DEFAULT_CAMERA_ZOOM)
  const cameraFacingRef = useRef<'environment' | 'user'>('environment')
  const zoomRequestRef = useRef(0)
  const nativeCaptureLaunchingRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const stopTimerRef = useRef<number | null>(null)
  const elapsedTimerRef = useRef<number | null>(null)
  const previewRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [eventId, setEventId] = useState('')
  const [events, setEvents] = useState<CampusEvent[]>([])
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [quota, setQuota] = useState<GlimpseQuota | null>(null)
  const [composerStep, setComposerStep] = useState<'preview' | 'caption'>('preview')
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraLaunchRequest, setCameraLaunchRequest] = useState(0)
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [cameraZoom, setCameraZoom] = useState(DEFAULT_CAMERA_ZOOM)
  const [visualCameraZoom, setVisualCameraZoom] = useState(DEFAULT_CAMERA_ZOOM)

  // Keep the page chrome behind this screen in sync with the app's current
  // theme immediately on mount, so there is no flash of a mismatched
  // background color while this screen's own div is still painting during
  // the route transition.
  useLayoutEffect(() => {
    const bg = '#000000'
    const targets = [document.documentElement, document.body, document.getElementById('root')].filter(Boolean) as HTMLElement[]
    const previous = targets.map(el => el.style.background)
    targets.forEach(el => { el.style.background = bg })
    return () => {
      targets.forEach((el, i) => { el.style.background = previous[i] })
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (cameraRef.current) cameraRef.current.srcObject = null
    cameraZoomRef.current = {
      nativeSupported: false,
      min: DEFAULT_CAMERA_ZOOM,
      max: FALLBACK_CAMERA_MAX_ZOOM,
      value: DEFAULT_CAMERA_ZOOM,
    }
    cameraZoomGestureStartRef.current = DEFAULT_CAMERA_ZOOM
    setCameraZoom(DEFAULT_CAMERA_ZOOM)
    setVisualCameraZoom(DEFAULT_CAMERA_ZOOM)
    setCameraReady(false)
  }, [])

  const startCamera = useCallback(async () => {
    if (file) return
    stopCamera()
    setCameraError(null)

    // Android's WebView camera API cannot reliably select physical lenses or
    // guarantee that its preview zoom is the zoom encoded into the file. Use
    // the CameraX bridge whenever the installed native shell provides it.
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('GlimpseCamera')) {
      if (nativeCaptureLaunchingRef.current) return
      nativeCaptureLaunchingRef.current = true
      try {
        const capture = await GlimpseCamera.capture({ maxVideoSeconds: MAX_VIDEO_SECONDS })
        const response = await fetch(Capacitor.convertFileSrc(capture.uri))
        if (!response.ok) throw new Error('The native capture file could not be opened.')
        const blob = await response.blob()
        if (blob.size === 0) throw new Error('The native capture file was empty.')
        setCaptured(new File([blob], capture.name, { type: capture.mimeType || blob.type }))
      } catch (error: any) {
        const message = String(error?.message || error || '')
        if (message.toLowerCase().includes('cancel')) {
          // Native CameraX is a separate Android activity. Its close control
          // and Android's system Back both report a cancelled capture; leave
          // this Create flow through the same coordinator as every other Back
          // action instead of immediately launching the camera again.
          requestAppBack()
        } else {
          setCameraError('The native camera could not start. Try again.')
        }
      } finally {
        nativeCaptureLaunchingRef.current = false
      }
      return
    }

    // Web and iPhone PWA capture should use the device camera app too. Do not
    // start a getUserMedia preview inside the WebView before opening it.
    nativePhotoInputRef.current?.click()
  }, [file, stopCamera])

  const handlePinchStart = useCallback(() => {
    cameraZoomGestureStartRef.current = cameraZoomRef.current.value
  }, [])

  const handlePinchZoom = useCallback((gestureScale: number) => {
    const zoom = cameraZoomRef.current
    const next = clampCameraZoom(cameraZoomGestureStartRef.current * gestureScale, zoom.min, zoom.max)
    zoom.value = next
    setCameraZoom(next)

    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || !zoom.nativeSupported) return

    const requestId = ++zoomRequestRef.current
    void track.applyConstraints({
      advanced: [{ zoom: next } as MediaTrackConstraintSet],
    } as MediaTrackConstraints).catch(() => {
      if (requestId !== zoomRequestRef.current) return
      zoom.nativeSupported = false
      setVisualCameraZoom(DEFAULT_CAMERA_ZOOM)
    })
  }, [])

  const flipBrowserCamera = useCallback(() => {
    if (recording || Capacitor.isNativePlatform()) return
    cameraFacingRef.current = cameraFacingRef.current === 'environment' ? 'user' : 'environment'
    void startCamera()
  }, [recording, startCamera])

  useEffect(() => {
    glimpsesApi.getQuota().then(response => setQuota(response.data.data)).catch(() => {})
    eventsApi.getAll({ upcoming: true, limit: 20 }).then(response => setEvents(response.data.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (DEMO_MODE || file || incomingCaptureRef.current || preparingIncomingCaptureRef.current) return
    void startCamera()
    return () => stopCamera()
  }, [cameraLaunchRequest, file, startCamera, stopCamera])

  useEffect(() => {
    return () => {
      disposeLocalMediaPreview(previewRef.current)
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current)
      if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current)
      abortRef.current?.abort()
      streamRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [])

  async function setCaptured(next: File) {
    const kind = uploadMediaKind(next)
    const validationError = await mediaUploadError(next, kind || undefined)
    if (validationError) {
      setSelectionError(validationError)
      return
    }
    disposeLocalMediaPreview(previewRef.current)
    let url: string
    try {
      url = await createLocalMediaPreview(next)
    } catch {
      toast.error('That capture could not be previewed. Please try again.')
      return
    }
    previewRef.current = url
    setFile(next)
    setPreview(url)
    setComposerStep('preview')
    setFailed(null)
    stopCamera()
  }

  useEffect(() => {
    const captured = incomingCaptureRef.current
    if (!captured || preparingIncomingCaptureRef.current) return
    preparingIncomingCaptureRef.current = true
    incomingCaptureRef.current = null
    navigate(location.pathname, { replace: true, state: null })
    void setCaptured(captured).finally(() => {
      preparingIncomingCaptureRef.current = false
    })
  }, [location.pathname, navigate])

  function clearCapture() {
    if (recording) return
    disposeLocalMediaPreview(previewRef.current)
    previewRef.current = null
    setFile(null)
    setPreview(null)
    setComposerStep('preview')
    setFailed(null)
    setProgress(0)
    setRecordingSeconds(0)
  }

  async function capturePhoto() {
    // iPhone web apps cannot take a native still through getUserMedia. Opening
    // this capture input hands photo capture to the real iOS Camera app and
    // returns its full-resolution original file.
    if (isIOSWebCamera()) {
      nativePhotoInputRef.current?.click()
      return
    }
    const video = cameraRef.current
    if (!video || !cameraReady || !video.videoWidth || !video.videoHeight) {
      toast.error('The live camera is still warming up.')
      return
    }
    const canvas = document.createElement('canvas')
    const track = streamRef.current?.getVideoTracks()[0]
    const ImageCaptureConstructor = (window as typeof window & {
      ImageCapture?: new (source: MediaStreamTrack) => { takePhoto: () => Promise<Blob> }
    }).ImageCapture
    if (track && ImageCaptureConstructor) {
      try {
        const original = await new ImageCaptureConstructor(track).takePhoto()
        if (original.size > 0) {
          setCaptured(new File([original], `glimpse-${Date.now()}.jpg`, { type: original.type || 'image/jpeg' }))
          return
        }
      } catch {
        // Some browsers expose ImageCapture but cannot produce a still for
        // every camera. The full-frame canvas fallback below remains usable.
      }
    }
    // Keep every pixel exposed by the negotiated camera stream. Do not center
    // crop to the portrait viewport or impose a software output cap.
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      toast.error('This device could not capture the photo.')
      return
    }
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.98))
    if (!blob) {
      toast.error('This device could not capture the photo.')
      return
    }
    setCaptured(new File([blob], `glimpse-${Date.now()}.jpg`, { type: 'image/jpeg' }))
  }

  function mediaRecorderMime() {
    const candidates = [
      'video/mp4;codecs=h264,aac',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ]
    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || ''
  }

  function stopRecording() {
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current)
    if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current)
    stopTimerRef.current = null
    elapsedTimerRef.current = null
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }

  function startRecording() {
    if (!cameraReady || !streamRef.current || typeof MediaRecorder === 'undefined') {
      toast.error('Video capture is not supported on this device.')
      return
    }
    const mimeType = mediaRecorderMime()
    try {
      const cameraStream = streamRef.current
      const previewVideo = cameraRef.current
      if (!previewVideo) {
        toast.error('The live camera is still warming up.')
        return
      }
      const recorder = mimeType
        ? new MediaRecorder(cameraStream, { mimeType })
        : new MediaRecorder(cameraStream)
      chunksRef.current = []
      recorderRef.current = recorder
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        setRecording(false)
        toast.error('The live video could not be captured. Try again.')
        stopRecording()
      }
      recorder.onstop = () => {
        const recorderMime = recorder.mimeType || mimeType || 'video/webm'
        const uploadMime = recorderMime.split(';', 1)[0].trim().toLowerCase() || 'video/webm'
        const blob = new Blob(chunksRef.current, { type: uploadMime })
        chunksRef.current = []
        recorderRef.current = null
        setRecording(false)
        setRecordingSeconds(0)
        stopCamera()
        if (blob.size === 0) {
          toast.error('The live video was empty. Try again.')
          return
        }
        const extension = uploadMime === 'video/mp4' ? 'mp4' : 'webm'
        setCaptured(new File([blob], `glimpse-${Date.now()}.${extension}`, { type: uploadMime }))
      }
      recorder.start()
      setRecording(true)
      setRecordingSeconds(0)
      elapsedTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(seconds => Math.min(MAX_VIDEO_SECONDS, seconds + 1))
      }, 1000)
      stopTimerRef.current = window.setTimeout(stopRecording, MAX_VIDEO_SECONDS * 1000)
    } catch {
      toast.error('The live video could not be started. Try again.')
    }
  }

  async function publish() {
    if (!file || uploading) return
    const validationError = await mediaUploadError(file, uploadMediaKind(file) || undefined)
    if (validationError) {
      setFailed(validationError)
      return
    }
    setUploading(true)
    setFailed(null)
    setProgress(0)
    abortRef.current = new AbortController()
    const data = new FormData()
    data.append('media', file)
    data.append('caption', caption.trim())
    if (eventId) data.append('event_id', eventId)
    try {
      const response = await glimpsesApi.create(data, setProgress, { signal: abortRef.current.signal })
      const pending = response.status === 202 || response.data.data?.moderation_status === 'pending'
      toast.success(pending ? 'Glimpse sent for review' : 'Glimpse published')
      navigateToAppRoot(navigate, location.pathname, '/app/glimpse')
    } catch (error: any) {
      if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') return
      const message = error?.response?.data?.error || error?.message || 'Upload failed. Try again.'
      if (error?.response?.data?.code === 'GLIMPSE_DAILY_LIMIT') setQuota(error.response.data.data)
      setFailed(message)
    } finally {
      setUploading(false)
      abortRef.current = null
    }
  }

  function cancelUpload() {
    abortRef.current?.abort()
    clearCapture()
  }

  const reachedLimit = quota ? quota.remaining <= 0 : false

  useBackDismiss(
    Boolean(file) && !reachedLimit && composerStep === 'preview',
    clearCapture,
  )
  useBackDismiss(
    Boolean(file) && !reachedLimit && composerStep === 'caption' && !uploading,
    () => {
      setComposerStep('preview')
      setFailed(null)
    },
  )
  useBackDismiss(
    Boolean(file) && !reachedLimit && uploading,
    cancelUpload,
    200,
  )

  return (
    <div className="app-scroll-region" style={{ position: file ? 'relative' : 'absolute', inset: file ? undefined : 0, width: '100%', height: '100%', overflowY: file ? 'auto' : 'hidden', background: file ? '#ffffff' : '#000000', color: '#151821', padding: file ? 'calc(12px + var(--sat)) max(16px, var(--sar)) calc(24px + var(--sab)) max(16px, var(--sal))' : 0, display: 'flex', flexDirection: 'column' }}>
      {(!file && reachedLimit || file) && <header style={{ display: 'flex', alignItems: 'center', gap: 11, minHeight: 46, flexShrink: 0, padding: 'calc(12px + var(--sat)) max(16px, var(--sar)) 10px max(16px, var(--sal))' }}>
        <button onClick={requestAppBack} aria-label={composerStep === 'caption' ? 'Back to Glimpse preview' : 'Close'} style={roundButton}><ArrowLeft size={19} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18 }}><Sparkles size={17} color="#151821" /> {!file ? 'Capture a Glimpse' : composerStep === 'caption' ? 'Add a caption' : 'Preview your Glimpse'}</div>
          <p style={{ margin: '3px 0 0', color: '#737987', fontSize: 11 }}>{!file ? 'One real moment. No endless scrolling.' : composerStep === 'caption' ? 'Add context before you upload.' : 'Review your live moment before continuing.'}</p>
        </div>
        <span style={{ color: quota?.remaining === 0 ? '#d14362' : '#737987', fontSize: 11, fontWeight: 900 }}>{quota?.used ?? 0}/10</span>
      </header>}

      {reachedLimit ? (
        <LimitReached onDone={() => navigateToAppRoot(navigate, location.pathname, '/app/glimpse')} />
      ) : !file ? (
        DEMO_MODE ? <div style={{ margin: 'auto', padding: 28, color: '#fff', textAlign: 'center' }}><h1>Capture a Glimpse</h1><p>Select an image or video for your local campus story.</p><label style={{ display: 'block', padding: 18, border: '1px solid #777', borderRadius: 16, cursor: 'pointer' }}>Choose Glimpse media<input aria-label="Choose Glimpse media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" style={{ display: 'block', marginTop: 12 }} onChange={e => { const selected = e.currentTarget.files?.[0]; if (selected) void setCaptured(selected) }} /></label>{selectionError && <p role="alert">{selectionError}</p>}<button onClick={requestAppBack} style={roundButton}>←</button></div> : Capacitor.isNativePlatform() ? <LiveCapture
          videoRef={cameraRef}
          cameraReady={cameraReady}
          cameraError={cameraError}
          recording={recording}
          recordingSeconds={recordingSeconds}
           quotaUsed={quota?.used ?? 0}
          onRetry={() => void startCamera()}
          onCapturePhoto={() => void capturePhoto()}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          cameraZoom={cameraZoom}
          visualZoom={visualCameraZoom}
          onPinchStart={handlePinchStart}
          onPinchZoom={handlePinchZoom}
          onFlipCamera={flipBrowserCamera}
          canFlipCamera={!Capacitor.isNativePlatform()}
          nativePhotoInputRef={nativePhotoInputRef}
          onNativePhoto={captured => void setCaptured(captured)}
        /> : <PhoneCameraLauncher nativePhotoInputRef={nativePhotoInputRef} onNativeCapture={captured => void setCaptured(captured)} />
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: 16 }}>
          {composerStep === 'preview' ? (
            <>
              <div style={previewStage}>
                {file.type.startsWith('video/')
                  ? <TemporaryPinchZoom maxScale={4}><video src={preview || undefined} controls autoPlay muted playsInline style={previewMedia} /></TemporaryPinchZoom>
                  : <TemporaryPinchZoom maxScale={4}><img src={preview || ''} alt="Glimpse preview" style={previewMedia} /></TemporaryPinchZoom>}
                <button onClick={clearCapture} aria-label="Retake live Glimpse" style={{ ...roundButton, position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,.94)' }}><X size={17} /></button>
                <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 999, background: 'rgba(10,11,16,.76)', color: '#ffffff', fontSize: 11, fontWeight: 800 }}>
                  {file.type.startsWith('video/') ? <Video size={13} /> : <ImageIcon size={13} />} Normal · {file.type.startsWith('video/') ? `video · ${MAX_VIDEO_SECONDS}s max` : 'photo'}
                </div>
              </div>
              <button onClick={() => setComposerStep('caption')} style={{ width: '100%', minHeight: 54, marginTop: 18, border: 0, borderRadius: 18, background: '#151821', color: '#ffffff', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 900, boxShadow: '0 8px 24px rgba(21,24,33,.16)' }}>
                Next
              </button>
              <p style={{ margin: '12px 10px 0', textAlign: 'center', color: '#737987', fontSize: 11, lineHeight: 1.45 }}>Looks good? Add a caption and upload your live moment.</p>
            </>
          ) : (
            <>
              <label style={labelStyle}>Say something about this moment <span style={{ color: '#737987', fontWeight: 500 }}>(optional)</span></label>
              <textarea value={caption} onChange={event => setCaption(event.target.value.slice(0, 140))} maxLength={140} placeholder="What’s happening on campus?" style={textareaStyle} rows={3} />
              <div style={{ textAlign: 'right', marginTop: 5, color: caption.length > 125 ? '#617d18' : '#737987', fontSize: 10, fontWeight: 800 }}>{caption.length}/140</div>

              <label style={labelStyle}><CalendarDays size={14} color="#151821" /> Connect to an event <span style={{ color: '#737987', fontWeight: 500 }}>(optional)</span></label>
              <EventPicker events={events} eventId={eventId} onChange={setEventId} />

              {failed && (
                <div style={{ marginTop: 14, padding: 13, border: '1px solid #f2b6c1', borderRadius: 16, background: '#fff6f8', color: '#8e3046', fontSize: 12, lineHeight: 1.45 }}>
                  <strong style={{ display: 'block', color: '#641d2d', marginBottom: 4 }}>Couldn’t publish this Glimpse</strong>{failed}
                  <button onClick={publish} disabled={uploading} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, border: 0, background: 'none', color: '#334d00', fontWeight: 900, cursor: 'pointer', padding: 0 }}><RotateCcw size={13} /> Retry upload</button>
                </div>
              )}

              {uploading && (
                <div style={{ marginTop: 16, padding: 15, border: '1px solid #dce7b8', borderRadius: 20, background: '#fbfff2' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#334d00', fontSize: 13, fontWeight: 800 }}><Loader2 size={17} className="spin" /> {progress < 100 ? 'Uploading your moment…' : 'Processing your Glimpse…'} <span style={{ marginLeft: 'auto' }}>{progress}%</span></div>
                  <div style={{ height: 5, marginTop: 12, overflow: 'hidden', borderRadius: 999, background: '#e8edd9' }}><div style={{ width: `${Math.max(4, progress)}%`, height: '100%', borderRadius: 999, background: '#9ac900', transition: 'width 180ms ease' }} /></div>
                  <button onClick={cancelUpload} style={{ marginTop: 11, border: 0, background: 'none', color: '#737987', cursor: 'pointer', fontSize: 11, fontWeight: 800 }}>Cancel upload</button>
                </div>
              )}

              <button onClick={publish} disabled={uploading} style={{ width: '100%', minHeight: 54, marginTop: 18, border: 0, borderRadius: 18, background: uploading ? '#d9dce2' : '#151821', color: '#ffffff', cursor: uploading ? 'wait' : 'pointer', fontFamily: 'var(--font-display)', fontWeight: 900, boxShadow: uploading ? 'none' : '0 8px 24px rgba(21,24,33,.16)' }}>
                {uploading ? 'Hang tight…' : 'Upload Glimpse'}
              </button>
              <p style={{ margin: '12px 10px 0', textAlign: 'center', color: '#737987', fontSize: 11, lineHeight: 1.45 }}>Your Glimpse is shown to students at your verified campus. Live photo or video, up to {MAX_VIDEO_SECONDS} seconds.</p>
            </>
          )}
        </div>
      )}
      <AlertDialog message={selectionError} onClose={() => setSelectionError(null)} />
    </div>
  )
}

function LiveCapture({
  videoRef,
  cameraReady,
  cameraError,
  recording,
  recordingSeconds,
  quotaUsed,
  onRetry,
  onCapturePhoto,
  onStartRecording,
  onStopRecording,
  cameraZoom,
  visualZoom,
  onPinchStart,
  onPinchZoom,
  onFlipCamera,
  canFlipCamera,
  nativePhotoInputRef,
  onNativePhoto,
}: {
  videoRef: React.Ref<HTMLVideoElement>
  cameraReady: boolean
  cameraError: string | null
  recording: boolean
  recordingSeconds: number
  quotaUsed: number
  onRetry: () => void
  onCapturePhoto: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  cameraZoom: number
  visualZoom: number
  onPinchStart: () => void
  onPinchZoom: (gestureScale: number) => void
  onFlipCamera: () => void
  canFlipCamera: boolean
  nativePhotoInputRef: React.Ref<HTMLInputElement>
  onNativePhoto: (captured: File) => void
}) {
  const holdTimerRef = useRef<number | null>(null)
  const shutterActiveRef = useRef(false)
  const holdStartedRef = useRef(false)
  const pinchPointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchStartDistanceRef = useRef(0)

  useEffect(() => () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current)
  }, [])

  function clearHoldTimer() {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null
  }

  function handleCameraPointerDown(event: ReactPointerEvent<HTMLVideoElement>) {
    if (event.pointerType !== 'touch') return
    pinchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinchPointersRef.current.size !== 2) return

    event.preventDefault()
    const points = [...pinchPointersRef.current.values()]
    pinchStartDistanceRef.current = Math.max(1, pointerDistance(points[0], points[1]))
    onPinchStart()
    try {
      for (const pointerId of pinchPointersRef.current.keys()) event.currentTarget.setPointerCapture(pointerId)
    } catch {}
  }

  function handleCameraPointerMove(event: ReactPointerEvent<HTMLVideoElement>) {
    if (!pinchPointersRef.current.has(event.pointerId)) return
    pinchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinchPointersRef.current.size < 2 || !pinchStartDistanceRef.current) return
    event.preventDefault()
    const points = [...pinchPointersRef.current.values()]
    onPinchZoom(pointerDistance(points[0], points[1]) / pinchStartDistanceRef.current)
  }

  function finishCameraPointer(event: ReactPointerEvent<HTMLVideoElement>) {
    pinchPointersRef.current.delete(event.pointerId)
    if (pinchPointersRef.current.size < 2) pinchStartDistanceRef.current = 0
  }

  function handleShutterDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!cameraReady || shutterActiveRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    shutterActiveRef.current = true
    holdStartedRef.current = false
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null
      holdStartedRef.current = true
      onStartRecording()
    }, 260)
  }

  function handleShutterEnd(event: React.PointerEvent<HTMLButtonElement>) {
    if (!shutterActiveRef.current) return
    event.preventDefault()
    shutterActiveRef.current = false
    clearHoldTimer()
    if (holdStartedRef.current || recording) onStopRecording()
    else onCapturePhoto()
    holdStartedRef.current = false
  }

  return (
    <div style={{ position: 'absolute', inset: 0, minHeight: 0, overflow: 'hidden', background: '#000000' }}>
      <input
        ref={nativePhotoInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={event => {
          const captured = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (captured) onNativePhoto(captured)
        }}
      />
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', border: 0, borderRadius: 0, background: '#000000' }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Live camera preview"
          onPointerDown={handleCameraPointerDown}
          onPointerMove={handleCameraPointerMove}
          onPointerUp={finishCameraPointer}
          onPointerCancel={finishCameraPointer}
          onLostPointerCapture={finishCameraPointer}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center center', background: '#000000', opacity: cameraReady ? 1 : 0, transform: `scale(${visualZoom})`, transformOrigin: 'center center', transition: visualZoom === DEFAULT_CAMERA_ZOOM ? 'transform 140ms ease-out' : 'none', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
        />
        {!cameraReady && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '42px 28px 150px', textAlign: 'center' }}>
          <div style={{ maxWidth: 292 }}>
            <div style={{ width: 78, height: 78, margin: '0 auto 20px', display: 'grid', placeItems: 'center', borderRadius: 26, background: cameraError ? '#fff6f8' : '#f8fbef', border: `1px solid ${cameraError ? '#f2b6c1' : '#dce7b8'}`, boxShadow: '0 12px 28px rgba(28,39,64,.08)' }}>
              {cameraError ? <Camera size={32} color="#c43c59" /> : <Loader2 size={32} color="#8cad00" style={{ animation: 'spin 900ms linear infinite' }} />}
            </div>
            <span style={{ display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: cameraError ? '#fff0f3' : '#f3f8df', color: cameraError ? '#a32b47' : '#526900', fontSize: 10, fontWeight: 900, letterSpacing: '.06em' }}>
              {cameraError ? 'PERMISSION REQUIRED' : 'GETTING THINGS READY'}
            </span>
            <h1 style={{ margin: '16px 0 9px', fontFamily: 'var(--font-display)', fontSize: 25, lineHeight: 1.12, letterSpacing: '-.04em', color: '#151821' }}>{cameraError ? 'Camera access needed' : 'Opening your live camera…'}</h1>
            <p style={{ maxWidth: 280, margin: '0 auto', color: '#737987', fontSize: 13, lineHeight: 1.55 }}>{cameraError || 'Glimpse only captures what is happening right now. Nothing is selected from your gallery.'}</p>
            {cameraError && <button onClick={onRetry} style={{ minHeight: 46, marginTop: 20, padding: '0 22px', border: 0, borderRadius: 16, background: '#151821', color: '#ffffff', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 900, boxShadow: '0 8px 24px rgba(21,24,33,.16)' }}>Try again</button>}
          </div>
        </div>}
        <button onClick={requestAppBack} aria-label="Close camera" style={{ ...roundButton, position: 'absolute', top: 'calc(16px + var(--sat))', left: 'max(16px, var(--sal))', zIndex: 2, background: 'rgba(255,255,255,.94)' }}>
          <ArrowLeft size={19} />
        </button>
        <div style={{ position: 'absolute', top: 'calc(16px + var(--sat))', left: 68, right: 'max(16px, var(--sar))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ padding: '7px 10px', borderRadius: 999, background: 'rgba(255,255,255,.94)', border: '1px solid #e1e5eb', color: '#151821', fontSize: 10, fontWeight: 900, letterSpacing: '.04em' }}>LIVE SNAP</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {canFlipCamera && (
              <button onClick={onFlipCamera} disabled={recording || !cameraReady} aria-label="Switch camera" style={{ ...roundButton, width: 34, height: 34, background: 'rgba(255,255,255,.94)', opacity: recording || !cameraReady ? .52 : 1 }}>
                <SwitchCamera size={17} />
              </button>
            )}
            <span style={{ padding: '7px 10px', borderRadius: 999, background: recording ? '#e64061' : 'rgba(255,255,255,.94)', border: '1px solid #e1e5eb', color: recording ? '#fff' : '#151821', fontSize: 10, fontWeight: 900 }}>{recording ? `${recordingSeconds}/${MAX_VIDEO_SECONDS}s` : `${quotaUsed}/10`}</span>
          </div>
        </div>
        {cameraReady && cameraZoom > DEFAULT_CAMERA_ZOOM && <span style={{ position: 'absolute', top: 'calc(64px + var(--sat))', left: '50%', transform: 'translateX(-50%)', padding: '6px 9px', borderRadius: 999, background: 'rgba(21,24,33,.72)', color: '#ffffff', fontSize: 10, fontWeight: 900 }}>{cameraZoom.toFixed(1)}×</span>}
        <div style={{ position: 'absolute', left: 'max(16px, var(--sal))', right: 'max(16px, var(--sar))', bottom: 'calc(18px + max(var(--native-safe-bottom, 0px), env(safe-area-inset-bottom, 0px)))', opacity: cameraReady ? 1 : 0, pointerEvents: cameraReady ? 'auto' : 'none', transition: 'opacity 180ms ease' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 9, marginBottom: 18 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 12px', border: '1px solid rgba(255,255,255,.76)', borderRadius: 999, background: 'rgba(255,255,255,.92)', color: '#526900', fontSize: 11, fontWeight: 900 }}>
              <Sparkles size={14} /> Normal
            </span>
          </div>
          <button
            disabled={!cameraReady}
            onPointerDown={handleShutterDown}
            onPointerUp={handleShutterEnd}
            onPointerCancel={handleShutterEnd}
            onContextMenu={event => event.preventDefault()}
            aria-label={recording ? 'Release to stop recording' : 'Tap for photo or hold for video'}
            style={{ display: 'grid', placeItems: 'center', width: 78, height: 78, margin: '0 auto', border: recording ? '7px solid #f4a2b2' : '7px solid #151821', borderRadius: '50%', background: recording ? '#e64061' : '#ffffff', color: recording ? '#fff' : '#151821', cursor: cameraReady ? 'pointer' : 'not-allowed', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', boxShadow: '0 0 0 5px rgba(255,255,255,.72), 0 8px 24px rgba(21,24,33,.16)' }}
          >
            {recording ? <Square size={23} fill="currentColor" /> : <Camera size={27} />}
          </button>
          <p style={{ margin: '10px 0 0', textAlign: 'center', color: '#ffffff', textShadow: '0 1px 5px rgba(0,0,0,.8)', fontSize: 11, fontWeight: 800 }}>{recording ? `Release to stop · auto-stops at ${MAX_VIDEO_SECONDS} seconds` : `Tap for a photo · hold to record video up to ${MAX_VIDEO_SECONDS} seconds`}</p>
        </div>
      </div>
    </div>
  )
}

function PhoneCameraLauncher({
  nativePhotoInputRef,
  onNativeCapture,
}: {
  nativePhotoInputRef: React.Ref<HTMLInputElement>
  onNativeCapture: (captured: File) => void
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, background: '#000000', color: '#ffffff' }}>
      <input
        ref={nativePhotoInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={event => {
          const captured = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (captured) onNativeCapture(captured)
        }}
      />
      <div style={{ maxWidth: 290, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, display: 'grid', placeItems: 'center', margin: '0 auto 18px', borderRadius: 24, background: '#f8fbef', color: '#526900' }}><Camera size={31} /></div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 25 }}>Open your camera</h1>
        <p style={{ margin: '10px 0 22px', color: 'rgba(255,255,255,.74)', fontSize: 13, lineHeight: 1.5 }}>Capture a fresh photo or video with your phone’s camera.</p>
        <button type="button" onClick={() => {
          const input = nativePhotoInputRef as React.RefObject<HTMLInputElement>
          input.current?.click()
        }} style={{ minHeight: 48, padding: '0 22px', border: 0, borderRadius: 16, background: '#bbff00', color: '#151821', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 900 }}>Open Camera</button>
      </div>
    </div>
  )
}

function isIOSWebCamera() {
  if (Capacitor.isNativePlatform()) return false
  const clientHints = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = clientHints.userAgentData?.platform || navigator.platform || ''
  return /iPad|iPhone|iPod/i.test(platform) || (navigator.maxTouchPoints > 1 && /MacIntel/i.test(platform))
}

function getCameraZoomRange(track?: MediaStreamTrack): CameraZoomState {
  const defaults: CameraZoomState = {
    nativeSupported: false,
    min: DEFAULT_CAMERA_ZOOM,
    max: FALLBACK_CAMERA_MAX_ZOOM,
    value: DEFAULT_CAMERA_ZOOM,
  }
  if (!track || typeof track.getCapabilities !== 'function') return defaults

  const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
    zoom?: { min?: number; max?: number; step?: number }
  }
  const min = Number.isFinite(capabilities.zoom?.min) ? Number(capabilities.zoom?.min) : DEFAULT_CAMERA_ZOOM
  const max = Number.isFinite(capabilities.zoom?.max) ? Number(capabilities.zoom?.max) : FALLBACK_CAMERA_MAX_ZOOM
  if (!capabilities.zoom || max <= min) return defaults
  // A WebView's reported zoom ratio is its only trustworthy browser signal.
  // Keep that actual current ratio; do not overwrite an ultrawide 0.5× state
  // with a cosmetic 1× label.
  const settings = track.getSettings() as MediaTrackSettings & { zoom?: number }
  const value = Number.isFinite(settings.zoom) ? Number(settings.zoom) : clampCameraZoom(DEFAULT_CAMERA_ZOOM, min, max)
  return {
    nativeSupported: true,
    min,
    max,
    value: clampCameraZoom(value, min, max),
  }
}

function clampCameraZoom(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}

function pointerDistance(first: { x: number; y: number }, second: { x: number; y: number }) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function EventPicker({ events, eventId, onChange }: { events: CampusEvent[]; eventId: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = events.find(event => event.id === eventId)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ ...selectStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', cursor: 'pointer' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected ? selected.title : 'No event — just a campus moment'}</span>
        <ChevronDown size={15} color="#737987" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', zIndex: 20, maxHeight: 220, overflowY: 'auto', border: '1px solid #e1e5eb', borderRadius: 15, background: '#ffffff', boxShadow: '0 16px 34px rgba(28,39,64,.14)' }}>
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            style={eventOptionStyle(eventId === '')}
          >
            No event — just a campus moment
          </button>
          {events.map(event => (
            <button
              key={event.id}
              type="button"
              onClick={() => { onChange(event.id); setOpen(false) }}
              style={eventOptionStyle(eventId === event.id)}
            >
              {event.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function eventOptionStyle(active: boolean): React.CSSProperties {
  return {
    display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: 0,
    borderBottom: '1px solid #eef0f3', background: active ? '#f3f8df' : '#ffffff',
    color: active ? '#526900' : '#151821', fontSize: 12, fontWeight: active ? 800 : 500, textAlign: 'left', cursor: 'pointer',
  }
}

function LimitReached({ onDone }: { onDone: () => void }) {
  return <div style={{ display: 'grid', placeItems: 'center', minHeight: '78dvh', padding: 30, textAlign: 'center' }}>
    <div style={{ width: 76, height: 76, display: 'grid', placeItems: 'center', borderRadius: 26, background: '#f3f8df', border: '1px solid #dce7b8', color: '#617d18' }}><Check size={34} strokeWidth={3} /></div>
    <h1 style={{ margin: '20px 0 8px', fontFamily: 'var(--font-display)', fontSize: 26, color: '#151821' }}>That’s your day in ten.</h1>
    <p style={{ maxWidth: 270, margin: 0, color: '#737987', fontSize: 13, lineHeight: 1.55 }}>You’ve reached the daily Glimpse limit. Your campus snapshot is complete for today.</p>
    <button onClick={onDone} style={{ marginTop: 24, minHeight: 46, padding: '0 20px', border: '1px solid #dfe4eb', borderRadius: 999, background: '#ffffff', color: '#151821', cursor: 'pointer', fontWeight: 800 }}>Back to Glimpse</button>
  </div>
}

const roundButton = { width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #dfe4eb', borderRadius: 14, background: '#ffffff', color: '#151821', cursor: 'pointer' }
const previewStage: React.CSSProperties = { position: 'relative', flex: 1, minHeight: 0, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#08090d', margin: '0 calc(-1 * max(16px, var(--sar))) 0 calc(-1 * max(16px, var(--sal)))' }
const previewMedia: React.CSSProperties = { display: 'block', width: '100%', height: '100%', objectFit: 'contain', background: '#08090d' }
const labelStyle = { display: 'flex', alignItems: 'center', gap: 6, margin: '18px 0 8px', color: '#151821', fontSize: 12, fontWeight: 850 }
const textareaStyle = { width: '100%', boxSizing: 'border-box' as const, padding: 13, resize: 'vertical' as const, border: '1px solid #dfe4eb', borderRadius: 16, outline: 0, background: '#ffffff', color: '#151821', fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.45 }
const selectStyle = { width: '100%', minHeight: 46, padding: '0 12px', border: '1px solid #dfe4eb', borderRadius: 15, outline: 0, background: '#ffffff', color: '#151821', fontSize: 12 }