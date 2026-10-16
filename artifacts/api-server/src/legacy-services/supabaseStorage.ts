// @ts-nocheck
import { createHash } from 'crypto'

const PRIVATE_BUCKET = 'campnect-private'
const SIGNED_URL_TTL_SECONDS = 60 * 60
let initialization: Promise<void> | null = null

function storageBaseUrl(): string {
  const value = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(value)) {
    throw new Error('SUPABASE_URL must be the HTTPS URL for the Campnect Supabase project.')
  }
  return value
}

function serviceRoleKey(): string {
  const value = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  if (!value) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for media storage.')
  return value
}

function encodedPath(path: string): string {
  return path.split('/').map((part) => encodeURIComponent(part)).join('/')
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'image/gif') return '.gif'
  if (mimeType === 'video/mp4') return '.mp4'
  if (mimeType === 'video/webm') return '.webm'
  if (mimeType === 'video/quicktime') return '.mov'
  return '.bin'
}

function prefixForPurpose(purpose: string): string {
  if (purpose === 'message_media') return 'chat'
  if (purpose === 'user_avatar' || purpose === 'user_cover') return 'profiles'
  if (purpose === 'event_cover') return 'events'
  if (purpose === 'group_avatar' || purpose === 'community_avatar' || purpose === 'community_cover') return 'communities'
  if (purpose === 'clip_media' || purpose === 'clip_cover') return 'clips'
  if (purpose === 'glimpse' || purpose === 'glimpse-cover') return 'glimpses'
  if (purpose === 'story_media') return 'stories'
  if (purpose === 'verification_id_photo' || purpose === 'verification_selfie') return 'restricted'
  if (purpose === 'post_media' || purpose === 'post_cover') return 'posts'
  return 'uploads'
}

function storageHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = serviceRoleKey()
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra }
}

async function storageResponse(response: Response, action: string): Promise<any> {
  if (response.ok) return response
  const text = await response.text().catch(() => '')
  throw new Error(`Supabase Storage ${action} failed (${response.status})${text ? `: ${text.slice(0, 240)}` : ''}`)
}

async function ensurePrivateBucket(): Promise<void> {
  const baseUrl = storageBaseUrl()
  const bucketUrl = `${baseUrl}/storage/v1/bucket/${PRIVATE_BUCKET}`
  const existing = await fetch(bucketUrl, { headers: storageHeaders() })
  if (existing.ok) return
  // Supabase Storage returns either HTTP 404 or HTTP 400 with NoSuchBucket
  // depending on the API gateway version.
  const lookupBody = await existing.text().catch(() => '')
  if (existing.status !== 404 && !/NoSuchBucket/i.test(lookupBody)) {
    throw new Error(`Supabase Storage bucket lookup failed (${existing.status})${lookupBody ? `: ${lookupBody.slice(0, 240)}` : ''}`)
  }

  const created = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: storageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      id: PRIVATE_BUCKET,
      name: PRIVATE_BUCKET,
      public: false,
      file_size_limit: null,
      allowed_mime_types: null,
    }),
  })
  if (created.ok || created.status === 409) return
  await storageResponse(created, 'bucket creation')
}

/** Initialize the private bucket once per process. All current Campnect media
 * stays private because post/profile/event visibility can change later. */
export async function ensureMediaStorage(): Promise<void> {
  if (!initialization) {
    initialization = ensurePrivateBucket().catch((error) => {
      initialization = null
      throw error
    })
  }
  return initialization
}

export function mediaStorageLocation(assetId: string, purpose: string, mimeType: string) {
  return {
    bucket: PRIVATE_BUCKET,
    path: `${prefixForPurpose(purpose)}/${assetId}${extensionForMime(mimeType)}`,
  }
}

export async function readStoredMedia(bucket: string, path: string): Promise<Buffer> {
  await ensureMediaStorage()
  const response = await fetch(
    `${storageBaseUrl()}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(path)}`,
    { headers: storageHeaders() },
  )
  await storageResponse(response, 'download')
  return Buffer.from(await response.arrayBuffer())
}

export async function verifyStoredMedia(
  bucket: string,
  path: string,
  expectedChecksum: string,
  expectedByteSize: number,
): Promise<void> {
  const bytes = await readStoredMedia(bucket, path)
  const checksum = createHash('sha256').update(bytes).digest('hex')
  if (bytes.length !== Number(expectedByteSize) || checksum !== expectedChecksum) {
    throw new Error('Supabase Storage verification did not match the expected media checksum or byte size.')
  }
}

export async function uploadStoredMedia(input: {
  bucket: string
  path: string
  bytes: Buffer
  mimeType: string
  checksum: string
}): Promise<void> {
  await ensureMediaStorage()
  const response = await fetch(
    `${storageBaseUrl()}/storage/v1/object/${encodeURIComponent(input.bucket)}/${encodedPath(input.path)}`,
    {
      method: 'PUT',
      headers: storageHeaders({
        'Content-Type': input.mimeType,
        'Cache-Control': '31536000',
        'x-upsert': 'false',
      }),
      body: input.bytes,
    },
  )
  if (!response.ok && response.status !== 409) await storageResponse(response, 'upload')
  await verifyStoredMedia(input.bucket, input.path, input.checksum, input.bytes.length)
}

export async function deleteStoredMedia(bucket: string, path: string): Promise<void> {
  await ensureMediaStorage()
  const response = await fetch(`${storageBaseUrl()}/storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: 'DELETE',
    headers: storageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: [path] }),
  })
  await storageResponse(response, 'delete')
}

/** A short-lived private URL is generated only after Campnect has applied its
 * existing media authorization rules. Service credentials never leave the API. */
export async function createStoredMediaAccessUrl(bucket: string, path: string): Promise<string> {
  await ensureMediaStorage()
  const response = await fetch(
    `${storageBaseUrl()}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath(path)}`,
    {
      method: 'POST',
      headers: storageHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
    },
  )
  await storageResponse(response, 'signed URL creation')
  const body = await response.json()
  const signedPath = body?.signedURL || body?.signedUrl
  if (typeof signedPath !== 'string' || !signedPath.startsWith('/')) {
    throw new Error('Supabase Storage did not return a signed media URL.')
  }
  return `${storageBaseUrl()}/storage/v1${signedPath}`
}