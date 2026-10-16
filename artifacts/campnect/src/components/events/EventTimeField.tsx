import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

type EventTimeFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}

type TimePart = 'hour' | 'minute' | 'period'

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1))
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))
const PERIODS = ['AM', 'PM']

export type TimeDraft = {
  hour: string
  minute: string
  period: string
}

export function EventTimeField({ label, value, onChange, required }: EventTimeFieldProps) {
  const [draft, setDraft] = useState(() => parseTime(value))
  const [openPart, setOpenPart] = useState<TimePart | null>(null)
  const groupRef = useRef<HTMLDivElement | null>(null)
  useBackDismiss(openPart !== null, () => setOpenPart(null), 150)

  useEffect(() => {
    setDraft(parseTime(value))
  }, [value])

  useEffect(() => {
    if (!openPart) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!groupRef.current?.contains(event.target as Node)) setOpenPart(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPart(null)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openPart])

  const update = (part: TimePart, next: string) => {
    const nextSelection = updateTimeDraft(draft, part, next)
    setDraft(nextSelection.draft)
    onChange(nextSelection.value)
    setOpenPart(null)
  }

  const complete = Boolean(draft.hour && draft.minute && draft.period)
  const selectedTime = complete ? `${draft.hour}:${draft.minute} ${draft.period}` : ''

  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>{label}{required ? ' *' : ''}</label>
      <div ref={groupRef} style={groupStyle}>
        {renderPicker('hour', draft.hour || 'Hour', HOURS)}
        <span aria-hidden="true" style={colonStyle}>:</span>
        {renderPicker('minute', draft.minute || 'Min', MINUTES)}
        {renderPicker('period', draft.period || 'AM/PM', PERIODS)}
      </div>
      <span aria-live="polite" style={helperStyle}>
        {selectedTime ? `Selected time: ${selectedTime}` : 'Choose hour, minute, and AM/PM'}
      </span>
    </div>
  )

  function renderPicker(part: TimePart, labelText: string, options: string[]) {
    const isOpen = openPart === part
    const selected = draft[part]

    return (
      <div style={pickerSlotStyle} key={part}>
        <button
          type="button"
          aria-label={`${label} ${part}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setOpenPart(isOpen ? null : part)}
          style={{ ...triggerStyle, ...(selected ? selectedTriggerStyle : {}), ...(isOpen ? openTriggerStyle : {}) }}
        >
          <span style={triggerTextStyle}>{labelText}</span>
          <ChevronDown size={14} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.78, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }} />
        </button>
        {isOpen && (
          <div role="listbox" aria-label={`${label} ${part} options`} style={menuStyle}>
            {options.map((option) => {
              const isSelected = option === selected
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => update(part, option)}
                  style={{ ...optionStyle, ...(isSelected ? selectedOptionStyle : {}) }}
                >
                  {option}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }
}

export function parseTime(value: string): TimeDraft {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return { hour: '', minute: '', period: '' }
  const [rawHour, minute] = value.split(':')
  const hourNumber = Number(rawHour)
  return {
    hour: String(hourNumber % 12 || 12),
    minute,
    period: hourNumber >= 12 ? 'PM' : 'AM',
  }
}

export function updateTimeDraft(
  draft: TimeDraft,
  part: TimePart,
  next: string,
): { draft: TimeDraft; value: string } {
  const nextDraft = { ...draft, [part]: next }
  const { hour, minute, period } = nextDraft
  if (!hour || !minute || !period) return { draft: nextDraft, value: '' }

  let hour24 = Number(hour) % 12
  if (period === 'PM') hour24 += 12
  return { draft: nextDraft, value: `${String(hour24).padStart(2, '0')}:${minute}` }
}

const labelStyle: CSSProperties = {
  display: 'block',
  margin: '0 0 7px',
  color: 'var(--color-text-secondary, #aeb5c2)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const groupStyle: CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr) minmax(0, 1.12fr)',
  alignItems: 'center',
  gap: 4,
  minWidth: 0,
  width: '100%',
  padding: 4,
  boxSizing: 'border-box',
  border: '1px solid var(--color-border, rgba(255,255,255,0.12))',
  borderRadius: 14,
  background: 'rgba(255,255,255,0.045)',
}

const pickerSlotStyle: CSSProperties = {
  position: 'relative',
  minWidth: 0,
}

const triggerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  width: '100%',
  minWidth: 0,
  height: 40,
  padding: '0 7px',
  border: '1px solid transparent',
  borderRadius: 10,
  outline: 'none',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--color-text-secondary, #aeb5c2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 800,
  WebkitTapHighlightColor: 'transparent',
}

const selectedTriggerStyle: CSSProperties = {
  color: 'var(--color-text-primary, #fff)',
}

const openTriggerStyle: CSSProperties = {
  borderColor: 'rgba(187,255,0,0.62)',
  background: 'rgba(187,255,0,0.09)',
  color: 'var(--color-lime, #bbff00)',
}

const triggerTextStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const colonStyle: CSSProperties = {
  flex: '0 0 auto',
  color: 'var(--color-text-muted, #747b89)',
  fontSize: 15,
  fontWeight: 900,
}

const menuStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  zIndex: 40,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  maxHeight: 220,
  overflowY: 'auto',
  padding: 4,
  boxSizing: 'border-box',
  border: '1px solid rgba(187,255,0,0.36)',
  borderRadius: 12,
  background: '#18151f',
  boxShadow: '0 16px 32px rgba(0,0,0,0.42)',
}

const optionStyle: CSSProperties = {
  width: '100%',
  minHeight: 34,
  padding: '0 7px',
  border: 0,
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--color-text-secondary, #aeb5c2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 750,
}

const selectedOptionStyle: CSSProperties = {
  background: 'var(--color-lime-dim, rgba(187,255,0,0.14))',
  color: 'var(--color-lime, #bbff00)',
}

const helperStyle: CSSProperties = {
  display: 'block',
  minHeight: 15,
  marginTop: 5,
  color: 'var(--color-text-muted, #747b89)',
  fontSize: 10,
}