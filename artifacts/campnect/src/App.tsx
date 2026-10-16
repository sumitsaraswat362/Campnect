import { DemoStorageNotice } from './demo/components'
import { DemoCallOverlay } from './demo/callOverlay'
import { DEMO_MODE } from './demo/config'
import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useThemeStore } from './stores/themeStore'

import { ProtectedRoute }       from './routes/ProtectedRoute'
import { AppShell }             from './screens/main/AppShell'

import { LoginScreen }          from './screens/auth/LoginScreen'
import { RegisterScreen }       from './screens/auth/RegisterScreen'
import { VerifyEmailScreen }    from './screens/auth/VerifyEmailScreen'
import { VerifyLoginScreen }    from './screens/auth/VerifyLoginScreen'
import { VerifyCollegeScreen }  from './screens/auth/VerifyCollegeScreen'
import { ForgotPasswordScreen } from './screens/auth/ForgotPasswordScreen'
import { DesktopLandingScreen } from './screens/auth/DesktopLandingScreen'

import { HomeScreen }         from './screens/main/HomeScreen'
import { ProfileScreen }      from './screens/main/ProfileScreen'
import { EditProfileScreen }  from './screens/main/EditProfileScreen'
import { CreatePostScreen }   from './screens/main/CreatePostScreen'
import { CreateChooserScreen } from './screens/main/CreateChooserScreen'
import { PostDetailScreen }   from './screens/main/PostDetailScreen'
import { FollowListScreen }   from './screens/main/FollowListScreen'

import { ChatListScreen }        from './screens/main/ChatListScreen'
import { ChatRoomScreen }        from './screens/main/ChatRoomScreen'
import { MessageRequestsScreen } from './screens/main/MessageRequestsScreen'
import { CreateGroupScreen }     from './screens/main/CreateGroupScreen'
import { GroupInfoScreen }       from './screens/main/GroupInfoScreen'
import { NewMessageScreen }      from './screens/main/NewMessageScreen'
import { GroupJoinScreen }       from './screens/main/GroupJoinScreen'

import { SearchScreen }           from './screens/main/SearchScreen'
import { IdSuggestionsScreen }    from './screens/main/IdSuggestionsScreen'
import { CollegeMembersScreen }   from './screens/main/CollegeMembersScreen'
import { CommunitiesScreen }      from './screens/main/CommunitiesScreen'
import { CommunityScreen }        from './screens/main/CommunityScreen'
import { EventsScreen }           from './screens/main/EventsScreen'
import { EventDetailScreen }      from './screens/main/EventDetailScreen'
import { CreateEventScreen }      from './screens/main/CreateEventScreen'
import { EventConfirmationScreen } from './screens/main/EventConfirmationScreen'
import { EventAttendeesScreen }   from './screens/main/EventAttendeesScreen'
import { EditEventScreen }        from './screens/main/EditEventScreen'
import { CreateCommunityScreen }  from './screens/main/CreateCommunityScreen'
import { EditCommunityScreen }    from './screens/main/EditCommunityScreen'
import { GlimpseScreen }          from './screens/main/GlimpseScreen'
import { CreateGlimpseScreen }    from './screens/main/CreateGlimpseScreen'
import { GlimpseViewerScreen }    from './screens/main/GlimpseViewerScreen'
import { ClipsScreen }            from './screens/main/ClipsScreen'
import { ClipCreateScreen }       from './screens/main/ClipCreateScreen'

import { NotificationsScreen }       from './screens/main/NotificationsScreen'
import { SettingsScreen }            from './screens/main/SettingsScreen'
import { PrivacyScreen }             from './screens/settings/PrivacyScreen'
import { AccountScreen }             from './screens/settings/AccountScreen'
import { NotificationPrefsScreen }   from './screens/settings/NotificationPrefsScreen'
import { SecurityScreen }            from './screens/settings/SecurityScreen'
import { AboutScreen }               from './screens/settings/AboutScreen'
import { HelpSupportScreen }         from './screens/settings/HelpSupportScreen'
import { HelpArticleScreen }         from './screens/settings/HelpArticleScreen'
import { LegalScreen }               from './screens/settings/LegalScreen'
import { SavedScreen }               from './screens/settings/SavedScreen'
import { ActivityScreen }            from './screens/settings/ActivityScreen'
import { ContentAppealsScreen }      from './screens/settings/ContentAppealsScreen'

