import { useEffect } from 'react'
import { Check, MapPin, Share2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../../components/shared/Avatar'
import { DetailPageSkeleton } from '../../components/shared/AppSkeletons'
import { useEventStore } from '../../stores/eventStore'
import { colors, radii, shadows, typography } from '../../styles/tokens'
import { formatDeviceDate, formatDeviceTime, parseApiDate } from '../../utils/dateTime'
import { navigateToAppRoot } from '../../navigation/appSectionNavigation'

export function EventConfirmationScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { currentEvent: event, loading, fetchEvent } = useEventStore()

  useEffect(() => {
    if (id && event?.id !== id) void fetchEvent(id)
  }, [id, event?.id, fetchEvent])

  if (loading && !event) return <div style={{ minHeight: '100%', background: colors.bg }}><DetailPageSkeleton kind="event" /></div>
  if (!event) return <div style={{ ...shell, padding: 24, textAlign: 'center' }}><p style={{ color: colors.textMuted }}>Event confirmation is unavailable.</p><button onClick={() => navigateToAppRoot(navigate, location.pathname, '/app/events')} style={button}>Back to events</button></div>

  const start = parseApiDate(event.starts_at)
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: event.title, text: `I'm going to ${event.title}`, url: window.location.href })
      else { await navigator.clipboard?.writeText(window.location.href); toast.success('Event link copied') }
    } catch {}
  }

  return (
    <div style={{ ...shell, padding: '36px 20px calc(40px + env(safe-area-inset-bottom, 0px))', overflowY: 'auto' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {Array.from({ length: 16 }).map((_, index) => <span key={index} style={{ position: 'absolute', left: `${(index * 29) % 100}%`, top: `${10 + ((index * 37) % 65)}%`, width: index % 2 ? 5 : 8, height: index % 2 ? 12 : 5, borderRadius: 2, background: index % 3 === 0 ? colors.lime : index % 3 === 1 ? colors.purpleBright : '#fff', opacity: 0.72, transform: `rotate(${index * 37}deg)`, animation: `floatConfetti ${1.8 + (index % 4) * 0.3}s ease-in-out ${index * 45}ms infinite alternate` }} />)}
      </div>
      <div style={{ position: 'relative', zIndex: 1, width: 86, height: 86, borderRadius: '50%', margin: '0 auto 20px', background: colors.lime, color: colors.onLime, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 10px rgba(187,255,0,0.08), 0 0 60px rgba(187,255,0,0.28)', animation: 'successPop 450ms cubic-bezier(0.34,1.56,0.64,1)' }}><Check size={44} strokeWidth={3} /></div>
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <p style={{ margin: 0, color: colors.lime, fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase' }}>You're going</p>
        <h1 style={{ margin: '9px 0 8px', color: colors.textPrimary, fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.055em', fontFamily: typography.fontDisplay }}>Make it a good one.</h1>
        <p style={{ margin: '0 auto', maxWidth: 280, color: colors.textMuted, fontSize: 13, lineHeight: 1.5 }}>Your spot is saved. We’ll keep the event details close by.</p>
      </div>
      <div style={{ position: 'relative', zIndex: 1, overflow: 'hidden', width: '100%', marginTop: 28, borderRadius: radii.lg, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.055)', boxShadow: shadows.card }}>
        <div style={{ height: 150, background: event.cover_url ? `linear-gradient(180deg, transparent, rgba(5,5,9,0.7)), url(${event.cover_url}) center/cover` : 'linear-gradient(135deg, rgba(24,24,27,0.6), rgba(5,5,9,0.92))' }} />
        <div style={{ padding: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar src={event.organizer_avatar} name={event.organizer_name} size={28} /><span style={{ color: colors.textMuted, fontSize: 11 }}>Hosted by {event.organizer_name}</span></div>
          <h2 style={{ margin: '12px 0 0', color: colors.textPrimary, fontSize: 19, lineHeight: 1.15 }}>{event.title}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 13, color: colors.textSecondary, fontSize: 12 }}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Sparkles size={15} color={colors.lime} />{formatDeviceDate(start, { weekday: 'short', month: 'short', day: 'numeric' })} · {formatDeviceTime(start)}</span><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><MapPin size={15} color={colors.lime} />{event.is_online ? 'Online event' : event.location || 'Campus venue'}</span></div>
        </div>
      </div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 9, width: '100%', marginTop: 16 }}><button onClick={share} style={{ ...button, background: 'rgba(255,255,255,0.055)', color: colors.textPrimary, border: `1px solid ${colors.borderStrong}` }}><Share2 size={17} /> Share event</button><button onClick={() => navigate('/app/events?filter=my', { replace: true })} style={button}>View my events</button></div>
    </div>
  )
}

const shell: React.CSSProperties = { minHeight: '100%', background: colors.bg, color: colors.textPrimary, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }
const button: React.CSSProperties = { width: '100%', minHeight: 48, border: 0, borderRadius: radii.pill, background: colors.lime, color: colors.onLime, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, fontWeight: 900, cursor: 'pointer', boxShadow: shadows.btn }