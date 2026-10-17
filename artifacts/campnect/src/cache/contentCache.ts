import { DEMO_MODE } from '../demo/config'
import { clipsApi, type Clip } from '../api/clips'
import { glimpsesApi, type Glimpse } from '../api/glimpses'
import { postsApi } from '../api/posts'
import type { Post } from '../stores/feedStore'

type CacheStatus = 'idle' | 'loading' | 'loaded' | 'error'

type CacheEntry<T> = {
  value?: T
  status: CacheStatus
  error?: string
  inFlight?: Promise<T>
}

export type ClipFeedCache = { clips: Clip[]; nextCursor: string | null; hasMore: boolean }

const contentCache = new Map<string, CacheEntry<unknown>>()

function keyFor(userId: string, resource: string) {
  return `${userId}:${resource}`
}

function debug(event: string, resource: string) {
  if (import.meta.env.DEV) console.debug(`[content-cache] ${event}`, resource)
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

export function readCachedContent<T>(userId: string, resource: string): CacheEntry<T> | undefined {
  return contentCache.get(keyFor(userId, resource)) as CacheEntry<T> | undefined
}

export async function loadCachedContent<T>(
  userId: string,
  resource: string,
  loader: () => Promise<T>,
  options: { force?: boolean } = {},
): Promise<T> {
  const key = keyFor(userId, resource)
  const existing = contentCache.get(key) as CacheEntry<T> | undefined
  if (!DEMO_MODE && !options.force && existing?.status === 'loaded' && existing.value !== undefined) {
    debug('HIT', resource)
    return existing.value
  }
  if (existing?.inFlight) {
    if (options.force) {
      // A forced reload must not attach to a request whose database snapshot
      // may predate the event that requested the refresh.
      return existing.inFlight
        .catch(() => undefined)
        .then(() => loadCachedContent(userId, resource, loader, options))
    }
    debug('DEDUPED', resource)
    return existing.inFlight
  }

  debug(options.force ? 'REFRESH' : 'MISS', resource)
  const entry: CacheEntry<T> = { ...existing, status: 'loading', error: undefined }
  const pending = loader()
    .then((value) => {
      // An account switch or logout may have cleared this entry while its
      // request was still resolving. Never restore data into a cleared scope.
      if (contentCache.get(key) === entry) contentCache.set(key, { value, status: 'loaded' })
      debug('COMPLETE', resource)
      return value
    })
    .catch((error) => {
      if (contentCache.get(key) === entry) {
        contentCache.set(key, { value: existing?.value, status: 'error', error: error instanceof Error ? error.message : 'Unable to load content' })
      }
      throw error
    })
  entry.inFlight = pending
  contentCache.set(key, entry)
  return pending
}

export function clearContentCache(userId?: string) {
  if (!userId) {
    contentCache.clear()
    return
  }
  for (const key of contentCache.keys()) {
    if (key.startsWith(`${userId}:`)) contentCache.delete(key)
  }
}

export async function loadInitialClips(userId: string, force = false) {
  return loadCachedContent<ClipFeedCache>(userId, 'clips:initial', async () => {
    const response = await clipsApi.getFeed()
    return {
      clips: uniqueById(response.data.data || []),
      nextCursor: response.data.meta?.nextCursor || null,
      hasMore: Boolean(response.data.meta?.hasMore),
    }
  }, { force })
}

export async function appendCachedClips(userId: string) {
  const current = await loadInitialClips(userId)
  if (!current.hasMore || !current.nextCursor) return current
  const pageKey = `clips:page:${current.nextCursor}`
  const page = await loadCachedContent(userId, pageKey, async () => {
    const response = await clipsApi.getFeed(current.nextCursor)
    return {
      clips: response.data.data || [],
      nextCursor: response.data.meta?.nextCursor || null,
      hasMore: Boolean(response.data.meta?.hasMore),
    }
  })
  const next = { clips: uniqueById([...current.clips, ...page.clips]), nextCursor: page.nextCursor, hasMore: page.hasMore }
  contentCache.set(keyFor(userId, 'clips:initial'), { value: next, status: 'loaded' })
  return next
}

export async function loadCachedClip(userId: string, id: string) {
  return loadCachedContent<Clip>(userId, `clip:${id}`, async () => (await clipsApi.get(id)).data.data)
}

export async function loadCachedPost(userId: string, id: string) {
  return loadCachedContent<Post>(userId, `post:${id}`, async () => (await postsApi.getPost(id)).data.data)
}

export function patchCachedPost(userId: string, id: string, patch: Partial<Post>) {
  const key = keyFor(userId, `post:${id}`)
  const entry = contentCache.get(key) as CacheEntry<Post> | undefined
  if (entry?.value) contentCache.set(key, { ...entry, value: { ...entry.value, ...patch } })
}

export function patchCachedClip(userId: string, id: string, patch: Partial<Clip>) {
  for (const [key, entry] of contentCache) {
    if (!key.startsWith(`${userId}:`) || entry.status !== 'loaded' || entry.value === undefined) continue
    if (key.endsWith('clips:initial')) {
      const value = entry.value as ClipFeedCache
      contentCache.set(key, { ...entry, value: { ...value, clips: value.clips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip) } })
    } else if (key.endsWith(`clip:${id}`)) {
      contentCache.set(key, { ...entry, value: { ...(entry.value as Clip), ...patch } })
    }
  }
}

export async function loadCachedGlimpses(userId: string, term = '', force = false, signal?: AbortSignal) {
  const normalizedTerm = term.trim()
  const resource = `glimpses:${normalizedTerm.toLowerCase() || 'initial'}`
  return loadCachedContent<Glimpse[]>(userId, resource, async () => {
    const params = { q: normalizedTerm || undefined }
    const [feed, mine] = await Promise.all([
      glimpsesApi.getFeed(1, 24, { mode: 'feed', ...params }, { signal }),
      glimpsesApi.getFeed(1, 24, { mode: 'my', ...params }, { signal }),
    ])
    return uniqueById([...(mine.data.data || []), ...(feed.data.data || [])])
  }, { force })
}

export function patchCachedGlimpse(userId: string, id: string, patch: Partial<Glimpse>) {
  for (const [key, entry] of contentCache) {
    if (!key.startsWith(`${userId}:glimpses:`) || entry.status !== 'loaded' || !Array.isArray(entry.value)) continue
    contentCache.set(key, { ...entry, value: (entry.value as Glimpse[]).map((item) => item.id === id ? { ...item, ...patch } : item) })
  }
}

export function removeCachedGlimpse(userId: string, id: string) {
  for (const [key, entry] of contentCache) {
    if (!key.startsWith(`${userId}:glimpses:`) || entry.status !== 'loaded' || !Array.isArray(entry.value)) continue
    contentCache.set(key, { ...entry, value: (entry.value as Glimpse[]).filter((item) => item.id !== id) })
  }
}