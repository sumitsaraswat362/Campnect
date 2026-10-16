import React from 'react'
import { radii, shadows } from '../../styles/tokens'

interface GlassCardProps {
  children:   React.ReactNode
  style?:     React.CSSProperties
  className?: string
  padding?:   string
  /** Adds purple glow shadow */
  glow?:      boolean
  /** Makes the glass surface more opaque/prominent */
  elevated?:  boolean
  onClick?:   () => void
}

export function GlassCard({
  children,
  style,
  className,
  padding  = '24px',
  glow     = false,
  elevated = false,
  onClick,
}: GlassCardProps) {
  const bg = elevated
    ? 'rgba(255, 255, 255, 0.06)'
    : 'rgba(255, 255, 255, 0.04)'

  const border = elevated
    ? '1px solid rgba(255, 255, 255, 0.12)'
    : '1px solid rgba(255, 255, 255, 0.08)'

  const shadow = glow
    ? `${shadows.glass}, ${shadows.glow}`
    : shadows.glass

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background:           bg,
        backdropFilter:       'blur(20px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
        border,
        borderRadius:         radii.xl,
        boxShadow:            shadow,
        padding,
        position:             'relative',
        overflow:             'hidden',
        cursor:               onClick ? 'pointer' : undefined,
        transition:           onClick ? 'background 180ms ease, box-shadow 180ms ease' : undefined,
        ...style,
      }}
    >
      {/* Top-edge glass highlight */}
      <div
        aria-hidden
        style={{
          position:      'absolute',
          top:           0, left: '10%', right: '10%',
          height:        '1px',
          background:    'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)',
          pointerEvents: 'none',
        }}
      />
      {/* Inner radial glow when elevated */}
      {elevated && (
        <div
          aria-hidden
          style={{
            position:      'absolute',
            top:           '-40%', left:  '-20%',
            width:         '60%',  height: '80%',
            background:    'radial-gradient(ellipse, rgba(24,24,27,0.07) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
      )}
      {children}
    </div>
  )
}
