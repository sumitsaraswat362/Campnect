import { Capacitor } from '@capacitor/core'
import {
  openNativeAppSettings,
  RuntimePermissions,
  RuntimePermissionAlias,
  RuntimePermissionState,
} from '../capacitor/plugins'

export interface PermissionResult {
  state: RuntimePermissionState
  granted: boolean
  message?: string
}

export { openNativeAppSettings }

export interface CallMediaResult {
  stream: MediaStream | null
  message?: string
}

const SETTINGS_HINT = 'Enable it in Android Settings → Apps → Campnect → Permissions, then return to Campnect.'

function result(state: RuntimePermissionState, message?: string): PermissionResult {
  return { state, granted: state === 'granted', message }
}

function deniedMessage(label: string) {
  return `${label} access is disabled. ${SETTINGS_HINT}`
}

async function browserPermission(name: 'camera' | 'microphone'): Promise<RuntimePermissionState> {
  if (!navigator.permissions?.query) return 'prompt'
  try {
    const permission = await navigator.permissions.query({ name } as PermissionDescriptor)
    return permission.state === 'granted' || permission.state === 'denied' ? permission.state : 'prompt'
  } catch {
    // Some WebViews expose getUserMedia but not the Permissions API. Let the
    // actual request decide in that case.
    return 'prompt'
  }
}

async function nativePermission(alias: RuntimePermissionAlias): Promise<PermissionResult | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const permissions = await RuntimePermissions.check()
    const state = permissions[alias] || 'unavailable'
    if (state === 'granted') return result('granted')
    if (state === 'denied') return result('denied', deniedMessage(alias === 'notifications' ? 'Notification' : alias === 'microphone' ? 'Microphone' : 'Camera'))
    if (state === 'prompt') return result('prompt')
    return result('unavailable', 'This device could not check the permission state. You can continue without this optional feature.')
  } catch {
    return result('unavailable', 'This device could not check permissions. You can continue without this optional feature.')
  }
}

async function requestRuntimePermission(alias: RuntimePermissionAlias, label: string): Promise<PermissionResult> {
  const current = await nativePermission(alias)
  if (!Capacitor.isNativePlatform()) {
    const state = await browserPermission(alias === 'camera' ? 'camera' : 'microphone')
    return state === 'denied' ? result('denied', `${label} access is blocked. Allow it in your browser or device site settings.`) : result(state)
  }
  if (!current || current.state === 'granted' || current.state === 'denied' || current.state === 'unavailable') return current || result('unavailable')
  try {
    const permissions = await RuntimePermissions.request({ permission: alias })
    const state = permissions[alias] || 'unavailable'
    if (state === 'granted') return result('granted')
    if (state === 'denied') return result('denied', deniedMessage(label))
    return result('unavailable', `Campnect could not obtain ${label.toLowerCase()} access. You can continue without this optional feature.`)
  } catch {
    return result('unavailable', `Campnect could not request ${label.toLowerCase()} access. You can continue without this optional feature.`)
  }
}

export function requestCameraPermission() {
  return requestRuntimePermission('camera', 'Camera')
}

export function requestMicrophonePermission() {
  return requestRuntimePermission('microphone', 'Microphone')
}

export async function requestNotificationPermission(): Promise<PermissionResult> {
  const native = await nativePermission('notifications')
  if (Capacitor.isNativePlatform()) {
    if (!native || native.state !== 'prompt') return native || result('unavailable')
    try {
      const permissions = await RuntimePermissions.request({ permission: 'notifications' })
      const state = permissions.notifications || 'unavailable'
      if (state === 'granted') {
        const { requestOneSignalPermission } = await import('../capacitor/oneSignal')
        const subscribed = await requestOneSignalPermission()
        return subscribed === false
          ? result('unavailable', 'Android allowed notifications, but Campnect could not finish push setup. Please try again.')
          : result('granted')
      }
      return state === 'denied'
        ? result('denied', deniedMessage('Notification'))
        : result('unavailable', 'Campnect could not enable notifications. You can continue without them.')
    } catch {
      return result('unavailable', 'Campnect could not request notifications. You can continue without them.')
    }
  }

  if (!('Notification' in window)) return result('unavailable', 'Notifications are not supported in this browser.')
  if (Notification.permission === 'granted') return result('granted')
  if (Notification.permission === 'denied') return result('denied', 'Notifications are blocked. Allow them in your browser or device site settings.')
  try {
    const state = await Notification.requestPermission()
    return state === 'granted'
      ? result('granted')
      : state === 'denied'
        ? result('denied', 'Notifications are blocked. Allow them in your browser or device site settings.')
        : result('prompt')
  } catch {
    return result('unavailable', 'Notifications are unavailable on this device.')
  }
}

export async function requestCallMedia(callType: 'voice' | 'video'): Promise<CallMediaResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { stream: null, message: 'Calls are not supported on this device or browser.' }
  }

  if (callType === 'video') {
    const camera = await requestCameraPermission()
    if (!camera.granted && camera.state !== 'prompt') return { stream: null, message: camera.message || deniedMessage('Camera') }
  }

  const microphone = await requestMicrophonePermission()
  if (!microphone.granted && microphone.state !== 'prompt') {
    return { stream: null, message: microphone.message || deniedMessage('Microphone') }
  }

  try {
    return {
      stream: await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      }),
    }
  } catch (error: any) {
    const label = callType === 'video' ? 'Camera and microphone' : 'Microphone'
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
      return { stream: null, message: `${label} access was denied. ${SETTINGS_HINT}` }
    }
    if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
      return { stream: null, message: `No ${callType === 'video' ? 'camera or microphone' : 'microphone'} was found on this device.` }
    }
    return { stream: null, message: `${label} access is unavailable on this device.` }
  }
}