import { useEffect, useState } from 'react'
import { SlideLayout }   from '../SlideLayout'
import { GlassCard }     from '../../../components/ui/GlassCard'
import { Button }        from '../../../components/ui/Button'
import { colors, typography } from '../../../styles/tokens'

interface Props {
  step: number; total: number
  onNext: () => void; onSkip: () => void; exiting: boolean
}

export function GetStartedSlide({ step, total, onNext, onSkip, exiting }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t) }, [])
  const visible = mounted && !exiting

  return (
    <SlideLayout step={step} total={total} onSkip={onSkip} exiting={exiting} hideDots={false}>
      {/* Header */}
      <div
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
          transitionDelay: '0.05s',
          textAlign: 'center',
          marginBottom: '28px',
        }}
      >
        <p style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, color: colors.textAccent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
          Ready to join?
        </p>
        <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary, letterSpacing: '-0.025em', lineHeight: 1.2, marginBottom: '12px' }}>
          Your college life,<br />elevated.
        </h2>
        <p style={{ fontSize: typography.sizes.base, color: colors.textSecondary, lineHeight: 1.6, maxWidth: '290px', margin: '0 auto' }}>
          Join thousands of students already building real connections on campus.
        </p>
      </div>

      {/* Sign-up options */}
      <div
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
          transitionDelay: '0.15s',
          marginBottom: '16px',
        }}
      >
        <GlassCard padding="20px 24px" glow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Email requirement notice */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                background: 'linear-gradient(135deg, rgba(24,24,27,0.25), rgba(24,24,27,0.12))',
                border: '1px solid rgba(24,24,27,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="4" width="14" height="10" rx="2.5" stroke="rgba(210,210,215,0.90)" strokeWidth="1.6"/>
                  <path d="M2 7l7 4 7-4" stroke="rgba(210,210,215,0.90)" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semi, color: colors.textPrimary, lineHeight: 1.3 }}>
                  Use your .edu email
                </p>
                <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, lineHeight: 1.4 }}>
                  Verification keeps Campnect students-only
                </p>
              </div>
            </div>

            <div style={{ height: '1px', background: 'var(--color-surface)', margin: '4px 0' }} />

            {/* Steps */}
            {[
              { n: '1', text: 'Sign up with your college email' },
              { n: '2', text: 'Verify and complete your profile' },
              { n: '3', text: 'Find your campus community' },
            ].map((s) => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '24px', height: '24px', borderRadius: '9999px', flexShrink: 0,
                  background: 'linear-gradient(135deg, #18181B, rgba(210,210,215,0.90))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, color: 'var(--color-text-primary)',
                  boxShadow: '0 2px 8px rgba(24,24,27,0.40)',
                }}>
                  {s.n}
                </div>
                <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, fontWeight: typography.weights.medium }}>
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Primary CTA */}
      <div
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
          transitionDelay: '0.26s',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <Button variant="primary" size="lg" fullWidth onClick={onNext}>
          Create Your Account
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Button>
        <Button variant="ghost" size="md" fullWidth onClick={onSkip}>
          I already have an account
        </Button>
      </div>

      {/* Legal */}
      <div
        style={{
          opacity:    visible ? 1 : 0,
          transition: 'opacity 0.5s ease',
          transitionDelay: '0.34s',
          textAlign: 'center',
          marginTop: '16px',
        }}
      >
        <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, lineHeight: 1.6 }}>
          By continuing you agree to our{' '}
          <span style={{ color: colors.textAccent }}>Terms of Service</span>{' '}
          and{' '}
          <span style={{ color: colors.textAccent }}>Privacy Policy</span>
        </p>
      </div>
    </SlideLayout>
  )
}
