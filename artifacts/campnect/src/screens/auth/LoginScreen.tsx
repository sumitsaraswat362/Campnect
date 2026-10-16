import { DEMO_MODE } from '../../demo/config'
import { DemoAccountSelector } from '../../demo/components'
import React, { useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../stores/authStore'
import { requestAppBack } from '../../navigation/appBackRequest'
import { consumePendingNotificationPath } from '../../capacitor/oneSignal'
import { destinationFromNavigationState, normalizeAppDestination } from '../../utils/navigation'

export function LoginScreen() {
  return <ProductionLoginScreen />
}

function ProductionLoginScreen() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const login     = useAuthStore((s) => s.login)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [serverMessage, setServerMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({})

  function validate() {
    const e: typeof errors = {}
    const value = identifier.trim()
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    const username = /^@?[a-z0-9_.]{3,30}$/i.test(value)
    if (!value) e.identifier = 'Email or @username is required'
    else if (!email && !username) e.identifier = 'Enter a valid email or @username'
    if (!password) e.password = 'Password is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setServerMessage(null)
    try {
      await login(identifier.trim().toLowerCase(), password)
      const destination = normalizeAppDestination(consumePendingNotificationPath())
        ?? destinationFromNavigationState(location.state)
        ?? '/app/feed'
      navigate(destination, { replace: true })
    } catch (err: any) {
      const status = err?.response?.status
      const code = err?.response?.data?.code
      const emailDeliveryUnavailable = code === 'EMAIL_DELIVERY_UNAVAILABLE'
      const isTemporaryFailure = status === 502 || status === 503 || status === 504 || !err?.response
      // Internal/database messages must never be shown to regular users.
      // Keep diagnostic details in the API logs and use a stable public message.
      const msg = emailDeliveryUnavailable
        ? 'We couldn’t send your login code. Please try again in a moment.'
        : isTemporaryFailure || status >= 500
        ? 'We’re getting things ready. Please try again in a moment.'
        : (err?.response?.data?.error || 'Login failed. Please try again.')
      if (err?.response?.status === 503 && code === 'DATABASE_INITIALIZING') {
        setServerMessage(msg)
        toast.error(msg)
        return
      }
      const responseData = err?.response?.data?.data || {}
      const resolvedEmail = responseData.email || identifier.trim().toLowerCase()
      const username = responseData.username || (
        !identifier.includes('@') ? identifier.trim().replace(/^@/, '') : ''
      )
      if (code === 'EMAIL_NOT_VERIFIED') {
        toast.error(msg)
        navigate('/verify-email', {
          state: {
            email: resolvedEmail,
            from: destinationFromNavigationState(location.state),
          },
        })
      } else if (code === 'LOGIN_OTP_REQUIRED') {
        const pendingLogin = {
          email: resolvedEmail,
          username,
          from: destinationFromNavigationState(location.state),
        }
        sessionStorage.setItem('campnect-pending-login', JSON.stringify(pendingLogin))
        navigate('/verify-login', { state: pendingLogin })
      } else {
        // Keep authentication failures visible in the form as well as in the
        // toast. Toasts can disappear behind the keyboard on mobile WebViews.
        setServerMessage(msg)
        toast.error(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen login-screen" style={{
      minHeight:  '100%',
      width:      '100%',
      background: '#FFFFFF',
      backgroundImage: 'none',
      display:    'flex',
      flexDirection: 'column',
      padding:    '0 24px',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      {/* Back button */}
      <div style={{ paddingTop: '16px', paddingBottom: '8px' }}>
        <button
          onClick={requestAppBack}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: '#FFFFFF',
            border: '1px solid #DEDEDE',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#111111',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
      </div>

      {/* Heading */}
      <div style={{ marginTop: '32px', marginBottom: '36px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#111111', lineHeight: 1.2, marginBottom: '8px' }}>
          Welcome back
        </h1>
        <p style={{ fontSize: '15px', color: '#686868', lineHeight: 1.5 }}>
          Login to continue your campus journey
        </p>
      </div>

      {DEMO_MODE ? <DemoAccountSelector embedded /> : <>
      {/* Form */}
      {serverMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginBottom: '16px',
            padding: '12px 14px',
            borderRadius: '12px',
            border: '1px solid #D2D2D2',
            background: '#F4F4F4',
            color: '#111111',
            fontSize: '13px',
            lineHeight: 1.45,
          }}
        >
          {serverMessage}
        </div>
      )}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Email field */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            background: '#FFFFFF',
            border: `1.5px solid ${errors.identifier ? '#111111' : '#D8D8D8'}`,
            borderRadius: '14px',
            padding: '0 16px',
            height: '56px',
          }}>
            <Mail size={18} color="#777777" />
            <input
              type="text"
              placeholder="Email or @username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: '#111111', fontSize: '15px',
                caretColor: '#111111',
                fontFamily: 'var(--font-body)',
              }}
            />
          </div>
          {errors.identifier
            ? <p style={{ color: '#EF4444', fontSize: '12px', marginTop: '4px', paddingLeft: '4px' }}>{errors.identifier}</p>
            : <p style={{ color: '#777777', fontSize: '12px', marginTop: '4px', paddingLeft: '4px' }}>Use your college email or username, for example @alex123.</p>}
        </div>

        {/* Password field */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            background: '#FFFFFF',
            border: `1.5px solid ${errors.password ? '#111111' : '#D8D8D8'}`,
            borderRadius: '14px',
            padding: '0 16px',
            height: '56px',
          }}>
            <Lock size={18} color="#777777" />
            <input
              type={showPwd ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: '#111111', fontSize: '15px',
                caretColor: '#111111',
                fontFamily: 'var(--font-body)',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666666', padding: 0, display: 'flex' }}
            >
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password && <p style={{ color: '#EF4444', fontSize: '12px', marginTop: '4px', paddingLeft: '4px' }}>{errors.password}</p>}
        </div>

        {/* Forgot */}
        <div style={{ textAlign: 'right', marginTop: '-4px' }}>
          <Link
            to="/forgot-password"
            style={{ fontSize: '14px', color: '#111111', textDecoration: 'none', fontWeight: 600 }}
          >
            Forgot password?
          </Link>
        </div>

        {/* Login button */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', height: '56px', borderRadius: '14px',
            background: '#111111', opacity: loading ? 0.6 : 1,
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px', fontWeight: 700, color: '#FFFFFF',
            marginTop: '8px',
            boxShadow: '0 8px 20px rgba(0,0,0,.14)',
            WebkitTapHighlightColor: 'transparent',
            transition: 'all 200ms',
            fontFamily: 'var(--font-display)',
          }}
        >
          {loading ? 'Signing in…' : 'Login'}
        </button>
      </form>

      {/* Sign up link */}
      <p style={{ textAlign: 'center', marginTop: 'auto', padding: '32px 0', paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))', fontSize: '14px', color: '#777777' }}>
        Don't have an account?{' '}
        <Link to="/signup" style={{ color: '#111111', textDecoration: 'none', fontWeight: 700 }}>
          Sign up
        </Link>
      </p>
      </>}
    </div>
  )
}
