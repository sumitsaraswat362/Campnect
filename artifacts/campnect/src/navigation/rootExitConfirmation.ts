export interface RootExitConfirmation {
  armedAt: number | null
}

export type RootExitDecision = 'arm' | 'exit'

// Gesture navigation commits much faster than physical Back buttons on some
// Android devices. Keep a small debounce for duplicated dispatcher events,
// without rejecting a user's deliberate second gesture.
export const ROOT_EXIT_MIN_CONFIRM_DELAY_MS = 150
export const ROOT_EXIT_CONFIRM_WINDOW_MS = 2500

export function createRootExitConfirmation(): RootExitConfirmation {
  return { armedAt: null }
}

export function clearRootExitConfirmation(state: RootExitConfirmation) {
  state.armedAt = null
}

export function requestRootExit(
  state: RootExitConfirmation,
  now: number,
): RootExitDecision {
  const elapsed = state.armedAt === null ? null : now - state.armedAt
  if (
    elapsed !== null
    && elapsed >= ROOT_EXIT_MIN_CONFIRM_DELAY_MS
    && elapsed <= ROOT_EXIT_CONFIRM_WINDOW_MS
  ) {
    state.armedAt = null
    return 'exit'
  }

  state.armedAt = now
  return 'arm'
}