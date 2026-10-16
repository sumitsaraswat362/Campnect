import { DEMO_MODE } from '../../demo/config'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BellRing, Bookmark, CalendarPlus, MapPin, MessageCircle, MoreHorizontal, Send, Share2, Sparkles, Users, Wifi, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { eventsApi, downloadICS } from '../../api/events'
import { Avatar } from '../../components/shared/Avatar'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { PromptDialog } from '../../components/shared/PromptDialog'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { DetailPageSkeleton } from '../../components/shared/AppSkeletons'
import { navigateToAppRoot } from '../../navigation/appSectionNavigation'
import { useAuthStore } from '../../stores/authStore'
import { useEventStore } from '../../stores/eventStore'
import { colors, radii, shadows, typography } from '../../styles/tokens'
import { formatDeviceDate, formatDeviceTime, parseApiDate } from '../../utils/dateTime'

export function EventDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const { currentEvent: event, loading, error, fetchEvent, rsvp, save, unsave } = useEventStore()
  const [rsvpLoading, setRsvpLoading] = useState(false)
  const [secondaryLoading, setSecondaryLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [announcementBody, setAnnouncementBody] = useState('')
  const [announcing, setAnnouncing] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviting, setInviting] = useState(false)
  const [cohostUsername, setCohostUsername] = useState('')
  const [addingCohost, setAddingCohost] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  useBackDismiss(reportOpen, () => setReportOpen(false), 200)

  useEffect(() => { if (id) void fetchEvent(id) }, [id, fetchEvent])

  const isHost = Boolean(event && user && (event.organizer_id === user.id || event.hosts?.some((host) => host.id === user.id)))
  const start = event ? parseApiDate(event.starts_at) : null
  const isFull = Boolean(event?.max_attendees && event.attendees_count >= event.max_attendees)
  const mainAction = useMemo(() => {
    if (!event) return 'JOIN EVENT'
    if (event.event_state === 'cancelled') return 'EVENT CANCELLED'
    if (event.event_state === 'ended') return 'EVENT ENDED'
    if (event.user_status === 'going') return 'GOING'
    if (event.user_status === 'waitlist') return 'ON WAITLIST'
    if (isFull && event.allow_waitlist) return 'JOIN WAITLIST'
    if (isFull) return 'EVENT FULL'
    return 'JOIN EVENT'
  }, [event, isFull])

  const handleRSVP = async () => {
    if (!event || !id || rsvpLoading || ['cancelled', 'ended'].includes(event.event_state || '')) return
    if (mainAction === 'GOING' || mainAction === 'ON WAITLIST' || mainAction === 'EVENT FULL') return
    setRsvpLoading(true)
    try {
      const status = await rsvp(id, 'going')
      if (status === 'going') navigate(`/app/events/${id}/confirmation`)
      else if (status === 'waitlist') toast.success('You are on the waitlist')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Unable to join this event')
    } finally {
      setRsvpLoading(false)
    }
  }

  const handleSecondaryRSVP = async () => {
    if (!event || !id || secondaryLoading) return
    setSecondaryLoading(true)
    try {
      if (event.user_status === 'going') {
        await eventsApi.leave(id)
        await fetchEvent(id)
        toast.success('You left this event')
      } else {
        await rsvp(id, 'interested')
        toast.success('Marked as interested')
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Unable to update your attendance')
    } finally {
      setSecondaryLoading(false)
    }
  }

  const toggleSave = async () => {
    if (!event || !id || saveLoading) return
    setSaveLoading(true)
    try {
      if (event.is_saved) await unsave(id)
      else await save(id)
      toast.success(event.is_saved ? 'Removed from saved events' : 'Event saved')
    } catch {
      toast.error('Unable to update saved events')
    } finally {
      setSaveLoading(false)
    }
  }

  const share = async () => {
    if (!event) return
    try {
      if (navigator.share) await navigator.share({ title: event.title, text: event.description, url: window.location.href })
      else { await navigator.clipboard?.writeText(window.location.href); toast.success('Event link copied') }
    } catch {}
  }

  const openChat = async () => {
    if (!id || ['cancelled', 'ended'].includes(event?.event_state || '')) {
      toast.error('Event chat is closed')
      return
    }
    try {
      const response = await eventsApi.getChat(id)
      navigate(`/app/chat/${response.data.data.conversation_id}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Join the event to access chat')
    }
  }

  const submitReport = async (reason: string, details?: string) => {
    if (!id || reporting) return
    setReporting(true)
    try {
      await eventsApi.report(id, reason, details)
      toast.success(DEMO_MODE ? 'Report saved to local demo intake. No moderation team is contacted.' : 'Report submitted for review')
      setReportOpen(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Unable to submit report')
    } finally {
      setReporting(false)
    }
  }

  const sendAnnouncement = async () => {
    if (!id || !announcementBody.trim() || announcing) return
    setAnnouncing(true)
    try {
      await eventsApi.announce(id, announcementBody.trim())
      setAnnouncementBody('')
      await fetchEvent(id)
      toast.success('Announcement sent')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Unable to send announcement')
    } finally {
      setAnnouncing(false)
    }
  }

  const inviteStudent = async () => {
    if (!id || !inviteUsername.trim() || inviting) return
    setInviting(true)
    try {
      await eventsApi.invite(id, inviteUsername.trim())
      setInviteUsername('')
      toast.success('Invitation sent')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Unable to invite that student')
    } finally {
      setInviting(false)
    }
  }

  const addCohost = async () => {
    if (!id || !cohostUsername.trim() || addingCohost) return
    setAddingCohost(true)
    try {
      await eventsApi.addHost(id, cohostUsername.trim())
      setCohostUsername('')
      await fetchEvent(id)
      toast.success('Co-host added')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Unable to add that co-host')
    } finally {
      setAddingCohost(false)
    }
  }

  const cancelEvent = async () => {
    if (!event || cancelling) return
    setCancelling(true)
    try {
      await eventsApi.cancel(event.id)
      setCancelOpen(false)
      toast.success('Event deleted.')
      navigate('/app/events', { replace: true })
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Unable to cancel this event')
    } finally {
      setCancelling(false)
    }
  }

  const endEvent = async () => {
    if (!event || ending) return
    setEnding(true)
    try {
      await eventsApi.end(event.id)
      setEndOpen(false)
      toast.success('Event deleted.')
      navigate('/app/events', { replace: true })
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Unable to end this event')
    } finally {
      setEnding(false)
    }
  }

  if (loading && !event) return <DetailLoading />
  if (!event || error) {
    return <div style={{ minHeight: '100%', background: colors.bg, padding: 28, color: colors.textPrimary, textAlign: 'center' }}><p style={{ color: colors.textMuted }}>{error || 'Event not found.'}</p><button onClick={() => navigateToAppRoot(navigate, location.pathname, '/app/events')} style={secondaryButton}>Back to events</button></div>
  }

  return (
    <div style={{ minHeight: '100%', background: colors.bg, color: colors.textPrimary, paddingBottom: 36 }}>
      <div style={{ position: 'relative', height: 246, overflow: 'hidden', background: 'linear-gradient(135deg, rgba(24,24,27,0.58), rgba(5,5,9,0.96))' }}>
        {event.cover_url && <AuthenticatedImage src={event.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.86 }} />}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,5,9,0.25), rgba(5,5,9,0.9))' }} />
        <div style={{ position: 'absolute', top: 'calc(12px + var(--sat))', left: 12, right: 12, display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={requestAppBack} aria-label="Go back" style={circleButton}><ArrowLeft size={18} /></button>
          <div style={{ display: 'flex', gap: 8 }}><button onClick={share} aria-label="Share event" style={circleButton}><Share2 size={17} /></button><button onClick={() => setReportOpen(true)} aria-label="Report event" style={circleButton}><MoreHorizontal size={18} /></button></div>
        </div>
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}><span style={pill(isLive(event))}>{isLive(event) ? 'LIVE NOW' : event.event_state === 'cancelled' ? 'CANCELLED' : event.event_state === 'ended' ? 'ENDED' : (event.category || 'EVENT').toUpperCase()}</span>{event.visibility === 'private' && <span style={mutedPill}>PRIVATE</span>}</div>
          <h1 style={{ margin: 0, color: '#fff', fontSize: 27, lineHeight: 1.05, letterSpacing: '-0.045em', fontFamily: typography.fontDisplay }}>{event.title}</h1>
          <p style={{ margin: '7px 0 0', color: 'rgba(255,255,255,0.74)', fontSize: 12 }}>Hosted by {event.organizer_name} · {event.college_name || 'Your campus'}</p>
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
          {isHost ? (
            <div style={{ ...primaryButton, flex: 1, background: 'rgba(255,255,255,0.045)', color: colors.textPrimary, border: `1px solid ${colors.borderStrong}`, boxShadow: 'none', cursor: 'default' }}>
              <Sparkles size={15} color={colors.lime} /> You're hosting
            </div>
          ) : (
            <button onClick={handleRSVP} disabled={rsvpLoading || ['EVENT ENDED', 'EVENT CANCELLED', 'EVENT FULL', 'GOING', 'ON WAITLIST'].includes(mainAction)} style={{ ...primaryButton, flex: 1, opacity: rsvpLoading || ['EVENT ENDED', 'EVENT CANCELLED', 'EVENT FULL', 'GOING', 'ON WAITLIST'].includes(mainAction) ? 0.72 : 1 }}>{rsvpLoading ? <LoadingSpinner size={17} /> : mainAction}</button>
          )}
          <button onClick={toggleSave} disabled={saveLoading} aria-label={event.is_saved ? 'Unsave event' : 'Save event'} style={{ ...secondaryButton, width: 48, padding: 0, color: event.is_saved ? colors.lime : colors.textPrimary }}><Bookmark size={19} fill={event.is_saved ? 'currentColor' : 'none'} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 16 }}>
           <InfoCard icon={<CalendarPlus size={16} color={colors.lime} />} label="WHEN"><strong>{formatDeviceDate(start!, { weekday: 'short', month: 'short', day: 'numeric' })}</strong><span>{formatDeviceTime(start!)}</span></InfoCard>
          <InfoCard icon={event.is_online ? <Wifi size={16} color={colors.lime} /> : <MapPin size={16} color={colors.lime} />} label="WHERE"><strong>{event.is_online ? 'Online event' : (event.location || 'Campus venue')}</strong><span>{event.is_online ? 'Use the meeting link' : event.location_type === 'outside' ? event.address || 'Outside address' : event.college_name || 'Your college'}</span></InfoCard>
        </div>

        {event.event_state === 'cancelled' && <div style={{ marginBottom: 14, padding: 13, borderRadius: radii.md, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', fontSize: 13 }}>This event has been cancelled{event.cancel_reason ? `: ${event.cancel_reason}` : '.'}</div>}

        <section style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><div><p style={eyebrow}>About this event</p><p style={{ margin: '8px 0 0', color: colors.textSecondary, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{event.description || 'No description provided.'}</p></div></div>
          {!event.is_online && (event.location || event.address) && <a href={`https://maps.google.com/?q=${encodeURIComponent([event.location, event.address].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 13, color: colors.lime, fontSize: 12, fontWeight: 800, textDecoration: 'none' }}><MapPin size={15} /> Open location in Maps</a>}
        </section>

        <section style={sectionStyle}>
          <p style={eyebrow}>People</p>
          <div style={{ display: 'flex', gap: 9, marginTop: 11 }}>
            <Stat label="Going" value={event.counts?.going ?? event.attendees_count} />
            <Stat label="Interested" value={event.counts?.interested ?? 0} />
            {event.max_attendees ? <Stat label="Capacity" value={event.max_attendees} /> : <Stat label="Hosts" value={event.hosts?.length || 1} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 14, gap: 7 }}>
            <div style={{ display: 'flex', paddingLeft: 5 }}>
              {(event.attendees_preview || []).slice(0, 6).map((attendee, index) => <div key={attendee.id} style={{ marginLeft: index ? -8 : -5, zIndex: 6 - index, borderRadius: '50%', border: `2px solid ${colors.surface}` }}><Avatar src={attendee.avatar_url} name={attendee.full_name} size={32} /></div>)}
            </div>
            <span style={{ color: colors.textMuted, fontSize: 12 }}>{event.counts?.going || event.attendees_count ? `${event.counts?.going || event.attendees_count} students going` : 'Be the first to join'}</span>
            <button onClick={() => navigate(`/app/events/${event.id}/attendees`)} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: colors.lime, fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>See all</button>
          </div>
        </section>

        <section style={sectionStyle}>
          <p style={eyebrow}>Organizer & hosts</p>
          <button onClick={() => navigate(`/app/profile/${event.organizer_username}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 11, border: 0, background: 'transparent', padding: 0, color: colors.textPrimary, textAlign: 'left', cursor: 'pointer' }}><Avatar src={event.organizer_avatar} name={event.organizer_name} size={42} /><span style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: 13 }}>{event.organizer_name}</strong><small style={{ display: 'block', marginTop: 3, color: colors.textMuted, fontSize: 11 }}>@{event.organizer_username} · Organizer</small></span><span style={{ color: colors.lime, fontSize: 11, fontWeight: 800 }}>View profile</span></button>
          {event.hosts && event.hosts.length > 1 && <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 13, paddingBottom: 2 }}>{event.hosts.slice(1).map((host) => <button key={host.id} onClick={() => navigate(`/app/profile/${host.username}`)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${colors.border}`, borderRadius: radii.pill, background: 'rgba(255,255,255,0.035)', color: colors.textSecondary, padding: '6px 10px 6px 6px', cursor: 'pointer' }}><Avatar src={host.avatar_url} name={host.full_name} size={22} /><span style={{ fontSize: 11, fontWeight: 700 }}>{host.full_name}</span></button>)}</div>}
        </section>

        {event.announcements && event.announcements.length > 0 && <section style={{ ...sectionStyle, borderColor: 'rgba(187,255,0,0.22)', background: 'rgba(187,255,0,0.055)' }}><p style={{ ...eyebrow, color: colors.lime }}><BellRing size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />Latest announcements</p>{event.announcements.slice(0, 3).map((announcement) => <div key={announcement.id} style={{ marginTop: 11, paddingTop: 11, borderTop: `1px solid rgba(187,255,0,0.14)` }}><p style={{ margin: 0, color: colors.textPrimary, fontSize: 13, lineHeight: 1.5 }}>{announcement.body}</p><small style={{ display: 'block', marginTop: 5, color: colors.textMuted, fontSize: 10 }}>{announcement.author_name || 'Host'} · {formatRelative(announcement.created_at)}</small></div>)}</section>}

         {isHost && <section style={sectionStyle}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><p style={eyebrow}>Host tools</p><span style={{ color: colors.lime, fontSize: 10, fontWeight: 800 }}>MANAGE</span></div><button onClick={() => navigate(`/app/events/${event.id}/edit`)} style={{ width: '100%', minHeight: 42, marginTop: 11, border: `1px solid ${colors.borderStrong}`, borderRadius: radii.pill, background: 'rgba(255,255,255,0.045)', color: colors.textPrimary, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Edit event details</button><div style={{ display: 'flex', gap: 8, marginTop: 11 }}><input value={announcementBody} onChange={(e) => setAnnouncementBody(e.target.value)} maxLength={1000} placeholder="Send an announcement..." style={{ ...inputStyle, minHeight: 42, fontSize: 12 }} /><button onClick={sendAnnouncement} disabled={!announcementBody.trim() || announcing} aria-label="Send announcement" style={{ width: 44, border: 0, borderRadius: radii.md, background: colors.lime, color: colors.onLime, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: !announcementBody.trim() || announcing ? 0.55 : 1 }}><Send size={17} /></button></div><div style={{ display: 'flex', gap: 8, marginTop: 11 }}><input value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} placeholder="Invite by @username" style={{ ...inputStyle, minHeight: 42, fontSize: 12 }} /><button onClick={inviteStudent} disabled={!inviteUsername.trim() || inviting} aria-label="Invite student" style={{ width: 44, border: 0, borderRadius: radii.md, background: colors.purpleBright, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: !inviteUsername.trim() || inviting ? 0.55 : 1 }}><Users size={17} /></button></div>{user?.id === event.organizer_id && <div style={{ display: 'flex', gap: 8, marginTop: 11 }}><input value={cohostUsername} onChange={(e) => setCohostUsername(e.target.value)} placeholder="Add co-host by @username" style={{ ...inputStyle, minHeight: 42, borderRadius: radii.md, background: 'rgba(255,255,255,0.05)', color: colors.textPrimary, padding: '0 12px', outline: 'none', fontFamily: typography.fontBody }} /><button onClick={addCohost} disabled={!cohostUsername.trim() || addingCohost} aria-label="Add co-host" style={{ width: 44, border: 0, borderRadius: radii.md, background: colors.lime, color: colors.onLime, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: !cohostUsername.trim() || addingCohost ? 0.55 : 1 }}><Users size={17} /></button></div>}{user?.id === event.organizer_id && event.event_state !== 'ended' && event.event_state !== 'cancelled' && <button onClick={() => setEndOpen(true)} style={{ marginTop: 12, border: 0, background: 'transparent', color: colors.lime, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>End event</button>}<button onClick={() => setCancelOpen(true)} style={{ marginTop: 12, marginLeft: 12, border: 0, background: 'transparent', color: '#FCA5A5', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel event</button></section>}

        {!isHost && event.event_state !== 'ended' && event.event_state !== 'cancelled' && <button onClick={handleSecondaryRSVP} disabled={secondaryLoading || event.user_status === 'waitlist'} style={{ width: '100%', minHeight: 38, marginTop: 14, border: 0, background: 'transparent', color: event.user_status === 'going' ? '#FCA5A5' : colors.textSecondary, fontSize: 11, fontWeight: 800, cursor: 'pointer', opacity: secondaryLoading || event.user_status === 'waitlist' ? 0.55 : 1 }}>{secondaryLoading ? 'Updating…' : event.user_status === 'going' ? 'Leave event' : event.user_status === 'interested' ? 'Remove interest' : 'I’m interested'}</button>}
         <div style={{ display: 'flex', gap: 9, marginTop: 5 }}><button onClick={openChat} disabled={['cancelled', 'ended'].includes(event.event_state || '')} style={{ ...secondaryButton, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: ['cancelled', 'ended'].includes(event.event_state || '') ? 0.55 : 1 }}><MessageCircle size={17} /> {['cancelled', 'ended'].includes(event.event_state || '') ? 'Chat closed' : 'Event chat'}</button><button onClick={() => downloadICS(event)} style={{ ...secondaryButton, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><CalendarPlus size={17} /> Add to calendar</button></div>
      </div>

      <PromptDialog open={reportOpen} title="Report event" message="Tell us what’s wrong with this event. Our safety team will review the details and event media." placeholder="Share any details that will help our safety team." submitLabel="Submit report" busy={reporting} onCancel={() => !reporting && setReportOpen(false)} onSubmit={(reason, details) => void submitReport(reason, details)} />
      <ConfirmDialog
        open={cancelOpen}
        title="Cancel this event?"
        message="This permanently deletes the event, its event chat, attendee updates, and event notifications."
        confirmLabel="Cancel event"
        cancelLabel="Keep event"
        destructive
        busy={cancelling}
        onCancel={() => { if (!cancelling) setCancelOpen(false) }}
        onConfirm={() => void cancelEvent()}
      />
      <ConfirmDialog
        open={endOpen}
        title="End this event?"
        message="This permanently deletes the event, its event chat, attendee updates, and event notifications."
        confirmLabel="End event"
        cancelLabel="Keep event open"
        busy={ending}
        onCancel={() => { if (!ending) setEndOpen(false) }}
        onConfirm={() => void endEvent()}
      />
    </div>
  )
}

function DetailLoading() {
  return <div style={{ minHeight: '100%', background: colors.bg }}><DetailPageSkeleton kind="event" /></div>
}

function isLive(event: { event_state?: string }) { return event.event_state === 'live' }
function formatRelative(value: string) { const delta = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000)); return delta < 60 ? `${delta}m ago` : delta < 1440 ? `${Math.round(delta / 60)}h ago` : `${Math.round(delta / 1440)}d ago` }

function InfoCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) { return <div style={{ minWidth: 0, overflow: 'hidden', padding: 12, borderRadius: radii.md, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.04)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.textMuted, fontSize: 9, fontWeight: 900, letterSpacing: '0.1em' }}>{icon}{label}</div><div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8, minWidth: 0, fontSize: 12 }}>{children}</div></div> }
function Stat({ label, value }: { label: string; value: number }) { return <div style={{ flex: 1, padding: '10px 11px', borderRadius: radii.md, background: 'rgba(255,255,255,0.045)', border: `1px solid ${colors.border}` }}><strong style={{ display: 'block', color: colors.textPrimary, fontSize: 18 }}>{value}</strong><span style={{ display: 'block', marginTop: 3, color: colors.textMuted, fontSize: 10 }}>{label}</span></div> }

