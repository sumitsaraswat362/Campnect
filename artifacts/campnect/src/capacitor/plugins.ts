/**
 * Capacitor native-plugin bootstrap.
 * Called once before the React tree mounts (see main.tsx).
 * All calls are guarded by Capacitor.isNativePlatform() so this file is
 * safe to import on web — it becomes a no-op in a normal browser.
 *
 * OneSignal is initialized here for native push delivery. The app still
 * provides persisted and realtime in-app notifications as its primary UI.
 */
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core'
import { initializeOneSignal, requestOneSignalPermission, setOneSignalStartupPermissionGate } from './oneSignal'

export const CallAudio = registerPlugin<{ setSpeaker(options: { enabled: boolean }): Promise<void>; reset(): Promise<void> }>('CallAudio')
export type RuntimePermissionAlias = 'camera' | 'microphone' | 'notifications'
export type RuntimePermissionState = 'granted' | 'prompt' | 'denied' | 'unavailable'

interface RuntimePermissionsPlugin {
  check(): Promise<Record<RuntimePermissionAlias, RuntimePermissionState>>
  request(options: { permission: RuntimePermissionAlias }): Promise<Record<RuntimePermissionAlias, RuntimePermissionState>>
  startupStatus(): Promise<{ complete: boolean }>
  openSettings(): Promise<void>
}

export const RuntimePermissions = registerPlugin<RuntimePermissionsPlugin>('RuntimePermissions')

export type NativeGlimpseCapture = {
  uri: string
  mimeType: string
  name: string
  size: number
}

interface GlimpseCameraPlugin {
  capture(options: { maxVideoSeconds: number }): Promise<NativeGlimpseCapture>
}

// Android's CameraX capture activity returns an app-private file URI. The
// caller converts that URI through Capacitor's local-file bridge and uploads
// those original bytes through the normal authenticated multipart endpoint.
export const GlimpseCamera = registerPlugin<GlimpseCameraPlugin>('GlimpseCamera')

export async function openNativeAppSettings(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    await RuntimePermissions.openSettings()
    return true
  } catch (error) {
    console.warn('Campnect could not open Android app settings.', error)
    return false
  }
}

interface SystemInsets {
  top: number
  right: number
  bottom: number
  left: number
}

interface SystemInsetsPlugin {
  get(): Promise<SystemInsets>
}

export const NativeSystemInsets = registerPlugin<SystemInsetsPlugin>('SystemInsets')

interface AppVersionPlugin {
  get(): Promise<{ versionCode: number; versionName: string }>
}

// Unlike a JavaScript build flag, this comes from Android's installed package
// and therefore cannot be spoofed by a web view or stale bundled asset.
export const AppVersion = registerPlugin<AppVersionPlugin>('AppVersion')

interface AppUpdatePlugin {
  openStore(options: { url: string }): Promise<void>
}

export const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate')

interface NativeNavigationPlugin {
  armExit(options: {
    eventId: number
    committedAtMs: number
    lifecycleGeneration: number
    exitResetGeneration: number
  }): Promise<void>
  clearExitArm(): Promise<void>
  exitApp(options: {
    eventId: number
    committedAtMs: number
    lifecycleGeneration: number
    exitResetGeneration: number
  }): Promise<void>
  setBackHandlerReady(options: { ready: boolean }): Promise<void>
}

export const NativeNavigation = registerPlugin<NativeNavigationPlugin>('NativeNavigation')

export type RuntimePermissionSnapshot = Record<RuntimePermissionAlias, RuntimePermissionState>

let permissionLifecycleInstalled = false
let permissionSyncInFlight: Promise<RuntimePermissionSnapshot | null> | null = null
let insetLifecycleInstalled = false
let insetRefreshTimer: number | null = null

async function syncNativeSystemInsets() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const nativeInsets = await NativeSystemInsets.get()
    const root = document.documentElement
    root.classList.add('native-safe-frame')
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      root.style.setProperty(`--native-safe-${side}`, `${Math.max(0, nativeInsets[side])}px`)
    }
  } catch (error) {
    console.warn('Campnect could not measure Android system bars.', error)
  }
}

function scheduleInsetRefresh() {
  if (!Capacitor.isNativePlatform()) return
  if (insetRefreshTimer !== null) window.clearTimeout(insetRefreshTimer)
  let attempts = 0
  const refresh = async () => {
    attempts += 1
    await syncNativeSystemInsets()
    if (attempts < 4) insetRefreshTimer = window.setTimeout(refresh, attempts * 120)
    else insetRefreshTimer = null
  }
  void refresh()
}

