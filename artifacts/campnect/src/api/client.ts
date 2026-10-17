import axios from 'axios'
import { DEMO_MODE, DEMO_AUTH_KEY } from '../demo/config'
import { Capacitor } from '@capacitor/core'

/**
 * API base URL.
 *
 * Web (dev/prod):   VITE_API_BASE_URL is unset → uses '/api' (Vite proxy / same-origin).
 * Native (Android): VITE_API_BASE_URL must be set to the absolute server URL at build time,
 *                   e.g. https://campnect.yourname.repl.co/api
 *                   because relative URLs in a Capacitor WebView resolve to
 *                   capacitor://localhost, not your backend server.
 *
 * See .env.capacitor.example for the exact variable to set.
 */
const configuredApiBase = (import.meta as any).env?.VITE_API_BASE_URL?.trim()
const isNative = Capacitor.isNativePlatform()
const nativeApiBase = 'https://campnect.perinol.com/api'
// Keep browser requests relative for Vite/the published same-origin app. Native
// builds use the production API even if someone invokes Vite/Capacitor directly
// instead of the repository's cap:build script.
export const API_BASE: string = DEMO_MODE ? '/api' : configuredApiBase || (isNative ? nativeApiBase : '/api')
export const API_ORIGIN: string = API_BASE.startsWith('http')
  ? API_BASE.replace(/\/api\/?$/, '')
  : ''

if (!DEMO_MODE && isNative && !configuredApiBase) {
  console.info('Campnect native build is using the production API endpoint.')
}

const MEDIA_KEYS = new Set([
  'avatar_url', 'cover_url', 'media_url', 'thumbnail_url', 'image_url', 'media',
  'video_url', 'audio_url', 'file_url', 'organizer_avatar', 'actor_avatar',
  'reporter_avatar', 'author_avatar',
])

function normalizeMediaUrls(value: unknown, mediaArray = false): unknown {
  if (!API_ORIGIN || value === null || value === undefined) return value
  // Binary responses from protected media requests must pass through untouched.
  // Treating a Blob like a JSON object turns it into {}, which makes
  // URL.createObjectURL fail and breaks every authenticated media surface.
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value
  if (typeof ArrayBuffer !== 'undefined' && (
    value instanceof ArrayBuffer || ArrayBuffer.isView(value)
  )) return value
  if (Array.isArray(value)) {
    return value.map((child) => (
      mediaArray && typeof child === 'string' && /^(?:\/?(?:api\/media|uploads)\/)/.test(child)
        ? `${API_ORIGIN}${child.startsWith('/') ? '' : '/'}${child}`
        : normalizeMediaUrls(child, mediaArray)
    ))
  }
  if (typeof value !== 'object') return value

  const result: Record<string, unknown> = { ...(value as Record<string, unknown>) }
  for (const [key, child] of Object.entries(result)) {
    if (MEDIA_KEYS.has(key) && typeof child === 'string' && /^(?:\/?(?:api\/media|uploads)\/)/.test(child)) {
      result[key] = `${API_ORIGIN}${child.startsWith('/') ? '' : '/'}${child}`
    } else {
      result[key] = normalizeMediaUrls(child, key === 'media')
    }
  }
  return result
}

const client = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  ...(DEMO_MODE ? { adapter: async (config) => (await import('../demo/apiAdapter')).demoAdapter(config) } : {}),
})

// ─── Request interceptor — attach JWT ────────────────────────────────────────
client.interceptors.request.use((config) => {
  // Let the browser/XHR adapter generate the multipart boundary. The client
  // instance has a JSON default, so explicitly remove it for real FormData
  // requests instead of allowing a JSON content type to reach the server.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (config.headers && typeof (config.headers as any).delete === 'function') {
      ;(config.headers as any).delete('Content-Type')
    } else if (config.headers) {
      delete (config.headers as any)['Content-Type']
      delete (config.headers as any)['content-type']
    }
  }

  const raw = localStorage.getItem(DEMO_MODE ? DEMO_AUTH_KEY : 'campnect-auth')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      const token = parsed?.state?.token
      if (token) config.headers.Authorization = `Bearer ${token}`
    } catch {
      // ignore
    }
  }
  return config
})

