// @ts-nocheck
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { fileTypeFromBuffer } from 'file-type'
import type { DbExecutor } from '../legacy-db/index.js'
import { optimizeImage, validateImage } from './imageProcessing.js'
import { optimizePlaybackVideo } from './videoProcessing.js'
import { deleteStoredMedia, mediaStorageLocation, uploadStoredMedia } from './supabaseStorage.js'
import { assertMediaUploadSize, isMediaPolicyError, MediaPolicyError } from './mediaLimits.js'

const MAX_ORIGINAL_NAME_LENGTH = 255
const MEDIA_ACCESS_TTL_SECONDS = 24 * 60 * 60
const MEDIA_ACCESS_SECRET = process.env.SESSION_SECRET
  || (process.env.NODE_ENV === 'test' ? 'campnect_explicit_test_media_secret' : null)
if (!MEDIA_ACCESS_SECRET) throw new Error('SESSION_SECRET environment variable is required for media access signing.')

/**
 * Persist an uploaded file in Supabase/Postgres.
 *
 * The caller must invoke this with the transaction executor that also writes
 * the owning row. The returned URL contains only an opaque asset id; bytes
 * never depend on the app server's local filesystem.
 */
export async function storeMediaAsset(
  tx: DbExecutor,
  file: Express.Multer.File,
  ownerId: string,
  purpose: string,
  entityId?: string,
): Promise<string> {
  if (!file.buffer || file.buffer.length === 0) {
    throw new Error('Uploaded file is empty.')
  }
  // Defense in depth for callers that missed the upload middleware assertion:
  // never persist Multer's client-controlled Content-Type as media metadata.
  const detected = await fileTypeFromBuffer(file.buffer)
  if (!detected) throw new Error('The uploaded media type could not be identified.')
  const sourceMimeType = detected.mime
  assertMediaUploadSize(sourceMimeType, file.buffer.length)
  file.mimetype = sourceMimeType
  let storedBuffer = file.buffer
  let storedMimeType = sourceMimeType || 'application/octet-stream'
  let sourceByteSize: number | null = null
  let optimizationStatus: string | null = null
  let width: number | null = null
  let height: number | null = null
  if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(sourceMimeType)) {
    try {
    // Verification documents are deliberately validated only, never recompressed.
    const info = purpose === 'verification_id_photo' || purpose === 'verification_selfie'
      ? await validateImage(file.buffer)
      : null
    if (info) {
      if (info.mimeType !== sourceMimeType) throw new Error('Image MIME does not match its contents.')
      width = info.width; height = info.height; sourceByteSize = file.buffer.length; optimizationStatus = 'original'
    } else {
      const optimized = await optimizeImage(file.buffer, sourceMimeType)
      storedBuffer = optimized.buffer; storedMimeType = optimized.mimeType
      sourceByteSize = optimized.sourceByteSize; optimizationStatus = optimized.optimizationStatus
      width = optimized.width; height = optimized.height
    }
    } catch (error) {
      if (isMediaPolicyError(error)) throw error
      throw new MediaPolicyError('INVALID_IMAGE', 'This photo could not be processed. Please try another photo.')
    }
  } else if (sourceMimeType.startsWith('video/')) {
    // All new videos, including small files and server-transformed uploads,
    // are validated and share one encoder. Failed optimization never persists
    // a raw, unvalidated original as the normal delivery representation.
    sourceByteSize = file.buffer.length
    const optimized = await optimizePlaybackVideo(file.buffer)
    storedBuffer = optimized.buffer
    storedMimeType = 'video/mp4'
    optimizationStatus = optimized.optimizationStatus === 'original' ? 'original' : 'optimized'
  }

  const id = uuidv4()
  const checksum = createHash('sha256').update(storedBuffer).digest('hex')
  const originalName = String(file.originalname || 'upload').slice(0, MAX_ORIGINAL_NAME_LENGTH)
  const existing = await tx.one<{ id: string }>(`
    SELECT id
    FROM media_assets
    WHERE owner_id = $1
      AND checksum = $2
      AND purpose = $3
      AND entity_id IS NOT DISTINCT FROM $4
    LIMIT 1
  `, [ownerId, checksum, purpose, entityId || null])
  if (existing?.id) return `/api/media/${existing.id}`

  // Storage is deliberately written before the metadata row. This guarantees
  // that a committed media_assets row never points at a missing object. A
  // failed transaction can at worst leave a deterministic orphan, which the
  // reconciliation command reports instead of deleting automatically.
  const storage = mediaStorageLocation(id, purpose, storedMimeType)
  await uploadStoredMedia({
    bucket: storage.bucket,
    path: storage.path,
    bytes: storedBuffer,
    mimeType: storedMimeType,
    checksum,
  })
  const asset = await tx.one<{ id: string }>(`
    INSERT INTO media_assets
      (id, owner_id, entity_type, entity_id, purpose, data, mime_type, original_name, byte_size, checksum,
       source_mime_type, source_byte_size, optimization_status, width, height,
       storage_bucket, storage_path, storage_status, storage_migrated_at, storage_checksum, storage_byte_size)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),$10,$9)
    ON CONFLICT (owner_id, checksum, purpose, entity_id)
    DO NOTHING
    RETURNING id
  `, [
    id,
    ownerId,
    purpose.split(':')[0] || purpose,
    entityId || null,
    purpose,
    // Keep the existing NOT NULL invariant without retaining new large media
    // payloads in Postgres. Storage is the canonical byte source for this row.
    Buffer.alloc(0),
    storedMimeType,
    originalName,
    storedBuffer.length,
    checksum,
    sourceByteSize ? sourceMimeType : null,
    sourceByteSize,
    optimizationStatus,
    width,
    height,
    storage.bucket,
    storage.path,
    'storage_ready',
  ])
  if (asset?.id) return `/api/media/${asset.id}`

  // A repeated upload for the same owner/entity/purpose can reuse its
  // immutable asset. The entity is part of the uniqueness key so the same
  // bytes used by a second post/story/message get a separate authorized row.
  const conflicted = await tx.one<{ id: string }>(`
    SELECT id
    FROM media_assets
    WHERE owner_id = $1
      AND checksum = $2
      AND purpose = $3
      AND entity_id IS NOT DISTINCT FROM $4
    LIMIT 1
  `, [ownerId, checksum, purpose, entityId || null])
  if (!conflicted?.id) throw new Error('The uploaded media could not be indexed.')
  // A concurrent equivalent upload won the immutable-row uniqueness race.
  // Remove only the unreferenced deterministic object created by this request.
  await deleteStoredMedia(storage.bucket, storage.path).catch(() => {})
  return `/api/media/${conflicted.id}`
}

