import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Building2, Check, ChevronDown, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { collegesApi, type College } from '../../api/colleges'
import { colors, radii, typography } from '../../styles/tokens'
import { PeopleRowsSkeleton } from '../shared/AppSkeletons'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

type EventCollegePickerProps = {
  value: string
  fallbackName?: string
  onChange: (value: string) => void
}

export function EventCollegePicker({ value, fallbackName, onChange }: EventCollegePickerProps) {
  const [colleges, setColleges] = useState<College[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  useBackDismiss(open, () => setOpen(false), 150)

  const loadColleges = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const response = await collegesApi.getAll({ limit: 500, page: 1 })
      setColleges(Array.isArray(response.data?.data) ? response.data.data : [])
    } catch {
      setLoadError(true)
      toast.error('Unable to load the college list')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadColleges() }, [])

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

  const filtered = colleges.filter((college) => {
    const haystack = `${college.name} ${college.short_name || ''} ${college.city || ''}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })
  const selected = colleges.find((college) => college.id === value)
  const selectedName = selected?.name || fallbackName || 'Choose a college'

  return (
    <div ref={containerRef} style={containerStyle}>
      <label style={labelStyle}>Event campus</label>
      <p style={hintStyle}>CEO accounts can publish inside-campus events for any verified college.</p>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} style={{ ...triggerStyle, ...(open ? openTriggerStyle : {}) }}>
        <Building2 size={16} color={colors.lime} aria-hidden="true" />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{selectedName}</span>
        <ChevronDown size={15} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.78, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }} />
      </button>
      {open && (
        <div role="listbox" aria-label="Event campus options" style={menuStyle}>
          <div style={searchStyle}>
            <Search size={14} color={colors.textMuted} aria-hidden="true" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search colleges" style={searchInputStyle} />
          </div>
          {loading && <PeopleRowsSkeleton count={3} action={false} compact />}
          {!loading && loadError && <button type="button" onClick={() => void loadColleges()} style={retryStyle}>Try again</button>}
          {!loading && !loadError && filtered.length === 0 && <span style={emptyStyle}>No matching colleges</span>}
          {!loading && !loadError && filtered.map((college) => {
            const isSelected = college.id === value
            return (
              <button key={college.id} type="button" role="option" aria-selected={isSelected} onClick={() => { onChange(college.id); setOpen(false); setQuery('') }} style={{ ...optionStyle, ...(isSelected ? selectedOptionStyle : {}) }}>
                <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}><strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{college.name}</strong><small style={{ display: 'block', marginTop: 3, color: isSelected ? 'rgba(187,255,0,0.72)' : colors.textMuted }}>{[college.short_name, college.city].filter(Boolean).join(' · ') || 'Verified college'}</small></span>
                {isSelected && <Check size={15} color={colors.lime} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const containerStyle: CSSProperties = { position: 'relative', minWidth: 0 }
const labelStyle: CSSProperties = { display: 'block', margin: '0 0 5px', color: colors.textSecondary, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }
const hintStyle: CSSProperties = { margin: '0 0 8px', color: colors.textMuted, fontSize: 10, lineHeight: 1.4 }
const triggerStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', minHeight: 48, padding: '0 13px', boxSizing: 'border-box', border: `1px solid ${colors.border}`, borderRadius: radii.md, background: 'rgba(255,255,255,0.045)', color: colors.textPrimary, cursor: 'pointer', fontFamily: typography.fontBody, fontSize: 13, fontWeight: 800, WebkitTapHighlightColor: 'transparent' }
const openTriggerStyle: CSSProperties = { borderColor: 'rgba(187,255,0,0.65)', background: colors.limeDim }
const menuStyle: CSSProperties = { position: 'absolute', top: 'calc(100% + 7px)', left: 0, right: 0, zIndex: 55, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 290, overflowY: 'auto', padding: 6, boxSizing: 'border-box', border: `1px solid ${colors.borderStrong}`, borderRadius: radii.lg, background: '#17141f', boxShadow: '0 20px 42px rgba(0,0,0,0.48)' }
const searchStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, minHeight: 38, padding: '0 9px', border: `1px solid ${colors.border}`, borderRadius: radii.md, background: 'rgba(255,255,255,0.045)' }
const searchInputStyle: CSSProperties = { width: '100%', minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: colors.textPrimary, fontFamily: typography.fontBody, fontSize: 12 }
const optionStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 48, padding: '7px 9px', boxSizing: 'border-box', border: 0, borderRadius: 10, background: 'transparent', color: colors.textSecondary, cursor: 'pointer', fontFamily: typography.fontBody, fontSize: 12 }
const selectedOptionStyle: CSSProperties = { background: colors.limeDim, color: colors.lime }
const emptyStyle: CSSProperties = { padding: '14px 8px', color: colors.textMuted, fontSize: 11, textAlign: 'center' }
const retryStyle: CSSProperties = { minHeight: 36, border: 0, borderRadius: 9, background: colors.limeDim, color: colors.lime, cursor: 'pointer', fontFamily: typography.fontBody, fontSize: 11, fontWeight: 800 }