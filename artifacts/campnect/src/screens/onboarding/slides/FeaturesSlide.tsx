import { useEffect, useState } from 'react'
import { SlideLayout }   from '../SlideLayout'
import { GlassCard }     from '../../../components/ui/GlassCard'
import { Button }        from '../../../components/ui/Button'
import { colors, typography } from '../../../styles/tokens'

interface Props {
  step: number; total: number
  onNext: () => void; onSkip: () => void; exiting: boolean
}

const features = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="8" r="3.5" stroke="rgba(210,210,215,0.90)" strokeWidth="1.8"/>
        <circle cx="4.5" cy="9.5" r="2.5" stroke="rgba(63,63,70,0.90)" strokeWidth="1.6" opacity="0.7"/>
        <circle cx="17.5" cy="9.5" r="2.5" stroke="rgba(63,63,70,0.90)" strokeWidth="1.6" opacity="0.7"/>
        <path d="M2 18c0-2.5 2-4 4.5-4M20 18c0-2.5-2-4-4.5-4M6.5 18c0-2.8 2-4.5 4.5-4.5s4.5 1.7 4.5 4.5" stroke="rgba(210,210,215,0.90)" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    title: 'Your Campus, Your Community',
    desc:  'Connect with verified classmates, join department groups, and build your college network.',
    accent: 'rgba(63,63,70,0.90)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="4" width="13" height="10" rx="3" stroke="rgba(210,210,215,0.90)" strokeWidth="1.8"/>
        <path d="M15 8l5 2.5L15 13V8z" stroke="rgba(63,63,70,0.90)" strokeWidth="1.6" strokeLinejoin="round" opacity="0.85"/>
        <path d="M5 17h8M7 17v-3" stroke="rgba(210,210,215,0.90)" strokeWidth="1.6" strokeLinecap="round" opacity="0.6"/>
      </svg>
    ),
    title: 'Stories & Campus Moments',
    desc:  'Share your college life — classes, events, late-night study sessions — with students who get it.',
    accent: '#18181B',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M3 7h16M3 11h10M3 15h7" stroke="rgba(210,210,215,0.90)" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="17" cy="15" r="3" stroke="rgba(63,63,70,0.90)" strokeWidth="1.6"/>
        <path d="M15.5 15l1 1 2-2" stroke="rgba(63,63,70,0.90)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Verified-Only Interactions',
    desc:  'Every person on Campnect is a real, verified college student — no bots, no strangers.',
    accent: 'rgba(210,210,215,0.90)',
  },
]

export function FeaturesSlide({ step, total, onNext, onSkip, exiting }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t) }, [])
  const visible = mounted && !exiting

  return (
    <SlideLayout step={step} total={total} onSkip={onSkip} exiting={exiting}>
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
          Why Campnect
        </p>
        <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary, letterSpacing: '-0.025em', lineHeight: 1.2 }}>
          Built for student life,<br />not everyone's life
        </h2>
      </div>

      {/* Feature cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
        {features.map((f, i) => (
          <div
            key={i}
            style={{
              opacity:    visible ? 1 : 0,
              transform:  visible ? 'translateX(0)' : 'translateX(-20px)',
              transition: 'opacity 0.45s ease, transform 0.45s cubic-bezier(0.34,1.56,0.64,1)',
              transitionDelay: `${0.12 + i * 0.09}s`,
            }}
          >
            <GlassCard padding="18px 20px">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                {/* Icon */}
                <div style={{
                  flexShrink: 0,
                  width: '44px', height: '44px',
                  borderRadius: '12px',
                  background: `rgba(24,24,27,0.14)`,
                  border: `1px solid rgba(24,24,27,0.18)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {f.icon}
                </div>
                {/* Text */}
                <div>
                  <p style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semi, color: colors.textPrimary, marginBottom: '4px', lineHeight: 1.3 }}>
                    {f.title}
                  </p>
                  <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, lineHeight: 1.5 }}>
                    {f.desc}
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
          transitionDelay: '0.40s',
        }}
      >
        <Button variant="primary" size="lg" fullWidth onClick={onNext}>
          Continue
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Button>
      </div>
    </SlideLayout>
  )
}
