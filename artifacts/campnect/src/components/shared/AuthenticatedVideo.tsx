import { DEMO_MODE } from '../../demo/config'
import { forwardRef, useEffect, useState, type VideoHTMLAttributes } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { useAuthMedia } from '../../hooks/useAuthMedia'
import { mediaUrl } from '../../utils/mediaUrl'

const VIDEO_SKELETON_POSTER = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#d9d9dd"/>
        <stop offset=".5" stop-color="#eeeeef"/>
        <stop offset="1" stop-color="#cfcfd4"/>
      </linearGradient>
    </defs>
    <rect width="720" height="1280" fill="url(#bg)"/>
    <rect x="286" y="566" width="148" height="148" rx="42" fill="#ffffff" fill-opacity=".42"/>
    <path d="M326 610h68v60h-68zM338 594l10 16m18-16 10 16m18-16 10 16" fill="none" stroke="#777780" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`)}`

type AuthenticatedVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src' | 'poster'> & {
  src?: string | null
  poster?: string | null
  /** Defers protected-media retrieval while retaining the video element. */
  loadMedia?: boolean
  loadingVariant?: 'default' | 'post'
  retryToken?: number
  onMediaFailure?: () => void
  streamDirectly?: boolean
}

/**
 * Protected API videos require the same JWT-backed blob loading as images.
 * Keeping a real video element mounted while the blob loads preserves refs,
 * intersection observers, autoplay, and playback state.
 */
export const AuthenticatedVideo = forwardRef<HTMLVideoElement, AuthenticatedVideoProps>(
  function AuthenticatedVideo({
    src: rawSrc,
    poster: rawPoster,
    loadMedia = true,
    onError,
    onCanPlay,
    onLoadedData,
    onClick,
    className,
    controls,
    loadingVariant = 'default',
    retryToken = 0,
    onMediaFailure,
    streamDirectly = false,
    ...videoProps
  }, ref) {
    streamDirectly = streamDirectly && !DEMO_MODE
    const resolvedSrc = rawSrc ? mediaUrl(rawSrc) : undefined
    const resolvedPoster = rawPoster ? mediaUrl(rawPoster) : undefined
    // Clips can be several megabytes even after processing. Leave enough time
    // for a slow connection to receive the protected blob before playback.
    const authenticatedMedia = useAuthMedia(streamDirectly || !loadMedia ? undefined : resolvedSrc, retryToken, 90_000)
    const src = streamDirectly && loadMedia ? resolvedSrc ?? null : authenticatedMedia.src
    const fetchError = streamDirectly || !loadMedia ? false : authenticatedMedia.error
    const retry = authenticatedMedia.retry
    const { src: poster } = useAuthMedia(resolvedPoster)
    const [mediaError, setMediaError] = useState(false)
    const [mediaReady, setMediaReady] = useState(false)

    useEffect(() => {
      setMediaError(false)
      setMediaReady(false)
    }, [resolvedSrc, retryToken])

    useEffect(() => {
      if (fetchError) onMediaFailure?.()
    }, [fetchError, onMediaFailure])

    const isLoading = Boolean(resolvedSrc) && (!loadMedia || (!src && !fetchError && !mediaError))
    const failed = Boolean(fetchError || mediaError)
    const showSkeleton = isLoading || failed || !mediaReady

    const videoElement = (
      <video
        key={`${failed ? 'video-error' : (src || 'video-loading')}-${retryToken}`}
        {...videoProps}
        ref={ref}
        className={[className, showSkeleton ? 'media-video-loading' : '', failed ? 'media-video-error' : ''].filter(Boolean).join(' ') || undefined}
        aria-busy={isLoading || undefined}
        aria-label={failed ? 'Video unavailable. Tap to retry.' : videoProps['aria-label']}
        src={!failed ? src ?? undefined : undefined}
        poster={poster ?? (showSkeleton ? VIDEO_SKELETON_POSTER : undefined)}
        controls={failed ? false : controls}
        onCanPlay={(event) => {
          setMediaReady(true)
          onCanPlay?.(event)
        }}
        onLoadedData={(event) => {
          setMediaReady(true)
          onLoadedData?.(event)
        }}
        onError={(event) => {
          setMediaReady(false)
          setMediaError(true)
          onMediaFailure?.()
          onError?.(event)
        }}
        onClick={(event) => {
          if (failed) {
            setMediaError(false)
            setMediaReady(false)
            retry()
          }
          onClick?.(event)
        }}
      />
    )

    if (loadingVariant !== 'post') return videoElement

    return (
      <div className="media-video-shell media-video-shell-post">
        {videoElement}
        {showSkeleton && loadingVariant === 'post' && (
          <span className="media-video-loading-icon" aria-hidden="true">
            <ImageIcon size={20} strokeWidth={1.8} />
          </span>
        )}
      </div>
    )
  },
)