import type { CSSProperties } from 'react'

interface LoadingSpinnerProps {
  size?: number
  color?: string
}

export function LoadingSpinner({ size = 28, color = 'var(--color-lime)' }: LoadingSpinnerProps) {
  return (
    <div
      style={{
        width:  size,
        height: size,
        borderRadius: '50%',
        border: `2.5px solid rgba(255,255,255,0.10)`,
        borderTopColor: color,
        animation: 'spin 700ms linear infinite',
        WebkitAnimation: 'spin 700ms linear infinite',
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
        willChange: 'transform',
        flexShrink: 0,
      } as CSSProperties}
    />
  )
}
