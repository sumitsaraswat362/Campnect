import React from 'react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

/**
 * Glassmorphism empty state — shows a glass-badge icon, title, optional description and CTA.
 * Pass a Lucide icon component as `icon` (or any ReactNode).
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '56px 24px',
      gap:            '14px',
      textAlign:      'center',
      animation:      'fadeIn 300ms var(--ease-smooth)',
    }}>
      {icon && (
        <div style={{
          width:        72,
          height:       72,
          borderRadius: '50%',
          background: 'var(--color-lime-dim)',
          border: '1px solid var(--color-lime)',
          boxShadow: '0 0 18px var(--color-lime-glow, rgba(187,255,0,0.20))',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          animation:    'iconPop 400ms var(--ease-spring)',
        }}>
          {icon}
        </div>
      )}
      <p style={{
        fontSize:   '16px',
        fontWeight: 700,
        fontFamily: 'var(--font-display)',
        color:      'var(--color-text-primary)',
        lineHeight: 1.25,
      }}>
        {title}
      </p>
      {description && (
        <p style={{
          fontSize:  '14px',
          fontFamily:'var(--font-body)',
          color:     'var(--color-text-secondary)',
          maxWidth:  '260px',
          lineHeight: 1.55,
        }}>
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
