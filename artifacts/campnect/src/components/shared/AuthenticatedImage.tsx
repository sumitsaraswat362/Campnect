import React, { useEffect, useState } from 'react'
import { Image as ImageIcon, ImageOff, Sparkles } from 'lucide-react'
import { useAuthMedia } from '../../hooks/useAuthMedia'
import { mediaUrl } from '../../utils/mediaUrl'

type AuthenticatedImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null
  placeholderLabel?: string
  errorPlaceholderLabel?: string
  placeholderStyle?: React.CSSProperties
  placeholderVariant?: 'default' | 'glimpse' | 'post'
}

/**
 * API media is protected by the Campnect JWT, so a raw <img src="/api/media/...">
 * cannot load it reliably. Fetching through useAuthMedia also gives every image
 * surface the same loading and unavailable states.
 */
export function AuthenticatedImage({
  src: rawSrc,
  alt = '',
  className,
  placeholderLabel,
  errorPlaceholderLabel,
  placeholderStyle,
  placeholderVariant = 'default',
  style,
  onError,
  ...imageProps
}: AuthenticatedImageProps) {
  const resolvedSrc = rawSrc ? mediaUrl(rawSrc) : undefined
  const { src, error: fetchError, retry } = useAuthMedia(resolvedSrc)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    setImageError(false)
  }, [resolvedSrc])

  if (!resolvedSrc || fetchError || imageError) {
    return (
      <MediaImagePlaceholder
        className={className}
        style={{ ...style, ...placeholderStyle }}
        label={errorPlaceholderLabel || placeholderLabel || (resolvedSrc ? 'Image unavailable' : 'No image')}
        failed={Boolean(resolvedSrc)}
        variant={placeholderVariant}
        onRetry={resolvedSrc ? retry : undefined}
      />
    )
  }

  if (!src) {
    return (
      <MediaImagePlaceholder
        className={className}
        style={{ ...style, ...placeholderStyle }}
        label={placeholderLabel || 'Loading image'}
        loading
        variant={placeholderVariant}
      />
    )
  }

  return (
    <img
      {...imageProps}
      src={src}
      alt={alt}
      className={className}
      style={{ display: 'block', ...style }}
      onError={(event) => {
        setImageError(true)
        onError?.(event)
      }}
    />
  )
}

function MediaImagePlaceholder({
  className,
  style,
  label,
  loading = false,
  failed = false,
  variant = 'default',
  onRetry,
}: {
  className?: string
  style?: React.CSSProperties
  label: string
  loading?: boolean
  failed?: boolean
  variant?: 'default' | 'glimpse' | 'post'
  onRetry?: () => void
}) {
  return (
    <div
        className={`media-image-placeholder${loading ? ' media-image-placeholder-loading' : ''}${variant === 'glimpse' ? ' media-image-placeholder-glimpse' : ''}${variant === 'post' ? ' media-image-placeholder-post' : ''}${failed ? ' media-image-placeholder-error' : ''}${className ? ` ${className}` : ''}`}
      style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      role="img"
      aria-label={label}
      onClick={failed ? onRetry : undefined}
      title={failed && onRetry ? 'Tap to retry' : undefined}
    >
      {(failed || variant === 'glimpse' || variant === 'post') && (
        <span className="media-image-placeholder-icon" aria-hidden="true">
          {failed ? <ImageOff size={18} strokeWidth={1.8} /> : variant === 'post' ? <ImageIcon size={20} strokeWidth={1.8} /> : <Sparkles size={20} strokeWidth={1.8} />}
        </span>
      )}
      {variant === 'glimpse' && <span className="media-image-placeholder-label">{label}</span>}
    </div>
  )
}