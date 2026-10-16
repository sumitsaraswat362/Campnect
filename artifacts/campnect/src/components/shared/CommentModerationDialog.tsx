import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import {
  commentWarningCanBeConfirmed,
  COMMENT_STRONG_WARNING_MESSAGE,
  COMMENT_WARNING_MESSAGE,
  type CommentModerationPrompt,
} from '../../features/comments/commentModeration'

interface CommentModerationDialogProps {
  open: boolean
  prompt: CommentModerationPrompt | null
  busy?: boolean
  onEdit: () => void
  onConfirm: () => void
  onCancel: () => void
}

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function CommentModerationDialog({
  open,
  prompt,
  busy = false,
  onEdit,
  onConfirm,
  onCancel,
}: CommentModerationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const canPostAnyway = commentWarningCanBeConfirmed(prompt)
  const isSevere = prompt?.severity === 'HIGH' || prompt?.severity === 'CRITICAL'
  const title = prompt?.decision === 'WARN' && canPostAnyway && !isSevere
    ? 'Before you comment'
    : prompt?.decision === 'HUMAN_REVIEW'
      ? 'Your comment needs a human review'
      : 'Your comment may violate our guidelines'

  useBackDismiss(open, onCancel, 230)

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current && previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus()
      }
      wasOpenRef.current = false
      previousFocusRef.current = null
      return
    }

    if (!wasOpenRef.current) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      wasOpenRef.current = true
      window.setTimeout(() => {
        if (canPostAnyway) confirmRef.current?.focus()
        else editRef.current?.focus()
      }, 0)
    }

    return () => {
      if (wasOpenRef.current && !previousFocusRef.current?.isConnected) {
        previousFocusRef.current = null
      }
    }
  }, [open, canPostAnyway])

  if (!open || !prompt) return null

  const dismiss = () => {
    if (!busy) onCancel()
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      dismiss()
      return
    }
    if (event.key !== 'Tab') return

    const buttons = dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector)
    if (!buttons?.length) {
      event.preventDefault()
      dialogRef.current?.focus()
      return
    }
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'max(20px, env(safe-area-inset-top, 0px)) 16px max(20px, env(safe-area-inset-bottom, 0px))',
        background: 'rgba(0,0,0,.66)', backdropFilter: 'blur(6px)',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="comment-moderation-title"
        aria-describedby="comment-moderation-description"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%', maxWidth: 400, maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto',
          padding: '22px 20px 18px', borderRadius: 22,
          background: 'var(--color-bg)', border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)', boxShadow: '0 18px 54px rgba(0,0,0,.42)',
        }}
      >
        <h2 id="comment-moderation-title" style={{ margin: '0 0 11px', color: 'var(--color-text-primary)', fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-display)' }}>
          {title}
        </h2>
        <p id="comment-moderation-description" style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
          {prompt.decision === 'WARN' && canPostAnyway && !isSevere ? COMMENT_WARNING_MESSAGE : COMMENT_STRONG_WARNING_MESSAGE}
        </p>
        {prompt.decision === 'HUMAN_REVIEW' && (
          <p role="status" style={{ margin: '12px 0 0', color: 'var(--color-text-muted)', fontSize: 13, lineHeight: 1.5 }}>
            This comment hasn’t been posted. Our team can review it; you can edit it or cancel for now.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            ref={editRef}
            type="button"
            disabled={busy}
            onClick={onEdit}
            style={secondaryButtonStyle}
          >
            Edit Comment
          </button>
          {canPostAnyway ? (
            <button
              ref={confirmRef}
              type="button"
              disabled={busy}
              onClick={onConfirm}
              style={primaryButtonStyle}
            >
              {busy ? 'Checking…' : 'Post Anyway'}
            </button>
          ) : (
            <button
              ref={confirmRef}
              type="button"
              disabled={busy}
              onClick={dismiss}
              style={primaryButtonStyle}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const primaryButtonStyle: React.CSSProperties = {
  border: 0, borderRadius: 12, padding: '11px 16px', minHeight: 42,
  background: 'var(--color-text-primary)', color: 'var(--color-bg)',
  fontSize: 14, fontWeight: 700, cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 12,
  padding: '11px 16px', minHeight: 42, background: 'var(--color-surface)',
  color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
