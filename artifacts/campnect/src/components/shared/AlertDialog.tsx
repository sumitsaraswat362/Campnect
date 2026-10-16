import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { colors, radii, shadows, typography } from '../../styles/tokens'

interface AlertDialogProps {
  message: string | null
  title?: string
  onClose: () => void
}

export function AlertDialog({ message, title = 'Video could not be opened', onClose }: AlertDialogProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useBackDismiss(Boolean(message), onClose, 300)

  useEffect(() => {
    if (!message) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    buttonRef.current?.focus()
    return () => previous?.focus()
  }, [message])

  if (!message) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-alert-title"
      aria-describedby="media-alert-message"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.74)', backdropFilter: 'blur(8px)' }}
    >
      <div onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: 430, padding: 18, border: `1px solid ${colors.borderStrong}`, borderRadius: radii.xl, background: '#151222', boxShadow: shadows.card, fontFamily: typography.fontBody }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span aria-hidden="true" style={{ width: 38, height: 38, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 13, background: colors.purpleDim, color: colors.lime }}><AlertTriangle size={19} /></span>
          <div>
            <h2 id="media-alert-title" style={{ margin: '1px 0 6px', color: '#fff', fontSize: 17, lineHeight: 1.2 }}>{title}</h2>
            <p id="media-alert-message" style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.5 }}>{message}</p>
          </div>
        </div>
        <button ref={buttonRef} type="button" onClick={onClose} style={{ width: '100%', minHeight: 44, marginTop: 18, border: 0, borderRadius: radii.pill, background: colors.lime, color: colors.onLime, fontSize: 13, fontWeight: 900, cursor: 'pointer', boxShadow: shadows.btn }}>OK</button>
      </div>
    </div>,
    document.body,
  )
}