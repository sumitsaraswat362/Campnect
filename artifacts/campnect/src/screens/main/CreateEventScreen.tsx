import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, ImagePlus, Loader2, MapPin, UploadCloud } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { eventsApi } from '../../api/events'
import { Avatar } from '../../components/shared/Avatar'
import { EventCoverEditor } from '../../components/events/EventCoverEditor'
import { EventCollegePicker } from '../../components/events/EventCollegePicker'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { EventDateField } from '../../components/events/EventDateField'
import { EventTimeField } from '../../components/events/EventTimeField'
import { colors, motion, radii, shadows, typography } from '../../styles/tokens'
import { useAuthStore } from '../../stores/authStore'
import { mediaUploadError } from '../../utils/mediaUploadPolicy'

const CATEGORIES = ['Music', 'Sports', 'Gaming', 'Coding', 'Academic', 'Clubs', 'Meetups', 'Social', 'Competition', 'Other']
const EVENT_TYPES = ['Public event', 'Private event']

type FormState = {
  title: string
  description: string
  category: string
  visibility: 'public' | 'private'
  date: string
  startTime: string
  collegeId: string
  locationType: 'inside' | 'outside'
  location: string
  address: string
  isOnline: boolean
  meetingLink: string
  capacity: string
  allowWaitlist: boolean
}

const INITIAL_FORM: FormState = {
  title: '',
  description: '',
  category: 'Social',
  visibility: 'public',
  date: '',
  startTime: '',
  collegeId: '',
  locationType: 'inside',
  location: '',
  address: '',
  isOnline: false,
  meetingLink: '',
  capacity: '',
  allowWaitlist: true,
}

