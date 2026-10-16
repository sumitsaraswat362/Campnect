import { useEffect, useState } from 'react'
import client from '../api/client'

// Module-level cache so the same media URL isn't re-fetched/re-blobbed every
// time a message list re-renders or a bubble remounts (e.g. on scroll).
type BlobCacheEntry = {
  objectUrl: string
  refs: number
  stale: boolean
}

type PendingMedia = {
  promise: Promise<BlobCacheEntry>
  controller: AbortController
  scope: string
  foregroundConsumers: number
  backgroundConsumers: number
}

const blobCache = new Map<string, BlobCacheEntry>()
const inFlight = new Map<string, PendingMedia>()
const MAX_BLOB_CACHE_ENTRIES = 80
let activeMediaScope = 'anonymous'

function revokeWhenReleased(entry: BlobCacheEntry) {
  if (!entry.stale || entry.refs > 0) return
  // Give React one paint to detach the old source before invalidating it.
  window.setTimeout(() => {
    if (entry.stale && entry.refs === 0) URL.revokeObjectURL(entry.objectUrl)
  }, 250)
}

function rememberBlob(key: string, objectUrl: string): BlobCacheEntry {
  const previous = blobCache.get(key)
  if (previous && !previous.stale) {
    URL.revokeObjectURL(objectUrl)
    return previous
  }

  const entry = { objectUrl, refs: 0, stale: false }
  blobCache.delete(key)
  blobCache.set(key, entry)
  while (blobCache.size > MAX_BLOB_CACHE_ENTRIES) {
    const oldest = [...blobCache.entries()].find(([, candidate]) => candidate.refs === 0)
    if (!oldest) break
    blobCache.delete(oldest[0])
    oldest[1].stale = true
    revokeWhenReleased(oldest[1])
  }
  return entry
}

function invalidateBlob(key: string) {
  const entry = blobCache.get(key)
  if (!entry) return
  blobCache.delete(key)
  entry.stale = true
  revokeWhenReleased(entry)
}

export function clearAuthenticatedMediaCache() {
  for (const entry of blobCache.values()) URL.revokeObjectURL(entry.objectUrl)
  blobCache.clear()
  for (const pending of inFlight.values()) pending.controller.abort()
  inFlight.clear()
}

/**
 * Protected blobs are memory-only and must never survive an account change.
 * The app supplies the authenticated account ID rather than deriving identity
 * from a rotating signed-media token.
 */
export function setAuthenticatedMediaScope(userId: string | null | undefined) {
  const nextScope = userId || 'anonymous'
  if (nextScope === activeMediaScope) return
  clearAuthenticatedMediaCache()
  activeMediaScope = nextScope
}

function isProtectedMediaUrl(url: string) {
  return /^\/api\/media\//.test(url) || /\/api\/media\//.test(url)
}

/**
 * User profile responses may sign the same immutable asset again with a new
 * expiry time on every request. Cache by the asset path and viewer identity,
 * not by the rotating signature, so navigation does not restart the download.
 */
