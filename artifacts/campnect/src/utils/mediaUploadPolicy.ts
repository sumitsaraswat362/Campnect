export const PHOTO_MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export const VIDEO_MAX_UPLOAD_BYTES = 100 * 1024 * 1024
export const VIDEO_MAX_DURATION_SECONDS = 60

export type UploadMediaKind = 'image' | 'video'

export function uploadMediaKind(file: Pick<File, 'name' | 'type'>): UploadMediaKind | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif'].includes(extension || '')) return 'image'
  if (['mp4', 'mov', 'webm', 'm4v', '3gp', 'avi', 'ogv'].includes(extension || '')) return 'video'
  return null
}

export function mediaUploadSizeError(file: Pick<File, 'size' | 'name' | 'type'>): string | null {
  const kind = uploadMediaKind(file)
  if (kind === 'image' && file.size > PHOTO_MAX_UPLOAD_BYTES) return 'Photo must be 25 MB or smaller.'
  if (kind === 'video' && file.size > VIDEO_MAX_UPLOAD_BYTES) return 'Video must be 100 MB or smaller.'
  return null
}

export function mediaUploadDurationError(durationSeconds: number): string | null {
  return Number.isFinite(durationSeconds) && durationSeconds > VIDEO_MAX_DURATION_SECONDS
    ? `Video must be ${VIDEO_MAX_DURATION_SECONDS} seconds or shorter.`
    : null
}

/** Returns null when metadata cannot be read; it never changes or trims the source. */
export function readVideoDurationSeconds(file: File, timeoutMs = 10_000): Promise<number | null> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return Promise.resolve(null)
  }

  return new Promise(resolve => {
    const video = document.createElement('video')
    const source = URL.createObjectURL(file)
    let settled = false
    const finish = (duration: number | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(source)
      resolve(duration)
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    video.preload = 'metadata'
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null)
    video.onerror = () => finish(null)
    video.src = source
  })
}

export async function mediaUploadError(
  file: File,
  expectedKind?: UploadMediaKind,
): Promise<string | null> {
  const kind = uploadMediaKind(file)
  if (!kind || (expectedKind && kind !== expectedKind)) {
    return expectedKind === 'image'
      ? 'Choose a photo to upload.'
      : expectedKind === 'video'
        ? 'Choose a video to upload.'
        : 'Choose a supported photo or video.'
  }

  const sizeError = mediaUploadSizeError(file)
  if (sizeError) return sizeError

  if (kind === 'video') {
    const duration = await readVideoDurationSeconds(file)
    if (duration !== null) {
      const durationError = mediaUploadDurationError(duration)
      if (durationError) return durationError
    }
    // Unsupported browser codecs stay usable through the existing normalization
    // and upload flow; the server remains authoritative when local metadata is unavailable.
  }
  return null
}