export async function storeMediaAssets(
  tx: DbExecutor,
  files: Express.Multer.File[],
  ownerId: string,
  purpose: string,
  entityId?: string,
): Promise<string[]> {
  const urls: string[] = []
  for (const file of files) {
    urls.push(await storeMediaAsset(tx, file, ownerId, purpose, entityId))
  }
  return urls
}

/** Remove canonical Storage objects only after their media_assets rows have
 * committed a permanent deletion. Failures are logged for reconciliation and
 * never undo the already-completed user deletion. */
export async function deleteStoredMediaAssets(assets: Array<{ storage_bucket?: string | null, storage_path?: string | null, storage_status?: string | null }>) {
  for (const asset of assets) {
    if (asset.storage_status !== 'storage_ready' || !asset.storage_bucket || !asset.storage_path) continue
    try {
      await deleteStoredMedia(asset.storage_bucket, asset.storage_path)
    } catch (error: any) {
      console.error(`[media] Storage cleanup failed for deleted asset: ${String(error?.message || 'unknown error').slice(0, 240)}`)
    }
  }
}

export function mediaAssetId(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null
  let pathname = value
  if (/^https?:\/\//i.test(value)) {
    try { pathname = new URL(value).pathname } catch { return null }
  }
  const match = pathname.match(/^\/api\/media\/([0-9a-f-]{36})$/i)
  return match?.[1] || null
}

/** Return the canonical same-origin URL for a durable media asset. */
export function durableMediaUrl(value?: string | null): string | null {
  const id = mediaAssetId(value)
  return id ? `/api/media/${id}` : null
}

/**
 * Media elements do not send the app's Authorization header. Glimpse assets
 * still need campus-scoped access, so feed responses carry a short-lived
 * signed capability containing the viewer id instead of exposing an
 * unauthenticated media endpoint.
 */
export function signedMediaUrl(value: string | null | undefined, viewerId: string): string | null {
  const url = durableMediaUrl(value)
  const id = mediaAssetId(value)
  if (!url || !id || !viewerId) return url

  const expiresAt = Math.floor(Date.now() / 1000) + MEDIA_ACCESS_TTL_SECONDS
  const payload = `${id}.${viewerId}.${expiresAt}`
  const signature = createHmac('sha256', MEDIA_ACCESS_SECRET).update(payload).digest('base64url')
  return `${url}?access=${encodeURIComponent(`${payload}.${signature}`)}`
}

export function verifyMediaAccess(value: unknown, assetId: string): { viewerId: string } | null {
  if (typeof value !== 'string') return null
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const [signedAssetId, viewerId, expiresAtText, signature] = parts
  const expiresAt = Number(expiresAtText)
  if (
    signedAssetId !== assetId ||
    !viewerId ||
    !Number.isInteger(expiresAt) ||
    expiresAt < Math.floor(Date.now() / 1000) ||
    !/^[0-9a-f-]{36}$/i.test(signedAssetId)
  ) return null

  const payload = `${signedAssetId}.${viewerId}.${expiresAtText}`
  const expected = createHmac('sha256', MEDIA_ACCESS_SECRET).update(payload).digest('base64url')
  const providedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null
  }
  return { viewerId }
}