const sectionStyle: React.CSSProperties = { marginTop: 14, padding: 14, borderRadius: radii.lg, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.035)' }
const eyebrow: React.CSSProperties = { margin: 0, color: colors.textPrimary, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1px solid ${colors.border}`, borderRadius: radii.md, background: 'rgba(255,255,255,0.05)', color: colors.textPrimary, padding: '0 12px', outline: 'none', fontFamily: typography.fontBody }
const primaryButton: React.CSSProperties = { minHeight: 48, border: 0, borderRadius: radii.pill, background: colors.lime, color: colors.onLime, fontWeight: 900, fontSize: 12, letterSpacing: '0.03em', cursor: 'pointer', boxShadow: shadows.btn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }
const secondaryButton: React.CSSProperties = { minHeight: 46, border: `1px solid ${colors.borderStrong}`, borderRadius: radii.pill, background: 'rgba(255,255,255,0.045)', color: colors.textPrimary, fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: '0 14px' }
const circleButton: React.CSSProperties = { width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(5,5,9,0.52)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(8px)' }
const mutedPill: React.CSSProperties = { padding: '5px 8px', borderRadius: 99, background: 'rgba(5,5,9,0.64)', color: 'rgba(255,255,255,0.78)', border: '1px solid rgba(255,255,255,0.14)', fontSize: 10, fontWeight: 800 }
function pill(active: boolean): React.CSSProperties { return { padding: '5px 8px', borderRadius: 99, background: active ? colors.lime : 'rgba(5,5,9,0.64)', color: active ? colors.onLime : '#fff', border: active ? 'none' : '1px solid rgba(255,255,255,0.14)', fontSize: 10, fontWeight: 900 } }