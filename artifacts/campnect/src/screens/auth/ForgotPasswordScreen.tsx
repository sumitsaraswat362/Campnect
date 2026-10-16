import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { AppBackground } from '../../components/layout/AppBackground'
import { GlassCard } from '../../components/ui/GlassCard'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { OTPInput } from '../../components/ui/OTPInput'
import { PasswordInput } from '../../components/ui/PasswordInput'
import client from '../../api/client'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

type Step = 'email' | 'otp' | 'password' | 'done'

export function ForgotPasswordScreen() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  useBackDismiss(step === 'otp', () => setStep('email'), 150)
  useBackDismiss(step === 'password', () => setStep('otp'), 160)
  useBackDismiss(step === 'done', () => navigate('/login', { replace: true }), 170)

  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = setInterval(() => setResendSeconds((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(timer)
  }, [resendSeconds])

  async function sendCode() {
    if (!email.trim()) { setErrors({ email: 'Email required' }); return }
    setLoading(true)
    try {
      await client.post('/auth/forgot-password', { email: email.toLowerCase().trim() })
      setErrors({})
      setResendSeconds(60)
      setStep('otp')
      toast.success('Reset code sent if email exists')
    } catch {
      toast.error('Failed to send reset code')
    } finally {
      setLoading(false)
    }
  }

  async function verifyOTP() {
    if (otp.length !== 6) return
    setStep('password')
  }

  async function resetPassword() {
    const e: Record<string, string> = {}
    if (password.length < 8) e.password = 'Password must be 8+ characters'
    if (password !== confirm) e.confirm = 'Passwords do not match'
    if (Object.keys(e).length) { setErrors(e); return }
    setLoading(true)
    try {
      await client.post('/auth/reset-password', { email: email.toLowerCase().trim(), otp, password })
      setStep('done')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Reset failed')
    } finally {
      setLoading(false)
    }
  }

  async function resendCode() {
    await client.post('/auth/resend-otp', { email: email.toLowerCase().trim(), type: 'reset' })
    setResendSeconds(60)
    toast.success('New code sent!')
  }

  return (
    <AppBackground>
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
        {/* Back */}
        <div style={{ width: '100%', maxWidth: '420px', marginBottom: '16px' }}>
          <button onClick={requestAppBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', padding: '4px 0' }}>
            <ArrowLeft size={18} /> Back
          </button>
        </div>

        {step === 'email' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'rgba(24,24,27,0.20)', border: '1px solid rgba(63,63,70,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Mail size={28} color="rgba(210,210,215,0.90)" />
              </div>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '6px' }}>Reset password</h1>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>Enter your email and we'll send a reset code</p>
            </div>
            <GlassCard style={{ width: '100%', maxWidth: '420px' }} padding="28px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Input label="College email" type="email" placeholder="you@college.edu" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} leftIcon={<Mail size={18} />} autoComplete="email" />
                <Button fullWidth onClick={sendCode} disabled={loading}>{loading ? 'Sending…' : 'Send reset code'}</Button>
              </div>
            </GlassCard>
          </>
        )}

        {step === 'otp' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '6px' }}>Enter reset code</h1>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>We sent a 6-digit code to <strong style={{ color: 'var(--color-text-primary)' }}>{email}</strong></p>
            </div>
            <GlassCard style={{ width: '100%', maxWidth: '420px' }} padding="28px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
                <OTPInput value={otp} onChange={(v) => { setOtp(v); if (v.length === 6) setTimeout(() => verifyOTP(), 100) }} />
                <Button fullWidth onClick={verifyOTP} disabled={otp.length !== 6}>Continue</Button>
                <button onClick={resendCode} disabled={resendSeconds > 0} style={{ background: 'none', border: 'none', cursor: resendSeconds > 0 ? 'not-allowed' : 'pointer', color: resendSeconds > 0 ? 'var(--color-text-muted)' : 'var(--color-blue-light)', fontSize: '14px' }}>
                  {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}
                </button>
              </div>
            </GlassCard>
          </>
        )}

        {step === 'password' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '6px' }}>New password</h1>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>Choose a strong password for your account</p>
            </div>
            <GlassCard style={{ width: '100%', maxWidth: '420px' }} padding="28px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <PasswordInput label="New password" placeholder="Create a strong password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} showStrength autoComplete="new-password" />
                <PasswordInput label="Confirm password" placeholder="Repeat your new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} autoComplete="new-password" />
                <Button fullWidth onClick={resetPassword} disabled={loading}>{loading ? 'Resetting…' : 'Reset password'}</Button>
              </div>
            </GlassCard>
          </>
        )}

        {step === 'done' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--color-lime-dim)', border: '2px solid var(--color-lime-glow, rgba(187,255,0,0.40))', boxShadow: '0 0 32px rgba(187,255,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', animation: 'checkPop 500ms var(--ease-spring)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-lime)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'fadeIn 300ms 200ms both' }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Password reset!</h1>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>Your password has been updated. Sign in with your new password.</p>
            </div>
            <Button onClick={() => navigate('/login', { replace: true })}>Sign in</Button>
          </>
        )}
      </div>
    </AppBackground>
  )
}
