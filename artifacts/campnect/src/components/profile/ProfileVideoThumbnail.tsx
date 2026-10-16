import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthenticatedVideo } from '../shared/AuthenticatedVideo'

type ProfileVideoThumbnailProps = {
  src: string
  onActivate: (video: HTMLVideoElement) => void
  onDeactivate: (video: HTMLVideoElement) => void
}

/**
 * Profile grids can contain many video posts. Keep each tile mounted for a
 * stable layout, but only load and play video media once it is near the
 * viewport. Playback coordination is supplied by the grid so only one tile
 * plays at a time.
 */
export function ProfileVideoThumbnail({
  src,
  onActivate,
  onDeactivate,
}: ProfileVideoThumbnailProps) {
  const visibleRef = useRef(false)
  const [loadMedia, setLoadMedia] = useState(false)
  const [videoNode, setVideoNode] = useState<HTMLVideoElement | null>(null)
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    setVideoNode(node)
  }, [])

  useEffect(() => {
    if (!videoNode) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nearViewport = entry.isIntersecting
        visibleRef.current = nearViewport && entry.intersectionRatio >= 0.65
        setLoadMedia(nearViewport)

        if (visibleRef.current && document.visibilityState !== 'hidden') {
          onActivate(videoNode)
        } else {
          onDeactivate(videoNode)
        }
      },
      { rootMargin: '160px 0px', threshold: [0, 0.65] },
    )

    observer.observe(videoNode)
    return () => {
      observer.disconnect()
      onDeactivate(videoNode)
    }
  }, [onActivate, onDeactivate, videoNode])

  return (
    <AuthenticatedVideo
      ref={setVideoRef}
      src={src}
      loadingVariant="post"
      loadMedia={loadMedia}
      muted
      loop
      playsInline
      preload="metadata"
      data-profile-video
      onCanPlay={(event) => {
        if (visibleRef.current && document.visibilityState !== 'hidden') {
          onActivate(event.currentTarget)
        }
      }}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        objectFit: 'cover',
        display: 'block',
      }}
    />
  )
}