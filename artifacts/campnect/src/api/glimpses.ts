import client from './client'
import axios, { type AxiosRequestConfig } from 'axios'

export interface GlimpseEvent {
  id: string
  title: string
  cover_url?: string | null
  starts_at?: string | null
  status?: string | null
}

export interface Glimpse {
  id: string
  user_id: string
  username: string
  full_name: string
  avatar_url?: string | null
  college_name?: string | null
  type: 'glimpse'
  content?: string
  media: string[]
  cover_url?: string | null
  duration?: number | null
  tags?: string[]
  likes_count: number
  comments_count: number
  saves_count: number
  views_count: number
  shares_count: number
  is_liked?: boolean
  is_saved?: boolean
  is_viewed?: boolean
  created_at: string
  visibility: string
  moderation_status?: 'pending' | 'approved' | 'restricted' | 'removed' | 'rejected'
  discovery_restricted?: boolean
  event?: GlimpseEvent | null
}

export interface GlimpseQuota {
  used: number
  remaining: number
  limit: number
}

export interface GlimpseActivityUser {
  id: string
  username: string
  full_name: string
  avatar_url?: string | null
  viewed_at?: string
  liked_at?: string
}

export interface GlimpseInsights {
  viewers: GlimpseActivityUser[]
  likes: GlimpseActivityUser[]
}

const UPLOAD_TIMEOUT_MS = 180_000
const SERVICE_RETRY_DELAY_MS = 3_000

function waitForRetry(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new axios.CanceledError('Upload canceled'))
      return
    }
    const timer = window.setTimeout(resolve, SERVICE_RETRY_DELAY_MS)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(new axios.CanceledError('Upload canceled'))
    }, { once: true })
  })
}

async function waitForUploadService(signal?: AbortSignal) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await client.get('/healthz', { timeout: 15_000, signal })
      return
    } catch (error) {
      if (axios.isCancel(error) || attempt === 2) throw error
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status && status !== 503) throw error
      await waitForRetry(signal)
    }
  }
}

export const glimpsesApi = {
  getFeed: (
    page = 1,
    limit = 8,
    params?: { mode?: 'feed' | 'my'; q?: string; event_id?: string; creator_id?: string },
    config?: Pick<AxiosRequestConfig, 'signal'>,
  ) =>
    client.get<{ success: boolean; data: Glimpse[]; meta: { page: number; limit: number; hasMore: boolean } }>('/glimpses', {
      params: { page, limit, ...params },
      signal: config?.signal,
    }),
  getQuota: () => client.get<{ success: boolean; data: GlimpseQuota }>('/glimpses/quota'),
  getById: (id: string) => client.get<{ success: boolean; data: Glimpse }>(`/glimpses/${id}`),
  getInsights: (id: string) => client.get<{ success: boolean; data: GlimpseInsights }>(`/glimpses/${id}/insights`),
  delete: (id: string) => client.delete(`/glimpses/${id}`),
  create: async (data: FormData, onUploadProgress?: (progress: number) => void, config?: AxiosRequestConfig) => {
    await waitForUploadService(config?.signal as AbortSignal | undefined)
    const requestConfig: AxiosRequestConfig = {
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: (event) => onUploadProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : 0),
      ...config,
    }
    try {
      return await client.post<{ success: boolean; data: Glimpse; meta?: { quota?: GlimpseQuota }; message?: string }>('/glimpses', data, requestConfig)
    } catch (error) {
      if (axios.isCancel(error) || !axios.isAxiosError(error) || error.response?.status !== 503) throw error
      await waitForRetry(config?.signal as AbortSignal | undefined)
      onUploadProgress?.(0)
      return client.post<{ success: boolean; data: Glimpse; meta?: { quota?: GlimpseQuota }; message?: string }>('/glimpses', data, requestConfig)
    }
  },
  view: (id: string, watchPct = 0, watchSeconds = 0) =>
    client.post(`/glimpses/${id}/view`, { watch_pct: watchPct, watch_seconds: watchSeconds }),
  share: (id: string) => client.post(`/glimpses/${id}/share`),
  report: (id: string, reason = 'other', description?: string) =>
    client.post(`/glimpses/${id}/report`, { reason, description }),
}