import { useAuthStore } from './stores/authStore'
import { consumePendingNotificationPath, syncOneSignalUser } from './capacitor/oneSignal'
import { normalizeAppDestination } from './utils/navigation'
import { BackNavigationProvider } from './navigation/BackNavigation'
import { OverlayDismissRegistryProvider } from './navigation/overlayDismissRegistry'
import { useSocket } from './hooks/useSocket'
import { MessagePreviewBanner } from './components/chat/MessagePreviewBanner'
import { setAuthenticatedMediaScope } from './hooks/useAuthMedia'
import { useGlimpseBackgroundPreload } from './hooks/useGlimpseBackgroundPreload'
import { useMaintenanceStatus } from './hooks/useMaintenanceStatus'
import { MaintenanceScreen } from './components/shared/MaintenanceScreen'
import { useAppUpdateNotice } from './hooks/useAppUpdateNotice'
import { AppUpdateNotice } from './components/shared/AppUpdateNotice'

function ThemeApplier() {
  const { mode, getEffective } = useThemeStore()
  useEffect(() => {
    const apply = () => document.documentElement.setAttribute('data-theme', getEffective())
    apply()
    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: light)')
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
    return undefined
  }, [mode])
  return null
}

function OneSignalIdentitySync() {
  const userId = useAuthStore((state) => state.user?.id ?? null)

  useEffect(() => {
    void syncOneSignalUser(userId)
  }, [userId])

  return null
}

function NotificationNavigationSync() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => {
    const openPendingPath = () => {
      if (!isAuthenticated) return
      const path = normalizeAppDestination(consumePendingNotificationPath())
      if (path) {
        navigate(path, { replace: true })
      }
    }
    const handleNotificationOpen = () => openPendingPath()

    window.addEventListener('campnect:notification-open', handleNotificationOpen)
    openPendingPath()
    return () => window.removeEventListener('campnect:notification-open', handleNotificationOpen)
  }, [isAuthenticated, navigate])

  return null
}

function AppRealtimeSync() {
  useSocket()
  return <MessagePreviewBanner />
}

function ContentPreloader() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  useGlimpseBackgroundPreload(userId, isAuthenticated)

  useEffect(() => {
    setAuthenticatedMediaScope(isAuthenticated ? userId : null)
    if (!isAuthenticated || !userId) return
    void Promise.allSettled([
      import('./stores/feedStore').then(({ useFeedStore }) => useFeedStore.getState().fetchFeed()),
      import('./cache/contentCache').then(({ loadInitialClips }) => loadInitialClips(userId)),
    ])
  }, [isAuthenticated, userId])

  return null
}

function MaintenanceGate({ children }: { children: ReactNode }) {
  const { enabled, message } = useMaintenanceStatus()
  if (enabled) return <MaintenanceScreen message={message} />
  return <>{children}</>
}

