import { DEMO_MODE } from '../demo/config'
import { Capacitor } from '@capacitor/core'

const ONESIGNAL_APP_ID = '2b238093-c625-4a5b-9825-364c8001de61'

type OneSignalClient = typeof import('@onesignal/capacitor-plugin').default

let client: OneSignalClient | null = null
let initialization: Promise<void> | null = null
let clickListenerInstalled = false
let subscriptionListenerInstalled = false
let activeExternalId: string | null = null
let startupPermissionGate: Promise<void> | null = null
const PENDING_NOTIFICATION_PATH_KEY = 'campnect-pending-notification-path'

function logOneSignalDiagnostics(event: string, details: Record<string, unknown> = {}) {
  if (!import.meta.env.DEV) return
  console.debug(`[Campnect OneSignal] ${event}`, details)
}

export function setOneSignalStartupPermissionGate(gate: Promise<void>) {
  startupPermissionGate = gate.catch((error) => {
    console.warn('Campnect native permission startup did not finish cleanly.', error)
  })
}

async function logSubscriptionDiagnostics() {
  if (!client || !import.meta.env.DEV) return
  try {
    const [subscriptionId, optedIn, token] = await Promise.all([
      client.User.pushSubscription.getIdAsync(),
      client.User.pushSubscription.getOptedInAsync(),
      client.User.pushSubscription.getTokenAsync(),
    ])
    logOneSignalDiagnostics('subscription state', {
      subscriptionId: subscriptionId || null,
      optedIn,
      hasToken: Boolean(token),
    })
  } catch (error) {
    console.debug('[Campnect OneSignal] subscription diagnostics unavailable', error)
  }
}

