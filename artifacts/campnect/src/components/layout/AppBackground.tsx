import React from 'react'

interface AppBackgroundProps {
  children: React.ReactNode
}

/**
 * Full-screen background with the Campnect purple/magenta radial glow.
 * Used for auth screens. Adapts to light and dark themes via CSS variables.
 */
export function AppBackground({ children }: AppBackgroundProps) {
  return (
    <div
      style={{
        minHeight:  '100%',
        width:      '100%',
        background: 'var(--color-bg)',
        position:   'relative',
        overflowX:  'hidden',
      }}
    >
      {/* Primary glow — top centre */}
      <div
        aria-hidden
        style={{
          position:   'fixed',
          inset:       0,
          background:  'var(--gradient-radial-bg)',
          pointerEvents: 'none',
          zIndex:      0,
        }}
      />
      {/* Secondary glow — bottom centre */}
      <div
        aria-hidden
        style={{
          position:   'fixed',
          inset:       0,
          background:  'var(--gradient-radial-mid)',
          pointerEvents: 'none',
          zIndex:      0,
        }}
      />
      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100%' }}>
        {children}
      </div>
    </div>
  )
}
