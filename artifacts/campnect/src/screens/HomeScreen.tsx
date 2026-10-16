import { AppBackground } from '../components/layout/AppBackground'
import { GlassCard }     from '../components/ui/GlassCard'
import { colors, typography } from '../styles/tokens'

/**
 * Placeholder home screen — shown after onboarding completes.
 * Will be replaced with the full feed + navigation shell in the next phase.
 */
export function HomeScreen() {
  return (
    <AppBackground>
      <div style={{
        minHeight:      '100%',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '24px',
        gap:            '24px',
      }}>
        <GlassCard padding="36px 32px" glow style={{ maxWidth: '380px', width: '100%', textAlign: 'center' }}>
          {/* Logo */}
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: 'linear-gradient(135deg, #18181B 0%, #3F3F46 60%, #C44DCC 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 8px 24px rgba(24,24,27,0.45)',
          }}>
            <svg width="30" height="30" viewBox="0 0 42 42" fill="none">
              <path d="M30 13.5C27.5 11 24 9.5 21 9.5C14.1 9.5 8.5 15.1 8.5 22C8.5 28.9 14.1 34.5 21 34.5C24 34.5 27.5 33 30 30.5"
                stroke="white" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
              <circle cx="30" cy="13.5" r="2.8" fill="white" opacity="0.9"/>
              <circle cx="30" cy="30.5" r="2.8" fill="white" opacity="0.9"/>
            </svg>
          </div>

          <h2 style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary, letterSpacing: '-0.02em', marginBottom: '10px' }}>
            You're in
          </h2>
          <p style={{ fontSize: typography.sizes.base, color: colors.textSecondary, lineHeight: 1.6 }}>
            Onboarding complete. The full campus feed and navigation shell are coming next.
          </p>

          <div style={{ marginTop: '24px', padding: '14px 18px', borderRadius: '12px', background: 'rgba(24,24,27,0.10)', border: '1px solid rgba(24,24,27,0.18)' }}>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textAccent, fontWeight: typography.weights.medium }}>
              Design system · Onboarding · Routing ✓
            </p>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: '4px' }}>
              Feed · Auth · Profiles → coming up
            </p>
          </div>
        </GlassCard>
      </div>
    </AppBackground>
  )
}
