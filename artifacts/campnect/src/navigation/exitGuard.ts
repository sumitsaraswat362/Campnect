export interface ExitGuard {
  pending: boolean
}

export function createExitGuard(): ExitGuard {
  return { pending: false }
}

export function claimExit(guard: ExitGuard) {
  if (guard.pending) return false
  guard.pending = true
  return true
}

export function releaseExit(guard: ExitGuard) {
  guard.pending = false
}