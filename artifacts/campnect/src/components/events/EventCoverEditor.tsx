import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { colors, radii, shadows } from '../../styles/tokens'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

type EventCoverEditorProps = {
  file: File
  onApply: (file: File, previewUrl: string) => void
  onCancel: () => void
}

type Size = { width: number; height: number }

export function EventCoverEditor({ file, onApply, onCancel }: EventCoverEditorProps) {
  useBackDismiss(true, onCancel, 400)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; zoom: number; panX: number; panY: number } | null>(null)
  const [natural, setNatural] = useState<Size | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [frame, setFrame] = useState<Size>({ width: 340, height: 191 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  useEffect(() => {
    let disposed = false
    let objectUrl = ''
    let fallbackAttempted = false

    setNatural(null)
    setLoadError(false)
    setSourceUrl(null)
    imageRef.current = null

    const finish = (image: HTMLImageElement, src: string) => {
      if (disposed) return
      imageRef.current = image
      setSourceUrl(src)
      setNatural({ width: image.naturalWidth, height: image.naturalHeight })
    }

    const loadSource = (src: string) => {
      const image = new Image()
      image.onload = () => finish(image, src)
      image.onerror = async () => {
        if (disposed || fallbackAttempted) {
          if (!disposed) setLoadError(true)
          return
        }
        fallbackAttempted = true
        try {
          const reader = new FileReader()
          reader.onload = () => {
            if (disposed || typeof reader.result !== 'string') return
            loadSource(reader.result)
          }
          reader.onerror = () => { if (!disposed) setLoadError(true) }
          reader.readAsDataURL(file)
        } catch {
          if (!disposed) setLoadError(true)
        }
      }
      image.src = src
    }

    try {
      objectUrl = URL.createObjectURL(file)
      loadSource(objectUrl)
    } catch {
      setLoadError(true)
    }

    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  useEffect(() => {
    if (!frameRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(240, entry.contentRect.width)
      setFrame({ width, height: width * 9 / 16 })
    })
    observer.observe(frameRef.current)
    return () => observer.disconnect()
  }, [])

  const imageLayout = natural ? coverLayout(natural, frame, zoom) : null
  const clampPan = (next: { x: number; y: number }, zoomLevel = zoom) => {
    const layout = natural ? coverLayout(natural, frame, zoomLevel) : null
    if (!layout) return next
    return {
      x: Math.max(-layout.maxPanX, Math.min(layout.maxPanX, next.x)),
      y: Math.max(-layout.maxPanY, Math.min(layout.maxPanY, next.y)),
    }
  }
  const pointerPair = () => Array.from(pointersRef.current.values()).slice(0, 2)
  const pointerDistance = ([first, second]: { x: number; y: number }[]) => Math.hypot(second.x - first.x, second.y - first.y)
  const beginPinch = () => {
    const points = pointerPair()
    if (points.length !== 2) return
    pinchRef.current = { distance: pointerDistance(points), zoom, panX: pan.x, panY: pan.y }
    dragRef.current = null
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size === 1) {
      dragRef.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y }
    } else if (pointersRef.current.size === 2) {
      beginPinch()
    }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const distance = pointerDistance(pointerPair())
      const nextZoom = Math.max(1, Math.min(3, pinchRef.current.zoom * (distance / pinchRef.current.distance)))
      setZoom(nextZoom)
      setPan(clampPan({ x: pinchRef.current.panX, y: pinchRef.current.panY }, nextZoom))
      return
    }
    if (!dragRef.current) return
    setPan(clampPan({
      x: dragRef.current.panX + event.clientX - dragRef.current.startX,
      y: dragRef.current.panY + event.clientY - dragRef.current.startY,
    }))
  }
  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    pinchRef.current = null
    const [remainingPointer] = pointerPair()
    dragRef.current = remainingPointer
      ? { startX: remainingPointer.x, startY: remainingPointer.y, panX: pan.x, panY: pan.y }
      : null
  }
  const apply = () => {
    const image = imageRef.current
    if (!image || !natural || !imageLayout) return
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 675
    const context = canvas.getContext('2d')
    if (!context) return
    const scale = canvas.width / frame.width
    context.drawImage(
      image,
      ((frame.width - imageLayout.width) / 2 + pan.x) * scale,
      ((frame.height - imageLayout.height) / 2 + pan.y) * scale,
      imageLayout.width * scale,
      imageLayout.height * scale,
    )
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Unable to prepare that image')
        return
      }
      const cropped = new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-event-cover.jpg`, { type: 'image/jpeg' })
      onApply(cropped, URL.createObjectURL(cropped))
    }, 'image/jpeg', 0.9)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit event image" style={overlay}>
      <div style={modal}>
        <header style={modalHeader}>
          <div><p style={eyebrow}>Event image</p><h2 style={{ margin: '4px 0 0', fontSize: 20 }}>Crop your cover</h2></div>
          <button onClick={onCancel} aria-label="Close image editor" style={circleButton}><X size={17} /></button>
        </header>
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          style={cropFrame}
        >
          <img
            src={sourceUrl || undefined}
            alt="Event cover preview"
            onError={() => { if (!natural) setLoadError(true) }}
            draggable={false}
            style={imageLayout ? { position: 'absolute', width: imageLayout.width, height: imageLayout.height, left: (frame.width - imageLayout.width) / 2 + pan.x, top: (frame.height - imageLayout.height) / 2 + pan.y, maxWidth: 'none', userSelect: 'none' } : { visibility: 'hidden' }}
          />
          <div style={cropGuide} />
          {!natural && !loadError && <span style={{ color: colors.textMuted, fontSize: 12 }}>Loading image…</span>}
          {loadError && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#ffc1cf', fontSize: 12, textAlign: 'center' }}><strong>We couldn’t read that image.</strong><span>Choose a JPG, PNG, or WEBP file and try again.</span></div>}
          <span style={dragHint}>Drag to reposition · Pinch to zoom</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} aria-label="Reset image crop" style={resetButton}><RotateCcw size={14} /></button>
        </div>
        <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
          <button onClick={onCancel} style={{ ...secondaryButton, flex: 1 }}>Cancel</button>
          <button onClick={apply} disabled={!natural} style={{ ...primaryButton, flex: 1, opacity: natural ? 1 : 0.6 }}><Check size={16} /> Use image</button>
        </div>
      </div>
    </div>
  )
}

function coverLayout(natural: Size, frame: Size, zoom: number) {
  const coverScale = Math.max(frame.width / natural.width, frame.height / natural.height)
  const width = natural.width * coverScale * zoom
  const height = natural.height * coverScale * zoom
  return {
    width,
    height,
    maxPanX: Math.max(0, (width - frame.width) / 2),
    maxPanY: Math.max(0, (height - frame.height) / 2),
  }
}

const overlay: CSSProperties = { position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12, background: 'rgba(0,0,0,0.78)' }
const modal: CSSProperties = { width: 'min(100%, 430px)', maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', padding: 16, border: `1px solid ${colors.borderStrong}`, borderRadius: 24, background: '#14111f', boxShadow: shadows.card }
const modalHeader: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 15 }
const eyebrow: CSSProperties = { margin: 0, color: colors.lime, fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }
const circleButton: CSSProperties = { width: 38, height: 38, flexShrink: 0, border: `1px solid ${colors.border}`, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', color: colors.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
const cropFrame: CSSProperties = { position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: radii.lg, background: '#08070d', cursor: 'grab', touchAction: 'none' }
const cropGuide: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.28)', boxShadow: 'inset 0 0 0 999px rgba(0,0,0,0.08)' }
const dragHint: CSSProperties = { position: 'absolute', left: 0, right: 0, bottom: 10, color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: 800, textAlign: 'center', textShadow: '0 1px 5px #000', pointerEvents: 'none' }
const secondaryButton: CSSProperties = { minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: `1px solid ${colors.border}`, borderRadius: radii.pill, background: 'rgba(255,255,255,0.05)', color: colors.textPrimary, fontSize: 12, fontWeight: 800, cursor: 'pointer' }
const primaryButton: CSSProperties = { minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 0, borderRadius: radii.pill, background: colors.lime, color: colors.onLime, fontSize: 12, fontWeight: 900, cursor: 'pointer', boxShadow: shadows.btn }
const resetButton: CSSProperties = { width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colors.border}`, borderRadius: '50%', background: 'transparent', color: colors.textSecondary, cursor: 'pointer' }