export function CreateEventScreen() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [cover, setCover] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const isCeo = user?.username?.trim().toLowerCase() === 'ceo'

  useBackDismiss(step === 2, () => setStep(1), 150)
  useBackDismiss(step === 3, () => setStep(2), 160)

  useEffect(() => {
    return () => { if (coverPreview) URL.revokeObjectURL(coverPreview) }
  }, [coverPreview])

  useEffect(() => {
    if (isCeo || !user?.college_id) return
    setForm((current) => current.collegeId ? current : { ...current, collegeId: user.college_id! })
  }, [isCeo, user?.college_id])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const datePreview = useMemo(() => {
    if (!form.date) return '24 May 2025'
    return new Date(`${form.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }, [form.date])

  const timePreview = form.startTime
    ? formatTime(form.startTime)
    : 'Choose a start time'

  const validateStep = (requestedStep: 1 | 2 | 3) => {
    if (requestedStep === 1) {
      if (form.title.trim().length < 3) { toast.error('Add an event name first'); return false }
      if (form.description.trim().length < 5) { toast.error('Add a short description so students know what to expect'); return false }
    }
    if (requestedStep === 2) {
      if (!form.date || !form.startTime) { toast.error('Choose a date and start time'); return false }
      const start = new Date(`${form.date}T${form.startTime}`)
      if (Number.isNaN(start.getTime())) { toast.error('Choose a valid date and time'); return false }
      if (start.getTime() <= Date.now()) { toast.error('Events must start in the future'); return false }
      if (!form.isOnline && !form.location.trim()) { toast.error('Add a venue or switch on Online event'); return false }
      if (!form.isOnline && form.locationType === 'outside' && form.address.trim().length < 8) { toast.error('Add the complete outside address, including street or landmark and city'); return false }
       if (!form.isOnline && form.locationType === 'inside' && !(isCeo ? form.collegeId : user?.college_id)) { toast.error(isCeo ? 'Choose a college for this inside-campus event' : 'Verify your college before creating an inside-campus event'); return false }
      if (form.isOnline && form.meetingLink && !/^https?:\/\//i.test(form.meetingLink)) { toast.error('Meeting link must be a valid URL'); return false }
      if (form.capacity && (!/^\d+$/.test(form.capacity) || Number(form.capacity) < 2)) { toast.error('Capacity must be at least 2'); return false }
    }
    return true
  }

  const selectCover = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Use a JPG, PNG, WEBP, or GIF image'); return }
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

  const publish = async () => {
    if (!validateStep(1) || !validateStep(2)) return
    if (cover) {
      const error = await mediaUploadError(cover, 'image')
      if (error) { toast.error(error); return }
    }
    setPublishing(true)
    setUploadProgress(cover ? 0 : 100)
    try {
      const data = new FormData()
      data.append('title', form.title.trim())
      data.append('description', form.description.trim())
      data.append('category', form.category)
      data.append('type', form.category.toLowerCase() === 'coding' ? 'hackathon' : 'meetup')
      data.append('visibility', form.visibility)
      data.append('starts_at', new Date(`${form.date}T${form.startTime}`).toISOString())
      data.append('location_type', form.locationType)
       if (!form.isOnline && form.locationType === 'inside') data.append('college_id', form.collegeId || user?.college_id || '')
      data.append('location', form.isOnline ? '' : form.location.trim())
      data.append('address', form.address.trim())
      data.append('is_online', String(form.isOnline))
      data.append('meeting_link', form.isOnline ? form.meetingLink.trim() : '')
      data.append('allow_waitlist', String(form.allowWaitlist))
      if (form.capacity) data.append('max_attendees', form.capacity)
      if (cover) data.append('cover', cover, cover.name)

      const response = await eventsApi.create(data, setUploadProgress)
      toast.success('Your event is live')
      navigate(`/app/events/${response.data.data.id}/confirmation`, { replace: true })
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Unable to publish event')
    } finally {
      setPublishing(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', minHeight: 48, boxSizing: 'border-box', border: `1px solid ${colors.border}`,
    borderRadius: radii.md, background: 'rgba(255,255,255,0.045)', color: colors.textPrimary,
    padding: '0 14px', outline: 'none', fontFamily: typography.fontBody, fontSize: 14,
  }
  const labelStyle: React.CSSProperties = { display: 'block', margin: '0 0 7px', color: colors.textSecondary, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }

  return (
    <div className="route-viewport" style={{ display: 'flex', flexDirection: 'column', background: colors.bg, color: colors.textPrimary, paddingTop: 'var(--sat)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 62, padding: '0 14px', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
        <button onClick={requestAppBack} aria-label="Go back" style={{ width: 40, height: 40, border: 0, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', color: colors.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Create event</h1>
          <p style={{ margin: '3px 0 0', color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Step {step} of 3 · {['Info', 'Details', 'Preview'][step - 1]}</p>
        </div>
        {step < 3 ? (
          <button onClick={() => validateStep(step) && setStep((step + 1) as 1 | 2 | 3)} style={{ border: 0, background: 'transparent', color: colors.lime, fontWeight: 800, fontSize: 13, cursor: 'pointer', minHeight: 44, padding: '0 4px' }}>Next</button>
        ) : (
          <button onClick={publish} disabled={publishing} style={{ border: 0, borderRadius: radii.pill, background: colors.lime, color: colors.onLime, minHeight: 38, padding: '0 13px', fontWeight: 900, fontSize: 12, cursor: publishing ? 'wait' : 'pointer', opacity: publishing ? 0.72 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {publishing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}{publishing ? 'Publishing' : 'Publish'}
          </button>
        )}
      </header>

      <div style={{ display: 'flex', gap: 6, padding: '14px 16px 0' }}>
        {[1, 2, 3].map((item) => (
          <div key={item} style={{ flex: 1 }}>
            <div style={{ height: 3, borderRadius: 99, background: item <= step ? colors.lime : 'rgba(255,255,255,0.13)', boxShadow: item === step ? '0 0 10px rgba(187,255,0,0.32)' : 'none', transition: `all ${motion.base} ${motion.easeSmooth}` }} />
            <span style={{ display: 'block', marginTop: 6, color: item === step ? colors.textPrimary : colors.textMuted, fontSize: 9, textAlign: 'center', fontWeight: 700 }}>{['Info', 'Details', 'Preview'][item - 1]}</span>
          </div>
        ))}
      </div>

      <main style={{ flex: 1, overflowY: 'auto', padding: '20px 16px calc(34px + env(safe-area-inset-bottom, 0px))' }}>
        {step === 1 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 17 }}>
            <div>
              <p style={{ margin: 0, color: colors.lime, fontSize: 11, fontWeight: 800, letterSpacing: '0.11em', textTransform: 'uppercase' }}>Start with the spark</p>
              <h2 style={{ margin: '6px 0 0', fontSize: 24, lineHeight: 1.1, letterSpacing: '-0.04em' }}>Give your event a reason to show up.</h2>
            </div>

             <div>
               <label
                 onDragOver={(event) => event.preventDefault()}
                 onDrop={(event) => { event.preventDefault(); selectCover(event.dataTransfer.files?.[0]) }}
                 style={{ display: 'block', height: 166, borderRadius: radii.lg, border: `1px dashed ${coverPreview ? 'rgba(187,255,0,0.58)' : 'rgba(63,63,70,0.65)'}`, background: coverPreview ? `linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.45)), url(${coverPreview}) center/cover` : 'linear-gradient(135deg, rgba(24,24,27,0.14), rgba(255,255,255,0.025))', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}
               >
                 <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => selectCover(event.target.files?.[0])} style={{ display: 'none' }} />
                 <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 9, color: coverPreview ? '#fff' : colors.textSecondary, background: coverPreview ? 'linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.62))' : 'transparent' }}>
                   {coverPreview ? <ImagePlus size={23} /> : <UploadCloud size={26} color={colors.purpleBright} strokeWidth={1.5} />}
                   <span style={{ fontSize: 12, fontWeight: 700 }}>{coverPreview ? 'Change event image' : 'Add event image'}</span>
                   {!coverPreview && <span style={{ color: colors.textMuted, fontSize: 10 }}>Optional · JPG, PNG, WEBP · up to 25 MB</span>}
                 </div>
               </label>
               {cover && <button type="button" onClick={() => setCropFile(cover)} style={{ width: '100%', minHeight: 36, marginTop: 8, border: `1px solid ${colors.border}`, borderRadius: radii.pill, background: 'rgba(255,255,255,0.045)', color: colors.textSecondary, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Edit crop & zoom</button>}
             </div>

            <div><label style={labelStyle}>Event name *</label><input autoFocus value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. Campus Rap Battle" maxLength={100} style={inputStyle} /></div>
            <div><label style={labelStyle}>Short description *</label><textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Show your bars. No cap." maxLength={2000} rows={3} style={{ ...inputStyle, height: 88, paddingTop: 13, resize: 'none', lineHeight: 1.45 }} /><span style={{ display: 'block', color: colors.textMuted, textAlign: 'right', fontSize: 10, marginTop: 4 }}>{form.description.length}/2000</span></div>

            <div>
              <label style={labelStyle}>Category</label>
              <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 3, scrollbarWidth: 'none' }}>
                {CATEGORIES.map((category) => <button key={category} onClick={() => update('category', category)} style={{ minHeight: 36, flexShrink: 0, padding: '0 12px', borderRadius: radii.pill, border: `1px solid ${form.category === category ? 'rgba(187,255,0,0.75)' : colors.border}`, background: form.category === category ? colors.limeDim : 'rgba(255,255,255,0.035)', color: form.category === category ? colors.lime : colors.textSecondary, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{category}</button>)}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Event type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {EVENT_TYPES.map((type) => {
                  const value = type === 'Public event' ? 'public' : 'private'
                  const active = form.visibility === value
                  return <button key={type} onClick={() => update('visibility', value)} style={{ minHeight: 56, textAlign: 'left', padding: '0 13px', borderRadius: radii.md, border: `1px solid ${active ? 'rgba(187,255,0,0.7)' : colors.border}`, background: active ? colors.limeDim : 'rgba(255,255,255,0.035)', color: active ? colors.lime : colors.textSecondary, cursor: 'pointer' }}><span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>{type}</span><span style={{ display: 'block', marginTop: 4, fontSize: 10, color: active ? 'rgba(187,255,0,0.78)' : colors.textMuted }}>{active ? 'Selected' : value === 'public' ? 'Discoverable on campus' : 'Invite or approve only'}</span></button>
                })}
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 17 }}>
            <div><p style={{ margin: 0, color: colors.lime, fontSize: 11, fontWeight: 800, letterSpacing: '0.11em', textTransform: 'uppercase' }}>Make it easy to find</p><h2 style={{ margin: '6px 0 0', fontSize: 24, lineHeight: 1.1, letterSpacing: '-0.04em' }}>When and where?</h2></div>
             <EventDateField label="Date" value={form.date} onChange={(value) => update('date', value)} required />
             <EventTimeField label="Start time" value={form.startTime} onChange={(value) => update('startTime', value)} required />
              <div><label style={labelStyle}>Where is it happening?</label><div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>{(['inside', 'outside'] as const).map((value) => <button key={value} type="button" onClick={() => update('locationType', value)} style={{ minHeight: 56, padding: '0 12px', borderRadius: radii.md, border: `1px solid ${form.locationType === value ? 'rgba(187,255,0,0.7)' : colors.border}`, background: form.locationType === value ? colors.limeDim : 'rgba(255,255,255,0.035)', color: form.locationType === value ? colors.lime : colors.textSecondary, textAlign: 'left', cursor: 'pointer' }}><strong style={{ display: 'block', fontSize: 12 }}>{value === 'inside' ? 'Inside campus' : 'Outside campus'}</strong><span style={{ display: 'block', marginTop: 4, color: form.locationType === value ? 'rgba(187,255,0,0.8)' : colors.textMuted, fontSize: 10 }}>{value === 'inside' ? isCeo ? form.collegeId ? 'Campus selected' : 'Choose a campus' : user?.college_name || 'Your verified college' : 'Use a complete street address'}</span></button>)}</div></div>
              {isCeo && form.locationType === 'inside' && <EventCollegePicker value={form.collegeId} fallbackName={user?.college_name} onChange={(value) => update('collegeId', value)} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 13px', borderRadius: radii.md, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.035)' }}><div style={{ width: 36, height: 36, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.purpleDim }}><MapPin size={17} color={colors.lime} /></div><div style={{ flex: 1 }}><p style={{ margin: 0, color: colors.textPrimary, fontWeight: 800, fontSize: 13 }}>Online event</p><p style={{ margin: '3px 0 0', color: colors.textMuted, fontSize: 10 }}>Use a meeting link instead of a campus venue</p></div><button role="switch" aria-checked={form.isOnline} onClick={() => update('isOnline', !form.isOnline)} style={{ width: 44, height: 25, padding: 2, borderRadius: 99, border: 0, background: form.isOnline ? colors.lime : 'rgba(255,255,255,0.17)', cursor: 'pointer' }}><span style={{ display: 'block', width: 21, height: 21, borderRadius: '50%', background: form.isOnline ? '#0d1206' : '#fff', transform: `translateX(${form.isOnline ? 19 : 0}px)`, transition: `transform ${motion.fast} ${motion.easeSpring}` }} /></button></div>
              {form.isOnline ? <div><label style={labelStyle}>Meeting link</label><input type="url" value={form.meetingLink} onChange={(event) => update('meetingLink', event.target.value)} placeholder="https://meet.google.com/..." style={inputStyle} /></div> : <><div><label style={labelStyle}>{form.locationType === 'inside' ? `Campus venue · ${isCeo ? 'selected college' : user?.college_name || 'your college'}` : 'Place or venue name'} *</label><input value={form.location} onChange={(event) => update('location', event.target.value)} placeholder={form.locationType === 'inside' ? 'LHS Amphitheatre' : 'The Grand Hall'} maxLength={200} style={inputStyle} /></div><div><label style={labelStyle}>{form.locationType === 'inside' ? 'Building / campus directions' : 'Full outside address *'}</label><input value={form.address} onChange={(event) => update('address', event.target.value)} placeholder={form.locationType === 'inside' ? 'Building, block, or directions' : '12 Main Street, Mathura, Uttar Pradesh'} maxLength={300} style={inputStyle} /><span style={{ display: 'block', marginTop: 5, color: colors.textMuted, fontSize: 10 }}>{form.locationType === 'outside' ? 'Include street or landmark, city, and state.' : isCeo ? 'The selected college is attached automatically.' : 'Your verified college is attached automatically.'}</span></div></>}
             <div><label style={labelStyle}>Capacity</label><input type="number" min={2} value={form.capacity} onChange={(event) => update('capacity', event.target.value)} placeholder="150 (leave blank for unlimited)" style={inputStyle} /></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px', borderRadius: radii.md, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.035)' }}><div><p style={{ margin: 0, color: colors.textPrimary, fontSize: 13, fontWeight: 800 }}>Allow waitlist</p><p style={{ margin: '3px 0 0', color: colors.textMuted, fontSize: 10 }}>Students can queue when capacity is reached</p></div><button role="switch" aria-checked={form.allowWaitlist} onClick={() => update('allowWaitlist', !form.allowWaitlist)} style={{ width: 44, height: 25, padding: 2, borderRadius: 99, border: 0, background: form.allowWaitlist ? colors.lime : 'rgba(255,255,255,0.17)', cursor: 'pointer' }}><span style={{ display: 'block', width: 21, height: 21, borderRadius: '50%', background: form.allowWaitlist ? '#0d1206' : '#fff', transform: `translateX(${form.allowWaitlist ? 19 : 0}px)`, transition: `transform ${motion.fast} ${motion.easeSpring}` }} /></button></div>
          </section>
        )}

        {step === 3 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><p style={{ margin: 0, color: colors.lime, fontSize: 11, fontWeight: 800, letterSpacing: '0.11em', textTransform: 'uppercase' }}>One last look</p><h2 style={{ margin: '6px 0 0', fontSize: 24, lineHeight: 1.1, letterSpacing: '-0.04em' }}>Preview your event</h2><p style={{ margin: '8px 0 0', color: colors.textMuted, fontSize: 12, lineHeight: 1.45 }}>This is how your event will appear to students on campus.</p></div>
            <div style={{ overflow: 'hidden', borderRadius: radii.lg, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.045)', boxShadow: shadows.card }}>
              <div style={{ height: 178, position: 'relative', background: coverPreview ? `linear-gradient(180deg, transparent, rgba(5,5,9,0.85)), url(${coverPreview}) center/cover` : 'linear-gradient(135deg, rgba(24,24,27,0.52), rgba(5,5,9,0.94))' }}><div style={{ position: 'absolute', bottom: 13, left: 14, right: 14 }}><span style={{ display: 'inline-block', marginBottom: 8, padding: '5px 9px', borderRadius: 99, background: colors.lime, color: '#101506', fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}>{form.category}</span><h3 style={{ margin: 0, color: '#fff', fontSize: 22, lineHeight: 1.1, letterSpacing: '-0.035em' }}>{form.title || 'Your event name'}</h3></div></div>
               <div style={{ padding: 14 }}><div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: colors.textSecondary, fontSize: 12 }}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><CalendarDays size={15} color={colors.lime} />{datePreview} · {timePreview}</span><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><MapPin size={15} color={colors.lime} />{form.isOnline ? 'Online event' : form.location || 'Campus venue'}{!form.isOnline && <small style={{ color: colors.textMuted }}>· {form.locationType === 'inside' ? user?.college_name || 'Your college' : form.address || 'Outside address'}</small>}</span></div><p style={{ margin: '14px 0 0', color: colors.textSecondary, fontSize: 13, lineHeight: 1.5 }}>{form.description || 'Your event description'}</p><div style={{ height: 1, background: colors.border, margin: '14px 0' }} /><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar src={user?.avatar_url} name={user?.full_name || 'You'} size={28} /><div><p style={{ margin: 0, color: colors.textPrimary, fontSize: 12, fontWeight: 800 }}>{user?.full_name || 'You'}</p><p style={{ margin: '2px 0 0', color: colors.textMuted, fontSize: 10 }}>Organizer · {form.visibility === 'public' ? 'Public event' : 'Private event'}</p></div></div></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 13, borderRadius: radii.md, background: colors.limeDim, border: '1px solid rgba(187,255,0,0.18)', color: colors.textSecondary, fontSize: 12 }}><Check size={16} color={colors.lime} /><span><strong style={{ color: colors.lime }}>Ready to publish.</strong> Students will be able to discover and join this event after it is saved.</span></div>
            {publishing && <div><div style={{ display: 'flex', justifyContent: 'space-between', color: colors.textMuted, fontSize: 10, marginBottom: 6 }}><span>{cover ? 'Uploading event image' : 'Publishing event'}</span><span>{uploadProgress}%</span></div><div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${uploadProgress}%`, background: colors.lime, transition: 'width 160ms ease' }} /></div></div>}
          </section>
        )}
      </main>
      {cropFile && <EventCoverEditor file={cropFile} onApply={applyCover} onCancel={() => setCropFile(null)} />}
    </div>
  )
}

function formatTime(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}