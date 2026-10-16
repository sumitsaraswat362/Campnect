import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { NativeNavigation } from '../capacitor/plugins'
import { claimExit, createExitGuard, releaseExit } from './exitGuard'
import {
  clearRootExitConfirmation,
  createRootExitConfirmation,
  requestRootExit,
} from './rootExitConfirmation'
import toast from 'react-hot-toast'
import {
  claimNativeBackDomEvent,
  type NativeBackEvent,
} from './nativeBackEvent'
import { useOverlayDismissRegistry } from './overlayDismissRegistry'
import { classifyAppRoute } from '../utils/navigation'
import {
  dispatchAppBack,
  registerAppBackHandler,
} from './appBackRequest'
import { executeAppBack } from './backCoordinator'

export type AppBackRouteAction =
  | { type: 'history' }
  | { type: 'fallback'; path: string }
  | { type: 'exit' }

export function resolveAppBackRouteAction(
  pathname: string,
  search: string,
  locationKey: string,
  _source: 'ui' | 'native' = 'native',
  navigationType: 'POP' | 'PUSH' | 'REPLACE' = 'POP',
  locationState?: unknown,
): AppBackRouteAction {
  const route = classifyAppRoute(pathname, search)
  if (route.kind === 'root') return { type: 'exit' }
  // Related articles replace the current article, not the Help entry below it.
  // Only a router-marked Help journey may unwind that replaced entry.
  const fromHelp = locationState !== null && typeof locationState === 'object'
    && (locationState as { helpFromHome?: unknown }).helpFromHome === true
  if (pathname.startsWith('/app/settings/help/article/')
    && locationKey !== 'default' && fromHelp) return { type: 'history' }
  if (locationKey !== 'default' && navigationType !== 'REPLACE') return { type: 'history' }
  return { type: 'fallback', path: route.fallback }
}

export function BackNavigationProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const { dismissTopOverlay } = useOverlayDismissRegistry()
  const handledNativeBackIds = useRef(new Set<number>())
  const requestBackRef = useRef<(nativeEvent?: NativeBackEvent) => void>(() => {})
  const exitGuard = useRef(createExitGuard())
  const rootExitConfirmation = useRef(createRootExitConfirmation())
  const nativeExitArmed = useRef(false)

  const clearExitConfirmation = useCallback(() => {
    clearRootExitConfirmation(rootExitConfirmation.current)
    if (nativeExitArmed.current && Capacitor.isNativePlatform()) {
      nativeExitArmed.current = false
      void NativeNavigation.clearExitArm().catch(() => {})
    }
  }, [])

  const requestBack = useCallback((nativeEvent?: NativeBackEvent) => {
    executeAppBack({
      isExitPending: () => exitGuard.current.pending,
      dismissTopOverlay,
      resolveRouteAction: () => resolveAppBackRouteAction(
        location.pathname,
        location.search,
        location.key,
        nativeEvent ? 'native' : 'ui',
        navigationType,
        location.state,
      ),
      clearExitConfirmation,
      navigate,
      requestRootExit: (now) => requestRootExit(rootExitConfirmation.current, now),
      armNativeExit: (event) => {
        nativeExitArmed.current = true
        if (Capacitor.isNativePlatform()) {
          void NativeNavigation.armExit(event).catch(() => {
            nativeExitArmed.current = false
          })
        }
      },
      showRootExitHint: () => {
        toast('Back again to exit Campnect', { id: 'campnect-root-exit', duration: 2200 })
      },
      claimExit: () => claimExit(exitGuard.current),
      releaseExit: () => releaseExit(exitGuard.current),
      exitNativeApp: (event) => {
        nativeExitArmed.current = false
        void NativeNavigation.exitApp(event).catch(() => releaseExit(exitGuard.current))
      },
      now: () => Date.now(),
    }, nativeEvent)
  }, [clearExitConfirmation, dismissTopOverlay, location.key, location.pathname, location.search, location.state, navigate, navigationType])

  requestBackRef.current = requestBack

  useLayoutEffect(
    () => registerAppBackHandler((nativeEvent) => requestBackRef.current(nativeEvent)),
    [],
  )

  useEffect(() => {
    clearExitConfirmation()
    toast.dismiss('campnect-root-exit')
  }, [clearExitConfirmation, location.key])

  useEffect(() => {
    const native = Capacitor.isNativePlatform()

    const onNativeBack = (event: Event) => {
      const detail = event instanceof CustomEvent
        ? event.detail as {
            id?: unknown
            eventId?: unknown
            committedAtMs?: unknown
            lifecycleGeneration?: unknown
            exitResetGeneration?: unknown
          } | undefined
        : undefined
      if (native) {
        const nativeEvent = claimNativeBackDomEvent(
          handledNativeBackIds.current,
          detail,
          () => event.preventDefault(),
        )
        if (!nativeEvent) return
        // dispatchEvent is synchronous. Only a successfully validated claim
        // tells Android that JavaScript owns this exact Back action.
      dispatchAppBack(nativeEvent)
        return
      }
      dispatchAppBack()
    }
    const onLifecycleReset = () => clearExitConfirmation()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearExitConfirmation()
    }
    window.addEventListener('campnect:native-back', onNativeBack)
    window.addEventListener('campnect:lifecycle-reset', onLifecycleReset)
    window.addEventListener('pagehide', onLifecycleReset)
    document.addEventListener('visibilitychange', onVisibilityChange)
    // Register both synchronous listeners before telling Android that the web
    // layer can consume Back. This effect is intentionally route-independent.
    if (native) void NativeNavigation.setBackHandlerReady({ ready: true })
    return () => {
      window.removeEventListener('campnect:native-back', onNativeBack)
      window.removeEventListener('campnect:lifecycle-reset', onLifecycleReset)
      window.removeEventListener('pagehide', onLifecycleReset)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (native) void NativeNavigation.setBackHandlerReady({ ready: false })
    }
  }, [clearExitConfirmation])

  return <>{children}</>
}
