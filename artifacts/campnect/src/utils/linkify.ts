// Shared URL detection for chat message text — used both to render clickable
// links inline and to decide whether to fetch a link-preview card.
export const URL_REGEX = /(https?:\/\/[^\s<]+[^\s<.,:;!?'")\]]|www\.[^\s<]+[^\s<.,:;!?'")\]])/gi

export function findFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null
  URL_REGEX.lastIndex = 0
  const match = URL_REGEX.exec(text)
  if (!match) return null
  return normalizeUrl(match[0])
}

export function normalizeUrl(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

interface TextSegment {
  text: string
  isLink: boolean
}

/** Splits message text into plain-text and link segments for inline rendering. */
export function splitTextWithLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let lastIndex = 0
  URL_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = URL_REGEX.exec(text))) {
    if (match.index > lastIndex) segments.push({ text: text.slice(lastIndex, match.index), isLink: false })
    segments.push({ text: match[0], isLink: true })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), isLink: false })
  return segments
}
