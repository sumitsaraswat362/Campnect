import React from 'react'
import { Play } from 'lucide-react'
import { Avatar } from '../shared/Avatar'
import { AuthenticatedImage } from '../shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../shared/AuthenticatedVideo'
import { mediaUrl } from '../../utils/mediaUrl'
import type { Glimpse } from '../../api/glimpses'

function isVideo(glimpse: Glimpse) {
  const source = glimpse.media?.[0] || ''
  return Boolean(glimpse.duration) || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(source)
}

export function GlimpsePreviewCard({
  glimpse,
  viewed = false,
  onOpen,
}: {
  glimpse: Glimpse
  viewed?: boolean
  onOpen: () => void
}) {
  const video = isVideo(glimpse)
  const source = mediaUrl(glimpse.media?.[0])
  const cover = mediaUrl(glimpse.cover_url || (!video ? glimpse.media?.[0] : undefined))

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Watch Glimpse from ${glimpse.full_name}`}
      style={{ ...previewCard, ...(viewed ? previewCardViewed : {}) }}
    >
      <div style={previewMedia}>
        {video && !cover ? (
          <AuthenticatedVideo src={source} autoPlay muted loop playsInline preload="metadata" style={previewMediaAsset} />
        ) : (
          <AuthenticatedImage
            src={cover}
            alt=""
            style={previewMediaAsset}
            placeholderStyle={{ width: '100%', height: '100%' }}
            placeholderVariant="glimpse"
            placeholderLabel="Loading Glimpse"
            errorPlaceholderLabel="Glimpse unavailable"
          />
        )}
        <div style={previewShade} />
      </div>

      <div style={previewContent}>
        <div style={previewAuthor}>
          <Avatar src={glimpse.avatar_url} name={glimpse.full_name} size={30} />
          <div style={previewAuthorText}>
            <span style={previewName}>{glimpse.full_name}</span>
            <span style={previewUsername}>@{glimpse.username}</span>
          </div>
        </div>
        {glimpse.content && <span style={previewCaption}>{glimpse.content}</span>}
        <span style={watchPill}><Play size={12} fill="currentColor" /> Watch</span>
      </div>
    </button>
  )
}

const previewCard: React.CSSProperties = {
  position: 'relative',
  minWidth: 0,
  width: '100%',
  aspectRatio: '0.76',
  padding: 0,
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 22,
  background: '#16121d',
  color: '#fff',
  textAlign: 'left',
  cursor: 'pointer',
  boxShadow: '0 10px 24px rgba(25, 15, 35, .08)',
  WebkitTapHighlightColor: 'transparent',
}

const previewCardViewed: React.CSSProperties = {
  opacity: 0.8,
}

const previewMedia: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(145deg, #272330, #0b0a0f)',
}

const previewMediaAsset: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  objectPosition: 'center',
}

const previewShade: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(180deg, rgba(0,0,0,.1) 25%, rgba(0,0,0,.82) 100%)',
  pointerEvents: 'none',
}

const previewContent: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  gap: 10,
  padding: 13,
}

const previewAuthor: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
}

const previewAuthorText: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
}

const previewName: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 12.5,
  fontWeight: 800,
  fontFamily: 'var(--font-display)',
  textShadow: '0 1px 4px rgba(0,0,0,.7)',
}

const previewUsername: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'rgba(255,255,255,.72)',
  fontSize: 10.5,
  marginTop: 1,
}

const previewCaption: React.CSSProperties = {
  display: '-webkit-box',
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  color: 'rgba(255,255,255,.92)',
  fontSize: 11.5,
  lineHeight: 1.35,
  textShadow: '0 1px 4px rgba(0,0,0,.7)',
}

const watchPill: React.CSSProperties = {
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  minHeight: 26,
  padding: '0 10px',
  borderRadius: 999,
  background: 'var(--color-lime)',
  color: 'var(--color-on-lime)',
  fontSize: 10.5,
  fontWeight: 900,
  boxShadow: '0 4px 12px rgba(0,0,0,.2)',
}
