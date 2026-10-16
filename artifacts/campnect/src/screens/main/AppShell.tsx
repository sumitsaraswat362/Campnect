import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { TopBar } from '../../components/navigation/TopBar'
import { BottomNav } from '../../components/navigation/BottomNav'
import { useOverlayDismissRegistry } from '../../navigation/overlayDismissRegistry'
import { useRootSwipeNavigation } from '../../navigation/useRootSwipeNavigation'

/**
 * Routes that render their own full-screen overlay with their own header.
 * On these routes, AppShell hides the shared TopBar and BottomNav. The Clips
 * root remains in the normal shell so it is always reachable from BottomNav.
 */
const FULLSCREEN_PREFIXES = [
  '/app/create/',
  '/app/chat/new-group',
  '/app/communities/create',
  '/app/events/create',
  '/app/events/',
  '/app/glimpse/create',
  '/app/glimpse/',
  '/app/clips/',
]

/** Matches /app/chat/<id> and /app/chat/<id>/info */
const CHAT_ROOM_RE = /^\/app\/chat\/(?!requests(?:\/|$))[^/]+/

function isFullScreenRoute(pathname: string, search = '') {
  return (
    FULLSCREEN_PREFIXES.some((p) => pathname.startsWith(p)) ||
    CHAT_ROOM_RE.test(pathname) ||
    (pathname === '/app/glimpse' && new URLSearchParams(search).has('open'))
  )
}

export function AppShell() {
  const location    = useLocation()
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const { hasActiveOverlay } = useOverlayDismissRegistry()

  useEffect(() => {
    const markOnline = () => setOnline(true)
    const markOffline = () => setOnline(false)
    window.addEventListener('online', markOnline)
    window.addEventListener('offline', markOffline)
    return () => {
      window.removeEventListener('online', markOnline)
      window.removeEventListener('offline', markOffline)
    }
  }, [])

  const fullscreen = isFullScreenRoute(location.pathname, location.search)
  const rootSwipe = useRootSwipeNavigation({ hasActiveOverlay })
  const clipRoute = location.pathname === '/app/clips' || location.pathname.startsWith('/app/clips/')
  // Feed-style screens keep the shared chrome. Messages and Glimpses own
  // their inner headers so they can match their distinct reference layouts,
  // but still retain the floating bottom navigation.
  const routeOwnsHeader =
    location.pathname === '/app/chat' ||
    location.pathname === '/app/chat/requests' ||
    location.pathname === '/app/glimpse' ||
    location.pathname === '/app/clips' ||
    location.pathname === '/app/create' ||
    location.pathname === '/app/profile' ||
    location.pathname.startsWith('/app/profile/') ||
    location.pathname.startsWith('/app/community/')

  return (
    <div className="app-viewport" style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      width:         '100%',
      maxWidth:      'none',
      background:    'var(--color-bg)',
      backgroundImage: [
        'var(--gradient-radial-bg)',
        'var(--gradient-radial-side)',
      ].filter(Boolean).join(', '),
      position:      'relative',
      overflow:      'hidden',
      touchAction:   'pan-y',
    }}>
      {/* Subtle bottom ambient glow */}
      {!fullscreen && (
        <div aria-hidden style={{
          position:   'absolute',
          bottom:     0,
          left:       '50%',
          transform:  'translateX(-50%)',
          width:      '70%',
          height:     '200px',
          background: 'radial-gradient(ellipse 80% 80% at 50% 100%, rgba(90,20,140,0.38) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex:     0,
        }} />
      )}

      {!fullscreen && !routeOwnsHeader && <TopBar />}
      {!online && (
        <div className="app-offline-banner" role="status">
          <WifiOff size={14} aria-hidden="true" />
          <span>No connection. Some content may be unavailable.</span>
        </div>
      )}
      <main
        key={location.pathname}
        className="app-scroll-region"
        onPointerDown={rootSwipe.onPointerDown}
        onPointerMove={rootSwipe.onPointerMove}
        onPointerUp={rootSwipe.onPointerUp}
        onPointerCancel={rootSwipe.onPointerCancel}
        style={{
          flex:      1,
          minHeight: 0,
          overflowY: clipRoute ? 'hidden' : 'auto',
          overflowX: 'hidden',
          // The Clips media canvas extends behind the floating navigation;
          // otherwise the shell's light background becomes a visible strip.
          background: clipRoute ? '#000' : undefined,
          paddingBottom: fullscreen
            ? 0
            : 'var(--bottom-nav-clearance)',
          WebkitOverflowScrolling: 'touch' as any,
          overscrollBehaviorY: 'contain' as any,
          position:  'relative',
          zIndex:    1,
          animation: rootSwipe.transitionDirection === 'right'
            ? 'rootSwipeFromRight 220ms var(--ease-out)'
            : rootSwipe.transitionDirection === 'left'
              ? 'rootSwipeFromLeft 220ms var(--ease-out)'
              : fullscreen ? 'none' : 'fadeSlideIn 200ms var(--ease-out)',
        }}
      >
        <Outlet />
      </main>
      {!fullscreen && <BottomNav />}
    </div>
  )
}