function installInsetLifecycleSync() {
  if (insetLifecycleInstalled || !Capacitor.isNativePlatform()) return
  insetLifecycleInstalled = true
  const refresh = scheduleInsetRefresh
  window.addEventListener('resize', refresh)
  window.addEventListener('orientationchange', refresh)
  window.addEventListener('pageshow', refresh)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh()
  })
}

function normalizePermissionState(state?: string): RuntimePermissionState {
  if (state === 'granted' || state === 'denied' || state === 'prompt') return state
  // Keep compatibility with native builds made before the Android bridge
  // normalized Capacitor's PROMPT_WITH_RATIONALE state.
  if (state === 'prompt-with-rationale') return 'prompt'
  return 'unavailable'
}

export async function syncRuntimePermissions(): Promise<RuntimePermissionSnapshot | null> {
  if (!Capacitor.isNativePlatform()) return null
  if (permissionSyncInFlight) return permissionSyncInFlight

  permissionSyncInFlight = RuntimePermissions.check()
    .then((permissions) => {
      const snapshot: RuntimePermissionSnapshot = {
        camera: normalizePermissionState(permissions.camera),
        microphone: normalizePermissionState(permissions.microphone),
        notifications: normalizePermissionState(permissions.notifications),
      }
      window.dispatchEvent(new CustomEvent<RuntimePermissionSnapshot>('campnect:permissions-changed', {
        detail: snapshot,
      }))
      return snapshot
    })
    .catch((error) => {
      console.warn('Campnect could not refresh runtime permissions.', error)
      return null
    })
    .finally(() => {
      permissionSyncInFlight = null
    })

  return permissionSyncInFlight
}

function installPermissionLifecycleSync() {
  if (permissionLifecycleInstalled || !Capacitor.isNativePlatform()) return
  permissionLifecycleInstalled = true

  const refreshWhenActive = () => {
    if (document.visibilityState === 'visible') void syncRuntimePermissions()
  }
  document.addEventListener('visibilitychange', refreshWhenActive)
  window.addEventListener('focus', refreshWhenActive)
  window.addEventListener('pageshow', refreshWhenActive)
}

export async function requestStartupPermissions(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  installPermissionLifecycleSync()

  // The Android Activity owns the first-install prompt sequence. Wait for its
  // completion so notification state is not checked while the native dialogs
  // are still open, which would cause OneSignal setup to miss the grant.
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      await syncRuntimePermissions()
      const status = await RuntimePermissions.startupStatus()
      if (status.complete) return
      await new Promise<void>((resolve) => window.setTimeout(resolve, 150))
    }
    console.warn('Campnect native permission startup sequence did not finish in time.')
  } catch (error) {
    // Older installed native shells may not expose startupStatus. Their
    // feature-level permission requests and settings recovery remain usable.
    console.warn('Campnect could not observe native permission startup.', error)
  }
}

export async function initCapacitorPlugins(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const startupPermissionGate = requestStartupPermissions()
  setOneSignalStartupPermissionGate(startupPermissionGate)

  // The measured safe frame keeps content clear of system bars even on
  // WebViews with missing CSS insets. Install it independently of icon styling.
  installInsetLifecycleSync()
  scheduleInsetRefresh()

  // ── System Bars ─────────────────────────────────────────────────────────────
  try {
    // SystemBars uses DARK for a dark background with light icons (the old
    // StatusBar plugin used the opposite naming). The app paints the backdrop;
    // no deprecated Window color or overlay APIs are needed.
    await SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.StatusBar })
  } catch (error) {
    console.warn('Campnect system bar styling was unavailable.', error)
  }

  // ── Splash Screen ───────────────────────────────────────────────────────────
  // Keep splash cleanup independent from status bar setup so a plugin failure
  // cannot leave the app showing a permanent blank launch screen.
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide({ fadeOutDuration: 400 })
  } catch (error) {
    console.warn('Campnect splash screen cleanup was unavailable.', error)
  }

  await startupPermissionGate

  // Initialize only after Android has completed its first-launch dialogs.
  // This lets OneSignal observe the final notification state and obtain its
  // FCM subscription without racing the Activity lifecycle.
  try {
    await initializeOneSignal()
  } catch {}

  // A user may have granted POST_NOTIFICATIONS through the existing native
  // permission bridge. Ask OneSignal to finish its subscription handshake
  // without forcing a second prompt when Android has already decided.
  try {
    if ((await RuntimePermissions.check()).notifications === 'granted') {
      await requestOneSignalPermission()
    }
  } catch {}
}
