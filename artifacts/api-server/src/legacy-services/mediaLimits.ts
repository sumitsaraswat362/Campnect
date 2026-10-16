/** Original-upload limits. MB in user-facing copy means MiB (1024 * 1024). */
export const PHOTO_MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export const VIDEO_MAX_UPLOAD_BYTES = 100 * 1024 * 1024
export const VIDEO_MAX_DURATION_SECONDS = 60

export class MediaPolicyError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message)
    this.name = 'MediaPolicyError'
  }
}

export function isMediaPolicyError(error: unknown): error is MediaPolicyError {
  return error instanceof MediaPolicyError
}

/** Call with a server-detected MIME type and actual Buffer.length, not headers. */
export function assertMediaUploadSize(mimeType: string, byteLength: number) {
  if (mimeType.startsWith('image/') && byteLength > PHOTO_MAX_UPLOAD_BYTES) {
    throw new MediaPolicyError('PHOTO_TOO_LARGE', 'Photo must be 25 MB or smaller.', 413)
  }
  if (mimeType.startsWith('video/') && byteLength > VIDEO_MAX_UPLOAD_BYTES) {
    throw new MediaPolicyError('VIDEO_TOO_LARGE', 'Video must be 100 MB or smaller.', 413)
  }
}

export function assertVideoDuration(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new MediaPolicyError('INVALID_VIDEO', 'This video could not be processed. Please try another video.')
  }
  if (duration > VIDEO_MAX_DURATION_SECONDS) {
    throw new MediaPolicyError('VIDEO_TOO_LONG', 'Video must be 60 seconds or shorter.')
  }
}