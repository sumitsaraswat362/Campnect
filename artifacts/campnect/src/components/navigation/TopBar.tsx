import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Bell, MessageCircle } from 'lucide-react'
import { useNotificationStore } from '../../stores/notificationStore'
import { useChatStore } from '../../stores/chatStore'
import { requestAppBack } from '../../navigation/appBackRequest'

const EXACT_TITLES: Record<string, string> = {
  '/app/search':        'Discover',
  '/app/search/id-suggestions': 'ID suggestions',
  '/app/chat':          'Messages',
  '/app/communities':   'Communities',
  '/app/events':        'Events',
  '/app/create':        'New Post',
  '/app/profile':       'Profile',
  '/app/edit-profile':  'Edit Profile',
  '/app/settings':      'Settings',
  '/app/notifications': 'Notifications',
  '/app/settings/account':       'Account',
  '/app/settings/privacy':       'Privacy',
  '/app/settings/notifications': 'Notifications',
  '/app/settings/security':      'Security',
  '/app/settings/about':         'About',
  '/app/settings/help':          'Help & Support',
  '/app/settings/legal':         'Legal',
  '/app/settings/saved':         'Saved',
  '/app/settings/activity':      'Your activity',
}

function deriveTitleAndBack(pathname: string): { title: string; showBack: boolean } {
  // Help owns its page heading; the shell provides only the shared Back control.
  if (pathname === '/app/settings/help') return { title: '', showBack: true }
  const isFeed = pathname === '/app/feed' || pathname === '/app'
  if (isFeed) return { title: '', showBack: false }

  if (EXACT_TITLES[pathname]) {
    const isSubScreen =
      pathname === '/app/chat' ||
       pathname === '/app/search/id-suggestions' ||
      pathname === '/app/notifications' ||
      pathname === '/app/settings' ||
      pathname.startsWith('/app/settings/')
    return { title: EXACT_TITLES[pathname], showBack: isSubScreen }
  }

  if (pathname.startsWith('/app/profile/')) {
    const username = pathname.replace('/app/profile/', '').split('/')[0]
    return { title: `@${username}`, showBack: true }
  }

  return { title: '', showBack: true }
}

export function TopBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { unreadCount, fetchNotifications, refreshUnread } = useNotificationStore()
  const conversations = useChatStore((s) => s.conversations)
  const fetchConversations = useChatStore((s) => s.fetchConversations)
  // The header badge is a conversation indicator: several unread messages
  // from the same person should still occupy one badge count.
  const unreadMessageCount = conversations.filter((conversation) => conversation.unread_count > 0).length

  const isFeed = location.pathname === '/app/feed' || location.pathname === '/app'
  const isEvents = location.pathname === '/app/events'
  const showBrandHeader = isFeed || isEvents
  const isNotifications = location.pathname === '/app/notifications'
  const { title, showBack } = deriveTitleAndBack(location.pathname)

  useEffect(() => { fetchNotifications() }, [])
  useEffect(() => { void fetchConversations() }, [])
  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshUnread()
      void fetchConversations()
    }, 8000)
    return () => window.clearInterval(timer)
  }, [refreshUnread, fetchConversations])

  useEffect(() => {
    if (isNotifications && unreadCount > 0) {
      useNotificationStore.getState().markAllRead()
    }
  }, [isNotifications])

  return (
    <header style={{
      position:       'sticky',
      top:            0,
      zIndex:         50,
      height:         'calc(var(--topbar-h) + var(--sat))',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      padding:        '0 14px',
      paddingTop:     'var(--sat)',
      background:     'var(--color-navbar-bg)',
      backdropFilter: 'blur(20px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
      borderBottom:   '1px solid var(--color-navbar-border)',
      flexShrink:     0,
    }}>

      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
        {showBack && (
          <button
            onClick={requestAppBack}
            aria-label="Go back"
            title="Go back"
            style={{
              background:    'var(--color-surface)',
              border:        '1px solid var(--color-border)',
              cursor:        'pointer',
              color:         'var(--color-text-primary)',
              display:       'flex',
              width:         '44px',
              height:        '44px',
              minWidth:      '44px',
              flexShrink:    0,
              alignItems:    'center',
              justifyContent:'center',
              padding:       0,
              borderRadius:  '50%',
              marginLeft:    '-2px',
              transition:    'background 150ms ease, transform 120ms ease',
              boxShadow:     'none',
              WebkitTapHighlightColor: 'transparent',
            }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.90)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface)' }}
            onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface)' }}
          >
            <ArrowLeft size={18} />
          </button>
        )}
        {showBrandHeader ? (
          <span style={{
            fontSize:      '22px',
            fontWeight:    800,
            color:         'var(--color-text-primary)',
            letterSpacing: '-0.5px',
            fontFamily:    'var(--font-display)',
          }}>
            Campnect
          </span>
        ) : title ? (
          <span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
            {title}
          </span>
        ) : null}
      </div>

      {/* Right — brand header only */}
      {showBrandHeader && (
        <div style={{ display: 'flex', gap: '2px' }}>
          <button
            onClick={() => navigate('/app/notifications')}
            style={{
              background: 'var(--color-surface)',
              border:     '1px solid var(--color-border)',
              cursor:     'pointer',
              color:      'var(--color-text-secondary)',
              display:    'flex',
              padding:    '8px',
              borderRadius: '12px',
              position:   'relative',
              transition: 'background 150ms ease, transform 120ms ease',
              WebkitTapHighlightColor: 'transparent',
            }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.90)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface)' }}
            onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface)' }}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: '4px', right: '4px',
                minWidth: '16px', height: '16px', borderRadius: '9999px',
                background: 'var(--color-purple-core)', color: '#FFFFFF',
                fontSize: '9px', fontWeight: 800, lineHeight: '16px',
                textAlign: 'center', padding: '0 3px',
                border: '1.5px solid var(--color-bg)',
                
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate('/app/chat')}
            style={{
              background: 'var(--color-surface)',
              border:     '1px solid var(--color-border)',
              cursor:     'pointer',
              color:      'var(--color-text-secondary)',
              display:    'flex',
              padding:    '8px',
              borderRadius: '12px',
              marginLeft: '4px',
              position:   'relative',
              transition: 'background 150ms ease, transform 120ms ease',
              WebkitTapHighlightColor: 'transparent',
            }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.90)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface)' }}
            onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface)' }}
          >
            <MessageCircle size={20} />
            {unreadMessageCount > 0 && (
              <span style={{
                position: 'absolute', top: '4px', right: '4px',
                minWidth: '16px', height: '16px', borderRadius: '9999px',
                background: 'var(--color-purple-core)', color: '#FFFFFF',
                fontSize: '9px', fontWeight: 800, lineHeight: '16px',
                textAlign: 'center', padding: '0 3px',
                border: '1.5px solid var(--color-bg)',
              }}>
                {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
              </span>
            )}
          </button>
        </div>
      )}
    </header>
  )
}
