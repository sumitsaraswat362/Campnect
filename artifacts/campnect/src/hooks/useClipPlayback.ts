import { useCallback, useEffect, useMemo, useRef } from 'react'

export function clipMountedWindow(active: number, length: number): number[] {
  const first = Math.max(0, active - 1)
  // Keep the active Clip, one recently visited Clip, and two upcoming elements
  // mounted for smooth snap navigation. Larger windows caused distant browser
  // video elements to issue unnecessary metadata/range work.
  const last = Math.min(length - 1, active + 2)
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index)
}

type PlaybackOptions = {
  muted: boolean
  enabled: boolean
  onAutoplayBlocked: (id: string) => void
  onPlayFailure: (id: string) => void
  onPlaybackStarted: (id: string) => void
}

/**
 * The only authority that calls play/pause for a Clips feed. Generation checks
 * make delayed media events and play promises harmless after a fast swipe.
 */
export function useClipPlayback({ muted, enabled, onAutoplayBlocked, onPlayFailure, onPlaybackStarted }: PlaybackOptions) {
  const videos = useRef(new Map<string, HTMLVideoElement>())
  const activeId = useRef<string | null>(null)
  const generation = useRef(0)
  const userPaused = useRef(new Set<string>())
  const mutedRef = useRef(muted)
  const enabledRef = useRef(enabled)

  const play = useCallback((id: string, expectedGeneration = generation.current) => {
    const video = videos.current.get(id)
    if (!video || !enabledRef.current || activeId.current !== id || userPaused.current.has(id) || expectedGeneration !== generation.current) return
    video.muted = mutedRef.current
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    void video.play().catch(error => {
      if (activeId.current !== id || expectedGeneration !== generation.current) return
      if (error?.name === 'NotAllowedError') onAutoplayBlocked(id)
      else if (error?.name !== 'AbortError') onPlayFailure(id)
    })
  }, [onAutoplayBlocked, onPlayFailure])

  const activate = useCallback((id: string | null) => {
    const nextGeneration = ++generation.current
    activeId.current = id
    // Pause every old element before attempting the target: there is never a
    // period where two clips can be playing.
    for (const [videoId, video] of videos.current) {
      if (videoId !== id) video.pause()
    }
    if (id) play(id, nextGeneration)
  }, [play])

  const deactivate = useCallback(() => {
    ++generation.current
    activeId.current = null
    for (const video of videos.current.values()) video.pause()
  }, [])

  const register = useCallback((id: string, video: HTMLVideoElement | null) => {
    const previous = videos.current.get(id)
    if (previous && previous !== video) previous.pause()
    if (!video) {
      previous?.pause()
      videos.current.delete(id)
      return
    }
    videos.current.set(id, video)
    video.muted = mutedRef.current
    if (activeId.current === id) play(id)
    else video.pause()
  }, [play])

  const isCurrent = useCallback((id: string, video?: HTMLVideoElement) =>
    activeId.current === id && (!video || videos.current.get(id) === video), [])

  const onCanPlay = useCallback((id: string, video: HTMLVideoElement) => {
    if (isCurrent(id, video)) play(id)
  }, [isCurrent, play])

  const onPlay = useCallback((id: string, video: HTMLVideoElement) => {
    const current = isCurrent(id, video)
    if (!current) video.pause()
    return current
  }, [isCurrent])

  const onPlaying = useCallback((id: string, video: HTMLVideoElement) => {
    if (isCurrent(id, video)) onPlaybackStarted(id)
  }, [isCurrent, onPlaybackStarted])

  const isActive = useCallback((id: string) => activeId.current === id, [])

  const toggle = useCallback((id: string) => {
    const video = videos.current.get(id)
    if (!video || activeId.current !== id) return
    if (video.paused) {
      userPaused.current.delete(id)
      play(id)
    } else {
      userPaused.current.add(id)
      video.pause()
    }
  }, [play])

  const retry = useCallback((id: string) => {
    userPaused.current.delete(id)
    if (activeId.current === id) play(id)
  }, [play])

  useEffect(() => {
    mutedRef.current = muted
    for (const video of videos.current.values()) video.muted = muted
  }, [muted])

  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled) {
      for (const video of videos.current.values()) video.pause()
    } else if (activeId.current) {
      play(activeId.current)
    }
  }, [enabled, play])

  useEffect(() => () => {
    for (const video of videos.current.values()) video.pause()
    videos.current.clear()
  }, [])

  return useMemo(() => ({
    activate, deactivate, register, onCanPlay, onPlay, onPlaying, toggle, retry, isActive, isCurrent,
  }), [activate, deactivate, register, onCanPlay, onPlay, onPlaying, toggle, retry, isActive, isCurrent])
}