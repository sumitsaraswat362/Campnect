import { AlertTriangle, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { colors, radii, shadows, typography } from '../../styles/tokens'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  busy?: boolean
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Keep it',
  busy = false,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useBackDismiss(open && !busy, onCancel, 300)
  if (!open) return null

  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.74)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 430,
          padding: 18,
          border: `1px solid ${destructive ? 'rgba(239,68,68,0.34)' : colors.borderStrong}`,
          borderRadius: radii.xl,
          background: '#151222',
          boxShadow: shadows.card,
          fontFamily: typography.fontBody,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 13,
              background: destructive ? 'rgba(239,68,68,0.12)' : colors.purpleDim,
              color: destructive ? '#FCA5A5' : colors.lime,
            }}
          >
            <AlertTriangle size={19} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id="confirm-dialog-title" style={{ margin: '1px 0 6px', color: '#fff', fontSize: 17, lineHeight: 1.2 }}>
              {title}
            </h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.5 }}>
              {message}
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" disabled={busy} style={{ width: 32, height: 32, flexShrink: 0, border: 0, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
          <button type="button" onClick={onCancel} disabled={busy} style={{ flex: 1, minHeight: 44, border: '1px solid rgba(255,255,255,0.16)', borderRadius: radii.pill, background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} style={{ flex: 1, minHeight: 44, border: 0, borderRadius: radii.pill, background: destructive ? '#DC2626' : colors.lime, color: destructive ? '#fff' : colors.onLime, fontSize: 12, fontWeight: 900, cursor: 'pointer', boxShadow: destructive ? 'none' : shadows.btn, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
  return createPortal(dialog, document.body)
}