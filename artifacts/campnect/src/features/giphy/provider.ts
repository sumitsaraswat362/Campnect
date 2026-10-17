import { DEMO_MODE } from '../../demo/config'
import client from '../../api/client'

const PAGE_SIZE = 20

export type GiphyKind = 'gif' | 'sticker'

export interface GiphySelection {
  provider: 'giphy'
  providerId: string
  renditionUrl: string
  width: number
  height: number
  altText: string
  creatorName: string
  creatorUrl: string
}

export interface GiphyResult extends GiphySelection {
  analytics?: {
    onload?: string
    onclick?: string
    onsend?: string
  }
}

const cache = new Map<string, GiphyResult[]>()
const inFlight = new Map<string, Promise<GiphyResult[]>>()

function withoutQuery(url: unknown, providerId?: string) {
  if (typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !/^(?:media\d*|i)\.giphy\.com$/i.test(parsed.hostname)) return null
    if (providerId) {
      const segments = parsed.pathname.split('/').filter(Boolean)
      const idIndex = segments.indexOf(providerId)
      const filename = idIndex >= 0 ? segments[idIndex + 1] : undefined
      if (!filename || !/^[A-Za-z0-9_-]+\.(?:gif|webp|mp4)$/i.test(filename)) return null
      // GIPHY supports this stable public form. Avoid persisting its
      // request-context segment returned by current API responses.
      return `https://media.giphy.com/media/${providerId}/${filename}`
    }
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return null
  }
}

function validProviderId(value: string) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value)
}

function giphyProfileUrl(value: unknown) {
  if (typeof value !== 'string') return ''
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && (parsed.hostname === 'giphy.com' || parsed.hostname.endsWith('.giphy.com'))
      ? `${parsed.origin}${parsed.pathname}`
      : ''
  } catch {
    return ''
  }
}

/**
 * Fetch a normalized page from Campnect's authenticated GIPHY endpoint.
 * Results are cached for the page lifetime and concurrent requests share work.
 */
export async function fetchGiphy(kind: GiphyKind, query: string, offset: number, signal?: AbortSignal) {
  const normalizedQuery = query.trim()
  const pageOffset = Math.max(0, Math.floor(offset))
  const key = `${kind}|${normalizedQuery.toLowerCase()}|${pageOffset}`
  const cached = cache.get(key)
  if (cached) return cached
  const existing = inFlight.get(key)
  if (existing) return existing

  const request = client.get<{ success: boolean; data?: GiphyResult[] }>('/chat/giphy', {
    params: { kind, q: normalizedQuery, offset: pageOffset },
    signal,
  })
    .then((response) => {
      const results = (response.data.data || []).filter((item): item is GiphyResult => (
        item?.provider === 'giphy'
        && validProviderId(item.providerId)
        && Boolean(withoutQuery(item.renditionUrl, item.providerId))
        && Number.isInteger(item.width) && item.width > 0
        && Number.isInteger(item.height) && item.height > 0
        && typeof item.altText === 'string'
        && typeof item.creatorName === 'string'
        && typeof item.creatorUrl === 'string'
      )).map((item) => ({
        ...item,
        renditionUrl: withoutQuery(item.renditionUrl, item.providerId)!,
        creatorUrl: giphyProfileUrl(item.creatorUrl),
      }))
      cache.set(key, results)
      return results
    })
    .finally(() => {
      inFlight.delete(key)
    })
  inFlight.set(key, request)
  return request
}

export function trackGiphyAction(result: GiphyResult, action: 'view' | 'click' | 'send') {
  if (DEMO_MODE) return
  const url = result.analytics?.[action === 'view' ? 'onload' : action === 'click' ? 'onclick' : 'onsend']
  if (!url) return
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (parsed.protocol !== 'https:' || !(parsed.hostname === 'giphy.com' || parsed.hostname.endsWith('.giphy.com'))) return
  // Analytics are best-effort. Never surface or log a failure to the user.
  try {
    void fetch(parsed.toString(), { mode: 'no-cors', keepalive: true }).catch(() => undefined)
  } catch {
    // Analytics must never interfere with sending a message.
  }
}

export function parseGiphySelection(value?: string | null): GiphySelection | null {
  try {
    const parsed = JSON.parse(value || '') as Partial<GiphySelection>
    if (
      parsed?.provider !== 'giphy'
      || typeof parsed.providerId !== 'string'
      || !validProviderId(parsed.providerId)
      || typeof parsed.renditionUrl !== 'string'
      || typeof parsed.width !== 'number'
      || typeof parsed.height !== 'number'
      || typeof parsed.altText !== 'string'
       || typeof parsed.creatorName !== 'string'
       || typeof parsed.creatorUrl !== 'string'
      || !Number.isInteger(parsed.width) || parsed.width < 1 || parsed.width > 4096
      || !Number.isInteger(parsed.height) || parsed.height < 1 || parsed.height > 4096
    ) return null
    const renditionUrl = withoutQuery(parsed.renditionUrl, parsed.providerId)
    if (!renditionUrl) return null
    return {
      provider: 'giphy',
      providerId: parsed.providerId,
      renditionUrl,
      width: parsed.width,
      height: parsed.height,
      altText: parsed.altText.trim().slice(0, 500),
      creatorName: parsed.creatorName.trim().replace(/^@+/, '').slice(0, 100),
      creatorUrl: giphyProfileUrl(parsed.creatorUrl),
    }
  } catch {
    return null
  }
}

export const GIPHY_PAGE_SIZE = PAGE_SIZE