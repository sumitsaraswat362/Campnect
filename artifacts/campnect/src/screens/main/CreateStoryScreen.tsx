import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { requestAppBack } from '../../navigation/appBackRequest'
import { navigateToAppRoot } from '../../navigation/appSectionNavigation'
import {
  X, Type, Pen, Smile, Sliders, RotateCcw,
  Image as ImageIcon, Camera, Check,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { createLocalMediaPreview, disposeLocalMediaPreview } from '../../utils/localMediaPreview'
import { storiesApi } from '../../api/stories'
import { useStoriesStore } from '../../stores/storiesStore'
import { useAuthStore } from '../../stores/authStore'
import { requestCameraPermission } from '../../utils/permissions'
import { mediaUploadError } from '../../utils/mediaUploadPolicy'

/* ─── Types ───────────────────────────────────────── */
type Tool = 'none' | 'text' | 'draw' | 'sticker'

interface TextItem {
  id: number
  text: string
  x: number   // % of container width
  y: number   // % of container height
  color: string
  size: number
  bold: boolean
}

interface StrokePoint { x: number; y: number }
interface Stroke { color: string; size: number; points: StrokePoint[] }

const TEXT_COLORS = ['#ffffff', 'var(--color-lime)', '#ff3b6b', '#00cfff', '#ffdc00', '#ff9500', '#c44dcc', '#000000']
const STICKERS    = ['🎓', '🔥', '✨', '❤️', '😂', '👀', '💯', '🙌', '🚀', '🎉', '💪', '😍', '🎵', '📚', '⚡', '🌙', '🦋', '👑', '💥', '🍕']
const BG_FILTERS  = [
  { id: 'none',   label: 'Original', css: 'none', overlay: 'transparent' },
  { id: 'warm',   label: 'Warm',     css: 'none', overlay: 'rgba(255,120,0,0.18)' },
  { id: 'cool',   label: 'Cool',     css: 'none', overlay: 'rgba(0,120,255,0.18)' },
  { id: 'vivid',  label: 'Vivid',    css: 'saturate(1.5) contrast(1.1)', overlay: 'transparent' },
  { id: 'fade',   label: 'Fade',     css: 'brightness(1.15) saturate(0.7)', overlay: 'transparent' },
  { id: 'bw',     label: 'B&W',      css: 'grayscale(1)', overlay: 'transparent' },
  { id: 'neon',   label: 'Neon',     css: 'saturate(2) contrast(1.3)', overlay: 'rgba(187,255,0,0.08)' },
]

export function CreateStoryScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const { prependMyStory } = useStoriesStore()

  /* Media */
  const [tab,      setTab]      = useState<'gallery'|'camera'>('gallery')
  const [file,     setFile]     = useState<File | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [isVideo,  setIsVideo]  = useState(false)

  /* Tools */
  const [activeTool,    setActiveTool]    = useState<Tool>('none')
  const [filterId,      setFilterId]      = useState('none')
  const [textItems,     setTextItems]     = useState<TextItem[]>([])
  const [mentionText,   setMentionText]   = useState('')
  const [storyAudience, setStoryAudience] = useState<'normal' | 'close_mates'>('normal')
  const [strokes,       setStrokes]       = useState<Stroke[]>([])
  const [stickers,      setStickerList]   = useState<{ id: number; emoji: string; x: number; y: number }[]>([])

  /* Text editing */
  const [editingText,   setEditingText]   = useState<TextItem | null>(null)
  const [textInput,     setTextInput]     = useState('')
  const [textColor,     setTextColor]     = useState('#ffffff')
  const [textSize,      setTextSize]      = useState(28)
  const [textBold,      setTextBold]      = useState(false)

  /* Drawing */
  const [drawColor, setDrawColor] = useState('var(--color-lime)')
  const [drawSize,  setDrawSize]  = useState(5)
  const [isDrawing, setIsDrawing] = useState(false)
  const currentStroke = useRef<StrokePoint[]>([])
  const canvasRef     = useRef<HTMLCanvasElement>(null)

  /* Camera */
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const videoRef     = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* Drag for text/sticker */
  const containerRef = useRef<HTMLDivElement>(null)
  const dragItem     = useRef<{ type: 'text'|'sticker'; id: number; startX: number; startY: number; origX: number; origY: number } | null>(null)

  const [uploading, setUploading] = useState(false)
  const idCounter  = useRef(0)
  const nextId = () => ++idCounter.current

  const activeFilter    = BG_FILTERS.find(f => f.id === filterId) ?? BG_FILTERS[0]

  /* ── Camera ─────────────────────────────────────── */
  useEffect(() => {
    if (tab === 'camera' && !mediaUrl) {
      requestCameraPermission()
        .then((permission) => {
          if (!permission.granted && permission.state !== 'prompt') {
            toast(permission.message || 'Allow camera access to use the camera.')
            return null
          }
          return navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        })
        .then(stream => {
          if (!stream) return
          setCameraStream(stream)
          if (videoRef.current) videoRef.current.srcObject = stream
        })
        .catch(() => toast('Camera not available — use gallery', { icon: '📷' }))
    }
    return () => { if (tab !== 'camera') { cameraStream?.getTracks().forEach(t => t.stop()); setCameraStream(null) } }
  }, [tab])

  function capturePhoto() {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width  = videoRef.current.videoWidth  || 720
    canvas.height = videoRef.current.videoHeight || 1280
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0)
    canvas.toBlob(async blob => {
      if (!blob) return
      const f = new File([blob], 'camera.jpg', { type: 'image/jpeg' })
      setFile(f)
      setMediaUrl(await createLocalMediaPreview(f))
      setIsVideo(false)
      cameraStream?.getTracks().forEach(t => t.stop())
      setCameraStream(null)
    }, 'image/jpeg', 0.92)
  }

  async function pickFile(files: FileList | null) {
    if (!files || files.length === 0) return
    const f = files[0]
    const extension = f.name.split('.').pop()?.toLowerCase() || ''
    const looksLikeImage = f.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)
    const looksLikeVideo = f.type.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v', '3gp', 'avi'].includes(extension)
    if (!looksLikeImage && !looksLikeVideo) {
      toast.error('Choose an image or video file')
      return
    }
    const validationError = await mediaUploadError(f, looksLikeVideo ? 'video' : 'image')
    if (validationError) {
      toast.error(validationError)
      return
    }
    disposeLocalMediaPreview(mediaUrl)
    setFile(f)
    setIsVideo(looksLikeVideo)
    try {
      setMediaUrl(await createLocalMediaPreview(f))
    } catch {
      setFile(null)
      toast.error('That file could not be previewed. Choose another file.')
      return
    }
    setTab('gallery')
  }

  /* ── Canvas drawing ──────────────────────────────── */
  useEffect(() => {
    redrawCanvas()
  }, [strokes])

  function redrawCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue
      ctx.beginPath()
      ctx.strokeStyle = stroke.color
      ctx.lineWidth   = stroke.size
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
      }
      ctx.stroke()
    }
  }

  function getCanvasPoint(e: React.PointerEvent): StrokePoint {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvasRef.current!.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvasRef.current!.height / rect.height),
    }
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    if (activeTool !== 'draw') return
    e.preventDefault()
    setIsDrawing(true)
    const pt = getCanvasPoint(e)
    currentStroke.current = [pt]
    // Draw first dot
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, drawSize / 2, 0, Math.PI * 2)
    ctx.fillStyle = drawColor
    ctx.fill()
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    if (!isDrawing || activeTool !== 'draw') return
    e.preventDefault()
    const pt = getCanvasPoint(e)
    currentStroke.current.push(pt)
    const ctx = canvasRef.current!.getContext('2d')!
    const pts = currentStroke.current
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.strokeStyle = drawColor
    ctx.lineWidth   = drawSize
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
  }

  function onCanvasPointerUp(_e: React.PointerEvent) {
    if (!isDrawing || activeTool !== 'draw') return
    setIsDrawing(false)
    if (currentStroke.current.length > 0) {
      setStrokes(prev => [...prev, { color: drawColor, size: drawSize, points: currentStroke.current }])
      currentStroke.current = []
    }
  }

  /* ── Text placement ─────────────────────────────── */
  function onContainerClick(ev: React.MouseEvent) {
    if (activeTool !== 'text') return
    if ((ev.target as HTMLElement).closest('.text-item, .sticker-item')) return
    const rect = containerRef.current!.getBoundingClientRect()
    const x = ((ev.clientX - rect.left) / rect.width)  * 100
    const y = ((ev.clientY - rect.top)  / rect.height) * 100
    const newItem: TextItem = { id: nextId(), text: '', x, y, color: textColor, size: textSize, bold: textBold }
    setEditingText(newItem)
    setTextInput('')
  }

  function commitText() {
    if (!editingText) return
    if (textInput.trim()) {
      const item = { ...editingText, text: textInput.trim() }
      if (textItems.some(t => t.id === item.id)) {
        setTextItems(prev => prev.map(t => t.id === item.id ? item : t))
      } else {
        setTextItems(prev => [...prev, item])
      }
    }
    setEditingText(null)
    setTextInput('')
  }

  function editExistingText(item: TextItem) {
    setEditingText(item)
    setTextInput(item.text)
    setTextColor(item.color)
    setTextSize(item.size)
    setTextBold(item.bold)
    setActiveTool('text')
  }

  /* ── Sticker placement ──────────────────────────── */
  function placeSticker(emoji: string) {
    setStickerList(prev => [...prev, { id: nextId(), emoji, x: 40 + Math.random() * 20, y: 40 + Math.random() * 20 }])
    setActiveTool('none')
  }

  /* ── Drag text/sticker ──────────────────────────── */
  function startDrag(type: 'text'|'sticker', id: number, e: React.PointerEvent, origX: number, origY: number) {
    e.stopPropagation()
    dragItem.current = { type, id, startX: e.clientX, startY: e.clientY, origX, origY }
    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup',   onWindowPointerUp, { once: true })
  }

  const onWindowPointerMove = useCallback((e: PointerEvent) => {
    if (!dragItem.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dx = ((e.clientX - dragItem.current.startX) / rect.width)  * 100
    const dy = ((e.clientY - dragItem.current.startY) / rect.height) * 100
    const newX = Math.max(5, Math.min(95, dragItem.current.origX + dx))
    const newY = Math.max(5, Math.min(95, dragItem.current.origY + dy))
    if (dragItem.current.type === 'text') {
      setTextItems(prev => prev.map(t => t.id === dragItem.current!.id ? { ...t, x: newX, y: newY } : t))
    } else {
      setStickerList(prev => prev.map(s => s.id === dragItem.current!.id ? { ...s, x: newX, y: newY } : s))
    }
  }, [])

  const onWindowPointerUp = useCallback(() => {
    window.removeEventListener('pointermove', onWindowPointerMove)
    dragItem.current = null
  }, [onWindowPointerMove])

  /* ── Canvas composite export for images ─────────── */
  async function exportCompositeImage(): Promise<File> {
    const W = 1080, H = 1920
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!

    // 1. Draw background image with CSS filter
    const img = new Image()
    img.src = mediaUrl!
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej })

    ctx.save()
    if (activeFilter.css && activeFilter.css !== 'none') {
      ctx.filter = activeFilter.css
    }
    // Cover-fit: maintain aspect ratio, crop to fill 1080x1920
    const iw = img.naturalWidth, ih = img.naturalHeight
    const scale = Math.max(W / iw, H / ih)
    const sw = iw * scale, sh = ih * scale
    ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh)
    ctx.filter = 'none'
    ctx.restore()

    // 2. Color overlay
    if (activeFilter.overlay && activeFilter.overlay !== 'transparent') {
      ctx.save()
      ctx.fillStyle = activeFilter.overlay
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }

    // 3. Draw strokes from the drawing canvas
    if (canvasRef.current) {
      ctx.drawImage(canvasRef.current, 0, 0, W, H)
    }

    // 4. Draw text items
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const item of textItems) {
      const x = (item.x / 100) * W
      const y = (item.y / 100) * H
      const fontSize = item.size * 3  // scale from CSS px to canvas px
      ctx.font = `${item.bold ? '700' : '500'} ${fontSize}px system-ui, sans-serif`
      ctx.shadowColor = 'rgba(0,0,0,0.75)'
      ctx.shadowBlur = 12
      ctx.fillStyle = item.color
      ctx.fillText(item.text, x, y)
    }
    ctx.shadowBlur = 0
    ctx.restore()

    // 5. Draw stickers (emoji)
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '130px serif'
    for (const s of stickers) {
      const x = (s.x / 100) * W
      const y = (s.y / 100) * H
      ctx.fillText(s.emoji, x, y)
    }
    ctx.restore()

    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob(b => b ? res(b) : rej(new Error('Export failed')), 'image/jpeg', 0.92)
    )
    return new File([blob], 'story.jpg', { type: 'image/jpeg' })
  }

  /* ── Upload ──────────────────────────────────────── */
  async function handlePost() {
    if (!file) { toast.error('Pick a photo or video first'); return }
    const sourceError = await mediaUploadError(file, isVideo ? 'video' : 'image')
    if (sourceError) { toast.error(sourceError); return }
    setUploading(true)
    try {
      const fd = new FormData()

      if (isVideo) {
        // For video stories: upload raw video; encode text overlays as JSON caption
        fd.append('media', file)
        const captionData = textItems.length > 0
          ? [...textItems.map(t => t.text), mentionText.trim()].filter(Boolean).join(' ')
          : ''
        fd.append('caption', captionData)
      } else {
        // For image stories: composite everything onto a canvas and upload that
        // If a browser cannot render the selected image into a canvas, keep the
        // original file usable instead of failing the entire story upload.
        let imageToUpload = file
        try {
          imageToUpload = await exportCompositeImage()
        } catch (compositeError) {
          console.warn('Story image compositing failed; uploading original image', compositeError)
        }
        const imageError = await mediaUploadError(imageToUpload, 'image')
        if (imageError) throw new Error(imageError)
        fd.append('media', imageToUpload)
        // Caption = all text items joined (for search/display)
        fd.append('caption', [...textItems.map(t => t.text), mentionText.trim()].filter(Boolean).join(' '))
      }

      fd.append('bg_color', '#080810')
      fd.append('filter_id', filterId)
      fd.append('visibility', storyAudience)

      const res = await storiesApi.createStory(fd)
      const story = res.data.data
      if (!story?.id) throw new Error('The server did not return the uploaded story')

      // Immediately update the stories bar without a full reload
      if (story && user) {
        prependMyStory(story, user)
      }

      toast.success('Story shared!')
      navigateToAppRoot(navigate, location.pathname, '/app/feed')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to post story')
    } finally {
      setUploading(false)
    }
  }

  /* ─── Render ─────────────────────────────────────── */
  // No media yet — show picker
  if (!mediaUrl) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: '#000', display: 'flex', flexDirection: 'column',
      }}>
        {/* Close */}
        <button
          onClick={requestAppBack}
          style={{
            position: 'absolute', top: 'calc(16px + env(safe-area-inset-top, 0px))', left: 16, zIndex: 10,
            background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%',
            width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
          }}
        >
          <X size={20} />
        </button>

        {/* Tabs */}
        <div style={{
          position: 'absolute', top: 'calc(16px + env(safe-area-inset-top, 0px))', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', background: 'rgba(255,255,255,0.12)', borderRadius: '9999px',
          padding: '3px', gap: '2px', zIndex: 10,
        }}>
          {(['gallery', 'camera'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 18px', borderRadius: '9999px', border: 'none', cursor: 'pointer',
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? '#000' : 'rgba(255,255,255,0.75)',
                fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-body)',
                WebkitTapHighlightColor: 'transparent', textTransform: 'capitalize',
              }}
            >
              {t === 'gallery' ? 'Gallery' : 'Camera'}
            </button>
          ))}
        </div>

        {/* Camera view */}
        {tab === 'camera' ? (
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <video
              ref={videoRef}
              autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{
              position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)',
            }}>
              <button
                onClick={capturePhoto}
                style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: '#fff', border: '4px solid rgba(255,255,255,0.5)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Camera size={28} color="#000" />
              </button>
            </div>
          </div>
        ) : (
          /* Gallery picker */
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '20px',
            background: 'linear-gradient(180deg, #0D0B12 0%, #1A1228 100%)',
            padding: '32px',
          }}>
            {/* Decorative circles */}
            <div style={{
              width: 120, height: 120, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(24,24,27,0.3), rgba(196,77,204,0.15))',
              border: '1.5px solid rgba(187,255,0,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ImageIcon size={44} color="var(--color-lime)" strokeWidth={1.5} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-display)', color: '#fff' }}>
                Add to your story
              </p>
              <p style={{ margin: 0, fontSize: '14px', fontFamily: 'var(--font-body)', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                Share a photo or video — it disappears in 24 hours
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '14px 36px', borderRadius: '9999px',
                background: 'var(--color-lime)', border: 'none', cursor: 'pointer',
                fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-display)',
                color: '#0D0B12', WebkitTapHighlightColor: 'transparent',
              }}
            >
              Choose from gallery
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={e => { const files = e.currentTarget.files; void pickFile(files); e.currentTarget.value = '' }}
        />
      </div>
    )
  }

  /* ─── Editor (media selected) ─── */

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
      {/* Full-screen media */}
      <div
        ref={containerRef}
        onClick={onContainerClick}
        style={{
          position: 'absolute', inset: 0,
          overflow: 'hidden', touchAction: activeTool === 'draw' ? 'none' : 'auto',
        }}
      >
        {isVideo ? (
          <video
            src={mediaUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: activeFilter.css }}
            autoPlay loop muted playsInline
          />
        ) : (
          <img
            src={mediaUrl}
            alt="story"
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: activeFilter.css }}
            draggable={false}
          />
        )}

        {/* Color filter overlay */}
        {activeFilter.overlay !== 'transparent' && (
          <div style={{
            position: 'absolute', inset: 0,
            background: activeFilter.overlay,
            pointerEvents: 'none',
          }} />
        )}

        {/* Drawing canvas */}
        <canvas
          ref={canvasRef}
          width={1080}
          height={1920}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerUp}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            touchAction: 'none',
            pointerEvents: activeTool === 'draw' ? 'all' : 'none',
            cursor: activeTool === 'draw' ? 'crosshair' : 'default',
          }}
        />

        {/* Text items */}
        {textItems.map(item => (
          <div
            key={item.id}
            className="text-item"
            onPointerDown={e => startDrag('text', item.id, e, item.x, item.y)}
            onDoubleClick={e => { e.stopPropagation(); editExistingText(item) }}
            style={{
              position: 'absolute',
              left: `${item.x}%`, top: `${item.y}%`,
              transform: 'translate(-50%, -50%)',
              color: item.color,
              fontSize: `${item.size}px`,
              fontWeight: item.bold ? 700 : 500,
              fontFamily: 'var(--font-display)',
              textShadow: '0 1px 8px rgba(0,0,0,0.8)',
              cursor: 'move',
              userSelect: 'none',
              touchAction: 'none',
              maxWidth: '80%',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              textAlign: 'center',
            }}
          >
            {item.text}
          </div>
        ))}

        {/* Stickers */}
        {stickers.map(s => (
          <div
            key={s.id}
            className="sticker-item"
            onPointerDown={e => startDrag('sticker', s.id, e, s.x, s.y)}
            style={{
              position: 'absolute',
              left: `${s.x}%`, top: `${s.y}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: '40px',
              cursor: 'move',
              userSelect: 'none',
              touchAction: 'none',
              lineHeight: 1,
            }}
          >
            {s.emoji}
          </div>
        ))}

        {/* Text editing overlay */}
        {editingText && (
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.55)',
              zIndex: 50,
            }}
            onClick={e => { if (e.target === e.currentTarget) commitText() }}
          >
            <div style={{ width: '85%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <textarea
                autoFocus
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder="Type something…"
                style={{
                  width: '100%', background: 'rgba(0,0,0,0.45)',
                  border: '1.5px solid rgba(255,255,255,0.3)',
                  borderRadius: '14px', padding: '14px 16px',
                  color: textColor, fontSize: `${Math.min(textSize, 28)}px`,
                  fontWeight: textBold ? 700 : 500,
                  fontFamily: 'var(--font-display)',
                  outline: 'none', resize: 'none',
                  textAlign: 'center', backdropFilter: 'blur(8px)',
                  caretColor: 'var(--color-lime)', minHeight: '60px',
                }}
                rows={2}
              />
              {/* Color picker */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {TEXT_COLORS.map(c => (
                  <div
                    key={c}
                    onClick={() => setTextColor(c)}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', background: c,
                      border: textColor === c ? '2.5px solid var(--color-lime)' : '2px solid rgba(255,255,255,0.4)',
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  />
                ))}
              </div>
              {/* Size */}
              <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-body)' }}>A</span>
                <input type="range" min="16" max="56" value={textSize} onChange={e => setTextSize(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-lime)' }} />
                <span style={{ fontSize: '18px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-body)' }}>A</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setTextBold(b => !b)}
                  style={{
                    padding: '7px 16px', borderRadius: '9999px', border: 'none', cursor: 'pointer',
                    background: textBold ? 'rgba(187,255,0,0.2)' : 'rgba(255,255,255,0.15)',
                    color: textBold ? 'var(--color-lime)' : '#fff', fontSize: '14px', fontWeight: 700,
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Bold
                </button>
                <button
                  onClick={commitText}
                  style={{
                    padding: '7px 20px', borderRadius: '9999px', border: 'none', cursor: 'pointer',
                    background: 'var(--color-lime)', color: '#0D0B12', fontSize: '14px', fontWeight: 700,
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Top toolbar ─── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '14px 16px',
        paddingTop: 'calc(14px + env(safe-area-inset-top))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 10, pointerEvents: 'none',
      }}>
        <button
          onClick={() => { disposeLocalMediaPreview(mediaUrl); setFile(null); setMediaUrl(null); setTextItems([]); setStrokes([]); setStickerList([]); setActiveTool('none') }}
          style={{ ...circularBtnStyle, pointerEvents: 'all' }}
        >
          <X size={20} color="#fff" />
        </button>

        <div style={{ display: 'flex', gap: '10px', pointerEvents: 'all' }}>
          {/* Text */}
          <ToolBtn active={activeTool === 'text'} onClick={() => setActiveTool(a => a === 'text' ? 'none' : 'text')}>
            <Type size={18} />
          </ToolBtn>
          {/* Draw */}
          <ToolBtn active={activeTool === 'draw'} onClick={() => setActiveTool(a => a === 'draw' ? 'none' : 'draw')}>
            <Pen size={18} />
          </ToolBtn>
          {/* Sticker */}
          <ToolBtn active={activeTool === 'sticker'} onClick={() => setActiveTool(a => a === 'sticker' ? 'none' : 'sticker')}>
            <Smile size={18} />
          </ToolBtn>
          {/* Filter */}
          <ToolBtn active={activeTool === 'filter' as any} onClick={() => setActiveTool(a => (a as string) === 'filter' ? 'none' : 'filter' as any)}>
            <Sliders size={18} />
          </ToolBtn>
          {/* Undo last stroke */}
          {strokes.length > 0 && (
            <button
              onClick={() => setStrokes(prev => { const next = prev.slice(0, -1); return next })}
              style={circularBtnStyle}
            >
              <RotateCcw size={16} color="#fff" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Draw color picker ─── */}
      {activeTool === 'draw' && (
        <div style={{
          position: 'absolute', bottom: '110px', left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 20,
        }}>
          <div style={{ display: 'flex', gap: '8px', padding: '8px 16px', background: 'rgba(0,0,0,0.55)', borderRadius: '9999px', backdropFilter: 'blur(8px)' }}>
            {[...TEXT_COLORS, '#ff3b6b', '#00cfff'].map(c => (
              <div
                key={c}
                onClick={() => setDrawColor(c)}
                style={{
                  width: 26, height: 26, borderRadius: '50%', background: c,
                  border: drawColor === c ? '2.5px solid var(--color-lime)' : '2px solid rgba(255,255,255,0.35)',
                  cursor: 'pointer', flexShrink: 0,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.55)', borderRadius: '9999px', padding: '6px 16px', backdropFilter: 'blur(8px)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
            <input type="range" min="2" max="18" value={drawSize} onChange={e => setDrawSize(Number(e.target.value))} style={{ width: 100, accentColor: 'var(--color-lime)' }} />
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff' }} />
          </div>
        </div>
      )}

      {/* ─── Sticker picker ─── */}
      {activeTool === 'sticker' && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'rgba(13,11,18,0.95)', borderRadius: '20px 20px 0 0',
          padding: '16px', zIndex: 30, backdropFilter: 'blur(20px)',
          maxHeight: '50vh', overflowY: 'auto',
        }}>
          <div style={{ width: 36, height: 4, borderRadius: '9999px', background: 'rgba(255,255,255,0.2)', margin: '0 auto 16px' }} />
          <p style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-display)' }}>Stickers</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
            {STICKERS.map(emoji => (
              <button
                key={emoji}
                onClick={() => placeSticker(emoji)}
                style={{
                  fontSize: '32px', background: 'rgba(255,255,255,0.06)', border: 'none',
                  borderRadius: '12px', padding: '8px', cursor: 'pointer',
                  lineHeight: 1, WebkitTapHighlightColor: 'transparent',
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <button onClick={() => setActiveTool('none')} style={{ width: '100%', marginTop: '12px', padding: '10px', background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: '12px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '14px' }}>
            Cancel
          </button>
        </div>
      )}

      {/* ─── Filter picker ─── */}
      {(activeTool as string) === 'filter' && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'rgba(13,11,18,0.95)', borderRadius: '20px 20px 0 0',
          padding: '16px', zIndex: 30, backdropFilter: 'blur(20px)',
        }}>
          <div style={{ width: 36, height: 4, borderRadius: '9999px', background: 'rgba(255,255,255,0.2)', margin: '0 auto 16px' }} />
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
            {BG_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => { setFilterId(f.id); setActiveTool('none') }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{
                  width: 60, height: 90, borderRadius: '10px', overflow: 'hidden', position: 'relative',
                  outline: filterId === f.id ? '2.5px solid var(--color-lime)' : '2.5px solid transparent',
                }}>
                  <img src={mediaUrl!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: f.css }} />
                  {f.overlay !== 'transparent' && (
                    <div style={{ position: 'absolute', inset: 0, background: f.overlay }} />
                  )}
                </div>
                <span style={{ fontSize: '11px', color: filterId === f.id ? 'var(--color-lime)' : 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}>
                  {f.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Bottom bar — Share button ─── */}
      {activeTool === 'none' && !editingText && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '16px 20px',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
          display: 'flex', alignItems: 'center', gap: '12px',
          zIndex: 10,
        }}>
          <input
            value={mentionText}
            onChange={e => setMentionText(e.target.value)}
            placeholder="@mention people"
            aria-label="Mention people in story"
            style={{ flex: 1, minWidth: 0, padding: '11px 14px', borderRadius: '9999px', border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(0,0,0,0.45)', color: '#fff', outline: 'none', fontSize: '13px', fontFamily: 'var(--font-body)' }}
          />
          <select
            value={storyAudience}
            onChange={e => setStoryAudience(e.target.value as 'normal' | 'close_mates')}
            aria-label="Story audience"
            style={{ padding: '10px 8px', borderRadius: '9999px', border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(0,0,0,0.65)', color: 'var(--color-lime)', outline: 'none', fontSize: '12px' }}
          >
            <option value="normal">Everyone</option>
            <option value="close_mates">Close Mates</option>
          </select>
          <button
            onClick={handlePost}
            disabled={uploading}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '14px 28px', borderRadius: '9999px',
              background: uploading ? 'rgba(187,255,0,0.5)' : 'var(--color-lime)',
              border: 'none', cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-display)',
              color: '#0D0B12', boxShadow: '0 4px 20px rgba(187,255,0,0.35)',
              WebkitTapHighlightColor: 'transparent',
              transition: 'all 150ms',
            }}
          >
            <Check size={18} strokeWidth={2.5} />
            {uploading ? 'Sharing…' : 'Your Story'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Shared sub-components ── */
const circularBtnStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
  border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  WebkitTapHighlightColor: 'transparent',
}

function ToolBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 38, height: 38, borderRadius: '50%',
        background: active ? 'rgba(187,255,0,0.25)' : 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        border: active ? '1.5px solid rgba(187,255,0,0.6)' : 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: active ? 'var(--color-lime)' : '#fff',
        WebkitTapHighlightColor: 'transparent',
        transition: 'all 150ms',
      }}
    >
      {children}
    </button>
  )
}
