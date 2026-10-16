import { useEffect, useState } from 'react'
import { ArrowLeft, ImagePlus, Loader2, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate, useParams } from 'react-router-dom'
import { eventsApi } from '../../api/events'
import { Avatar } from '../../components/shared/Avatar'
import { EventCoverEditor } from '../../components/events/EventCoverEditor'
import { EventCollegePicker } from '../../components/events/EventCollegePicker'
import { requestAppBack } from '../../navigation/appBackRequest'
import { EventDateField } from '../../components/events/EventDateField'
import { EventTimeField } from '../../components/events/EventTimeField'
import { DetailPageSkeleton } from '../../components/shared/AppSkeletons'
import { useAuthStore } from '../../stores/authStore'
import { useEventStore } from '../../stores/eventStore'
import { colors, motion, radii, shadows, typography } from '../../styles/tokens'
import { parseApiDate } from '../../utils/dateTime'
import { mediaUploadError } from '../../utils/mediaUploadPolicy'

const CATEGORIES = ['Music', 'Sports', 'Gaming', 'Coding', 'Academic', 'Clubs', 'Meetups', 'Social', 'Competition', 'Other']

export function EditEventScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentEvent: event, loading, fetchEvent } = useEventStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Social')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [collegeId, setCollegeId] = useState('')
  const [locationType, setLocationType] = useState<'inside' | 'outside'>('inside')
  const [location, setLocation] = useState('')
  const [address, setAddress] = useState('')
  const [isOnline, setIsOnline] = useState(false)
  const [meetingLink, setMeetingLink] = useState('')
  const [capacity, setCapacity] = useState('')
  const [allowWaitlist, setAllowWaitlist] = useState(true)
  const [cover, setCover] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const isCeo = user?.username?.trim().toLowerCase() === 'ceo'

  useEffect(() => { if (id) void fetchEvent(id) }, [id, fetchEvent])
  useEffect(() => {
    if (!event || event.id !== id) return
    const starts = parseApiDate(event.starts_at)
    setTitle(event.title)
    setDescription(event.description || '')
    setCategory(event.category || event.type || 'Social')
    setVisibility(event.visibility || 'public')
    setDate(toDateInput(starts))
    setStartTime(toTimeInput(starts))
    setCollegeId(event.college_id || user?.college_id || '')
    setLocationType(event.location_type || 'inside')
    setLocation(event.location || '')
    setAddress(event.address || '')
    setIsOnline(Boolean(event.is_online))
    setMeetingLink(event.meeting_link || '')
    setCapacity(event.max_attendees ? String(event.max_attendees) : '')
    setAllowWaitlist(Boolean(event.allow_waitlist))
  }, [event?.id, id, user?.college_id])

  const existingCover = coverPreview || event?.cover_url || null
  const selectCover = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Choose an image for the event cover.'); return }
    const error = await mediaUploadError(file, 'image')
    if (error) { toast.error(error); return }
    setCropFile(file)
  }
  const applyCover = async (file: File, previewUrl: string) => {
    const error = await mediaUploadError(file, 'image')
    if (error) { URL.revokeObjectURL(previewUrl); toast.error(error); return }
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCover(file)
    setCoverPreview(previewUrl)
    setCropFile(null)
  }
  const save = async () => {
    if (!id || !title.trim() || !description.trim() || !date || !startTime) { toast.error('Complete the event details first'); return }
    const starts = new Date(`${date}T${startTime}`)
    if (Number.isNaN(starts.getTime()) || starts <= new Date()) { toast.error('Choose a valid future date and start time'); return }
    if (!isOnline && !location.trim()) { toast.error('Add a venue or switch on Online event'); return }
    if (!isOnline && locationType === 'outside' && address.trim().length < 8) { toast.error('Add the complete outside address, including street or landmark and city'); return }
    if (!isOnline && locationType === 'inside' && !(isCeo ? collegeId : user?.college_id)) { toast.error(isCeo ? 'Choose a college for this inside-campus event' : 'Verify your college before using an inside-campus location'); return }
    if (cover) {
      const error = await mediaUploadError(cover, 'image')
      if (error) { toast.error(error); return }
    }
    setSaving(true)
    try {
      const data = new FormData()
      data.append('title', title.trim())
      data.append('description', description.trim())
      data.append('category', category)
      data.append('type', category.toLowerCase() === 'coding' ? 'hackathon' : 'meetup')
      data.append('visibility', visibility)
      data.append('starts_at', starts.toISOString())
      data.append('location_type', locationType)
      if (!isOnline && locationType === 'inside') data.append('college_id', collegeId || user?.college_id || '')
      data.append('location', isOnline ? '' : location.trim())
      data.append('address', address.trim())
      data.append('is_online', String(isOnline))
      data.append('meeting_link', isOnline ? meetingLink.trim() : '')
      data.append('allow_waitlist', String(allowWaitlist))
      data.append('max_attendees', capacity)
      if (cover) data.append('cover', cover, cover.name)
      await eventsApi.update(id, data)
      await fetchEvent(id)
      toast.success('Event updated')
      navigate(`/app/events/${id}`)
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Unable to update event')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !event) return <div style={{ minHeight: '100%', background: colors.bg }}><DetailPageSkeleton kind="form" /></div>

  return (
    <div style={shell}>
      <header style={header}><button onClick={requestAppBack} aria-label="Go back" style={circleButton}><ArrowLeft size={18} /></button><div style={{ flex: 1 }}><h1 style={{ margin: 0, fontSize: 16 }}>Edit event</h1><p style={{ margin: '3px 0 0', color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Host tools</p></div><button onClick={save} disabled={saving} style={{ ...saveButton, opacity: saving ? 0.65 : 1 }}>{saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : 'Save'}</button></header>
      <main style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}><Avatar src={user?.avatar_url} name={user?.full_name || 'Host'} size={34} /><div><p style={{ margin: 0, color: colors.textPrimary, fontSize: 12, fontWeight: 800 }}>{event?.title || 'Event'}</p><p style={{ margin: '3px 0 0', color: colors.textMuted, fontSize: 10 }}>Changes are visible to attendees</p></div></div>
        <label style={labelStyle}>Event cover</label><label style={{ display: 'block', height: 146, marginBottom: cover ? 8 : 17, borderRadius: radii.lg, border: `1px dashed ${colors.borderStrong}`, background: existingCover ? `linear-gradient(180deg, transparent, rgba(5,5,9,0.56)), url(${existingCover}) center/cover` : colors.purpleDim, cursor: 'pointer', overflow: 'hidden' }}><input type="file" accept="image/*" onChange={(e) => selectCover(e.target.files?.[0])} style={{ display: 'none' }} /><span style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, color: '#fff', fontSize: 11, fontWeight: 800, background: existingCover ? 'linear-gradient(180deg, transparent, rgba(0,0,0,0.6))' : 'transparent' }}><ImagePlus size={24} />Change image</span></label>{cover && <button type="button" onClick={() => setCropFile(cover)} style={{ width: '100%', minHeight: 36, marginBottom: 17, border: `1px solid ${colors.border}`, borderRadius: radii.pill, background: 'rgba(255,255,255,0.045)', color: colors.textSecondary, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Edit crop & zoom</button>}
        <div style={field}><label style={labelStyle}>Event name</label><input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} /></div>
        <div style={field}><label style={labelStyle}>Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ ...inputStyle, height: 100, paddingTop: 12, resize: 'none', lineHeight: 1.45 }} /></div>
        <div style={field}><label style={labelStyle}>Category</label><div style={{ display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none' }}>{CATEGORIES.map((item) => <button key={item} onClick={() => setCategory(item)} style={{ flexShrink: 0, minHeight: 34, padding: '0 11px', borderRadius: radii.pill, border: `1px solid ${category === item ? 'rgba(187,255,0,0.7)' : colors.border}`, background: category === item ? colors.limeDim : 'transparent', color: category === item ? colors.lime : colors.textSecondary, fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>{item}</button>)}</div></div>
         <div style={field}><EventDateField label="Date" value={date} onChange={setDate} required /></div>
        <div style={field}><EventTimeField label="Start time" value={startTime} onChange={setStartTime} required /><span style={{ display: 'block', marginTop: 6, color: colors.textMuted, fontSize: 10 }}>The host will end the event manually.</span></div>
         <div style={field}><label style={labelStyle}>Where is it happening?</label><div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>{(['inside', 'outside'] as const).map((value) => <button key={value} type="button" onClick={() => setLocationType(value)} style={{ minHeight: 56, padding: '0 12px', borderRadius: radii.md, border: `1px solid ${locationType === value ? 'rgba(187,255,0,0.7)' : colors.border}`, background: locationType === value ? colors.limeDim : 'rgba(255,255,255,0.035)', color: locationType === value ? colors.lime : colors.textSecondary, textAlign: 'left', cursor: 'pointer' }}><strong style={{ display: 'block', fontSize: 12 }}>{value === 'inside' ? 'Inside campus' : 'Outside campus'}</strong><span style={{ display: 'block', marginTop: 4, color: locationType === value ? 'rgba(187,255,0,0.8)' : colors.textMuted, fontSize: 10 }}>{value === 'inside' ? isCeo ? collegeId ? 'Campus selected' : 'Choose a campus' : user?.college_name || 'Your verified college' : 'Use a complete street address'}</span></button>)}</div></div>
         {isCeo && locationType === 'inside' && <div style={field}><EventCollegePicker value={collegeId} fallbackName={event?.college_name || user?.college_name} onChange={setCollegeId} /></div>}
         <div style={field}><label style={labelStyle}>{locationType === 'inside' ? `Campus venue · ${isCeo ? 'selected college' : user?.college_name || 'your college'}` : 'Place or venue name'}</label><div style={{ position: 'relative' }}><MapPin size={16} color={colors.lime} style={{ position: 'absolute', left: 13, top: 16 }} /><input value={location} onChange={(e) => setLocation(e.target.value)} disabled={isOnline} placeholder={isOnline ? 'Online event' : locationType === 'inside' ? 'Campus venue' : 'The Grand Hall'} style={{ ...inputStyle, paddingLeft: 40, opacity: isOnline ? 0.6 : 1 }} /></div></div>
         <div style={field}><label style={labelStyle}>{locationType === 'inside' ? 'Building / campus directions' : 'Full outside address *'}</label><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={locationType === 'inside' ? 'Building, block, or directions' : '12 Main Street, Mathura, Uttar Pradesh'} style={inputStyle} /><span style={{ display: 'block', marginTop: 5, color: colors.textMuted, fontSize: 10 }}>{locationType === 'outside' ? 'Include street or landmark, city, and state.' : isCeo ? 'The selected college is attached automatically.' : 'Your verified college is attached automatically.'}</span></div>
        <div style={{ ...field, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 13, borderRadius: radii.md, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.035)' }}><div><strong style={{ display: 'block', fontSize: 12 }}>Online event</strong><span style={{ display: 'block', marginTop: 3, color: colors.textMuted, fontSize: 10 }}>Replace the venue with a meeting link</span></div><button role="switch" aria-checked={isOnline} onClick={() => setIsOnline(!isOnline)} style={toggle(isOnline)}><span style={toggleKnob(isOnline)} /></button></div>
        {isOnline && <div style={field}><label style={labelStyle}>Meeting link</label><input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/..." style={inputStyle} /></div>}
        <div style={{ ...field, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}><div><label style={labelStyle}>Capacity</label><input type="number" min={2} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Unlimited" style={inputStyle} /></div><div><label style={labelStyle}>Visibility</label><select value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private')} style={{ ...inputStyle, colorScheme: 'dark' }}><option value="public">Public</option><option value="private">Private</option></select></div></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 13, borderRadius: radii.md, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.035)' }}><div><strong style={{ display: 'block', fontSize: 12 }}>Allow waitlist</strong><span style={{ display: 'block', marginTop: 3, color: colors.textMuted, fontSize: 10 }}>Keep a queue when the event is full</span></div><button role="switch" aria-checked={allowWaitlist} onClick={() => setAllowWaitlist(!allowWaitlist)} style={toggle(allowWaitlist)}><span style={toggleKnob(allowWaitlist)} /></button></div>
        <button onClick={save} disabled={saving} style={{ ...saveButton, width: '100%', minHeight: 48, marginTop: 18, justifyContent: 'center', opacity: saving ? 0.65 : 1 }}>{saving ? 'Saving changes…' : 'Save changes'}</button>
      </main>
      {cropFile && <EventCoverEditor file={cropFile} onApply={applyCover} onCancel={() => setCropFile(null)} />}
    </div>
  )
}

function toDateInput(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function toTimeInput(date: Date) { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` }
function toggle(active: boolean): React.CSSProperties { return { width: 44, height: 25, padding: 2, borderRadius: 99, border: 0, background: active ? colors.lime : 'rgba(255,255,255,0.17)', cursor: 'pointer' } }
function toggleKnob(active: boolean): React.CSSProperties { return { display: 'block', width: 21, height: 21, borderRadius: '50%', background: active ? '#0d1206' : '#fff', transform: `translateX(${active ? 19 : 0}px)`, transition: `transform ${motion.fast} ${motion.easeSpring}` } }
const shell: React.CSSProperties = { minHeight: '100%', display: 'flex', flexDirection: 'column', background: colors.bg, color: colors.textPrimary }
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 'calc(62px + var(--sat))', padding: 'var(--sat) 14px 0', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }
const circleButton: React.CSSProperties = { width: 40, height: 40, borderRadius: '50%', border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.05)', color: colors.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
const saveButton: React.CSSProperties = { minHeight: 38, display: 'flex', alignItems: 'center', gap: 6, border: 0, borderRadius: radii.pill, background: colors.lime, color: '#0d1106', padding: '0 15px', fontSize: 12, fontWeight: 900, cursor: 'pointer', boxShadow: shadows.btn }
const inputStyle: React.CSSProperties = { width: '100%', minHeight: 46, boxSizing: 'border-box', border: `1px solid ${colors.border}`, borderRadius: radii.md, background: 'rgba(255,255,255,0.045)', color: colors.textPrimary, padding: '0 13px', outline: 'none', fontFamily: typography.fontBody, fontSize: 13 }
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 7, color: colors.textSecondary, fontSize: 10, fontWeight: 900, letterSpacing: '0.09em', textTransform: 'uppercase' }
const field: React.CSSProperties = { marginBottom: 16 }