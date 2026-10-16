import { useEffect, useMemo, useState } from 'react'
import { Bookmark, CalendarDays, Check, ChevronRight, Clock3, MapPin, Search, SlidersHorizontal, Sparkles, Users, Wifi, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Event, useEventStore } from '../../stores/eventStore'
import { eventsApi } from '../../api/events'
import { collegesApi, College } from '../../api/colleges'
import { EventStoryRail } from '../../components/events/EventStoryRail'
import { Avatar } from '../../components/shared/Avatar'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { colors, motion, radii, shadows, typography } from '../../styles/tokens'
import { formatDeviceTime, parseApiDate } from '../../utils/dateTime'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

type Filter = 'upcoming' | 'today' | 'week' | 'my' | 'saved' | 'popular' | 'near' | 'live'

const QUICK_FILTERS: { id: Filter; label: string }[] = [
  { id: 'upcoming', label: 'Latest' },
  { id: 'popular', label: 'Popular' },
  { id: 'saved', label: 'Saved' },
]

const MORE_FILTERS: { id: Filter; label: string }[] = [
  { id: 'my', label: 'My events' },
  { id: 'near', label: 'Near me' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'live', label: 'Live now' },
]

const ALL_FILTERS = [...QUICK_FILTERS, ...MORE_FILTERS]

const GENRES = ['Music', 'Sports', 'Gaming', 'Coding', 'Academic', 'Clubs', 'Meetups', 'Social', 'Competition', 'Other']

const TIME_SLOTS: { id: string; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'night', label: 'Night' },
]

interface PreciseFilters {
  date: string
  collegeId: string
  timeOfDay: string
  genre: string
}

const EMPTY_PRECISE: PreciseFilters = { date: '', collegeId: '', timeOfDay: '', genre: '' }

