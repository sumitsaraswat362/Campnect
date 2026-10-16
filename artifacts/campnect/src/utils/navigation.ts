/** Root destinations whose Back behavior may exit the native app. */

export const ROOT_TAB_PATHS = [
  '/app/feed',
  '/app/search',
  '/app/events',
  '/app/glimpse',
  '/app/clips',
  '/app/profile',
] as const

export function isRootTabPath(pathname: string) {
  // Root switches are intentionally strict. In particular, parameterized
  // profile/detail paths and slash-normalized aliases must remain nested.
  return ROOT_TAB_PATHS.some((root) => pathname === root)
}

export type AppRouteClassification =
  | { kind: 'root'; root: typeof ROOT_TAB_PATHS[number] }
  | { kind: 'child'; fallback: string }
  | { kind: 'outside-app'; fallback: '/' }

export function classifyAppRoute(pathname: string, search = ''): AppRouteClassification {
  if (isRootTabPath(pathname) && search === '') {
    return { kind: 'root', root: pathname as typeof ROOT_TAB_PATHS[number] }
  }

  if (!pathname.startsWith('/app/')) {
    return { kind: 'outside-app', fallback: '/' }
  }

  if (isRootTabPath(pathname)) return { kind: 'child', fallback: pathname }

  if (pathname.startsWith('/app/search/')) {
    return { kind: 'child', fallback: '/app/search' }
  }

  if (pathname.startsWith('/app/settings/help/article/')) {
    return { kind: 'child', fallback: '/app/settings/help' }
  }

  if (pathname === '/app/settings' || pathname.startsWith('/app/settings/') || pathname === '/app/edit-profile') {
    return { kind: 'child', fallback: '/app/profile' }
  }

  if (pathname.startsWith('/app/profile/')) {
    return { kind: 'child', fallback: '/app/search' }
  }

  if (pathname.startsWith('/app/events/')) {
    return { kind: 'child', fallback: '/app/events' }
  }

  if (pathname === '/app/chat' || pathname.startsWith('/app/chat/')) {
    return { kind: 'child', fallback: '/app/feed' }
  }

  if (pathname === '/app/create' || pathname.startsWith('/app/create/')) {
    return { kind: 'child', fallback: '/app/feed' }
  }
  if (pathname === '/app/glimpse/create' || /^\/app\/glimpse\/[^/]+$/.test(pathname)) {
    return { kind: 'child', fallback: '/app/glimpse' }
  }
  if (pathname === '/app/clips/create' || /^\/app\/clips\/[^/]+$/.test(pathname)) {
    return { kind: 'child', fallback: '/app/clips' }
  }

  if (
    pathname === '/app/communities' ||
    pathname === '/app/communities/create' ||
    pathname.startsWith('/app/community/') ||
    pathname.startsWith('/app/college/')
  ) {
    return { kind: 'child', fallback: '/app/search' }
  }

  if (pathname.startsWith('/app/post/')) return { kind: 'child', fallback: '/app/feed' }
  if (pathname === '/app/notifications') return { kind: 'child', fallback: '/app/feed' }

  return { kind: 'child', fallback: '/app/feed' }
}

export function normalizeAppDestination(value: unknown): string | null {
  let candidate: string | null = null
  if (typeof value === 'string') {
    candidate = value
  } else if (value && typeof value === 'object') {
    const location = value as { pathname?: unknown; search?: unknown; hash?: unknown }
    if (typeof location.pathname === 'string') {
      candidate = `${location.pathname}${typeof location.search === 'string' ? location.search : ''}${typeof location.hash === 'string' ? location.hash : ''}`
    }
  }
  if (!candidate?.startsWith('/') || candidate.startsWith('//')) return null

  try {
    const url = new URL(candidate, 'https://campnect.local')
    if (
      url.origin !== 'https://campnect.local' ||
      (url.pathname !== '/app' && !url.pathname.startsWith('/app/')) ||
      /[\\\u0000-\u001f]/.test(candidate)
    ) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function destinationFromNavigationState(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null
  return normalizeAppDestination((state as { from?: unknown }).from)
}
