import { DEMO_MODE } from '../demo/config'
import axios, { type AxiosRequestConfig } from 'axios'
import client from './client'
import type { Post } from '../stores/feedStore'
import { mediaUploadError } from '../utils/mediaUploadPolicy'

export type Clip = Post & {
  views_count?: number
  thumbnail_url?: string | null
  is_following_author?: boolean | null
  processing?: boolean
  status?: 'ready' | 'processing' | string
}

export interface ClipFeedMeta {
  limit: number
  hasMore: boolean
  nextCursor: string | null
}

export interface CreateClipData {
  caption: string
  visibility: 'public' | 'friends' | 'college'
  idempotency_key: string
}

const UPLOAD_TIMEOUT_MS = 180_000
const SERVICE_RETRY_DELAY_MS = 3_000
const SERVICE_READY_ATTEMPTS = 8
const UPLOAD_RETRY_ATTEMPTS = 3

function waitForRetry(signal?: AbortSignal, delayMs = SERVICE_RETRY_DELAY_MS) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new axios.CanceledError('Upload canceled'))
      return
    }
    const timer = window.setTimeout(resolve, delayMs)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(new axios.CanceledError('Upload canceled'))
    }, { once: true })
  })
}

async function waitForUploadService(signal?: AbortSignal) {
  // Autoscale instances can briefly return 503 while opening their database
  // connection. Clip publishing must wait through that bounded warm-up window
  // instead of failing before an upload session can start.
  for (let attempt = 0; attempt < SERVICE_READY_ATTEMPTS; attempt += 1) {
    try {
      await client.get('/healthz', { timeout: 15_000, signal })
      return
    } catch (error) {
      if (axios.isCancel(error) || attempt === SERVICE_READY_ATTEMPTS - 1) throw error
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status && status !== 503) throw error
      await waitForRetry(signal, Math.min(9_000, 1_500 * (2 ** attempt)))
    }
  }
}

function canRetryUpload(error: unknown) {
  if (axios.isCancel(error)) return false
  if (!axios.isAxiosError(error)) return true
  const status = error.response?.status
  return !status || status === 408 || status === 429 || status >= 500
}

async function retryUploadRequest<T>(request: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < UPLOAD_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await request()
    } catch (error) {
      lastError = error
      if (!canRetryUpload(error) || attempt === UPLOAD_RETRY_ATTEMPTS - 1) throw error
      await waitForRetry(signal)
    }
  }
  throw lastError
}

export const clipsApi = {
  getFeed: (cursor?: string | null, limit = 20) =>
    client.get<{ data: Clip[]; meta: ClipFeedMeta }>('/clips', { params: { cursor: cursor || undefined, limit } }),
  get: (id: string) => client.get<{ data: Clip }>(`/clips/${id}`),
  getUserClips: (username: string) => client.get<{ data: Clip[] }>(`/clips/users/${encodeURIComponent(username)}`),
  create: async (video: File, data: CreateClipData, config?: AxiosRequestConfig) => {
    if (DEMO_MODE) {
      const fd = new FormData(); fd.append('data', JSON.stringify(data)); fd.append('media', video)
      return client.post<{ data: Clip }>('/clips', fd, config)
    }
    const policyError = await mediaUploadError(video, 'video')
    if (policyError) throw new Error(policyError)
    const signal = config?.signal as AbortSignal | undefined
    await waitForUploadService(signal)
    // Multipart bodies from Android WebViews can arrive with file metadata but
    // no bytes. Use raw, resumable chunks for every Clip so all platforms take
    // the same byte-preserving path through the production gateway.
    const started = await retryUploadRequest(
      () => client.post<{ data: { id: string; chunk_size: number; total_chunks: number } }>('/clips/uploads', {
        file_name: video.name || 'clip.mp4',
        mime_type: video.type || 'video/mp4',
        total_bytes: video.size,
        data,
      }, { timeout: UPLOAD_TIMEOUT_MS, signal }),
      signal,
    )
    const upload = started.data.data
    for (let index = 0; index < upload.total_chunks; index += 1) {
      const start = index * upload.chunk_size
      const chunk = video.slice(start, Math.min(video.size, start + upload.chunk_size), 'application/octet-stream')
      await retryUploadRequest(
        () => client.put(`/clips/uploads/${upload.id}/chunks/${index}`, chunk, {
          timeout: UPLOAD_TIMEOUT_MS,
          signal,
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
        signal,
      )
      config?.onUploadProgress?.({ loaded: Math.min(video.size, start + chunk.size), total: video.size } as any)
    }
    return retryUploadRequest(
      () => client.post<{ data: Clip }>(`/clips/uploads/${upload.id}/complete`, undefined, {
        timeout: UPLOAD_TIMEOUT_MS,
        signal,
      }),
      signal,
    )
  },
  delete: (id: string) => client.delete(`/clips/${id}`),
  report: (id: string, reason: string, description?: string) => client.post(`/clips/${id}/report`, { reason, description }),
  recordView: (id: string) => client.post(`/clips/${id}/view`),
}