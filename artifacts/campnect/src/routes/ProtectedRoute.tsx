import React, { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { SuspendedAccountScreen } from '../screens/main/SuspendedAccountScreen'
import { LoadingSpinner } from '../components/shared/LoadingSpinner'
import { normalizeAppDestination } from '../utils/navigation'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isEmailVerified, user, refreshUser } = useAuthStore()
  const location = useLocation()
  const validatedOnce = useRef(false)
  const [checkingSession, setCheckingSession] = useState(() => Boolean(isAuthenticated && user))

  // A persisted token can outlive the server session (for example after a
  // remote logout). Validate it at entry and periodically. Do not validate
  // on every focus/visibility event: mobile keyboards and preview iframes can
  // emit those events repeatedly and cause unnecessary API churn.
  useEffect(() => {
    if (!isAuthenticated || !user) {
      validatedOnce.current = false
      setCheckingSession(false)
      return
    }

    let active = true
    const validateSession = async (showLoader = false) => {
      if (showLoader && active) setCheckingSession(true)
      await refreshUser()
      if (active && showLoader) {
        validatedOnce.current = true
        setCheckingSession(false)
      }
    }

    void validateSession(!validatedOnce.current)

    const interval = window.setInterval(() => { void validateSession() }, 5 * 60 * 1000)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [isAuthenticated, user?.id, refreshUser, location.pathname])

  // Not logged in at all
  if (!isAuthenticated || !user) {
    const from = normalizeAppDestination(`${location.pathname}${location.search}${location.hash}`)
    return <Navigate to="/login" state={{ from }} replace />
  }

  if (checkingSession) {
    return (
      <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)' }}>
        <LoadingSpinner size={32} />
      </main>
    )
  }

  // Email not verified — must verify before accessing the app
  if (!isEmailVerified) {
    const from = normalizeAppDestination(`${location.pathname}${location.search}${location.hash}`)
    return <Navigate to="/verify-email" state={{ email: user.email, from }} replace />
  }

  if (user.is_suspended) return <SuspendedAccountScreen />

  // College verification is an optional badge, not an access gate.
  // Users can use the app after email verification; the verified badge
  // shows on their profile once an admin approves their college ID.

  return <>{children}</>
}
