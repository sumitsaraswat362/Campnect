import React, { useState } from 'react'
import { radii, typography, motion } from '../../styles/tokens'

type ButtonVariant = 'primary' | 'ghost' | 'text' | 'outline' | 'glass' | 'purple'
type ButtonSize    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:   ButtonVariant
  size?:      ButtonSize
  fullWidth?: boolean
  children:   React.ReactNode
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '10px 20px', fontSize: typography.sizes.sm,  height: '40px' },
  md: { padding: '14px 28px', fontSize: typography.sizes.base, height: '52px' },
  lg: { padding: '16px 36px', fontSize: typography.sizes.md,  height: '58px' },
}

export function Button({
  variant   = 'primary',
  size      = 'md',
  fullWidth = false,
  children,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const [pressed, setPressed] = useState(false)

  const base: React.CSSProperties = {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '8px',
    border:         'none',
    borderRadius:   radii.pill,
    fontFamily:     typography.fontDisplay,
    fontWeight:     typography.weights.semi,
    letterSpacing:  '0.01em',
    cursor:         disabled ? 'not-allowed' : 'pointer',
    transition:     `all ${motion.base} ${motion.easeSmooth}`,
    userSelect:     'none',
    whiteSpace:     'nowrap',
    width:          fullWidth ? '100%' : undefined,
    opacity:        disabled ? 0.42 : 1,
    transform:      pressed && !disabled ? 'scale(0.96)' : 'scale(1)',
    WebkitTapHighlightColor: 'transparent',
    position:       'relative',
    overflow:       'hidden',
    ...sizeStyles[size],
  }

  const variants: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      background:  'var(--color-lime)',
      color:       'var(--color-on-lime, #FFFFFF)',
      fontWeight:  700,
      boxShadow:   pressed
        ? 'var(--shadow-btn)'
        : 'var(--shadow-btn-hover)',
    },
    purple: {
      background:  'linear-gradient(135deg, var(--color-purple-core) 0%, var(--color-purple-bright) 100%)',
      color:       '#FFFFFF',
      fontWeight:  700,
      boxShadow:   pressed
        ? '0 2px 12px var(--color-purple-glow-sm)'
        : 'var(--shadow-purple)',
    },
    glass: {
      background:           'var(--color-surface)',
      color:                'var(--color-text-primary)',
      border:               '1px solid var(--color-border)',
      boxShadow:            pressed ? 'none' : 'var(--shadow-card)',
    },
    ghost: {
      background:           'var(--color-surface-hover)',
      color:                'var(--color-text-primary)',
      border:               '1px solid var(--color-border)',
      boxShadow:            'none',
    },
    outline: {
      background:  'transparent',
      color:       'var(--color-text-primary)',
      border:      '1.5px solid var(--color-border-strong)',
      boxShadow:   'none',
    },
    text: {
      background:  'transparent',
      color:       'var(--color-text-muted)',
      boxShadow:   'none',
      padding:     '8px 12px',
      height:      'auto',
    },
  }

  return (
    <button
      {...rest}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      {/* shimmer for primary buttons */}
      {variant === 'primary' && !disabled && (
        <span aria-hidden style={{
          position:   'absolute',
          inset:      0,
          background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.22) 50%, transparent 70%)',
          backgroundSize: '200% 100%',
          animation:  'shimmer 3s infinite ease-in-out',
          borderRadius: 'inherit',
          pointerEvents: 'none',
        }} />
      )}
      {children}
    </button>
  )
}
