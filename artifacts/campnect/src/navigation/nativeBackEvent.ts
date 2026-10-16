export interface NativeBackEvent {
  eventId: number
  committedAtMs: number
  lifecycleGeneration: number
  exitResetGeneration: number
}

interface NativeBackEventDetail {
  id?: unknown
  eventId?: unknown
  committedAtMs?: unknown
  lifecycleGeneration?: unknown
  exitResetGeneration?: unknown
}

export function claimNativeBackEvent(
  handledEventIds: Set<number>,
  detail: NativeBackEventDetail | undefined,
): NativeBackEvent | null {
  const eventId = Number(detail?.eventId ?? detail?.id)
  const committedAtMs = Number(detail?.committedAtMs)
  const lifecycleGeneration = Number(detail?.lifecycleGeneration)
  const exitResetGeneration = Number(detail?.exitResetGeneration)
  if (
    !Number.isFinite(eventId)
    || !Number.isFinite(committedAtMs)
    || !Number.isFinite(lifecycleGeneration)
    || !Number.isFinite(exitResetGeneration)
  ) return null
  if (handledEventIds.has(eventId)) return null

  handledEventIds.add(eventId)
  if (handledEventIds.size > 32) {
    const oldest = handledEventIds.values().next().value
    if (oldest !== undefined) handledEventIds.delete(oldest)
  }
  return { eventId, committedAtMs, lifecycleGeneration, exitResetGeneration }
}

export function claimNativeBackDomEvent(
  handledEventIds: Set<number>,
  detail: NativeBackEventDetail | undefined,
  preventDefault: () => void,
): NativeBackEvent | null {
  const eventId = Number(detail?.eventId ?? detail?.id)
  const committedAtMs = Number(detail?.committedAtMs)
  const lifecycleGeneration = Number(detail?.lifecycleGeneration)
  const exitResetGeneration = Number(detail?.exitResetGeneration)
  if (
    !Number.isFinite(eventId)
    || !Number.isFinite(committedAtMs)
    || !Number.isFinite(lifecycleGeneration)
    || !Number.isFinite(exitResetGeneration)
  ) return null

  // Android may retry the same dispatcher-owned event after a readiness
  // interruption. Acknowledge that valid replay so it cannot block the native
  // queue, but return null so it never causes a second logical Back request.
  if (handledEventIds.has(eventId)) {
    preventDefault()
    return null
  }

  const nativeEvent = claimNativeBackEvent(handledEventIds, detail)
  if (!nativeEvent) return null
  preventDefault()
  return nativeEvent
}