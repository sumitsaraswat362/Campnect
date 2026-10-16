import type { NativeBackEvent } from './nativeBackEvent'

export type CoordinatorRouteAction =
  | { type: 'history' }
  | { type: 'fallback'; path: string }
  | { type: 'exit' }

export interface BackCoordinatorDependencies {
  isExitPending: () => boolean
  dismissTopOverlay: () => boolean
  resolveRouteAction: () => CoordinatorRouteAction
  clearExitConfirmation: () => void
  navigate: (target: number | string, options?: { replace?: boolean }) => void
  requestRootExit: (now: number) => 'arm' | 'exit'
  armNativeExit: (event: NativeBackEvent) => void
  showRootExitHint: () => void
  claimExit: () => boolean
  releaseExit: () => void
  exitNativeApp: (event: NativeBackEvent) => void
  now: () => number
}

/**
 * Performs exactly one logical Back action. Platform listener registration is
 * deliberately kept outside this function; both native and visual Back routes
 * call this same coordinator.
 */
export function executeAppBack(
  dependencies: BackCoordinatorDependencies,
  nativeEvent?: NativeBackEvent,
) {
  if (dependencies.isExitPending()) return 'ignored'

  if (dependencies.dismissTopOverlay()) {
    dependencies.clearExitConfirmation()
    return 'overlay'
  }

  const routeAction = dependencies.resolveRouteAction()
  if (routeAction.type === 'fallback') {
    dependencies.clearExitConfirmation()
    dependencies.navigate(routeAction.path, { replace: true })
    return 'fallback'
  }
  if (routeAction.type === 'history') {
    dependencies.clearExitConfirmation()
    dependencies.navigate(-1)
    return 'history'
  }

  const confirmationTime = nativeEvent?.committedAtMs ?? dependencies.now()
  if (dependencies.requestRootExit(confirmationTime) === 'arm') {
    if (nativeEvent) dependencies.armNativeExit(nativeEvent)
    dependencies.showRootExitHint()
    return 'arm'
  }

  if (!dependencies.claimExit()) return 'ignored'
  if (!nativeEvent) {
    dependencies.releaseExit()
    return 'ignored'
  }
  dependencies.exitNativeApp(nativeEvent)
  return 'exit'
}