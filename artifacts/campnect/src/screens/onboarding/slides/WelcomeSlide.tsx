import { useEffect, useState } from 'react'
import { SlideLayout }   from '../SlideLayout'
import { Button }        from '../../../components/ui/Button'
import { colors, typography } from '../../../styles/tokens'

interface Props {
  step: number; total: number
  onNext: () => void; onSkip: () => void; exiting: boolean
}

export function WelcomeSlide({ step, total, onNext, onSkip, exiting }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t) }, [])

  const visible = mounted && !exiting

  return (
    <SlideLayout step={step} total={total} onSkip={onSkip} exiting={exiting}>
      {/* Logo mark */}
      <div
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.95)',
          transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
          transitionDelay: '0.05s',
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '32px',
        }}
      >
        <div style={{ position: 'relative' }}>
          {/* Outer glow ring */}
          <div style={{
            position: 'absolute', inset: '-12px',
            borderRadius: '9999px',
            background: 'radial-gradient(circle, rgba(24,24,27,0.35) 0%, transparent 70%)',
            filter: 'blur(8px)',
          }} />
          {/* Logo circle */}
          <div style={{
            width: '80px', height: '80px',
            borderRadius: '24px',
            background: 'linear-gradient(135deg, #1D4ED8 0%, rgba(63,63,70,0.90) 60%, rgba(210,210,215,0.90) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(24,24,27,0.50), 0 1px 0 rgba(255,255,255,0.20) inset',
            position: 'relative',
          }}>
            <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
              {/* Stylised C for Campnect */}
              <path
                d="M30 13.5C27.5 11 24 9.5 21 9.5C14.1 9.5 8.5 15.1 8.5 22C8.5 28.9 14.1 34.5 21 34.5C24 34.5 27.5 33 30 30.5"
                stroke="white" strokeWidth="3.2" strokeLinecap="round" fill="none"
              />
              {/* Connection node dots */}
              <circle cx="30" cy="13.5" r="2.8" fill="white" opacity="0.9" />
              <circle cx="30" cy="30.5" r="2.8" fill="white" opacity="0.9" />
              <circle cx="21"  cy="22"  r="2.2" fill="white" opacity="0.55" />
            </svg>
          </div>
        </div>
      </div>

      {/* App name */}
      <div
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
          transitionDelay: '0.12s',
          textAlign:  'center',
          marginBottom: '12px',
        }}
      >
        <h1 style={{
          fontSize:   typography.sizes['4xl'],
          fontWeight: typography.weights.display,
          color:      colors.textPrimary,
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
        }}>
          Camp<span style={{
            background: 'linear-gradient(135deg, rgba(63,63,70,0.90), rgba(210,210,215,0.90))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>nect</span>
        </h1>
      </div>

      {/* Tagline */}
      <div
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
          transitionDelay: '0.20s',
          textAlign:  'center',
          marginBottom: '40px',
        }}
      >
        <p style={{
          fontSize:   typography.sizes.md,
          fontWeight: typography.weights.regular,
          color:      colors.textSecondary,
          lineHeight: 1.6,
          maxWidth:   '280px',
          margin:     '0 auto',
        }}>
          The social space built exclusively for college students — verified, real, yours.
        </p>
      </div>

      {/* Verified badge strip */}
      <div
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
          transitionDelay: '0.28s',
          marginBottom: '36px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(24,24,27,0.12)',
          border: '1px solid rgba(24,24,27,0.25)',
          borderRadius: '9999px',
          padding: '8px 18px',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L8.545 4.545L12.5 5.09L9.75 7.91L10.455 12L7 10.09L3.545 12L4.25 7.91L1.5 5.09L5.455 4.545L7 1Z"
              fill="rgba(63,63,70,0.90)" stroke="rgba(63,63,70,0.90)" strokeWidth="0.5" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, color: colors.textAccent }}>
            Verified students only
          </span>
        </div>
      </div>

      {/* CTA */}
      <div
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
          transitionDelay: '0.34s',
        }}
      >
        <Button variant="primary" size="lg" fullWidth onClick={onNext}>
          Get Started
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Button>
      </div>
    </SlideLayout>
  )
}
