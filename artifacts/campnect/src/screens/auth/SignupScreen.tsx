import React, { useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { User, Mail, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { AppBackground } from '../../components/layout/AppBackground'
import { GlassCard } from '../../components/ui/GlassCard'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { PasswordInput } from '../../components/ui/PasswordInput'
import { useAuthStore } from '../../stores/authStore'
import client from '../../api/client'
import { legalLinks } from '../../help/helpLinks'

type CollegeStatus = 'idle' | 'checking' | 'found' | 'not_found' | 'invalid'

export function SignupScreen() {
  const navigate = useNavigate()
  const signup = useAuthStore((s) => s.signup)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [collegeStatus, setCollegeStatus] = useState<CollegeStatus>('idle')
  const [collegeName, setCollegeName] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const checkEmail = useCallback(async (val: string) => {
    if (!val.includes('@') || !val.includes('.')) return
    setCollegeStatus('checking')
    try {
      const res = await client.get(`/colleges/check-email?email=${encodeURIComponent(val.toLowerCase())}`)
      const { valid, collegeName: cn } = res.data.data
      if (!valid) {
        setCollegeStatus('invalid')
        setCollegeName('')
      } else if (cn) {
        setCollegeStatus('found')
        setCollegeName(cn)
      } else {
        setCollegeStatus('not_found')
        setCollegeName('')
      }
    } catch {
      setCollegeStatus('idle')
    }
  }, [])

  function validate() {
    const e: Record<string, string> = {}
    if (!fullName.trim() || fullName.trim().length < 2) e.fullName = 'Enter your full name'
    else if (fullName.trim().length > 50) e.fullName = 'Full name must be 50 characters or fewer'
    if (!email.trim()) e.email = 'Email is required'
    else if (collegeStatus === 'invalid') e.email = 'Must be a college/university email'
    if (!password) e.password = 'Password is required'
    else if (password.length < 8) e.password = 'Password must be 8+ characters'
    if (password !== confirm) e.confirm = 'Passwords do not match'
    if (!agreed) e.agreed = 'Please accept the terms'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const { email: signedEmail } = await signup({
        email: email.toLowerCase().trim(),
        password,
        full_name: fullName.trim(),
        policy_accepted: true,
      })
      toast.success('Account created! Check your email for a verification code.')
      navigate('/verify-email', { state: { email: signedEmail } })
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  const collegeIcon = () => {
    if (collegeStatus === 'checking') return <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
    if (collegeStatus === 'found') return <CheckCircle size={16} color="#22C55E" />
    if (collegeStatus === 'invalid' || collegeStatus === 'not_found') return <AlertCircle size={16} color="#F59E0B" />
    return <Mail size={18} />
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
        <div style={{ marginBottom: '28px', textAlign: 'center' }}>
          <img src="/campnect-logo.png" alt="Campnect" width={52} height={52} style={{ marginBottom: '10px', borderRadius: 14, objectFit: 'cover' }} />
          <h1 style={{
            fontSize: '26px',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #fff 30%, rgba(210,210,215,0.80))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Join Campnect
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '6px', fontSize: '14px' }}>
            Exclusively for verified college students
          </p>
        </div>

        <GlassCard style={{ width: '100%', maxWidth: '420px' }} padding="28px">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input
              label="Full name"
              placeholder="Alex Chen"
              value={fullName}
              onChange={(e) => setFullName(e.target.value.slice(0, 50))}
              maxLength={50}
              error={errors.fullName}
              leftIcon={<User size={18} />}
              autoComplete="name"
            />
            <div>
              <Input
                label="College email"
                type="email"
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => checkEmail(email)}
                error={errors.email}
                leftIcon={collegeIcon()}
                autoComplete="email"
                autoCapitalize="none"
              />
              {collegeStatus === 'found' && (
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={13} color="#22C55E" />
                  <span style={{ fontSize: '12px', color: '#22C55E' }}>{collegeName}</span>
                </div>
              )}
              {collegeStatus === 'not_found' && (
                <p style={{ fontSize: '12px', color: '#F59E0B', marginTop: '6px' }}>
                  College not in our directory yet —{' '}
                  <a href="mailto:colleges@campnect.app" style={{ color: 'rgba(210,210,215,0.90)', textDecoration: 'none' }}>
                    request your college
                  </a>
                </p>
              )}
              {collegeStatus === 'invalid' && (
                <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '6px' }}>
                  Please use your official college email (.edu, .ac.in, etc.)
                </p>
              )}
            </div>

            <PasswordInput
              label="Password"
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              showStrength
              autoComplete="new-password"
            />
            <PasswordInput
              label="Confirm password"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={errors.confirm}
              autoComplete="new-password"
            />

            {/* Terms */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <div
                onClick={() => setAgreed((a) => !a)}
                style={{
                  width: '20px',
                  height: '20px',
                  minWidth: '20px',
                  borderRadius: '6px',
                  border: `1.5px solid ${agreed ? 'rgba(63,63,70,0.80)' : errors.agreed ? '#EF4444' : 'rgba(255,255,255,0.20)'}`,
                  background: agreed ? 'rgba(24,24,27,0.85)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 200ms',
                  marginTop: '1px',
                  cursor: 'pointer',
                }}
              >
                {agreed && (
                  <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                I agree to Campnect's{' '}
                <a href={legalLinks[1].url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-blue-light)' }}>Terms of Service</a>
                {', '}
                <a href={legalLinks[0].url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-blue-light)' }}>Privacy Policy</a>
                {', '}
                <a href={legalLinks[2].url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-blue-light)' }}>Community Guidelines</a>
                {', and '}
                <a href={legalLinks[3].url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-blue-light)' }}>Cookie and Storage Policy</a>
              </span>
            </label>
            {errors.agreed && (
              <span style={{ fontSize: '12px', color: '#EF4444', marginTop: '-8px' }}>{errors.agreed}</span>
            )}

            <Button type="submit" fullWidth disabled={loading} style={{ marginTop: '4px' }}>
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </GlassCard>

        <p style={{ marginTop: '24px', marginBottom: 'max(16px, env(safe-area-inset-bottom, 16px))', fontSize: '14px', color: 'var(--color-text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--color-blue-light)', textDecoration: 'none', fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AppBackground>
  )
}
