import React, { forwardRef, useState } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:     string
  error?:     string
  hint?:      string
  leftIcon?:  React.ReactNode
  rightIcon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, style, className, ...rest }, ref) => {
    const [focused, setFocused] = useState(false)

    const borderColor = error
      ? 'rgba(239, 68, 68, 0.80)'
      : focused
        ? 'rgba(63,63,70, 0.75)'
        : 'var(--color-input-border)'

    const glowShadow = focused && !error
      ? '0 0 0 3px rgba(24,24,27, 0.18), 0 2px 12px rgba(0,0,0,0.25)'
      : error
        ? '0 0 0 3px rgba(239, 68, 68, 0.14)'
        : '0 2px 8px rgba(0,0,0,0.20)'

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        {label && (
          <label style={{
            fontSize:      '13px',
            fontWeight:    500,
            color:         focused ? 'rgba(63,63,70,0.90)' : 'var(--color-text-secondary)',
            letterSpacing: '0.01em',
            transition:    'color 180ms ease',
            fontFamily:    'var(--font-display)',
          }}>
            {label}
          </label>
        )}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {leftIcon && (
            <span style={{
              position:     'absolute',
              left:         '14px',
              color:        focused ? 'rgba(63,63,70,0.90)' : 'var(--color-input-icon)',
              transition:   'color 200ms ease',
              display:      'flex',
              pointerEvents:'none',
              zIndex:       1,
            }}>
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            {...rest}
            onFocus={(e) => { setFocused(true); rest.onFocus?.(e) }}
            onBlur={(e) => { setFocused(false); rest.onBlur?.(e) }}
            style={{
              width:                '100%',
              height:               '52px',
              padding:              leftIcon ? '0 16px 0 44px' : rightIcon ? '0 44px 0 16px' : '0 16px',
              background:           focused
                ? 'rgba(255,255,255,0.065)'
                : 'var(--color-input-bg)',
              border:               `1.5px solid ${borderColor}`,
              borderRadius:         '14px',
              color:                'var(--color-input-text)',
              fontSize:             '15px',
              fontFamily:           'var(--font-family)',
              outline:              'none',
              transition:           'border-color 200ms ease, box-shadow 200ms ease, background 200ms ease',
              boxShadow:            glowShadow,
              backdropFilter:       'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              ...style,
            }}
          />
          {rightIcon && (
            <span style={{
              position: 'absolute',
              right:    '14px',
              color:    'var(--color-input-icon)',
              display:  'flex',
              zIndex:   1,
            }}>
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <span style={{
            fontSize: '12px',
            color:    '#EF4444',
            display:  'flex',
            alignItems: 'center',
            gap:      '4px',
            animation: 'fadeIn 200ms ease',
          }}>
            {error}
          </span>
        )}
        {hint && !error && (
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {hint}
          </span>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
