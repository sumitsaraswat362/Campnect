import React from 'react'
import { Link2 } from 'lucide-react'
import { chatApi } from '../../api/chat'
import { normalizeUrl } from '../../utils/linkify'

interface Preview {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

// Module-level cache + in-flight dedupe so scrolling past the same message
// repeatedly (or several messages sharing a link) doesn't refetch.
const previewCache = new Map<string, Preview | null>()
const inFlight = new Map<string, Promise<Preview | null>>()

async function loadPreview(url: string): Promise<Preview | null> {
  if (previewCache.has(url)) return previewCache.get(url)!
  if (inFlight.has(url)) return inFlight.get(url)!
  const promise = chatApi.getLinkPreview(url)
    .then((response) => {
      const data = response.data?.data ?? null
      previewCache.set(url, data)
      return data as Preview | null
    })
    .catch(() => {
      previewCache.set(url, null)
      return null
    })
    .finally(() => inFlight.delete(url))
  inFlight.set(url, promise)
  return promise
}

/** Renders a clickable Open Graph preview card for a URL found in a chat message. */
export function LinkPreviewCard({ url, isOwn }: { url: string; isOwn: boolean }) {
  const normalized = normalizeUrl(url)
  const [preview, setPreview] = React.useState<Preview | null | undefined>(() => previewCache.get(normalized))

  React.useEffect(() => {
    if (previewCache.has(normalized)) {
      setPreview(previewCache.get(normalized)!)
      return
    }
    let cancelled = false
    loadPreview(normalized).then((data) => {
      if (!cancelled) setPreview(data)
    })
    return () => { cancelled = true }
  }, [normalized])

  if (preview === null) return null // fetched, nothing worth showing
  if (preview === undefined) return null // still loading — keep the bubble compact

  const textColor = isOwn ? 'var(--chat-own-text)' : 'var(--chat-received-text)'
  const metaColor = isOwn ? 'var(--chat-own-meta)' : 'var(--chat-received-meta)'

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginTop: '6px',
        overflow: 'hidden',
        borderRadius: '12px',
        border: isOwn ? '1px solid var(--chat-own-border)' : '1px solid var(--chat-received-border)',
        background: isOwn ? 'rgba(255,255,255,0.08)' : 'var(--chat-soft-surface)',
        textDecoration: 'none',
        maxWidth: '260px',
      }}
    >
      {preview.image && (
        <div style={{ width: '100%', aspectRatio: '1.9 / 1', overflow: 'hidden', background: 'var(--chat-media-bg)' }}>
          <img
            src={preview.image}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(event) => { (event.currentTarget.parentElement as HTMLElement).style.display = 'none' }}
          />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: metaColor, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.02em' }}>
          <Link2 size={11} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.siteName || 'Link'}</span>
        </div>
        {preview.title && (
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, lineHeight: 1.3, color: textColor, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p style={{ margin: 0, fontSize: '11.5px', lineHeight: 1.35, color: metaColor, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {preview.description}
          </p>
        )}
      </div>
    </a>
  )
}
