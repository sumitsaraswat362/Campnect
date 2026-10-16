import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { colors, radii, typography } from '../../styles/tokens'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

type EventDateFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function EventDateField({ label, value, onChange, required }: EventDateFieldProps) {
  const selectedDate = parseDateKey(value)
  const today = startOfDay(new Date())
  const todayKey = toDateKey(today)
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => {
    const base = selectedDate || today
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const containerRef = useRef<HTMLDivElement | null>(null)
  useBackDismiss(open, () => setOpen(false), 150)

  useEffect(() => {
    const next = parseDateKey(value)
    if (next) setViewMonth(new Date(next.getFullYear(), next.getMonth(), 1))
  }, [value])

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const firstDay = monthStart.getDay()
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, index) => (
    new Date(viewMonth.getFullYear(), viewMonth.getMonth(), index - firstDay + 1)
  ))

  const selectedLabel = selectedDate
    ? selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'Choose a date'

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: 0 }}>
      <label style={labelStyle}>{label}{required ? ' *' : ''}</label>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{ ...triggerStyle, ...(open ? openTriggerStyle : {}) }}
      >
        <CalendarDays size={16} color={colors.lime} aria-hidden="true" />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{selectedLabel}</span>
        <ChevronDown size={15} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.78, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }} />
      </button>

      {open && (
        <div role="dialog" aria-label={`${label} calendar`} style={calendarStyle}>
          <div style={calendarHeaderStyle}>
            <button type="button" aria-label="Previous month" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} style={monthButtonStyle}><ChevronLeft size={17} /></button>
            <strong style={{ color: colors.textPrimary, fontSize: 14 }}>{viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
            <button type="button" aria-label="Next month" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} style={monthButtonStyle}><ChevronRight size={17} /></button>
          </div>
          <div style={weekdayGridStyle}>
            {WEEKDAYS.map((day) => <span key={day} style={weekdayStyle}>{day}</span>)}
          </div>
          <div style={dayGridStyle}>
            {cells.map((date) => {
              const key = toDateKey(date)
              const isCurrentMonth = date.getMonth() === viewMonth.getMonth()
              const isSelected = key === value
              const isToday = key === todayKey
              const isDisabled = key < todayKey
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isDisabled}
                  aria-label={date.toLocaleDateString(undefined, { dateStyle: 'full' })}
                  aria-pressed={isSelected}
                  onClick={() => { onChange(key); setOpen(false) }}
                  style={{
                    ...dayStyle,
                    color: isSelected ? colors.onLime : isCurrentMonth ? colors.textSecondary : 'rgba(174,181,194,0.38)',
                    background: isSelected ? colors.lime : isToday ? 'rgba(63,63,70,0.24)' : 'transparent',
                    border: isToday && !isSelected ? `1px solid ${colors.lime}` : '1px solid transparent',
                    opacity: isDisabled ? 0.38 : 1,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
          <div style={calendarFooterStyle}>
            <button type="button" onClick={() => { onChange(todayKey); setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setOpen(false) }} style={footerButtonStyle}>Today</button>
            <button type="button" onClick={() => { onChange(''); setOpen(false) }} style={footerButtonStyle}>Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}

function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const labelStyle: CSSProperties = {
  display: 'block',
  margin: '0 0 7px',
  color: colors.textSecondary,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const triggerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  minHeight: 48,
  boxSizing: 'border-box',
  padding: '0 13px',
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  outline: 'none',
  background: 'rgba(255,255,255,0.045)',
  color: colors.textPrimary,
  cursor: 'pointer',
  fontFamily: typography.fontBody,
  fontSize: 13,
  fontWeight: 700,
  WebkitTapHighlightColor: 'transparent',
}

const openTriggerStyle: CSSProperties = {
  borderColor: colors.lime,
  background: colors.limeDim,
}

const calendarStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  zIndex: 50,
  padding: 12,
  boxSizing: 'border-box',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radii.lg,
  background: colors.surface,
  boxShadow: '0 20px 42px rgba(0,0,0,0.48)',
}

const calendarHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginBottom: 12,
}

const monthButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  padding: 0,
  border: `1px solid ${colors.border}`,
  borderRadius: '50%',
  background: colors.surfaceHover,
  color: colors.textSecondary,
  cursor: 'pointer',
}

const weekdayGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 3,
  marginBottom: 4,
}

const weekdayStyle: CSSProperties = {
  color: colors.textMuted,
  fontSize: 9,
  fontWeight: 900,
  textAlign: 'center',
  textTransform: 'uppercase',
}

const dayGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 3,
}

const dayStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  aspectRatio: '1',
  minHeight: 32,
  padding: 0,
  border: '1px solid transparent',
  borderRadius: 9,
  background: 'transparent',
  fontFamily: typography.fontBody,
  fontSize: 12,
  fontWeight: 800,
}

const calendarFooterStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: 10,
  paddingTop: 9,
  borderTop: `1px solid ${colors.border}`,
}

const footerButtonStyle: CSSProperties = {
  minHeight: 32,
  padding: '0 8px',
  border: 0,
  background: 'transparent',
  color: colors.lime,
  cursor: 'pointer',
  fontFamily: typography.fontBody,
  fontSize: 11,
  fontWeight: 900,
}