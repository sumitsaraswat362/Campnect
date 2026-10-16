import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Clock3, Mail, RotateCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { AppBackground } from '../../components/layout/AppBackground'
import { GlassCard } from '../../components/ui/GlassCard'
import { Button } from '../../components/ui/Button'
import { OTPInput } from '../../components/ui/OTPInput'
import { useAuthStore } from '../../stores/authStore'
import client from '../../api/client'
import { consumePendingNotificationPath } from '../../capacitor/oneSignal'
import { normalizeAppDestination } from '../../utils/navigation'

export function VerifyLoginScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const verifyLogin = useAuthStore((s) => s.verifyLogin)
  const pendingLogin = (() => {
    const state = (location.state || {}) as { email?: string; username?: string; from?: string }
    if (state.email) return state
    try {
      const stored = JSON.parse(sessionStorage.getItem('campnect-pending-login') || 'null')
      return stored && typeof stored.email === 'string' ? stored : {}
    } catch {
      return {}
    }
  })()
  const { email = '', username = '' } = pendingLogin
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [seconds, setSeconds] = useState(60)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!email) navigate('/login', { replace: true })
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [email, navigate])

  useEffect(() => {
    if (otp.length === 6) void submit()
  }, [otp])

  async function submit() {
    if (otp.length !== 6 || loading) return
    setLoading(true); setError(false)
    try {
      await verifyLogin(email, otp)
      sessionStorage.removeItem('campnect-pending-login')
      toast.success('Login verified')
      const destination = normalizeAppDestination(consumePendingNotificationPath())
        ?? normalizeAppDestination(pendingLogin.from)
        ?? '/app/feed'
      navigate(destination, { replace: true })
    } catch (err: any) {
      setError(true); setOtp('')
      toast.error(err?.response?.status && err.response.status >= 500
        ? 'We’re getting things ready. Please try again in a moment.'
        : 'That code is incorrect or expired. Please try again.')
    } finally { setLoading(false) }
  }

  async function resend() {
    if (seconds > 0 || resending) return
    setResending(true)
    try {
      await client.post('/auth/resend-otp', { email, type: 'login' })
      setSeconds(60); setOtp(''); setError(false); toast.success('New login code sent')
    } catch (err: any) {
      const message = err?.response?.data?.error || (err?.response?.status && err.response.status >= 500
        ? 'We’re getting things ready. Please try again in a moment.'
        : 'Could not resend the code. Please try again.')
      toast.error(message)
    } finally {
      setResending(false)
    }
  }

  return (
    <AppBackground>
      <div className="verify-login-page route-scroll" style={{ height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', background: '#FFFFFF', color: '#111111' }}>
        <div className="verify-login-icon" style={{ width: 80, height: 80, borderRadius: 24, background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Mail size={36} color="#FFFFFF" />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111111', marginBottom: 8 }}>Confirm your login</h1>
        <p style={{ color: '#686868', fontSize: 14, textAlign: 'center', marginBottom: 32, maxWidth: 320, lineHeight: 1.6 }}>
          Enter the 6-digit code sent to the email for{' '}
          <strong style={{ color: '#111111' }}>
            {username ? `@${username.replace(/^@/, '').toLowerCase()}` : 'your account'}
          </strong>
        </p>
        <GlassCard className="verify-login-card" style={{ width: '100%', maxWidth: 400, background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 8px 30px rgba(17,17,17,.07)' }} padding="28px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
            <OTPInput value={otp} onChange={setOtp} error={error} disabled={loading} />
            <Button fullWidth onClick={submit} disabled={otp.length !== 6 || loading} style={{ background: '#111111', color: '#FFFFFF', boxShadow: '0 6px 16px rgba(0,0,0,.12)' }}>{loading ? 'Verifying…' : 'Continue'}</Button>
            <div style={{ width: '100%', paddingTop: 2, textAlign: 'center' }}>
              <p style={{ margin: '0 0 10px', color: '#777777', fontSize: 12 }}>Didn’t receive the email? Check Spam or Promotions.</p>
              <button
                type="button"
                onClick={resend}
                disabled={seconds > 0 || resending}
                style={{
                  minHeight: 42,
                  padding: '0 16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  border: seconds > 0 ? '1px solid #E7E7E7' : '1px solid #111111',
                  borderRadius: 999,
                  background: seconds > 0 ? '#F7F7F7' : '#FFFFFF',
                  color: seconds > 0 ? '#777777' : '#111111',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: seconds > 0 || resending ? 'not-allowed' : 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {resending
                  ? <><RotateCw size={15} className="spin" /> Sending new code…</>
                  : seconds > 0
                    ? <><Clock3 size={15} /> Resend available in {seconds}s</>
                    : <><RotateCw size={15} /> Resend login code</>}
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    </AppBackground>
  )
}