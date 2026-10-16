
import { useEffect, useState } from 'react'
import { mediaUrl } from '../../utils/mediaUrl'
import { useAuthMedia } from '../../hooks/useAuthMedia'

interface AvatarProps {
  src?: string | null
  name?: string
  size?: number
  ring?: 'story' | 'seen' | 'none'
  online?: boolean
  onClick?: () => void
}

export function Avatar({ src, name, size = 40, ring = 'none', online, onClick }: AvatarProps) {
  const initial = name?.[0]?.toUpperCase() || '?'
  const [imageError, setImageError] = useState(false)
  const imageSrc = src ? mediaUrl(src) : undefined
  const { src: authenticatedImageSrc, error: mediaError } = useAuthMedia(imageSrc)

  useEffect(() => {
    setImageError(false)
  }, [imageSrc])

  const ringStyle = ring === 'story'
    ? { background: 'linear-gradient(135deg, #18181B, rgba(210,210,215,0.90))', padding: '2.5px' }
    : ring === 'seen'
    ? { background: 'var(--color-border-strong)', padding: '2.5px' }
    : {}

  const hasRing = ring !== 'none'
  const innerSize = hasRing ? size - 5 : size

  return (
    <div
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: '9999px',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(hasRing ? ringStyle : {}),
      }}
    >
      <div style={{
        width: innerSize,
        height: innerSize,
        borderRadius: '9999px',
        overflow: 'hidden',
        background: authenticatedImageSrc && !imageError && !mediaError ? 'transparent' : 'linear-gradient(135deg, #3F3F46, #18181B)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: hasRing ? '2px solid #080810' : 'none',
      }}>
        {authenticatedImageSrc && !imageError && !mediaError ? (
          <img
            src={authenticatedImageSrc}
            alt={name || 'Avatar'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setImageError(true)}
          />
        ) : (
          <span style={{
            fontSize: Math.max(10, innerSize * 0.38),
            fontWeight: 700,
            color: '#fff',
            userSelect: 'none',
          }}>
            {initial}
          </span>
        )}
      </div>
      {online && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: Math.max(8, size * 0.22),
          height: Math.max(8, size * 0.22),
          borderRadius: '9999px',
          background: '#22C55E',
          border: '2px solid #080810',
        }} />
      )}
    </div>
  )
}
