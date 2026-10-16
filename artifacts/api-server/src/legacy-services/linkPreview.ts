// @ts-nocheck
// Generates lightweight Open Graph link previews for URLs shared in chat.
// Fetches are constrained (protocol, size, timeout) and the resolved IP is
// checked against private/loopback ranges before connecting, since this
// endpoint lets an authenticated user make the server fetch an arbitrary URL.
import dns from 'dns'
import net from 'net'

const CACHE_TTL_MS = 30 * 60 * 1000
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 6000
const MAX_BYTES = 1_000_000

interface LinkPreview {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

const cache = new Map<string, { expires: number; value: LinkPreview | null }>()

function isBlockedIp(address: string): boolean {
  if (net.isIP(address) === 4) {
    const parts = address.split('.').map(Number)
    const [a, b] = parts
    if (a === 127) return true // loopback
    if (a === 10) return true // private
    if (a === 169 && b === 254) return true // link-local
    if (a === 172 && b >= 16 && b <= 31) return true // private
    if (a === 192 && b === 168) return true // private
    if (a === 0) return true
    if (a >= 224) return true // multicast/reserved
    return false
  }
  const lower = address.toLowerCase()
  if (lower === '::1') return true // loopback
  if (lower.startsWith('fe80:')) return true // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique local
  return false
}

async function assertPublicHost(hostname: string): Promise<void> {
  const lookups = await dns.promises.lookup(hostname, { all: true })
  if (!lookups.length) throw new Error('Could not resolve host')
  for (const { address } of lookups) {
    if (isBlockedIp(address)) throw new Error('Host resolves to a disallowed address')
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function extractMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i'),
    ]
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match?.[1]) return decodeEntities(match[1])
    }
  }
  return null
}

function resolveUrl(maybeRelative: string | null, base: string): string | null {
  if (!maybeRelative) return null
  try {
    return new URL(maybeRelative, base).toString()
  } catch {
    return null
  }
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const cacheKey = parsed.toString()
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.value

  try {
    await assertPublicHost(parsed.hostname)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let html = ''
    let finalUrl = parsed.toString()
    try {
      // Resolve redirects manually so every destination is checked before the
      // server connects to it. Automatic redirect following could otherwise
      // turn a harmless public URL into a request to a private host.
      let response: Response | null = null
      for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
        const currentUrl = new URL(finalUrl)
        await assertPublicHost(currentUrl.hostname)
        response = await fetch(finalUrl, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CampnectLinkPreview/1.0; +https://campnect.app)',
            Accept: 'text/html,application/xhtml+xml',
          },
        })
        if (response.status < 300 || response.status >= 400) break
        const location = response.headers.get('location')
        if (!location) break
        finalUrl = new URL(location, finalUrl).toString()
        if (redirectCount === 3) throw new Error('Too many redirects')
      }

      if (!response || !response.ok || !response.body) {
        cache.set(cacheKey, { expires: Date.now() + NEGATIVE_CACHE_TTL_MS, value: null })
        return null
      }
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('html')) {
        cache.set(cacheKey, { expires: Date.now() + NEGATIVE_CACHE_TTL_MS, value: null })
        return null
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let bytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        html += decoder.decode(value, { stream: true })
        if (bytes >= MAX_BYTES) {
          await reader.cancel().catch(() => {})
          break
        }
      }
    } finally {
      clearTimeout(timeout)
    }

    const title = extractMeta(html, ['og:title', 'twitter:title']) || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1]) : null)
    const description = extractMeta(html, ['og:description', 'twitter:description', 'description'])
    const image = resolveUrl(extractMeta(html, ['og:image', 'twitter:image']), finalUrl)
    const siteName = extractMeta(html, ['og:site_name']) || parsed.hostname.replace(/^www\./, '')

    if (!title && !description && !image) {
      cache.set(cacheKey, { expires: Date.now() + NEGATIVE_CACHE_TTL_MS, value: null })
      return null
    }

    const preview: LinkPreview = { url: finalUrl, title, description, image, siteName }
    cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, value: preview })
    return preview
  } catch {
    cache.set(cacheKey, { expires: Date.now() + NEGATIVE_CACHE_TTL_MS, value: null })
    return null
  }
}
