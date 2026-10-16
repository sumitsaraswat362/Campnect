import { colors, radii, motion } from '../../styles/tokens'

interface ProgressDotsProps {
  total:   number
  current: number
}

export function ProgressDots({ total, current }: ProgressDotsProps) {
  return (
    <div
      role="tablist"
      aria-label="Onboarding progress"
      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
    >
      {Array.from({ length: total }, (_, i) => {
        const active = i === current
        return (
          <div
            key={i}
            role="tab"
            aria-selected={active}
            aria-label={`Step ${i + 1} of ${total}`}
            style={{
              width:        active ? '24px' : '7px',
              height:       '7px',
              borderRadius: radii.pill,
              background:   active
                ? 'linear-gradient(90deg, #18181B, rgba(210,210,215,0.90))'
                : colors.textMuted,
              transition:   `all ${motion.slow} ${motion.easeSpring}`,
              boxShadow:    active ? '0 0 8px rgba(24,24,27,0.55)' : 'none',
            }}
          />
        )
      })}
    </div>
  )
}
