import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate, useParams } from 'react-router-dom'
import { eventsApi } from '../../api/events'
import { Avatar } from '../../components/shared/Avatar'
import { PeopleRowsSkeleton } from '../../components/shared/AppSkeletons'
import { useAuthStore } from '../../stores/authStore'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useEventStore } from '../../stores/eventStore'
import { colors, radii } from '../../styles/tokens'

type Tab = 'going' | 'interested' | 'waitlist' | 'hosts'

export function EventAttendeesScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentEvent: event, loading, fetchEvent } = useEventStore()
  const [tab, setTab] = useState<Tab>('going')
  const [attendees, setAttendees] = useState<any[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const isHost = Boolean(event && user && (event.organizer_id === user.id || event.hosts?.some((host) => host.id === user.id)))
  const isOrganizer = Boolean(event && user && event.organizer_id === user.id)

  useEffect(() => { if (id && event?.id !== id) void fetchEvent(id) }, [id, event?.id, fetchEvent])
  useEffect(() => {
    if (!id || tab === 'hosts') return
    setListLoading(true)
    void eventsApi.getAttendees(id, tab).then((response) => setAttendees(response.data.data || [])).catch(() => setAttendees([])).finally(() => setListLoading(false))
  }, [id, tab])

  const list = tab === 'hosts' ? (event?.hosts || []) : attendees
  const manageWaitlist = async (personId: string, action: 'promote' | 'remove') => {
    if (!id || actionId) return
    setActionId(personId)
    try {
      if (action === 'promote') await eventsApi.promoteAttendee(id, personId)
      else await eventsApi.removeAttendee(id, personId)
      setAttendees((current) => current.filter((person) => person.id !== personId))
      await fetchEvent(id)
      toast.success(action === 'promote' ? 'Attendee promoted' : 'Removed from waitlist')
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Unable to update the waitlist')
    } finally {
      setActionId(null)
    }
  }
  const removeHost = async (personId: string) => {
    if (!id || actionId || !isOrganizer || personId === event?.organizer_id) return
    setActionId(personId)
    try {
      await eventsApi.removeHost(id, personId)
      await fetchEvent(id)
      toast.success('Co-host removed')
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Unable to remove co-host')
    } finally {
      setActionId(null)
    }
  }

  return (
    <div style={{ minHeight: '100%', background: colors.bg, color: colors.textPrimary }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 62, padding: '0 14px', borderBottom: `1px solid ${colors.border}` }}><button onClick={requestAppBack} style={circleButton}><ArrowLeft size={18} /></button><div><h1 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Attendees</h1><p style={{ margin: '3px 0 0', color: colors.textMuted, fontSize: 10 }}>{event?.title || 'Event people'}</p></div></header>
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '16px 16px 12px' }}>{(['going', 'interested', ...(isHost ? ['waitlist'] : []), 'hosts'] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} style={{ flex: '1 0 auto', minHeight: 40, borderRadius: radii.pill, border: `1px solid ${tab === item ? 'rgba(187,255,0,0.65)' : colors.border}`, background: tab === item ? colors.limeDim : 'rgba(255,255,255,0.035)', color: tab === item ? colors.lime : colors.textSecondary, padding: '0 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer', textTransform: 'capitalize' }}>{item === 'going' ? `Going ${event?.counts?.going ? `(${event.counts.going})` : ''}` : item === 'interested' ? `Interested ${event?.counts?.interested ? `(${event.counts.interested})` : ''}` : item === 'waitlist' ? `Waitlist ${event?.counts?.waitlist ? `(${event.counts.waitlist})` : ''}` : `Hosts ${event?.hosts?.length ? `(${event.hosts.length})` : ''}`}</button>)}</div>
       <div style={{ padding: '0 16px 30px' }}>{(loading || listLoading) && <PeopleRowsSkeleton count={5} action={false} />}{!loading && !listLoading && list.length === 0 && <div style={{ padding: '48px 20px', textAlign: 'center', color: colors.textMuted }}><Users size={30} color={colors.purpleBright} /><p style={{ margin: '12px 0 0', fontSize: 13 }}>No {tab} students yet.</p></div>}{!loading && !listLoading && list.map((person: any) => <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '12px 0', borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary }}><button onClick={() => person.username && navigate(`/app/profile/${person.username}`)} style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0, border: 0, background: 'transparent', color: colors.textPrimary, textAlign: 'left', cursor: 'pointer', padding: 0 }}><Avatar src={person.avatar_url} name={person.full_name} size={42} /><span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.full_name}</strong><small style={{ display: 'block', marginTop: 4, color: colors.textMuted, fontSize: 11 }}>@{person.username} · {person.college_name || 'Campus student'}</small></span></button>{tab === 'hosts' && isOrganizer && person.id !== event?.organizer_id ? <button disabled={actionId === person.id} onClick={() => void removeHost(person.id)} style={{ ...actionButton, color: '#FCA5A5', borderColor: 'rgba(239,68,68,0.28)' }}>{actionId === person.id ? '…' : 'Remove'}</button> : (tab === 'waitlist' || tab === 'going') && isHost ? <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}><button disabled={actionId === person.id} onClick={() => void manageWaitlist(person.id, 'remove')} style={{ ...actionButton, color: '#FCA5A5', borderColor: 'rgba(239,68,68,0.28)' }}>{actionId === person.id ? '…' : 'Remove'}</button>{tab === 'waitlist' && <button disabled={actionId === person.id} onClick={() => void manageWaitlist(person.id, 'promote')} style={actionButton}>Promote</button>}</div> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: tab === 'hosts' ? colors.lime : colors.textMuted, fontSize: 10, fontWeight: 800 }}>{tab === 'hosts' ? <CheckCircle2 size={14} /> : tab === 'going' ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}{tab === 'hosts' ? person.role || 'Host' : tab === 'going' ? 'Going' : 'Interested'}</span>}</div>)}</div>
    </div>
  )
}

const circleButton: React.CSSProperties = { width: 40, height: 40, borderRadius: '50%', border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.05)', color: colors.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
const actionButton: React.CSSProperties = { minHeight: 32, padding: '0 9px', borderRadius: radii.pill, border: `1px solid rgba(187,255,0,0.35)`, background: 'rgba(187,255,0,0.08)', color: colors.lime, fontSize: 10, fontWeight: 800, cursor: 'pointer' }