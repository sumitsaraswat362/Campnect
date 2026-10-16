/**
 * ImageCropper — pure canvas-based crop/zoom modal.
 * No external dependencies.
 *
 * Props:
 *   file       — raw File from <input type="file">
 *   aspect     — desired output aspect ratio (1 for square, 3 for banner, undefined for free)
 *   onConfirm  — called with a cropped Blob
 *   onCancel   — called when user dismisses
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn, ZoomOut, Check } from 'lucide-react'
import { createLocalMediaPreview, disposeLocalMediaPreview } from '../../utils/localMediaPreview'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

interface Props {
  file: File
  aspect?: number          // width/height; 1 = square, 3 = cover banner
  outputSize?: number      // max output dimension in px (default 800)
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

export function ImageCropper({ file, aspect = 1, outputSize = 1080, onConfirm, onCancel }: Props) {
  useBackDismiss(true, onCancel, 350)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const imgRef    = useRef<HTMLImageElement | null>(null)

  // img coords / scale
  const [_imgUrl, setImgUrl] = useState('')
  const [scale, setScale]   = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [ready, setReady]   = useState(false)

  // drag state
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, ox: 0, oy: 0 })
  // pinch state
  const pinchRef = useRef({ active: false, dist: 0, scale: 1 })

  // ---------- load image ----------
  useEffect(() => {
    let disposed = false
    let url: string | null = null
    setReady(false)
    void createLocalMediaPreview(file)
      .then((preview) => {
        if (disposed) {
          disposeLocalMediaPreview(preview)
          return
        }
        url = preview
        setImgUrl(preview)
        const img = new Image()
        img.onload = () => {
          if (disposed) return
          imgRef.current = img
          setReady(true)
        }
        img.src = preview
      })
      .catch(() => {
        if (!disposed) setReady(false)
      })
    return () => {
      disposed = true
      disposeLocalMediaPreview(url)
    }
  }, [file])

  // ---------- frame dimensions (responsive) ----------
  const [viewport, setViewport] = useState(() => ({
    width: window.visualViewport?.width || window.innerWidth,
    height: window.visualViewport?.height || window.innerHeight,
  }))

  useEffect(() => {
    const updateViewport = () => setViewport({
      width: window.visualViewport?.width || window.innerWidth,
      height: window.visualViewport?.height || window.innerHeight,
    })
    const visualViewport = window.visualViewport
    window.addEventListener('resize', updateViewport)
    visualViewport?.addEventListener('resize', updateViewport)
    visualViewport?.addEventListener('scroll', updateViewport)
    return () => {
      window.removeEventListener('resize', updateViewport)
      visualViewport?.removeEventListener('resize', updateViewport)
      visualViewport?.removeEventListener('scroll', updateViewport)
    }
  }, [])

  // Keep the cropper modal in control of scrolling while it is open. This is
  // especially important in Capacitor/WebView, where a drag can otherwise
  // scroll the profile page underneath the fixed editor.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousOverscrollBehavior = document.body.style.overscrollBehavior
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscrollBehavior
    }
  }, [])

  const frameW = Math.min(380, Math.max(180, viewport.width - 32))
  const frameH = aspect ? Math.round(frameW / aspect) : frameW  // square by default

  // ---------- clamp offset so image always covers frame ----------
  const clamp = useCallback((ox: number, oy: number, sc: number) => {
    const img = imgRef.current
    if (!img) return { x: ox, y: oy }
    const iw = img.naturalWidth  * sc
    const ih = img.naturalHeight * sc
    const minX = frameW - iw;  const maxX = 0
    const minY = frameH - ih;  const maxY = 0
    return {
      x: Math.max(Math.min(ox, maxX), minX),
      y: Math.max(Math.min(oy, maxY), minY),
    }
  }, [frameW, frameH])

  // ---------- initial fit ----------
  useEffect(() => {
    if (!ready || !imgRef.current) return
    const img = imgRef.current
    const fitScale = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight)
    const sc = fitScale
    const ox = (frameW - img.naturalWidth  * sc) / 2
    const oy = (frameH - img.naturalHeight * sc) / 2
    setScale(sc)
    setOffset({ x: ox, y: oy })
  }, [ready, frameW, frameH])

  // ---------- draw ----------
  useEffect(() => {
    if (!ready || !imgRef.current || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')!
    ctx.clearRect(0, 0, frameW, frameH)
    ctx.drawImage(imgRef.current, offset.x, offset.y, imgRef.current.naturalWidth * scale, imgRef.current.naturalHeight * scale)
  }, [ready, scale, offset, frameW, frameH])

  // ---------- mouse drag ----------
  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current.dragging) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const clamped = clamp(dragRef.current.ox + dx, dragRef.current.oy + dy, scale)
    setOffset(clamped)
  }
  function onMouseUp() { dragRef.current.dragging = false }

  // ---------- touch drag + pinch ----------
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      dragRef.current = { dragging: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY, ox: offset.x, oy: offset.y }
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      pinchRef.current = { active: true, dist, scale }
      dragRef.current.dragging = false
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    if (pinchRef.current.active && e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const img = imgRef.current!
      const minScale = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight)
      const newScale = Math.max(minScale, Math.min(4, pinchRef.current.scale * (dist / pinchRef.current.dist)))
      setScale(newScale)
      setOffset((o) => clamp(o.x, o.y, newScale))
    } else if (dragRef.current.dragging && e.touches.length === 1) {
      const dx = e.touches[0].clientX - dragRef.current.startX
      const dy = e.touches[0].clientY - dragRef.current.startY
      setOffset(clamp(dragRef.current.ox + dx, dragRef.current.oy + dy, scale))
    }
  }
  function onTouchEnd() {
    dragRef.current.dragging = false
    pinchRef.current.active  = false
  }

  // ---------- zoom buttons ----------
  function zoom(dir: 1 | -1) {
    setScale((s) => {
      const img = imgRef.current!
      const minScale = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight)
      const ns = Math.max(minScale, Math.min(4, s + dir * 0.15))
      setOffset((o) => clamp(o.x, o.y, ns))
      return ns
    })
  }

  // ---------- confirm — draw to output canvas and export ----------
  function confirm() {
    const img = imgRef.current
    if (!ready || !img) return
    // Never upscale the selected source region. Enlarging a small crop onto a
    // fixed canvas softens detail before it is uploaded and cannot add quality.
    const sourceCropWidth = frameW / scale
    const outW = Math.max(1, Math.min(outputSize, Math.round(sourceCropWidth)))
    const outH = aspect ? Math.max(1, Math.round(outW / aspect)) : outputSize
    const scaleFactor = outW / frameW

    const out = document.createElement('canvas')
    out.width  = outW
    out.height = outH
    const ctx = out.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, offset.x * scaleFactor, offset.y * scaleFactor, img.naturalWidth * scale * scaleFactor, img.naturalHeight * scale * scaleFactor)
    out.toBlob((blob) => { if (blob) onConfirm(blob) }, 'image/jpeg', 0.98)
  }

  return createPortal((
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.95)',
        height: 'var(--visual-viewport-height, 100dvh)', maxHeight: 'var(--visual-viewport-height, 100dvh)', boxSizing: 'border-box',
        paddingTop: 'var(--sat)',
        paddingBottom: 'var(--sab)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        overflow: 'hidden', overscrollBehavior: 'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '430px', padding: '12px 20px', boxSizing: 'border-box', flexShrink: 0 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: '6px', WebkitTapHighlightColor: 'transparent' }}>
          <X size={22} />
        </button>
        <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: '#fff' }}>
          Crop & Adjust
        </p>
        <button onClick={confirm} disabled={!ready} style={{ background: '#B7FF00', border: 'none', borderRadius: '9999px', padding: '8px 18px', cursor: ready ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: '#0B0B0D', display: 'flex', alignItems: 'center', gap: '5px', opacity: ready ? 1 : 0.55, WebkitTapHighlightColor: 'transparent' }}>
          <Check size={14} strokeWidth={3} />
          Save
        </button>
      </div>

      <div style={{
        width: '100%', minHeight: 0, flex: '1 1 auto', overflowY: 'auto',
        overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '12px 16px 20px', boxSizing: 'border-box',
      }}>
        {/* Canvas */}
        <div
          ref={wrapRef}
          style={{ position: 'relative', cursor: 'grab', touchAction: 'none', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.25)', flexShrink: 0 }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <canvas ref={canvasRef} width={frameW} height={frameH} style={{ display: 'block', width: frameW, height: frameH }} />
          {/* Grid overlay */}
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={frameW} height={frameH}>
            <line x1={frameW/3}   y1={0} x2={frameW/3}   y2={frameH} stroke="rgba(255,255,255,0.20)" strokeWidth="1" />
            <line x1={frameW*2/3} y1={0} x2={frameW*2/3} y2={frameH} stroke="rgba(255,255,255,0.20)" strokeWidth="1" />
            <line x1={0} y1={frameH/3}   x2={frameW} y2={frameH/3}   stroke="rgba(255,255,255,0.20)" strokeWidth="1" />
            <line x1={0} y1={frameH*2/3} x2={frameW} y2={frameH*2/3} stroke="rgba(255,255,255,0.20)" strokeWidth="1" />
            <rect x={0} y={0} width={frameW} height={frameH} fill="none" stroke="rgba(255,255,255,0.50)" strokeWidth="1.5" rx="10" />
          </svg>
        </div>

        {/* Zoom controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '24px', flexShrink: 0 }}>
          <button onClick={() => zoom(-1)} style={{ background: 'rgba(255,255,255,0.10)', border: 'none', borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
            <ZoomOut size={20} />
          </button>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.50)', fontSize: '13px', fontFamily: 'var(--font-body)', minWidth: '60px', textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </p>
          <button onClick={() => zoom(1)} style={{ background: 'rgba(255,255,255,0.10)', border: 'none', borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
            <ZoomIn size={20} />
          </button>
        </div>

        <p style={{ margin: '16px 0 0', color: 'rgba(255,255,255,0.35)', fontSize: '12px', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
          Drag to reposition · Pinch or use buttons to zoom
        </p>
      </div>
    </div>
  ), document.body)
}
