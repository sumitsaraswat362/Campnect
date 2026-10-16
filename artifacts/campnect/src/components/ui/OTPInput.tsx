import { useRef, useState, KeyboardEvent, ClipboardEvent } from 'react'

interface OTPInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  error?: boolean
  disabled?: boolean
}

export function OTPInput({ length = 6, value, onChange, error, disabled }: OTPInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const [focusedIndex, setFocusedIndex] = useState(0)
  const digits = value.replace(/\D/g, '').split('').concat(Array(length).fill('')).slice(0, length)

  function handleChange(idx: number, char: string) {
    if (!/^\d*$/.test(char)) return
    if (char.length > 1) {
      const pasted = char.replace(/\D/g, '').slice(0, length)
      onChange(pasted)
      inputRefs.current[Math.min(pasted.length, length - 1)]?.focus()
      return
    }
    const newDigits = [...digits]
    newDigits[idx] = char.slice(-1)
    const newVal = newDigits.join('')
    onChange(newVal)
    if (char && idx < length - 1) {
      inputRefs.current[idx + 1]?.focus()
    }
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (!digits[idx] && idx > 0) {
        const newDigits = [...digits]
        newDigits[idx - 1] = ''
        onChange(newDigits.join(''))
        inputRefs.current[idx - 1]?.focus()
      } else {
        const newDigits = [...digits]
        newDigits[idx] = ''
        onChange(newDigits.join(''))
      }
    }
    if (e.key === 'ArrowLeft' && idx > 0) inputRefs.current[idx - 1]?.focus()
    if (e.key === 'ArrowRight' && idx < length - 1) inputRefs.current[idx + 1]?.focus()
  }

  function handlePaste(e: ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (text) {
      onChange(text.padEnd(length, '').slice(0, length))
      const nextIdx = Math.min(text.length, length - 1)
      inputRefs.current[nextIdx]?.focus()
    }
  }

  return (
    <div
      role="group"
      aria-label={`Enter ${length}-digit verification code`}
      style={{ display: 'flex', width: '100%', maxWidth: '340px', gap: 'clamp(6px, 2.2vw, 10px)', justifyContent: 'center' }}
    >
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => { inputRefs.current[idx] = el }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={`Verification code digit ${idx + 1} of ${length}`}
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          onFocus={(e) => { setFocusedIndex(idx); e.target.select() }}
          onBlur={() => setFocusedIndex(-1)}
          style={{
            flex: '1 1 0',
            width: '0',
            minWidth: '0',
            maxWidth: '48px',
            height: 'clamp(50px, 14vw, 56px)',
            boxSizing: 'border-box',
            textAlign: 'center',
            fontSize: 'clamp(19px, 5.5vw, 22px)',
            fontWeight: 700,
            fontFamily: 'var(--font-family)',
            color: error ? '#EF4444' : 'var(--color-text-primary)',
            background: digit ? 'var(--color-surface-hover)' : 'var(--color-surface)',
            border: `1.5px solid ${error ? '#EF4444' : focusedIndex === idx ? 'var(--color-lime)' : digit ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
            borderRadius: '14px',
            outline: focusedIndex === idx ? '3px solid var(--color-lime-soft, rgba(187,255,0,0.14))' : 'none',
            outlineOffset: '2px',
            transition: 'all 200ms',
            cursor: disabled ? 'not-allowed' : 'text',
            opacity: disabled ? 0.5 : 1,
          }}
        />
      ))}
    </div>
  )
}
