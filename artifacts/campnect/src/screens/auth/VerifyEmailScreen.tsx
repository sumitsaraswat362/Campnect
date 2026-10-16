import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import { AppBackground } from '../../components/layout/AppBackground'
import { GlassCard } from '../../components/ui/GlassCard'
import { Button } from '../../components/ui/Button'
import { OTPInput } from '../../components/ui/OTPInput'
import { useAuthStore } from '../../stores/authStore'
import client from '../../api/client'
import { consumePendingNotificationPath } from '../../capacitor/oneSignal'
import { normalizeAppDestination } from '../../utils/navigation'

export function VerifyEmailScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const verifyEmail = useAuthStore((s) => s.verifyEmail)
  const userEmail = useAuthStore((s) => s.user?.email)

  const state = (location.state || {}) as { email?: string; from?: unknown }
  const email = state.email || userEmail || ''
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(60)
  const [otpError, setOtpError] = useState(false)

  useEffect(() => {
    if (!email) { navigate('/signup', { replace: true }); return }
    const timer = setInterval(() => {
      setResendSeconds((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [email])

  useEffect(() => {
    if (otp.length === 6) handleVerify()
  }, [otp])

  async function handleVerify() {
    if (otp.length !== 6) return
    setLoading(true)
    setOtpError(false)
    try {
      await verifyEmail(email, otp)
      toast.success('Email verified! Welcome to Campnect 🎉')
      const destination = normalizeAppDestination(consumePendingNotificationPath())
        ?? normalizeAppDestination(state.from)
        ?? '/app/feed'
      navigate(destination, { replace: true })
    } catch (err: any) {
      setOtpError(true)
      setOtp('')
      toast.error(err?.response?.data?.error || 'Incorrect code')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    try {
      await client.post('/auth/resend-otp', { email, type: 'verify' })
      setResendSeconds(60)
      setOtp('')
      setOtpError(false)
      toast.success('New code sent!')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not resend code')
    }
  }

  return (
    <AppBackground>
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
      }}>
        {/* Hero */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '24px',
          background: 'linear-gradient(135deg, rgba(24,24,27,0.30), rgba(196,77,204,0.18))',
          border: '1px solid rgba(24,24,27,0.30)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          boxShadow: '0 0 40px rgba(24,24,27,0.30)',
        }}>
          <Mail size={36} color="rgba(210,210,215,0.90)" />
        </div>

        <h1 style={{
          fontSize: '26px',
          fontWeight: 800,
          color: 'var(--color-text-primary)',
          marginBottom: '8px',
          textAlign: 'center',
        }}>
          Check your inbox
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', textAlign: 'center', marginBottom: '32px', maxWidth: '300px', lineHeight: 1.6 }}>
          We sent a 6-digit code to{' '}
          <strong style={{ color: 'var(--color-text-primary)' }}>{email}</strong>
        </p>

        <GlassCard style={{ width: '100%', maxWidth: '400px' }} padding="28px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center' }}>
            <OTPInput value={otp} onChange={setOtp} error={otpError} disabled={loading} />

            {otpError && (
              <p style={{ fontSize: '13px', color: '#EF4444', textAlign: 'center', marginTop: '-12px' }}>
                That code doesn't match. Try again.
              </p>
            )}

            <Button
              fullWidth
              onClick={handleVerify}
              disabled={otp.length !== 6 || loading}
            >
              {loading ? 'Verifying…' : 'Verify email'}
            </Button>

            <button
              onClick={handleResend}
              disabled={resendSeconds > 0}
              style={{
                background: 'none',
                border: 'none',
                cursor: resendSeconds > 0 ? 'not-allowed' : 'pointer',
                color: resendSeconds > 0 ? 'var(--color-text-muted)' : 'var(--color-blue-light)',
                fontSize: '14px',
                padding: '4px',
              }}
            >
              {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
            </button>
          </div>
        </GlassCard>

        <p style={{ marginTop: '24px', fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: '300px', lineHeight: 1.5 }}>
          Didn't receive it? Check your spam folder, or{' '}
          <button onClick={() => navigate('/signup')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-blue-light)', fontSize: '13px', padding: 0 }}>
            use a different email
          </button>
        </p>
      </div>
    </AppBackground>
  )
}
