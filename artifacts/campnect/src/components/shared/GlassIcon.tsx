import React from 'react'

interface GlassIconProps {
  children: React.ReactNode
  size?: number
  /** 'purple' | 'lime' | 'neutral' */
  color?: 'purple' | 'lime' | 'neutral'
  glow?: boolean
  style?: React.CSSProperties
}

const colorMap = {
  purple:  { bg: 'rgba(24,24,27,0.18)', border: 'rgba(24,24,27,0.50)', glow: '0 0 28px rgba(24,24,27,0.25)' },
  lime:    { bg: 'var(--color-lime-dim)',  border: 'var(--color-lime-glow, rgba(187,255,0,0.40))',  glow: '0 0 28px rgba(187,255,0,0.20)' },
  neutral: { bg: 'rgba(255,255,255,0.06)',border: 'var(--color-border-strong)',glow: 'none' },
}

/**
 * Circular frosted-glass badge that wraps a Lucide icon.
 * Used in onboarding steps, empty states, and feature spots.
 */
export function GlassIcon({ children, size = 72, color = 'purple', glow = true, style }: GlassIconProps) {
  const c = colorMap[color]
  return (
    <div
      style={{
        width:          size,
        height:         size,
        borderRadius:   '50%',
        background:     c.bg,
        border:         `1.5px solid ${c.border}`,
        boxShadow:      glow ? c.glow : 'none',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
