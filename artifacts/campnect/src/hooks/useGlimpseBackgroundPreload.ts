import { useEffect } from 'react'
import axios from 'axios'
import { useLocation } from 'react-router-dom'
import type { Glimpse } from '../api/glimpses'
import { loadCachedGlimpses } from '../cache/contentCache'
import { prefetchAuthenticatedMedia } from './useAuthMedia'
import { mediaUrl } from '../utils/mediaUrl'

const IDLE_DELAY_MS = 1_500
const IDLE_TIMEOUT_MS = 5_000

function isBackgroundSafePath(pathname: string) {
  return /^\/app\/(?:feed|search|college|profile|communities|community|events)(?:\/|$)/.test(pathname)
}

function isVideo(glimpse: Glimpse) {
  const source = glimpse.media?.[0] || ''
  return Boolean(glimpse.duration) || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(source)
}

function previewSource(glimpse: Glimpse) {
  // Protected Glimpse videos normally play from a JWT-backed blob. Fetching
  // one in the background would read the full asset, so warm only its cover.
  // Images can reuse the existing protected-media blob cache directly.
  return mediaUrl(isVideo(glimpse) ? glimpse.cover_url : glimpse.media?.[0])
}

function scheduleIdle(callback: () => void) {
  const idleWindow = window as Window & {
    requestIdleCallback?: (work: () => void, options?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (idleWindow.requestIdleCallback) {
    const id = idleWindow.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS })
    return () => idleWindow.cancelIdleCallback?.(id)
  }
  const timer = window.setTimeout(callback, IDLE_DELAY_MS)
  return () => window.clearTimeout(timer)
}

/**
 * Best-effort, idle-only Glimpse preparation. It shares the normal content
 * and protected-media caches; no media cache or UI state is introduced here.
 */
export function useGlimpseBackgroundPreload(userId: string | null, enabled: boolean) {
  const location = useLocation()

  useEffect(() => {
    if (!enabled || !userId || !isBackgroundSafePath(location.pathname)) return

    let disposed = false
    let controller: AbortController | null = null
    let cancelIdle = () => {}

    const begin = () => {
      controller?.abort()
      controller = new AbortController()
      const signal = controller.signal
      void loadCachedGlimpses(userId, '', false, signal)
        .then(async (items) => {
          if (disposed || signal.aborted) return
          // First/current plus one immediate successor only. Videos warm their
          // optimized cover rather than triggering a full protected-video blob.
          const sources = items.slice(0, 2).map(previewSource).filter((url): url is string => Boolean(url))
          await Promise.all(sources.map((url) => prefetchAuthenticatedMedia(url, { signal })))
        })
        .catch((error) => {
          if (!signal.aborted && !axios.isCancel(error)) {
            // Background preparation is intentionally silent and never blocks UI.
            console.debug('[glimpse-preload] skipped', error instanceof Error ? error.message : 'request failed')
          }
        })
    }

    const defer = () => {
      controller?.abort()
      cancelIdle()
      cancelIdle = scheduleIdle(begin)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') controller?.abort()
      else defer()
    }

    cancelIdle = scheduleIdle(begin)
    window.addEventListener('scroll', defer, { passive: true, capture: true })
    window.addEventListener('pointerdown', defer, { passive: true, capture: true })
    window.addEventListener('keydown', defer, { capture: true })
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      disposed = true
      cancelIdle()
      controller?.abort()
      window.removeEventListener('scroll', defer, true)
      window.removeEventListener('pointerdown', defer, true)
      window.removeEventListener('keydown', defer, true)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled, location.pathname, userId])
}