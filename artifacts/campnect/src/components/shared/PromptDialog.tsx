import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Flag, X } from 'lucide-react'
import { colors, radii, shadows, typography } from '../../styles/tokens'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

interface PromptDialogProps {
  open: boolean
  title: string
  message: string
  placeholder?: string
  defaultValue?: string
  submitLabel: string
  cancelLabel?: string
  busy?: boolean
  destructive?: boolean
  onSubmit: (reason: string, details?: string) => void | Promise<void>
  onCancel: () => void
}

export function PromptDialog({
  open,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  submitLabel,
  cancelLabel = 'Cancel',
  busy = false,
  destructive = false,
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const [reason, setReason] = useState(defaultValue || 'other')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (open) {
      setReason(defaultValue || 'other')
      setDetails('')
      setSubmitting(false)
    }
  }, [defaultValue, open])
  const pending = busy || submitting
  useBackDismiss(open && !pending, onCancel, 300)
  if (!open) return null

  async function handleSubmit() {
    if (pending || !reason) return
    setSubmitting(true)
    try {
      await onSubmit(reason, details.trim() || undefined)
    } finally {
      setSubmitting(false)
    }
  }

  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-dialog-title"
      onClick={() => { if (!pending) onCancel() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
          alignItems: 'center',
        justifyContent: 'center',
          padding: 'max(16px, var(--sat)) 16px max(16px, var(--sab))',
          background: 'rgba(15, 15, 20, 0.48)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          padding: 20,
          border: `1px solid ${destructive ? 'rgba(225,29,72,0.32)' : 'rgba(15,15,20,0.10)'}`,
          borderRadius: 24,
          background: '#FFFFFF',
          boxShadow: '0 24px 72px rgba(15,15,20,0.24)',
          fontFamily: typography.fontBody,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 42, height: 42, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, background: 'rgba(225,29,72,0.10)', color: '#E11D48' }}>
            <Flag size={19} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id="prompt-dialog-title" style={{ margin: '1px 0 6px', color: '#17141F', fontSize: 19, lineHeight: 1.2, fontFamily: typography.fontDisplay }}>{title}</h2>
            <p style={{ margin: 0, color: '#625D6A', fontSize: 13, lineHeight: 1.48 }}>{message}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" disabled={pending} style={{ width: 36, height: 36, flexShrink: 0, border: 0, borderRadius: '50%', background: '#F2F0F5', color: '#3C3744', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
        <p style={{ margin: '18px 0 9px', color: '#625D6A', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>What’s the issue?</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[['spam', 'Spam or scam'], ['harassment', 'Harassment'], ['nudity', 'Sexual content'], ['violence', 'Violence or danger'], ['hate', 'Hate or bullying'], ['other', 'Something else']].map(([value, label]) => {
            const active = reason === value
            return <button key={value} type="button" onClick={() => setReason(value)} disabled={pending} style={{ minHeight: 42, padding: '0 10px', borderRadius: 12, border: `1px solid ${active ? '#7FAE00' : '#E3E0E8'}`, background: active ? '#F1F9D7' : '#FFFFFF', color: active ? '#466300' : '#393441', textAlign: 'left', fontFamily: typography.fontBody, fontSize: 12, fontWeight: 750, cursor: 'pointer' }}>{label}</button>
          })}
        </div>
        <label style={{ display: 'block', margin: '16px 0 7px', color: '#393441', fontSize: 12, fontWeight: 700 }}>Add details <span style={{ color: '#847E8B', fontWeight: 500 }}>(optional)</span></label>
        <textarea
          autoFocus
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          disabled={pending}
          placeholder={placeholder || 'Share any details that will help our safety team.'}
          rows={3}
          aria-label="Additional report details"
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px', resize: 'vertical', minHeight: 82, borderRadius: 14, border: '1px solid #DCD8E2', outline: 'none', background: '#FAF9FB', color: '#201C27', caretColor: '#638800', fontFamily: typography.fontBody, fontSize: 14, lineHeight: 1.45 }}
        />
        <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
          <button type="button" onClick={onCancel} disabled={pending} style={{ flex: 1, minHeight: 46, border: '1px solid #DCD8E2', borderRadius: radii.pill, background: '#FFFFFF', color: '#393441', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
            {cancelLabel}
          </button>
          <button type="button" onClick={() => void handleSubmit()} disabled={pending || !reason} style={{ flex: 1, minHeight: 46, border: 0, borderRadius: radii.pill, background: destructive ? '#DC2626' : colors.lime, color: destructive ? '#fff' : colors.onLime, fontSize: 13, fontWeight: 900, cursor: pending || !reason ? 'not-allowed' : 'pointer', boxShadow: destructive ? 'none' : shadows.btn, opacity: pending || !reason ? 0.55 : 1 }}>
            {pending ? 'Please wait…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
  return createPortal(dialog, document.body)
}