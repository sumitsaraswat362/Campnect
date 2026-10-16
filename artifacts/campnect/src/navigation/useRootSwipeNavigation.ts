import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { navigateToAppRoot } from './appSectionNavigation.ts'
import { classifyAppRoute } from '../utils/navigation.ts'

/** The horizontal pager intentionally excludes Events and the Create action. */
export const ROOT_SWIPE_PATHS = [
  '/app/feed',
  '/app/search',
  '/app/glimpse',
  '/app/clips',
  '/app/profile',
] as const

export type RootSwipeDirection = 'left' | 'right'

export const ROOT_SWIPE_CHILD_SELECTOR = [
  '[data-swipe-ignore]',
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'summary',
  '[contenteditable]',
  '[draggable="true"]',
].join(',')

export function getAdjacentRoot(pathname: string, direction: RootSwipeDirection) {
  const index = ROOT_SWIPE_PATHS.indexOf(pathname as typeof ROOT_SWIPE_PATHS[number])
  if (index < 0) return null
  // This product defines a rightward finger swipe as advancing to the next root.
  const destinationIndex = direction === 'right' ? index + 1 : index - 1
  return ROOT_SWIPE_PATHS[destinationIndex] ?? null
}

export function resolveRootSwipeDestination(
  pathname: string,
  search: string,
  direction: RootSwipeDirection,
  hasActiveOverlay: boolean,
) {
  if (hasActiveOverlay) return null
  const route = classifyAppRoute(pathname, search)
  if (route.kind !== 'root') return null
  return getAdjacentRoot(route.root, direction)
}

export function isDeliberateRootSwipe(deltaX: number, deltaY: number, viewportWidth: number) {
  const horizontalDistance = Math.abs(deltaX)
  const verticalDistance = Math.abs(deltaY)
  const threshold = Math.max(56, Math.min(120, viewportWidth * 0.16))
  return horizontalDistance >= threshold && horizontalDistance > verticalDistance * 1.5
}

function isGestureOwnedByChild(target: EventTarget | null, boundary: HTMLElement) {
  if (!(target instanceof Element)) return true
  if (target.closest(ROOT_SWIPE_CHILD_SELECTOR)) {
    return true
  }

  for (let element: Element | null = target; element && element !== boundary; element = element.parentElement) {
    const style = window.getComputedStyle(element)
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      element.scrollWidth > element.clientWidth + 1
    ) {
      return true
    }
  }
  return false
}

type ActivePointer = {
  id: number
  startX: number
  startY: number
  horizontalIntent: boolean
  ignored: boolean
}

const SYSTEM_EDGE_GUARD_PX = 24
const INTENT_DISTANCE_PX = 20

/**
 * Touch-only enhancement for switching canonical roots. It deliberately has no
 * relationship to browser/native Back or the overlay dismissal coordinator.
 */
export function useRootSwipeNavigation({
  hasActiveOverlay,
}: {
  hasActiveOverlay: boolean
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const pointer = useRef<ActivePointer | null>(null)
  const clearTransitionTimer = useRef<number | null>(null)
  const [transitionDirection, setTransitionDirection] = useState<RootSwipeDirection | null>(null)

  useEffect(() => () => {
    if (clearTransitionTimer.current !== null) window.clearTimeout(clearTransitionTimer.current)
  }, [])

  const clearPointer = () => {
    pointer.current = null
  }

  return {
    transitionDirection,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return
      const width = window.innerWidth
      if (event.clientX <= SYSTEM_EDGE_GUARD_PX || event.clientX >= width - SYSTEM_EDGE_GUARD_PX) return
      if (!resolveRootSwipeDestination(location.pathname, location.search, 'right', hasActiveOverlay)
        && !resolveRootSwipeDestination(location.pathname, location.search, 'left', hasActiveOverlay)) {
        return
      }

      const boundary = event.currentTarget
      pointer.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        horizontalIntent: false,
        ignored: isGestureOwnedByChild(event.target, boundary),
      }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const active = pointer.current
      if (!active || active.id !== event.pointerId || active.ignored || active.horizontalIntent) return
      const deltaX = event.clientX - active.startX
      const deltaY = event.clientY - active.startY
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < INTENT_DISTANCE_PX) return
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        active.ignored = true
        return
      }
      active.horizontalIntent = true
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const active = pointer.current
      clearPointer()
      if (!active || active.id !== event.pointerId || active.ignored || !active.horizontalIntent) return

      const deltaX = event.clientX - active.startX
      const deltaY = event.clientY - active.startY
      if (!isDeliberateRootSwipe(deltaX, deltaY, window.innerWidth)) return

      const direction: RootSwipeDirection = deltaX > 0 ? 'right' : 'left'
      const destination = resolveRootSwipeDestination(
        location.pathname,
        location.search,
        direction,
        hasActiveOverlay,
      )
      if (!destination) return

      if (clearTransitionTimer.current !== null) window.clearTimeout(clearTransitionTimer.current)
      setTransitionDirection(direction)
      clearTransitionTimer.current = window.setTimeout(() => setTransitionDirection(null), 260)
      navigateToAppRoot(navigate, location.pathname, destination)
    },
    onPointerCancel: clearPointer,
  }
}