export function EventsScreen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { events, loading, error, fetchEvents } = useEventStore()
  const [filter, setFilter] = useState<Filter>(() => {
    const requested = searchParams.get('filter')
    return ALL_FILTERS.some((item) => item.id === requested) ? requested as Filter : 'upcoming'
  })
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [precise, setPrecise] = useState<PreciseFilters>(EMPTY_PRECISE)
  const [draftPrecise, setDraftPrecise] = useState<PreciseFilters>(EMPTY_PRECISE)
  const [colleges, setColleges] = useState<College[]>([])
  useBackDismiss(filtersOpen, () => setFiltersOpen(false), 200)
  const preciseCount = (precise.date ? 1 : 0) + (precise.collegeId ? 1 : 0) + (precise.timeOfDay ? 1 : 0) + (precise.genre ? 1 : 0)

  useEffect(() => {
    let active = true
    collegesApi.getAll({ limit: 200 }).then((res) => {
      if (active) setColleges(res.data?.data || [])
    }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params: Record<string, string | number | boolean> = { limit: 40 }
      if (query.trim()) params.q = query.trim()
      if (filter === 'upcoming') params.upcoming = true
      else params.filter = filter
      if (precise.date) params.date = precise.date
      if (precise.collegeId) params.college_id = precise.collegeId
      if (precise.timeOfDay) params.time_of_day = precise.timeOfDay
      if (precise.genre) params.category = precise.genre
      void fetchEvents(params)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [filter, query, precise, fetchEvents])

  const title = useMemo(() => {
    if (filter === 'my') return 'My events'
    if (filter === 'saved') return 'Saved events'
    if (filter === 'live') return 'Live on campus'
    if (filter === 'popular') return 'Popular events'
    if (filter === 'near') return 'Events near me'
    if (filter === 'today') return 'Today'
    if (filter === 'week') return 'This week'
    return 'Discover events'
  }, [filter])
  const visibleEvents = useMemo(
    () => events.filter((event) => filter === 'my' || event.event_state !== 'cancelled'),
    [events, filter],
  )

  return (
    <div style={{ minHeight: '100%', background: colors.bg, paddingBottom: 24 }}>
      <EventStoryRail autoLoad={false} />

      <div style={{ padding: '20px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 800 }}>Your campus calendar</p>
            <h1 style={{ margin: '4px 0 0', color: colors.textPrimary, fontSize: 25, lineHeight: 1.1, letterSpacing: '-0.03em', fontFamily: typography.fontDisplay, fontWeight: 800 }}>{title}</h1>
          </div>
          <button
            onClick={() => navigate('/app/events/create')}
            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, border: 0, borderRadius: radii.pill, padding: '0 16px', background: '#111114', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: typography.fontDisplay, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Create
          </button>
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={17} color={colors.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events, people, categories, places..."
            aria-label="Search events"
            style={{
              width: '100%', minHeight: 48, boxSizing: 'border-box', borderRadius: radii.pill,
              border: `1px solid ${colors.border}`, background: colors.surface,
              color: colors.textPrimary, padding: '0 14px 0 44px', outline: 'none',
              fontFamily: typography.fontBody, fontSize: 13,
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 16px' }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          {QUICK_FILTERS.map((item) => {
            const active = item.id === filter
            return (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                style={{
                  minHeight: 38, flexShrink: 0, borderRadius: radii.pill, border: `1px solid ${active ? '#111114' : colors.border}`,
                  padding: '0 16px', background: active ? '#111114' : colors.surface,
                  color: active ? '#fff' : colors.textSecondary, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  fontFamily: typography.fontDisplay,
                  transition: `all ${motion.fast} ${motion.easeSmooth}`,
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => { setDraftPrecise(precise); setFiltersOpen(true) }}
          aria-label="More filters"
          style={{
            position: 'relative', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38, borderRadius: radii.pill,
            border: `1px solid ${MORE_FILTERS.some((item) => item.id === filter) || preciseCount > 0 ? '#111114' : colors.border}`,
            padding: '0 14px', background: MORE_FILTERS.some((item) => item.id === filter) || preciseCount > 0 ? '#111114' : colors.surface,
            color: MORE_FILTERS.some((item) => item.id === filter) || preciseCount > 0 ? '#fff' : colors.textSecondary,
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: typography.fontDisplay,
          }}
        >
          <SlidersHorizontal size={15} /> Filters
          {preciseCount > 0 && (
            <span style={{ minWidth: 17, height: 17, borderRadius: '50%', background: colors.lime, color: colors.onLime, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{preciseCount}</span>
          )}
        </button>
      </div>

      {filtersOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setFiltersOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 430, maxHeight: '86vh', overflowY: 'auto', padding: '18px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
              borderRadius: '24px 24px 0 0', border: `1px solid ${colors.borderStrong}`, background: colors.glass2,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ margin: 0, color: colors.textPrimary, fontSize: 17, fontWeight: 800, fontFamily: typography.fontDisplay }}>All filters</h2>
              <button onClick={() => setFiltersOpen(false)} aria-label="Close filters" style={{ width: 34, height: 34, borderRadius: '50%', border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {ALL_FILTERS.map((item) => {
                const active = item.id === filter
                return (
                  <button
                    key={item.id}
                    onClick={() => setFilter(item.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 46,
                      border: 0, borderRadius: radii.md, padding: '0 12px', background: active ? colors.limeDim : 'transparent',
                      color: active ? colors.textPrimary : colors.textSecondary, fontSize: 14, fontWeight: active ? 800 : 600,
                      fontFamily: typography.fontBody, cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    {item.label}
                    {active && <Check size={16} color={colors.lime} />}
                  </button>
                )
              })}
            </div>

            <div style={{ height: 1, background: colors.border, margin: '14px 0' }} />

            <p style={{ margin: '0 0 8px', color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800 }}>Date</p>
            <input
              type="date"
              value={draftPrecise.date}
              onChange={(e) => setDraftPrecise((s) => ({ ...s, date: e.target.value }))}
              style={{
                width: '100%', minHeight: 44, boxSizing: 'border-box', borderRadius: radii.md, border: `1px solid ${colors.border}`,
                background: colors.surface, color: colors.textPrimary, padding: '0 12px', fontFamily: typography.fontBody, fontSize: 13,
              }}
            />

            <p style={{ margin: '16px 0 8px', color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800 }}>Campus</p>
            <select
              value={draftPrecise.collegeId}
              onChange={(e) => setDraftPrecise((s) => ({ ...s, collegeId: e.target.value }))}
              style={{
                width: '100%', minHeight: 44, boxSizing: 'border-box', borderRadius: radii.md, border: `1px solid ${colors.border}`,
                background: colors.surface, color: colors.textPrimary, padding: '0 12px', fontFamily: typography.fontBody, fontSize: 13,
              }}
            >
              <option value="">Any campus</option>
              {colleges.map((college) => <option key={college.id} value={college.id}>{college.short_name || college.name}</option>)}
            </select>

            <p style={{ margin: '16px 0 8px', color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800 }}>Time of day</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TIME_SLOTS.map((slot) => {
                const active = draftPrecise.timeOfDay === slot.id
                return (
                  <button
                    key={slot.id}
                    onClick={() => setDraftPrecise((s) => ({ ...s, timeOfDay: active ? '' : slot.id }))}
                    style={{
                      minHeight: 36, borderRadius: radii.pill, border: `1px solid ${active ? colors.lime : colors.border}`,
                      padding: '0 14px', background: active ? colors.limeDim : colors.surface,
                      color: active ? colors.textPrimary : colors.textSecondary, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      fontFamily: typography.fontDisplay,
                    }}
                  >
                    {slot.label}
                  </button>
                )
              })}
            </div>

            <p style={{ margin: '16px 0 8px', color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800 }}>Genre</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {GENRES.map((genre) => {
                const active = draftPrecise.genre === genre
                return (
                  <button
                    key={genre}
                    onClick={() => setDraftPrecise((s) => ({ ...s, genre: active ? '' : genre }))}
                    style={{
                      minHeight: 36, borderRadius: radii.pill, border: `1px solid ${active ? colors.lime : colors.border}`,
                      padding: '0 14px', background: active ? colors.limeDim : colors.surface,
                      color: active ? colors.textPrimary : colors.textSecondary, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      fontFamily: typography.fontDisplay,
                    }}
                  >
                    {genre}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setDraftPrecise(EMPTY_PRECISE)}
                style={{ flex: 1, minHeight: 46, borderRadius: radii.pill, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textPrimary, fontWeight: 700, fontSize: 13.5, fontFamily: typography.fontDisplay, cursor: 'pointer' }}
              >
                Clear
              </button>
              <button
                onClick={() => { setPrecise(draftPrecise); setFiltersOpen(false) }}
                style={{ flex: 2, minHeight: 46, borderRadius: radii.pill, border: 0, background: '#111114', color: '#fff', fontWeight: 700, fontSize: 13.5, fontFamily: typography.fontDisplay, cursor: 'pointer' }}
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '0 16px' }}>
        {loading && events.length === 0 && <EventSkeletonList />}

        {!loading && error && (
          <div style={{ padding: '28px 18px', border: `1px solid rgba(239,68,68,0.25)`, borderRadius: radii.lg, background: 'rgba(239,68,68,0.07)', textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', color: colors.textPrimary, fontWeight: 700 }}>Events could not load</p>
            <p style={{ margin: '0 0 16px', color: colors.textMuted, fontSize: 13 }}>{error}</p>
            <button onClick={() => void fetchEvents({ limit: 40, upcoming: true })} style={{ minHeight: 42, padding: '0 16px', border: `1px solid ${colors.borderStrong}`, borderRadius: radii.pill, background: 'transparent', color: colors.textPrimary, fontWeight: 700, cursor: 'pointer' }}>Try again</button>
          </div>
        )}

        {!loading && !error && visibleEvents.length === 0 && (
          <div style={{ padding: '52px 24px', border: `1px solid ${colors.border}`, borderRadius: 26, textAlign: 'center', background: colors.surface }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.surfaceHover }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(155deg, #18181B, #18181B)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(24,24,27,.28)' }}>
                <CalendarDays size={22} color="#fff" strokeWidth={1.8} />
              </div>
            </div>
            <h2 style={{ margin: '0 0 8px', color: colors.textPrimary, fontSize: 18, fontWeight: 800, fontFamily: typography.fontDisplay }}>Nothing here yet</h2>
            <p style={{ margin: '0 auto 22px', maxWidth: 270, color: colors.textSecondary, fontSize: 13.5, lineHeight: 1.55 }}>
              {filter === 'saved' ? 'Save events you want to remember and they will show up here.' : 'Be the first student to put something worth showing on campus.'}
            </p>
            <button onClick={() => navigate('/app/events/create')} style={{ minHeight: 46, border: 0, borderRadius: radii.pill, padding: '0 22px', background: '#111114', color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: typography.fontDisplay, cursor: 'pointer' }}>Create an event</button>
          </div>
        )}

        {visibleEvents.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visibleEvents.map((event, index) => (
              <EventCard key={event.id} event={event} index={index} onClick={() => navigate(`/app/events/${event.id}`)} />
            ))}
          </div>
        )}

        {loading && events.length > 0 && <div style={{ display: 'flex', justifyContent: 'center', padding: 18 }}><LoadingSpinner size={22} /></div>}
      </div>
    </div>
  )
}

function EventSkeletonList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1, 2, 3].map((item) => (
        <div key={item} style={{ height: 158, borderRadius: radii.lg, background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.4s ease-in-out infinite' }} />
      ))}
    </div>
  )
}

function EventCard({ event, index, onClick }: { event: Event; index: number; onClick: () => void }) {
  const [saved, setSaved] = useState(Boolean(event.is_saved))
  const [saving, setSaving] = useState(false)
  const start = parseApiDate(event.starts_at)
  const isLive = event.event_state === 'live'
  const isEnded = event.event_state === 'ended'
  const going = event.user_status === 'going'
  const canJoin = event.event_state !== 'ended' && event.event_state !== 'cancelled'

  useEffect(() => setSaved(Boolean(event.is_saved)), [event.is_saved])

  const toggleSave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (saving) return
    setSaving(true)
    try {
      if (saved) await eventsApi.unsave(event.id)
      else await eventsApi.save(event.id)
      setSaved(!saved)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article
      onClick={onClick}
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: radii.lg, border: `1px solid ${isLive ? 'rgba(187,255,0,0.4)' : colors.border}`,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))',
        boxShadow: shadows.card, cursor: 'pointer', animation: `fadeSlideIn 240ms ${motion.easeOut} ${Math.min(index * 35, 140)}ms both`,
      }}
    >
      <div style={{ height: 126, position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(24,24,27,0.42), rgba(21,18,34,0.92))' }}>
        {event.cover_url ? <AuthenticatedImage src={event.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.88 }} /> : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={35} color="rgba(255,255,255,0.58)" strokeWidth={1.2} /></div>
        )}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,5,9,0.05) 20%, rgba(5,5,9,0.82) 100%)' }} />
        <div style={{ position: 'absolute', top: 10, left: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ padding: '5px 8px', borderRadius: radii.pill, background: isLive ? colors.lime : 'rgba(5,5,9,0.62)', color: isLive ? colors.onLime : '#fff', border: isLive ? 'none' : '1px solid rgba(255,255,255,0.14)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{isLive ? 'Live now' : (event.category || event.type || 'Event')}</span>
          {event.visibility === 'private' && <span style={{ padding: '5px 8px', borderRadius: radii.pill, background: 'rgba(5,5,9,0.62)', color: 'rgba(255,255,255,0.78)', border: '1px solid rgba(255,255,255,0.14)', fontSize: 10, fontWeight: 700 }}>Private</span>}
        </div>
        <button onClick={toggleSave} aria-label={saved ? 'Remove saved event' : 'Save event'} style={{ position: 'absolute', top: 8, right: 8, width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(5,5,9,0.54)', color: saved ? colors.lime : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
          <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />
        </button>
        <div style={{ position: 'absolute', bottom: 11, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, color: '#fff', fontSize: 18, lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.025em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</h2>
            <p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,0.72)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>by {event.organizer_name}</p>
          </div>
          <div style={{ flexShrink: 0, width: 46, borderRadius: 12, padding: '7px 4px', background: 'rgba(5,5,9,0.7)', textAlign: 'center', border: '1px solid rgba(255,255,255,0.13)' }}>
            <span style={{ display: 'block', color: '#BBFF00', fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>{start.toLocaleDateString(undefined, { month: 'short' })}</span>
            <strong style={{ display: 'block', color: '#fff', fontSize: 20, lineHeight: 1.05 }}>{start.getDate()}</strong>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 12px 13px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px 14px', color: colors.textSecondary, fontSize: 11 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Clock3 size={13} color={colors.lime} />{formatDeviceTime(start)}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: '100%' }}>{event.is_online ? <Wifi size={13} color={colors.lime} /> : <MapPin size={13} color={colors.lime} />}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.is_online ? 'Online event' : (event.location || event.address || 'Campus venue')}</span></span>
        </div>
        {event.description && <p style={{ margin: '9px 0 10px', color: colors.textMuted, fontSize: 12, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{event.description}</p>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: event.description ? 0 : 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 5 }}>
              {(event.attendees_preview || []).slice(0, 3).map((attendee, attendeeIndex) => (
                <div key={attendee.id} style={{ marginLeft: attendeeIndex === 0 ? -5 : -7, zIndex: 3 - attendeeIndex, borderRadius: '50%', border: `2px solid ${colors.surface}` }}>
                  <Avatar src={attendee.avatar_url} name={attendee.full_name} size={23} />
                </div>
              ))}
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.textMuted, fontSize: 11 }}><Users size={13} />{event.attendees_count} going</span>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: canJoin ? (going ? colors.lime : colors.textSecondary) : colors.textMuted, fontSize: 11, fontWeight: 800 }}>{isEnded ? 'Ended' : going ? 'Going' : canJoin ? 'View event' : 'Cancelled'}<ChevronRight size={14} /></span>
        </div>
      </div>
    </article>
  )
}