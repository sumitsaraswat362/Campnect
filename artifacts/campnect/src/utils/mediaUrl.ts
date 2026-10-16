import { Capacitor } from '@capacitor/core'
import { API_ORIGIN } from '../api/client'

/**
 * Resolve media paths returned by the API for both browser and Capacitor builds.
 * The web app can use relative paths through Vite; native WebViews need the
 * published API origin because `capacitor://localhost/uploads/...` is invalid.
 */
export function mediaUrl(value?: string | null): string | undefined {
  if (!value) return undefined
  if (/^(file|content):/i.test(value)) {
    return Capacitor.isNativePlatform() ? Capacitor.convertFileSrc(value) : value
  }
  if (/^(https?:|data:|blob:)/i.test(value)) return value
  return API_ORIGIN ? `${API_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}` : value
}