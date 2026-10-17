import client from './client'
import { mediaUrl } from '../utils/mediaUrl'

function jpgRepresentationUrl(value?: string | null): string | undefined {
  const resolved = mediaUrl(value)
  if (!resolved) return undefined
  return resolved.replace(
    /(\/api\/media\/[0-9a-f-]{36})(\?[^#]*)?$/i,
    '$1/download.jpg$2',
  )
}

function safeDownloadName(value: string) {
  const base = value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '')
  return `${base || 'campnect-image'}.jpg`
}

export async function downloadMediaAsJpeg(
  mediaPath: string,
  suggestedName = 'campnect-image',
): Promise<void> {
  const url = jpgRepresentationUrl(mediaPath)
  if (!url || url === mediaUrl(mediaPath)) {
    throw new Error('This image is not available for JPG download.')
  }

  const response = await client.get(url, { responseType: 'blob', timeout: 60_000 })
  const blob = response.data instanceof Blob
    ? response.data
    : new Blob([response.data], { type: 'image/jpeg' })
  if (blob.type && blob.type !== 'image/jpeg') {
    throw new Error('The downloaded image was not a valid JPG.')
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = safeDownloadName(suggestedName)
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
  }
}