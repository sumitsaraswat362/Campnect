import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { Avatar } from '../shared/Avatar'

interface MessagePreview {
  id: string
  conversationId: string | null
  actorName: string
  actorAvatar?: string | null
  preview: string
}

const PREVIEW_DURATION_MS = 4200
const EXIT_DURATION_MS = 220

function conversationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/app\/chat\/([^/]+)\/?$/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function MessagePreviewBanner() {
  const navigate = useNavigate()
  const [preview, setPreview] = useState<MessagePreview | null>(null)
  const [leaving, setLeaving] = useState(false)
  const dismissTimer = useRef<number | null>(null)
  const removeTimer = useRef<number | null>(null)
  const lastPreview = useRef<{ id: string; receivedAt: number } | null>(null)

  function clearTimers() {
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current)
    if (removeTimer.current !== null) window.clearTimeout(removeTimer.current)
    dismissTimer.current = null
    removeTimer.current = null
  }

  function dismiss() {
    clearTimers()
    setLeaving(true)
    removeTimer.current = window.setTimeout(() => {
      setPreview(null)
      setLeaving(false)
      removeTimer.current = null
    }, EXIT_DURATION_MS)
  }

  useEffect(() => {
    const handlePreview = (event: Event) => {
      const detail = (event as CustomEvent<MessagePreview>).detail
      if (!detail?.id || !detail.actorName) return
      // The incoming message is already visible in the open conversation, so
      // a second in-app alert would be distracting and misleading.
      if (detail.conversationId && detail.conversationId === conversationIdFromPath(window.location.pathname)) return
      const now = Date.now()
      if (lastPreview.current?.id === detail.id && now - lastPreview.current.receivedAt < PREVIEW_DURATION_MS) return

      clearTimers()
      setLeaving(false)
      setPreview(detail)
      lastPreview.current = { id: detail.id, receivedAt: now }
      dismissTimer.current = window.setTimeout(dismiss, PREVIEW_DURATION_MS)
    }

    window.addEventListener('campnect:message-preview', handlePreview)
    return () => {
      window.removeEventListener('campnect:message-preview', handlePreview)
      clearTimers()
    }
  }, [])

  if (!preview) return null

  const openPreview = () => {
    if (preview.conversationId) navigate(`/app/chat/${preview.conversationId}`)
    dismiss()
  }

  return (
    <div
      className={`message-preview-banner${leaving ? ' is-leaving' : ''}`}
      onClick={openPreview}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openPreview()
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open message from ${preview.actorName}`}
      aria-live="polite"
    >
      <Avatar src={preview.actorAvatar} name={preview.actorName} size={44} />
      <span className="message-preview-copy">
        <strong>{preview.actorName}</strong>
        <span>{preview.preview}</span>
      </span>
      <span className="message-preview-now">now</span>
      <button
        type="button"
        className="message-preview-close"
        aria-label="Dismiss message preview"
        onClick={(event) => {
          event.stopPropagation()
          dismiss()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            dismiss()
          }
        }}
      >
        <X size={17} />
      </button>
    </div>
  )
}