function notificationPath(notification: any): string | null {
  const path = notification?.additionalData?.path
  if (
    typeof path !== 'string' ||
    !path.startsWith('/app') ||
    path.startsWith('//') ||
    /[\\\u0000-\u001f]/.test(path)
  ) return null

  try {
    const url = new URL(path, window.location.origin)
    if (url.origin !== window.location.origin || (url.pathname !== '/app' && !url.pathname.startsWith('/app/'))) {
      return null
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

function queueNotificationPath(path: string) {
  try { sessionStorage.setItem(PENDING_NOTIFICATION_PATH_KEY, path) } catch {}
  window.dispatchEvent(new CustomEvent('campnect:notification-open', { detail: { path } }))
}

function showForegroundMessagePreview(notification: any) {
  const data = notification?.additionalData
  if (data?.notificationType !== 'message' || !data.actorName) return
  window.dispatchEvent(new CustomEvent('campnect:message-preview', {
    detail: {
      id: data.notificationId || `push-message-${Date.now()}`,
      conversationId: data.conversationId || null,
      actorName: data.actorName,
      actorAvatar: data.actorAvatar || null,
      preview: data.preview || 'sent you a message',
    },
  }))
}

async function linkActiveUserToSubscription(): Promise<void> {
  if (!client || !activeExternalId) return
  const token = await client.User.pushSubscription.getTokenAsync()
  if (!token) return
  await client.login(activeExternalId)
  logOneSignalDiagnostics('external user linked to subscription', { externalId: activeExternalId })
}

export function consumePendingNotificationPath(): string | null {
  try {
    const path = sessionStorage.getItem(PENDING_NOTIFICATION_PATH_KEY)
    if (path) sessionStorage.removeItem(PENDING_NOTIFICATION_PATH_KEY)
    return path
  } catch {
    return null
  }
}

export async function initializeOneSignal(): Promise<void> {
  if (DEMO_MODE) return

  if (!Capacitor.isNativePlatform()) return
  if (initialization) return initialization

  initialization = (async () => {
    // The Activity owns the first-launch permission sequence. Initializing the
    // SDK before it settles can leave Android permission state and the FCM
    // subscription out of sync, so every caller shares this native gate.
    await startupPermissionGate
    const module = await import('@onesignal/capacitor-plugin')
    client = module.default
    await client.initialize(ONESIGNAL_APP_ID)
    logOneSignalDiagnostics('initialized', { appId: ONESIGNAL_APP_ID })

    if (!clickListenerInstalled) {
      clickListenerInstalled = true
      client.Notifications.addEventListener('click', (event) => {
        const path = notificationPath(event.notification)
        if (path) {
          queueNotificationPath(path)
        }
      })

      // The app already maintains its own in-app notification surface. Avoid
      // showing a system alert when the user is actively looking at Campnect.
      // A push message also backs up the realtime socket banner on Android.
      client.Notifications.addEventListener('foregroundWillDisplay', (event) => {
        if (document.visibilityState === 'visible') {
          event.preventDefault()
          showForegroundMessagePreview(event.getNotification())
        }
      })
      client.Notifications.addEventListener('permissionChange', (permission) => {
        logOneSignalDiagnostics('permission changed', { granted: Boolean(permission) })
        window.dispatchEvent(new CustomEvent('campnect:push-permission-changed', { detail: { permission } }))
      })
    }

    if (!subscriptionListenerInstalled) {
      subscriptionListenerInstalled = true
      client.User.pushSubscription.addEventListener('change', (event) => {
        logOneSignalDiagnostics('subscription changed', {
          subscriptionId: event.current.id || null,
          optedIn: event.current.optedIn,
          hasToken: Boolean(event.current.token),
        })
        // FCM registration can complete after the user logs in. Re-link at
        // that point so a late-created Android subscription is targeted by
        // the server's external_id notification delivery.
        void linkActiveUserToSubscription().catch((error) => {
          console.warn('Campnect could not link its OneSignal subscription.', error)
        })
        window.dispatchEvent(new CustomEvent('campnect:push-subscription-changed', {
          detail: event.current,
        }))
      })
    }
  })().catch((error) => {
    initialization = null
    client = null
    console.warn('Campnect OneSignal initialization was unavailable.', error)
    throw error
  })

  return initialization
}

export async function syncOneSignalUser(externalId: string | null): Promise<void> {
  if (DEMO_MODE) return

  if (!Capacitor.isNativePlatform()) return
  try {
    await initializeOneSignal()
    if (!client) return
    if (externalId) {
      activeExternalId = externalId
      const hasPermission = await client.Notifications.hasPermission()
      if (hasPermission) await client.User.pushSubscription.optIn()
      await linkActiveUserToSubscription()
      logOneSignalDiagnostics('external user sync requested', { externalId, hasPermission })
    } else {
      activeExternalId = null
      await client.logout()
      logOneSignalDiagnostics('external user cleared')
    }
    await logSubscriptionDiagnostics()
  } catch (error) {
    console.warn('Campnect could not sync its OneSignal user.', error)
  }
}

export async function requestOneSignalPermission(): Promise<boolean | null> {
  if (DEMO_MODE) return null

  if (!Capacitor.isNativePlatform()) return null
  try {
    await initializeOneSignal()
    if (!client) return null
    const alreadyGranted = await client.Notifications.hasPermission()
    const canPrompt = await client.Notifications.canRequestPermission()
    const granted = alreadyGranted || await client.Notifications.requestPermission(!canPrompt)
    logOneSignalDiagnostics('permission checked', { alreadyGranted, canPrompt, granted })
    if (!granted) return false

    await client.User.pushSubscription.optIn()
    await linkActiveUserToSubscription()

    // Android may report POST_NOTIFICATIONS as granted before FCM has
    // completed registration. Do not report push as enabled until OneSignal
    // has a real subscription token that the server can target.
    // A first-time FCM token can take longer than the old five-second window,
    // especially after Android restores the app or resumes networking.
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const optedIn = await client.User.pushSubscription.getOptedInAsync()
      const token = await client.User.pushSubscription.getTokenAsync()
      if (optedIn && token) {
        await linkActiveUserToSubscription()
        await logSubscriptionDiagnostics()
        return true
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500))
    }

    return false
  } catch (error) {
    console.warn('Campnect could not request OneSignal permission.', error)
    return false
  }
}