function cacheKey(url: string) {
  try {
    const parsed = new URL(url, window.location.origin)
    if (!/\/api\/media\//.test(parsed.pathname)) return url
    return `${parsed.origin}${parsed.pathname}?viewer=${encodeURIComponent(activeMediaScope)}`
  } catch {
    return url
  }
}

function awaitPendingMedia(key: string, pending: PendingMedia, signal?: AbortSignal): Promise<BlobCacheEntry> {
  if (!signal) {
    pending.foregroundConsumers += 1
    return pending.promise
  }
  if (signal.aborted) return Promise.reject(new DOMException('Media preparation canceled', 'AbortError'))

  pending.backgroundConsumers += 1
  return new Promise<BlobCacheEntry>((resolve, reject) => {
    const release = () => {
      pending.backgroundConsumers = Math.max(0, pending.backgroundConsumers - 1)
      if (pending.backgroundConsumers === 0 && pending.foregroundConsumers === 0 && inFlight.get(key) === pending) {
        pending.controller.abort()
      }
    }
    const onAbort = () => {
      release()
      reject(new DOMException('Media preparation canceled', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    pending.promise.then(
      (entry) => {
        signal.removeEventListener('abort', onAbort)
        release()
        resolve(entry)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        release()
        reject(error)
      },
    )
  })
}

async function loadProtectedMedia(url: string, timeout = 15_000, signal?: AbortSignal): Promise<BlobCacheEntry> {
  const key = cacheKey(url)
  const cached = blobCache.get(key)
  if (cached && !cached.stale) return cached

  let pending = inFlight.get(key)
  if (!pending) {
    const controller = new AbortController()
    const scope = activeMediaScope
    const promise = (async () => {
      const path = url.replace(/^.*\/api\/media\//, 'media/')
      const res = await client.get(path, { responseType: 'blob', timeout, signal: controller.signal })
      if (!(res.data instanceof Blob)) throw new TypeError('Protected media response was not binary data')
      if (scope !== activeMediaScope) throw new DOMException('Media scope changed', 'AbortError')
      return rememberBlob(key, URL.createObjectURL(res.data))
    })()
    pending = { promise, controller, scope, foregroundConsumers: 0, backgroundConsumers: 0 }
    inFlight.set(key, pending)
    void promise.finally(() => {
      if (inFlight.get(key) === pending) inFlight.delete(key)
    }).catch(() => {})
  }
  return awaitPendingMedia(key, pending, signal)
}

export async function prefetchAuthenticatedMedia(
  url: string | null | undefined,
  options: { signal?: AbortSignal; timeout?: number } = {},
): Promise<void> {
  if (!url || !isProtectedMediaUrl(url)) return
  await loadProtectedMedia(url, options.timeout, options.signal)
}

/**
 * Chat attachments live behind `/api/media/:id`, which requires the app's
 * JWT (sent as an Authorization header). A plain <img>/<video>/<audio> tag
 * cannot attach that header, so it gets a 401 and renders as a broken
 * "attachment" placeholder. This hook fetches the asset through the
 * authenticated axios client and exposes it as a local blob: URL instead.
 */
export function useAuthMedia(
  url: string | null | undefined,
  retryToken = 0,
  timeout = 15_000,
): { src: string | null; error: boolean; retry: () => void } {
  const [src, setSrc] = useState<string | null>(() => {
    if (!url) return null
    if (!isProtectedMediaUrl(url)) return url
    return blobCache.get(cacheKey(url))?.objectUrl ?? null
  })
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!url) { setSrc(null); setError(false); return }

    // Non-API media (already a full http/data/blob URL) can load directly.
    if (!isProtectedMediaUrl(url)) {
      setSrc(url)
      setError(false)
      return
    }

    const key = cacheKey(url)
    if (retryToken > 0) invalidateBlob(key)
    const cached = blobCache.get(key)
    let retained: BlobCacheEntry | null = null
    const retain = (entry: BlobCacheEntry) => {
      retained = entry
      entry.refs += 1
      setSrc(entry.objectUrl)
      setError(false)
    }
    if (cached && !cached.stale) {
      retain(cached)
      return () => {
        if (retained) {
          retained.refs = Math.max(0, retained.refs - 1)
          revokeWhenReleased(retained)
        }
      }
    }

    let cancelled = false
    setSrc(null)
    setError(false)

    const pending = loadProtectedMedia(url, timeout)

    pending
      .then((entry) => {
        if (!cancelled) retain(entry)
      })
      .catch((fetchError) => {
        console.warn('Campnect protected media request failed.', {
          path: (() => {
            try { return new URL(url, window.location.origin).pathname }
            catch { return 'invalid-media-url' }
          })(),
          status: fetchError?.response?.status,
          message: fetchError instanceof Error ? fetchError.message : 'Unknown media error',
        })
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
      if (retained) {
        retained.refs = Math.max(0, retained.refs - 1)
        revokeWhenReleased(retained)
      }
    }
  }, [url, attempt, retryToken, timeout])

  return {
    src,
    error,
    retry: () => {
      if (url) {
        const key = cacheKey(url)
        invalidateBlob(key)
      }
      setAttempt((value) => value + 1)
    },
  }
}
