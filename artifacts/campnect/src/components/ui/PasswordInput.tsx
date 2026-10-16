import React, { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from './Input'

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  hint?: string
  showStrength?: boolean
}

function getStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++

  if (score <= 1) return { score, label: 'Weak', color: '#EF4444' }
  if (score <= 2) return { score, label: 'Fair', color: '#F59E0B' }
  if (score <= 3) return { score, label: 'Good', color: 'rgba(210,210,215,0.90)' }
  return { score, label: 'Strong', color: '#22C55E' }
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, hint, showStrength = false, value, ...rest }, ref) => {
    const [show, setShow] = useState(false)
    const strength = showStrength && value ? getStrength(String(value)) : null

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        <Input
          ref={ref}
          type={show ? 'text' : 'password'}
          label={label}
          error={error}
          hint={hint}
          value={value}
          rightIcon={
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-muted)', display: 'flex' }}
              tabIndex={-1}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
          {...rest}
        />
        {showStrength && value && String(value).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: '3px',
                    borderRadius: '9999px',
                    background: strength && i <= strength.score
                      ? strength.color
                      : 'rgba(255,255,255,0.1)',
                    transition: 'background 300ms',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: strength?.color }}>{strength?.label}</span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {!strength || strength.score < 2 ? 'Use 8+ chars, uppercase, numbers' : ''}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'