function AppUpdateGate({ children }: { children: ReactNode }) {
  const { notice, dismiss } = useAppUpdateNotice()
  return <>{children}{notice && <AppUpdateNotice notice={notice} onLater={dismiss} />}</>
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppUpdateGate>
        <MaintenanceGate>
        <BrowserRouter>
        <OverlayDismissRegistryProvider>
        <BackNavigationProvider>
          <ThemeApplier />
          <OneSignalIdentitySync />
          <NotificationNavigationSync />
          <AppRealtimeSync />
          {DEMO_MODE && <><DemoStorageNotice /><DemoCallOverlay /></>}
          <ContentPreloader />
          <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: 'var(--glass-3, rgba(255,255,255,0.98))',
              color: 'var(--color-text-primary, #101014)',
              border: '1px solid var(--color-border, rgba(17,17,20,0.08))',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-float)',
              fontSize: '14px',
              fontWeight: 500,
              maxWidth: '360px',
            },
            success: { iconTheme: { primary: '#141416', secondary: '#FFFFFF' } },
            error:   { iconTheme: { primary: '#EF4444', secondary: '#FFFFFF' } },
          }}
        />
          <Routes>
        {/* Root redirect — landing page for unauthenticated, feed for authenticated */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="/onboarding" element={<Navigate to="/signup" replace />} />

        {/* Public group invite link — accessible without authentication */}
        <Route path="/join/:token" element={<GroupJoinScreen />} />

        {/* Auth */}
        <Route path="/login"           element={<LoginScreen />} />
        <Route path="/signup"          element={<RegisterScreen />} />
        <Route path="/verify-email"    element={<VerifyEmailScreen />} />
          <Route path="/verify-login"    element={<VerifyLoginScreen />} />
        <Route path="/verify-college"  element={<VerifyCollegeScreen />} />
        <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
        <Route path="/reset-password"  element={<ForgotPasswordScreen />} />

        {/* Protected app shell */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/app/feed" replace />} />
          <Route path="feed"          element={<HomeScreen />} />
          <Route path="search"        element={<SearchScreen />} />
          <Route path="search/id-suggestions" element={<IdSuggestionsScreen />} />
          <Route path="college/:id"   element={<CollegeMembersScreen />} />
          <Route path="create"        element={<CreateChooserScreen />} />
          <Route path="create/post"   element={<CreatePostScreen />} />
          {/* Story/Reels student surfaces remain retired; Glimpse is the new daily campus snapshot. */}
          <Route path="create-story"   element={<Navigate to="/app/feed" replace />} />
          <Route path="glimpse"         element={<GlimpseScreen />} />
          <Route path="glimpse/create"  element={<CreateGlimpseScreen />} />
          <Route path="glimpse/:id"     element={<GlimpseViewerScreen />} />
           <Route path="clips"           element={<ClipsScreen />} />
           <Route path="clips/create"    element={<ClipCreateScreen />} />
           <Route path="clips/:id"       element={<ClipsScreen />} />
          <Route path="chat"                  element={<ChatListScreen />} />
          <Route path="chat/new"              element={<NewMessageScreen />} />
          <Route path="chat/requests"         element={<MessageRequestsScreen />} />
          <Route path="chat/new-group"        element={<CreateGroupScreen />} />
          <Route path="chat/:id"              element={<ChatRoomScreen />} />
          <Route path="chat/:id/info"         element={<GroupInfoScreen />} />

          <Route path="profile"                          element={<ProfileScreen />} />
          <Route path="profile/:username"                element={<ProfileScreen />} />
          <Route path="profile/:username/followers"      element={<FollowListScreen mode="followers" />} />
          <Route path="profile/:username/following"      element={<FollowListScreen mode="following" />} />
          <Route path="edit-profile"                     element={<EditProfileScreen />} />
          <Route path="post/:id"                         element={<PostDetailScreen />} />

          <Route path="communities"         element={<CommunitiesScreen />} />
          <Route path="communities/create"  element={<CreateCommunityScreen />} />
          <Route path="community/:slug/edit" element={<EditCommunityScreen />} />
          <Route path="community/:slug"     element={<CommunityScreen />} />

          <Route path="events"          element={<EventsScreen />} />
          <Route path="events/create"   element={<CreateEventScreen />} />
          <Route path="events/:id/confirmation" element={<EventConfirmationScreen />} />
          <Route path="events/:id/attendees"    element={<EventAttendeesScreen />} />
          <Route path="events/:id/edit"         element={<EditEventScreen />} />
          <Route path="events/:id"      element={<EventDetailScreen />} />

          <Route path="notifications" element={<NotificationsScreen />} />

          <Route path="settings"                     element={<SettingsScreen />} />
          <Route path="settings/account"             element={<AccountScreen />} />
          <Route path="settings/privacy"             element={<PrivacyScreen />} />
          <Route path="settings/notifications"       element={<NotificationPrefsScreen />} />
          <Route path="settings/security"            element={<SecurityScreen />} />
          <Route path="settings/about"               element={<AboutScreen />} />
           <Route path="settings/help"                element={<HelpSupportScreen />} />
           <Route path="settings/help/article/:slug"  element={<HelpArticleScreen />} />
           <Route path="settings/legal"               element={<LegalScreen />} />
          <Route path="settings/saved"               element={<SavedScreen />} />
          <Route path="settings/activity"            element={<ActivityScreen />} />
          <Route path="settings/content-appeals"     element={<ContentAppealsScreen />} />
          <Route path="settings/close-mates"         element={<Navigate to="/app/settings" replace />} />

        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BackNavigationProvider>
        </OverlayDismissRegistryProvider>
        </BrowserRouter>
        </MaintenanceGate>
      </AppUpdateGate>
    </AppErrorBoundary>
  )
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Campnect UI failed to render.', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main style={{
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: '#F4F3F0',
        color: '#101014',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 38, marginBottom: 14 }}>◌</div>
          <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Campnect needs a refresh</h1>
          <p style={{ margin: 0, color: '#5C5C66', lineHeight: 1.55 }}>
            The screen hit a temporary problem. Your saved account data is still on this device.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              minHeight: 48,
              marginTop: 22,
              padding: '0 20px',
              border: 0,
              borderRadius: 9999,
              background: '#141416',
              color: '#FFFFFF',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Refresh Campnect
          </button>
        </div>
      </main>
    )
  }
}

function RootRedirect() {
  const { isAuthenticated, isEmailVerified } = useAuthStore()
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 860px)').matches)

  useEffect(() => {
    const query = window.matchMedia('(min-width: 860px)')
    const sync = () => setIsDesktop(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  if (isAuthenticated && isEmailVerified) {
    return <Navigate to="/app/feed" replace />
  }
  if (DEMO_MODE) return <Navigate to="/login" replace />
  if (isDesktop) {
    return <DesktopLandingScreen />
  }
  return <Navigate to="/signup" replace />
}
