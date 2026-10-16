// @ts-nocheck
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { fileTypeFromBuffer } from 'file-type'
import {
  PHOTO_MAX_UPLOAD_BYTES,
  VIDEO_MAX_UPLOAD_BYTES,
  MediaPolicyError,
  assertMediaUploadSize,
  isMediaPolicyError,
} from '../legacy-services/mediaLimits.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Kept for the legacy /uploads route. New uploads use memoryStorage and are
// persisted by the route into the durable media_assets table.
export const UPLOADS_DIR = path.join(__dirname, '../../uploads')

/**
 * Never write user media to the application filesystem. The app filesystem
 * can be replaced during rebuilds/deploys while database rows remain. Routes
 * persist file.buffer into media_assets in the same transaction as the row
 * that references it.
 */
const memoryStorage = multer.memoryStorage()

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const ALLOWED_MEDIA_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'video/x-msvideo',
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav',
])
const GENERIC_UPLOAD_MIMES = new Set(['text/plain', 'application/octet-stream'])
const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
  '.3gp': 'video/3gpp',
  '.avi': 'video/x-msvideo',
}
const AUDIO_MAX_UPLOAD_BYTES = 20 * 1024 * 1024

function baseMimeType(value: unknown) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase()
}

/**
 * Validate a file's actual content against magic bytes using the file-type
 * library. This guards against client-controlled Content-Type spoofing where
 * an attacker labels arbitrary content with an allowed MIME type.
 *
 * @throws Error if the detected type is not in the allowed set.
 */
async function assertMagicBytes(
  file: Express.Multer.File,
  allowed: Set<string>,
  label: string,
): Promise<string> {
  const detected = await fileTypeFromBuffer(file.buffer)
  if (!detected || !allowed.has(detected.mime)) {
    throw new MediaPolicyError(
      label === 'image' ? 'INVALID_IMAGE' : 'INVALID_MEDIA',
      label === 'image'
        ? 'This image could not be read. Please choose another image.'
        : 'This media could not be read. Please choose another file.',
      400,
    )
  }
  assertMediaUploadSize(detected.mime, file.buffer.length)
  if (detected.mime.startsWith('audio/') && file.buffer.length > AUDIO_MAX_UPLOAD_BYTES) {
    throw new MediaPolicyError('AUDIO_TOO_LARGE', 'Audio must be 20 MB or smaller.', 413)
  }
  // Multer's mimetype is client supplied. Every persisted media row must use
  // the signature-derived canonical MIME rather than this header.
  file.mimetype = detected.mime
  return detected.mime
}

/**
 * Assert that the uploaded file's actual bytes identify it as an allowed image
 * type (jpeg, png, webp, gif). Call this in route handlers after multer has
 * buffered the file, before persisting to the database.
 */
export async function assertImageMagic(file: Express.Multer.File): Promise<string> {
  return assertMagicBytes(file, ALLOWED_IMAGE_MIMES, 'image')
}

/**
 * Assert that the uploaded file's actual bytes identify it as an allowed
 * image, video, or audio type. Call this in route handlers after multer has
 * buffered the file, before persisting to the database.
 */
export async function assertMediaMagic(file: Express.Multer.File): Promise<string> {
  return assertMagicBytes(file, ALLOWED_MEDIA_MIMES, 'media')
}

export function sendMediaPolicyError(res: any, error: unknown): boolean {
  if (!isMediaPolicyError(error)) return false
  res.status(error.status).json({
    success: false,
    error: error.message,
    code: error.code,
  })
  return true
}

export function mediaUploadLimitError(error: any, imageOnly = false, videoOnly = false): MediaPolicyError | null {
  if (error?.code !== 'LIMIT_FILE_SIZE') return null
  if (imageOnly) {
    return new MediaPolicyError('PHOTO_TOO_LARGE', 'Photo must be 25 MB or smaller.', 413)
  }
  if (videoOnly) {
    return new MediaPolicyError('VIDEO_TOO_LARGE', 'Video must be 100 MB or smaller.', 413)
  }
  return new MediaPolicyError(
    'MEDIA_TOO_LARGE',
    'Photos must be 25 MB or smaller; videos must be 100 MB or smaller.',
    413,
  )
}

function imageFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ALLOWED_IMAGE_MIMES.has(baseMimeType(file.mimetype))) {
    cb(null, true)
  } else {
    cb(new MediaPolicyError('INVALID_IMAGE', 'Only image files are allowed (jpg, png, webp, gif).', 400))
  }
}

function mediaFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const receivedMime = baseMimeType(file.mimetype)
  const extensionMime = MEDIA_MIME_BY_EXTENSION[path.extname(file.originalname || '').toLowerCase()]
  const acceptedMime = ALLOWED_MEDIA_MIMES.has(receivedMime)
    ? receivedMime
    : (GENERIC_UPLOAD_MIMES.has(receivedMime) ? extensionMime : undefined)
  if (acceptedMime && ALLOWED_MEDIA_MIMES.has(acceptedMime)) {
    // Some WebViews serialize codec-qualified MediaRecorder Blobs as
    // text/plain. Restore the type from the generated video filename; route
    // handlers still verify the actual bytes before processing or storage.
    file.mimetype = acceptedMime
    cb(null, true)
  } else {
    cb(new MediaPolicyError('INVALID_MEDIA', 'Only image, video, and audio files are allowed.', 400))
  }
}

export const uploadAvatar = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: { fileSize: PHOTO_MAX_UPLOAD_BYTES },
})
export const uploadCover = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: { fileSize: PHOTO_MAX_UPLOAD_BYTES },
})
export const uploadPost = multer({
  storage: memoryStorage,
  fileFilter: mediaFilter,
  limits: { fileSize: VIDEO_MAX_UPLOAD_BYTES, files: 10 },
})
export const uploadStory = multer({
  storage: memoryStorage,
  fileFilter: mediaFilter,
  limits: { fileSize: VIDEO_MAX_UPLOAD_BYTES },
})
export const uploadVerify = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: { fileSize: PHOTO_MAX_UPLOAD_BYTES, files: 2 },
})
export const uploadMessage = multer({
  storage: memoryStorage,
  fileFilter: mediaFilter,
  limits: { fileSize: VIDEO_MAX_UPLOAD_BYTES },
})
export const uploadGroup = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: { fileSize: PHOTO_MAX_UPLOAD_BYTES },
})