// ─── Response interceptor — 401 refresh retry ────────────────────────────────
let refreshing = false
let refreshQueue: Array<(token: string | null) => void> = []

client.interceptors.response.use(
  (res) => {
    if (res.config.responseType !== 'blob' && res.config.responseType !== 'arraybuffer') {
      res.data = normalizeMediaUrls(res.data)
    }
    return res
  },
  async (err) => {
    if (DEMO_MODE) return Promise.reject(err)
    const original = err.config
    const isMultipartRequest = typeof FormData !== 'undefined'
      && original?.data instanceof FormData

    // Some Android System WebView versions can fail an XHR multipart request
    // before it ever reaches the API. Retry that narrow case through fetch,
    // which has a separate native transport and still generates the FormData
    // boundary itself. Do not retry cancellations, HTTP responses, or a second
    // failed fetch request.
    if (
      isNative &&
      isMultipartRequest &&
      !err.response &&
      !axios.isCancel(err) &&
      !original?._nativeMultipartFetchRetry &&
      typeof fetch === 'function'
    ) {
      original._nativeMultipartFetchRetry = true
      original.adapter = 'fetch'
      return client(original)
    }

    // Never let infrastructure details (database errors, stack traces,
    // gateway messages, or raw network errors) reach a regular user-facing
    // screen. Client validation and expected auth errors below 500 remain
    // available to the relevant form.
    if (!err.response) {
      err.message = 'The service is temporarily unavailable. Please try again.'
    } else if (err.response.status >= 500) {
      err.response.data = {
        ...(typeof err.response.data === 'object' ? err.response.data : {}),
        error: 'The service is temporarily unavailable. Please try again.',
      }
    }
    // Skip retry for auth endpoints (login, refresh, logout) and already-retried requests
    const isAuthRoute = original.url?.includes('/auth/')
    if (err.response?.status !== 401 || original._retry || isAuthRoute) {
      return Promise.reject(err)
    }
    original._retry = true

    if (refreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push((token) => {
          if (token) {
            original.headers.Authorization = `Bearer ${token}`
            resolve(client(original))
          } else {
            reject(err)
          }
        })
      })
    }

    refreshing = true
    try {
      const raw = localStorage.getItem(DEMO_MODE ? DEMO_AUTH_KEY : 'campnect-auth')
      const parsed = raw ? JSON.parse(raw) : null
      const refreshToken = parsed?.state?.refreshToken
      if (!refreshToken) throw new Error('No refresh token')

      const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken })
      const newToken: string = res.data.data.token
      const newRefreshToken: string = res.data.data.refreshToken
      if (!newToken || !newRefreshToken) throw new Error('Invalid refresh response')

      // Update store token without triggering re-render storms
      if (parsed?.state) {
        parsed.state.token = newToken
        parsed.state.refreshToken = newRefreshToken
        localStorage.setItem('campnect-auth', JSON.stringify(parsed))
        // Keep Zustand's in-memory state in sync too. Requests queued behind
        // this rotation read the new persisted value, while components and a
        // later logout use the same new token.
        const { useAuthStore } = await import('../stores/authStore')
        useAuthStore.getState().setTokens(newToken, newRefreshToken)
      }

      refreshQueue.forEach((cb) => cb(newToken))
      refreshQueue = []
      original.headers.Authorization = `Bearer ${newToken}`
      return client(original)
    } catch {
      refreshQueue.forEach((cb) => cb(null))
      refreshQueue = []
      // Clear persisted auth state and let React Router redirect via ProtectedRoute.
      // Never use window.location.href here — it hard-reloads the page and can wipe
      // a freshly established session if any in-flight old request races the new login.
      try {
        localStorage.removeItem('campnect-auth')
        // Dynamically import the store to avoid circular deps and call logout
        const { useAuthStore } = await import('../stores/authStore')
        useAuthStore.getState().logout()
      } catch {
        // Absolute last resort — only if the dynamic import fails
        localStorage.removeItem('campnect-auth')
      }
      return Promise.reject(err)
    } finally {
      refreshing = false
    }
  }
)

export default client
