const GIPHY_ID = /^[A-Za-z0-9_-]{1,128}$/
const GIPHY_HOST = /^(?:media\d*|i)\.giphy\.com$/i
const MAX_DIMENSION = 4096
const GIPHY_API_BASE = 'https://api.giphy.com/v1'
const GIPHY_PAGE_SIZE = 20

export type GiphyMessageReference = {
  provider: 'giphy'
  providerId: string
  renditionUrl: string
  width: number
  height: number
  altText: string
  creatorName: string
  creatorUrl: string
}

type GiphySearchKind = 'gif' | 'sticker'

type GiphyApiItem = {
  id?: string
  title?: string
  alt_text?: string
  username?: string
  user?: { username?: string; profile_url?: string }
  images?: Record<string, { url?: string; webp?: string; width?: string; height?: string }>
}

export type GiphySearchResult = GiphyMessageReference

function normalizeRenditionUrl(url: unknown, providerId: string): string | null {
  if (typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const idIndex = segments.indexOf(providerId)
    const filename = idIndex >= 0 ? segments[idIndex + 1] : undefined
    if (
      parsed.protocol !== 'https:'
      || !GIPHY_HOST.test(parsed.hostname)
      || !filename
      || !/^[A-Za-z0-9_-]+\.(?:gif|webp|mp4)$/i.test(filename)
    ) return null
    return `https://media.giphy.com/media/${providerId}/${filename}`
  } catch {
    return null
  }
}

function normalizeCreatorUrl(url: unknown): string {
  if (typeof url !== 'string') return ''
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && (parsed.hostname === 'giphy.com' || parsed.hostname.endsWith('.giphy.com'))
      ? `${parsed.origin}${parsed.pathname}`
      : ''
  } catch {
    return ''
  }
}

function mapGiphySearchItem(item: GiphyApiItem, kind: GiphySearchKind): GiphySearchResult | null {
  if (!item.id || !GIPHY_ID.test(item.id)) return null
  const images = item.images || {}
  const candidates = [images.fixed_width, images.fixed_width_downsampled, images.fixed_width_small]
  for (const candidate of candidates) {
    const renditionUrl = normalizeRenditionUrl(kind === 'sticker' ? candidate?.webp || candidate?.url : candidate?.url, item.id)
    if (!renditionUrl) continue
    const width = Number(candidate?.width)
    const height = Number(candidate?.height)
    return {
      provider: 'giphy',
      providerId: item.id,
      renditionUrl,
      width: Number.isInteger(width) && width > 0 ? Math.min(width, MAX_DIMENSION) : 200,
      height: Number.isInteger(height) && height > 0 ? Math.min(height, MAX_DIMENSION) : 200,
      altText: String(item.alt_text || item.title || `${kind === 'sticker' ? 'Sticker' : 'GIF'} from GIPHY`).trim().slice(0, 500),
      creatorName: String(item.user?.username || item.username || '').trim().replace(/^@+/, '').slice(0, 100),
      creatorUrl: normalizeCreatorUrl(item.user?.profile_url),
    }
  }
  return null
}

export async function searchGiphy(
  kind: GiphySearchKind,
  query: string,
  offset: number,
): Promise<GiphySearchResult[]> {
  const apiKey = process.env.GIPHY_API_KEY
  if (!apiKey) throw new Error('GIPHY_API_KEY is not configured.')

  const normalizedQuery = query.trim().slice(0, 150)
  const endpoint = normalizedQuery
    ? `${GIPHY_API_BASE}/${kind === 'sticker' ? 'stickers' : 'gifs'}/search`
    : `${GIPHY_API_BASE}/${kind === 'sticker' ? 'stickers' : 'gifs'}/trending`
  const normalizedOffset = Number.isFinite(offset) ? Math.min(Math.max(0, Math.floor(offset)), 500) : 0
  const params = new URLSearchParams({
    api_key: apiKey,
    rating: 'pg',
    limit: String(GIPHY_PAGE_SIZE),
    offset: String(normalizedOffset),
  })
  if (normalizedQuery) params.set('q', normalizedQuery)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(`${endpoint}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`GIPHY returned ${response.status}.`)
    const payload = await response.json() as { data?: GiphyApiItem[] }
    return (payload.data || [])
      .map((item) => mapGiphySearchItem(item, kind))
      .filter((item): item is GiphySearchResult => Boolean(item))
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Persisted GIPHY references are constrained to a returned GIPHY rendition,
 * rather than allowing chat messages to carry arbitrary external URLs.
 */
export function normalizeGiphyMessageReference(value: unknown): string | null {
  let payload: unknown
  try {
    payload = typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const data = payload as Record<string, unknown>
  const allowedKeys = ['provider', 'providerId', 'renditionUrl', 'width', 'height', 'altText', 'creatorName', 'creatorUrl']
  if (Object.keys(data).some((key) => !allowedKeys.includes(key))) return null
  if (data.provider !== 'giphy' || typeof data.providerId !== 'string' || !GIPHY_ID.test(data.providerId)) return null
  const width = data.width
  const height = data.height
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) return null
  if (typeof data.altText !== 'string' || data.altText.length > 500) return null
  if (typeof data.creatorName !== 'string' || data.creatorName.length > 100) return null
  if (typeof data.creatorUrl !== 'string' || data.creatorUrl.length > 1024) return null
  if (typeof data.renditionUrl !== 'string' || data.renditionUrl.length > 1024) return null

  let renditionUrl: URL
  try {
    renditionUrl = new URL(data.renditionUrl)
  } catch {
    return null
  }
  const renditionSegments = renditionUrl.pathname.split('/').filter(Boolean)
  const providerIdIndex = renditionSegments.indexOf(data.providerId)
  const renditionFilename = providerIdIndex >= 0 ? renditionSegments[providerIdIndex + 1] : undefined
  if (
    renditionUrl.protocol !== 'https:'
    || !GIPHY_HOST.test(renditionUrl.hostname)
    || !renditionFilename
    || !/^[A-Za-z0-9_-]+\.(?:gif|webp|mp4)$/i.test(renditionFilename)
  ) return null
  let creatorUrl = ''
  if (data.creatorUrl) {
    try {
      const parsedCreatorUrl = new URL(data.creatorUrl)
      if (parsedCreatorUrl.protocol !== 'https:' || !(parsedCreatorUrl.hostname === 'giphy.com' || parsedCreatorUrl.hostname.endsWith('.giphy.com'))) return null
      creatorUrl = `${parsedCreatorUrl.origin}${parsedCreatorUrl.pathname}`
    } catch {
      return null
    }
  }

  const reference: GiphyMessageReference = {
    provider: 'giphy',
    providerId: data.providerId,
    renditionUrl: `https://media.giphy.com/media/${data.providerId}/${renditionFilename}`,
    width,
    height,
    altText: data.altText.trim(),
    creatorName: data.creatorName.trim().replace(/^@+/, ''),
    creatorUrl,
  }
  return JSON.stringify(reference)
}