import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Home, Search, Plus, CalendarDays, Sparkles, Clapperboard } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../shared/Avatar'
import { navigateToAppRoot } from '../../navigation/appSectionNavigation'
import { isRootTabPath } from '../../utils/navigation'

interface NavItem {
  id: string
  icon?: React.ReactNode
  path: string
  isCreate?: boolean
  isProfile?: boolean
}

export function BottomNav() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user }  = useAuthStore()
  const [pressed, setPressed] = useState<string | null>(null)
  const navigateToItem = (path: string) => {
    if (!isRootTabPath(path)) return false
    return navigateToAppRoot(navigate, location.pathname, path)
  }

  const NAV_ITEMS: NavItem[] = [
    { id: 'feed',    icon: <Home size={22} strokeWidth={2} />,   path: '/app/feed' },
    { id: 'search',  icon: <Search size={22} strokeWidth={2} />, path: '/app/search' },
    { id: 'events',  icon: <CalendarDays size={21} strokeWidth={2} />, path: '/app/events' },
    { id: 'glimpse', icon: <Sparkles size={21} strokeWidth={2} />, path: '/app/glimpse' },
    { id: 'clips',   icon: <Clapperboard size={21} strokeWidth={2} />, path: '/app/clips' },
    { id: 'create',  path: '/app/create', isCreate: true },
    { id: 'profile', path: '/app/profile', isProfile: true },
  ]

  const activeId = (() => {
    const p = location.pathname
    if (p.startsWith('/app/profile')) return 'profile'
    if (p.startsWith('/app/search'))  return 'search'
    if (p.startsWith('/app/events'))  return 'events'
    if (p.startsWith('/app/glimpse')) return 'glimpse'
    if (p.startsWith('/app/clips')) return 'clips'
    if (p.startsWith('/app/feed') || p === '/app') return 'feed'
    return ''
  })()

  return (
    <nav
      className="campnect-bottom-nav"
      style={{
        position:    'absolute',
        bottom:      'var(--bottom-nav-offset)',
        left:        'var(--app-gutter)',
        right:       'var(--app-gutter)',
        width:       'auto',
        maxWidth:    'none',
        height:      'var(--nav-height)',
        background:  'var(--color-bottomnav-bg, rgba(255,255,255,0.97))',
        backdropFilter: 'blur(24px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
        border:      '1px solid var(--color-navbar-border, rgba(17,17,20,0.06))',
        borderRadius: '9999px',
        boxShadow:   'var(--shadow-float)',
        display:     'flex',
        alignItems:  'center',
        justifyContent: 'space-between',
        padding:     '0 clamp(4px, 1.5vw, 12px)',
        zIndex:      100,
        animation:   'navRise 260ms cubic-bezier(0.34,1.2,0.64,1)',
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive  = activeId === item.id
        const isPressed = pressed === item.id

        /* ── Create (plus) button — plain icon, matching the other nav items ── */
        if (item.isCreate) {
          return (
            <button
              key={item.id}
              aria-label="Create"
              onClick={() => {
                if (location.pathname !== item.path) navigate(item.path)
              }}
              onPointerDown={() => setPressed(item.id)}
              onPointerUp={() => setPressed(null)}
              onPointerLeave={() => setPressed(null)}
              style={{
                display:       'flex',
                flexDirection: 'column',
                alignItems:    'center',
                gap:           '3px',
                background:    'none',
                border:        'none',
                cursor:        'pointer',
                padding:       '6px 4px',
                transform:     isPressed ? 'scale(0.86)' : 'scale(1)',
                transition:    'transform 180ms cubic-bezier(0.34,1.56,0.64,1)',
                WebkitTapHighlightColor: 'transparent',
                minWidth:      0,
                flex:          1,
                position:      'relative',
              }}
            >
              <span style={{
                color:      'var(--color-icon-inactive, rgba(16,16,20,0.38))',
                display:    'flex',
                transition: 'color 180ms ease',
              }}>
                <Plus size={22} strokeWidth={2} />
              </span>
            </button>
          )
        }

        /* ── Profile (avatar) button ── */
        if (item.isProfile) {
          return (
            <button
              key={item.id}
              aria-label="Profile"
              onClick={() => navigateToItem(item.path)}
              onPointerDown={() => setPressed(item.id)}
              onPointerUp={() => setPressed(null)}
              onPointerLeave={() => setPressed(null)}
              style={{
                background:  'none',
                border:      'none',
                cursor:      'pointer',
                padding:     '6px',
                display:     'flex',
                flexDirection: 'column',
                alignItems:  'center',
                gap:         '3px',
                transform:   isPressed ? 'scale(0.88)' : 'scale(1)',
                transition:  'transform 180ms cubic-bezier(0.34,1.56,0.64,1)',
                WebkitTapHighlightColor: 'transparent',
                minWidth:    0,
                flex:        1,
                position:    'relative',
              }}
            >
              <div style={{
                width:  '32px',
                height: '32px',
                borderRadius: '50%',
                border: isActive
                  ? '2px solid var(--color-purple-core, #18181B)'
                  : '2px solid var(--color-border, rgba(17,17,20,0.08))',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-surface-hover)',
                transition: 'border-color 200ms',
              }}>
                <Avatar
                  src={user?.avatar_url}
                  name={user?.full_name || user?.username}
                  size={28}
                />
              </div>
            </button>
          )
        }

        /* ── Regular icon buttons ── */
        return (
          <button
            key={item.id}
            aria-label={item.id}
            onClick={() => navigateToItem(item.path)}
            onPointerDown={() => setPressed(item.id)}
            onPointerUp={() => setPressed(null)}
            onPointerLeave={() => setPressed(null)}
            style={{
              display:       'flex',
              flexDirection: 'column',
              alignItems:    'center',
              gap:           '3px',
              background:    'none',
              border:        'none',
              cursor:        'pointer',
              padding:       '6px 4px',
              transform:     isPressed ? 'scale(0.86)' : 'scale(1)',
              transition:    'transform 180ms cubic-bezier(0.34,1.56,0.64,1)',
              WebkitTapHighlightColor: 'transparent',
              minWidth:      0,
              flex:          1,
              position:      'relative',
            }}
          >
            <span style={{
              color:      isActive
                ? 'var(--color-text-primary, #101014)'
                : 'var(--color-icon-inactive, rgba(16,16,20,0.38))',
              display:    'flex',
              transition: 'color 180ms ease',
            }}>
              {item.icon}
            </span>
            {isActive && (
              <span style={{
                position:     'absolute',
                bottom:       '2px',
                left:         '50%',
                transform:    'translateX(-50%)',
                width:        '4px',
                height:       '4px',
                borderRadius: '9999px',
                background:   'var(--color-text-primary, #101014)',
                animation:    'navDotPop 300ms cubic-bezier(0.34,1.56,0.64,1)',
              }} />
            )}
          </button>
        )
      })}
    </nav>
  )
}
