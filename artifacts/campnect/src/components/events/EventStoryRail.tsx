import { useEffect } from 'react'
import { CalendarDays, ChevronRight, Plus, Users } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useEventStore } from '../../stores/eventStore'
import { colors, radii, shadows } from '../../styles/tokens'
import { AuthenticatedImage } from '../shared/AuthenticatedImage'
import { parseApiDate } from '../../utils/dateTime'
import { navigateToAppRoot } from '../../navigation/appSectionNavigation'

function CalendarIllustration() {
  const squares = [
    { bg: '#B8A6F2' }, { bg: '#F5A8C4' }, { bg: '#EDEDED' },
    { bg: '#B7E0A8' }, { bg: '#EDEDED' }, { bg: '#F3D89B' },
  ]
  return (
    <div style={{ position: 'relative', width: 108, height: 96, flexShrink: 0 }}>
      <div style={{ position: 'absolute', left: 10, top: 30, width: 10, height: 58, background: '#111114', borderRadius: '0 0 4px 4px', transform: 'skewX(-18deg)' }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: 14, background: '#FFFFFF', border: '1px solid rgba(17,17,20,0.08)', boxShadow: '0 14px 28px rgba(20,20,24,0.12)', padding: '18px 9px 9px' }}>
        {[0, 1, 2, 3].map((wire) => (
          <span key={wire} style={{ position: 'absolute', top: -7, left: 10 + wire * 24, width: 8, height: 14, borderRadius: '8px 8px 0 0', border: '2px solid #B9B9BF', borderBottom: 'none' }} />
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {squares.map((sq, i) => (
            <span key={i} style={{ width: '100%', aspectRatio: '1', borderRadius: 5, background: sq.bg }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function eventPreviewLabel(startsAt: string) {
  const date = parseApiDate(startsAt)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function EventStoryRail({ autoLoad = true }: { autoLoad?: boolean } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { events, loading, error, fetchEvents } = useEventStore()

  useEffect(() => {
    if (autoLoad && events.length === 0) void fetchEvents({ upcoming: true, limit: 12 })
  }, [autoLoad, events.length, fetchEvents])

  const activeEvents = events.filter((event) => event.event_state !== 'ended' && event.event_state !== 'cancelled').slice(0, 10)

  const hasEvents = activeEvents.length > 0

  return (
    <section className="campus-events-rail" aria-label="Campus events" style={{ padding: '14px 16px 0' }}>
      <div style={{ padding: '20px 20px 22px', borderRadius: 22, background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: '0 1px 2px rgba(20,20,24,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <div>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>On campus</p>
            <h2 style={{ margin: '5px 0 0', color: colors.textPrimary, fontSize: 20, lineHeight: 1.2, fontWeight: 800, letterSpacing: '-0.02em', maxWidth: 200 }}>Events happening around you</h2>
          </div>
          <button
            onClick={() => navigateToAppRoot(navigate, location.pathname, '/app/events')}
            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: colors.textPrimary, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}
          >
            See all <ChevronRight size={14} />
          </button>
        </div>

        {loading && !hasEvents ? (
          <div style={{ display: 'flex', gap: 12, overflow: 'hidden', margin: '0 -4px', padding: '0 4px' }} aria-busy="true" aria-label="Loading campus events">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} aria-hidden style={{ flex: '0 0 68px', minHeight: 100, textAlign: 'center' }}>
                <span className="skeleton" style={{ display: 'block', width: 60, height: 60, borderRadius: '50%', margin: '0 auto' }} />
                <span className="skeleton" style={{ display: 'block', width: 54, height: 8, borderRadius: 99, margin: '9px auto 0' }} />
                <span className="skeleton" style={{ display: 'block', width: 34, height: 6, borderRadius: 99, margin: '6px auto 0' }} />
              </div>
            ))}
          </div>
        ) : error && !hasEvents ? (
          <button
            type="button"
            onClick={() => void fetchEvents({ upcoming: true, limit: 12 })}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: 'none', background: 'transparent', padding: '7px 0', color: colors.textPrimary, cursor: 'pointer', textAlign: 'left' }}
          >
            <span>
              <strong style={{ display: 'block', fontSize: 13.5 }}>Events could not load</strong>
              <span style={{ display: 'block', marginTop: 3, color: colors.textMuted, fontSize: 12 }}>Check your connection and try again.</span>
            </span>
            <span style={{ flexShrink: 0, color: colors.purpleBright, fontSize: 13, fontWeight: 800 }}>Retry</span>
          </button>
        ) : !hasEvents ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <button
              onClick={() => navigate('/app/events/create')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, border: 'none', background: 'transparent', padding: 0, color: colors.textPrimary, cursor: 'pointer' }}
            >
              <div style={{ position: 'relative', width: 52, height: 52, borderRadius: 16, background: colors.purpleDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CalendarDays size={24} color={colors.purpleBright} strokeWidth={1.6} />
                <span style={{ position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: '50%', background: '#111114', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2.5px solid ${colors.surface}` }}>
                  <Plus size={12} strokeWidth={3} />
                </span>
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2 }}>Create<br />event</span>
            </button>
            <CalendarIllustration />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -4px', padding: '0 4px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            <button
              onClick={() => navigate('/app/events/create')}
              style={{ flex: '0 0 68px', border: 'none', background: 'transparent', padding: 0, color: colors.textPrimary, cursor: 'pointer', minHeight: 100 }}
            >
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: colors.purpleDim, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', margin: '0 auto' }}>
                <CalendarDays size={22} color={colors.purpleBright} strokeWidth={1.6} />
                <span style={{ position: 'absolute', right: -3, bottom: -2, width: 20, height: 20, borderRadius: '50%', background: '#111114', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2.5px solid ${colors.surface}` }}>
                  <Plus size={11} strokeWidth={3} />
                </span>
              </div>
              <span style={{ display: 'block', marginTop: 7, fontSize: 11, fontWeight: 700, lineHeight: 1.2, textAlign: 'center' }}>Create event</span>
            </button>

            {activeEvents.map((event) => {
                const isLive = event.event_state === 'live'
                return (
                  <button
                    key={event.id}
                    onClick={() => navigate(`/app/events/${event.id}`)}
                    style={{ flex: '0 0 68px', border: 'none', background: 'transparent', padding: 0, color: colors.textPrimary, cursor: 'pointer', minHeight: 100, textAlign: 'center' }}
                  >
                    <div style={{ width: 60, height: 60, borderRadius: '50%', padding: 2, margin: '0 auto', background: isLive ? '#111114' : 'linear-gradient(135deg, #C44DCC, #18181B, #E040A0)', boxShadow: isLive ? shadows.btn : 'none' }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: `2px solid ${colors.surface}`, background: colors.purpleDim }}>
                        {event.cover_url ? (
                          <AuthenticatedImage src={event.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CalendarDays size={20} color={colors.purpleBright} strokeWidth={1.5} />
                          </div>
                        )}
                      </div>
                    </div>
                    <span style={{ display: 'block', marginTop: 5, fontSize: 11, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</span>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 3, fontSize: 9, color: isLive ? colors.textPrimary : colors.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>
                      {isLive ? 'Live' : eventPreviewLabel(event.starts_at)}
                      {!isLive && event.attendees_count > 0 && <><Users size={9} />{event.attendees_count}</>}
                    </span>
                  </button>
                )
              })}
          </div>
        )}
      </div>
    </section>
  )
}