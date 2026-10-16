import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Camera, Check, ChevronDown, Link2, Plus, Search, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { Avatar } from '../../components/shared/Avatar'
import { Button } from '../../components/ui/Button'
import { GlassCard } from '../../components/ui/GlassCard'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { ImageCropper } from '../../components/shared/ImageCropper'
import { usersApi } from '../../api/users'
import { useAuthStore } from '../../stores/authStore'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { DetailPageSkeleton } from '../../components/shared/AppSkeletons'
import { colors, radii, typography } from '../../styles/tokens'
import { getCourseCatalogForCollege } from '../../data/courseCatalog'
import {
  containsProhibitedLanguage,
  SKILL_BANNED_MESSAGE,
  USERNAME_BANNED_MESSAGE,
} from '../../utils/contentSafety'
import { hasNativeMediaGallery, pickNativePhoto } from '../../capacitor/photoGallery'
import { mediaUploadError } from '../../utils/mediaUploadPolicy'

const SKILL_OPTIONS = [
  'JavaScript', 'Python', 'React', 'Java', 'C++', 'Machine Learning', 'Data Science',
  'UI/UX Design', 'Figma', 'Photography', 'Video Editing', 'Public Speaking',
  'Leadership', 'Marketing', 'Finance', 'Graphic Design',
]
const MAX_PROFILE_SKILLS = 4

const YEAR_OPTIONS = [
  { label: 'Year 1', value: 1 },
  { label: 'Year 2', value: 2 },
  { label: 'Year 3', value: 3 },
  { label: 'Year 4', value: 4 },
  { label: 'Year 5', value: 5 },
  { label: 'Year 6 / PG', value: 6 },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-surface)',
  border: `1.5px solid rgba(255,255,255,0.10)`,
  borderRadius: '14px',
  padding: '12px 16px',
  color: colors.textPrimary,
  fontSize: '15px',
  fontFamily: typography.fontFamily,
  outline: 'none',
  boxSizing: 'border-box',
}

type CropperState = {
  file: File
  aspect: number
  forType: 'avatar' | 'cover'
}

type ProfileLink = {
  label: string
  url: string
}

type RelationshipStatus = 'single' | 'mingle' | 'hidden'

const RELATIONSHIP_OPTIONS: { label: string; value: RelationshipStatus; hint: string }[] = [
  { label: 'Single', value: 'single', hint: 'Open to a connection' },
  { label: 'Mingle', value: 'mingle', hint: 'Seeing what happens' },
  { label: 'Hidden', value: 'hidden', hint: 'Only shown as a private status' },
]

function parseProfileLinks(value: unknown): ProfileLink[] {
  if (!value) return []
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => item && typeof item.url === 'string')
        .slice(0, 2)
        .map((item) => ({ label: String(item.label || 'Link'), url: item.url }))
    }
    if (parsed?.custom && Array.isArray(parsed.custom)) {
      return parsed.custom
        .filter((item: any) => item && typeof item.url === 'string')
        .slice(0, 2)
        .map((item: any) => ({ label: String(item.label || 'Link'), url: item.url }))
    }
    if (parsed?.website) return [{ label: 'Website', url: String(parsed.website) }]
  } catch {}
  return []
}

export function EditProfileScreen() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()

  const [form, setForm] = useState({
    fullName: user?.full_name || '',
    course: user?.department || user?.course || '',
    username: user?.username || '',
    bio: user?.bio || '',
    year: user?.year || user?.semester || 1,
    skills: [] as string[],
    links: [] as ProfileLink[],
    relationshipStatus: (user?.relationship_status || 'hidden') as RelationshipStatus,
  })
  const [loading, setLoading]               = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [coverUploading, setCoverUploading]   = useState(false)
  const [avatarUrl, setAvatarUrl]             = useState(user?.avatar_url || '')
  const [coverUrl,  setCoverUrl]              = useState(user?.cover_url  || '')
  const [courseOpen, setCourseOpen]           = useState(false)
  const [courseQuery, setCourseQuery]         = useState('')
  const [showAvatarSheet, setShowAvatarSheet] = useState(false)
  const [showCoverSheet,  setShowCoverSheet]  = useState(false)
  const [cropperState,    setCropperState]    = useState<CropperState | null>(null)
  const [customSkill, setCustomSkill]         = useState('')
  const relationshipTouchedRef = useRef(false)

  // Back first closes the active photo action sheet instead of leaving the
  // editor. The cropper has the same behavior through its own shared hook.
  useBackDismiss(showAvatarSheet, () => setShowAvatarSheet(false), 240)
  useBackDismiss(showCoverSheet, () => setShowCoverSheet(false), 240)
  useBackDismiss(courseOpen, () => setCourseOpen(false), 230)

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    usersApi.getMe().then((res) => {
      const p = res.data.data
       const parsedSkills    = (() => {
         try {
           const parsed = JSON.parse(p.skills || '[]')
           return Array.isArray(parsed)
             ? parsed.filter((skill): skill is string => typeof skill === 'string').slice(0, MAX_PROFILE_SKILLS)
             : []
         } catch { return [] }
       })()
       const relationshipStatus: RelationshipStatus = ['single', 'mingle', 'hidden'].includes(p.relationship_status) ? p.relationship_status : 'hidden'
       setForm((current) => ({
          fullName: p.full_name || '',
          course: p.department || p.course || '',
         username: p.username || '',
         bio: p.bio || '',
         year: p.year || p.semester || 1,
         skills: parsedSkills,
         links: parseProfileLinks(p.social_links),
         relationshipStatus: relationshipTouchedRef.current ? current.relationshipStatus : relationshipStatus,
       }))
      setAvatarUrl(p.avatar_url || '')
      setCoverUrl(p.cover_url  || '')
    }).catch(() => {}).finally(() => setProfileLoading(false))
  }, [])

  // ── Avatar handlers ──────────────────────────────────────────────────────────
  async function selectProfileImage(file: File, forType: 'avatar' | 'cover') {
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file')
      return
    }
    const error = await mediaUploadError(file, 'image')
    if (error) { toast.error(error); return }
    setCropperState({ file, aspect: forType === 'avatar' ? 1 : 3.5, forType })
  }

  function onAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    void selectProfileImage(f, 'avatar')
    setShowAvatarSheet(false)
  }

  async function openProfilePhotoPicker(forType: 'avatar' | 'cover') {
    if (!hasNativeMediaGallery()) {
      if (forType === 'avatar') avatarInputRef.current?.click()
      else coverInputRef.current?.click()
      return
    }
    try {
      const file = await pickNativePhoto()
      await selectProfileImage(file, forType)
    } catch (error) {
      if (!String((error as Error)?.message || '').toLowerCase().includes('cancelled')) {
        toast.error('That photo could not be opened. Try another photo.')
      }
    }
  }

  async function handleAvatarCrop(blob: Blob) {
    setCropperState(null)
    try {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      const error = await mediaUploadError(file, 'image')
      if (error) { toast.error(error); return }
      setAvatarUploading(true)
      const fd = new FormData(); fd.append('avatar', file)
      const res = await usersApi.uploadAvatar(fd)
      const newUrl = res.data.data.avatar_url
      if (typeof newUrl !== 'string' || !newUrl) throw new Error('Avatar upload did not return a media URL')
      setAvatarUrl(newUrl)
      if (user) setUser({ ...user, avatar_url: newUrl })
      toast.success('Profile photo updated')
    } catch (error: any) { toast.error(error?.response?.data?.error || error?.message || 'Upload failed') }
    finally { setAvatarUploading(false) }
  }

  async function handleRemoveAvatar() {
    setShowAvatarSheet(false)
    setAvatarUploading(true)
    try {
      await usersApi.removeAvatar()
      setAvatarUrl('')
      if (user) setUser({ ...user, avatar_url: '' })
      toast.success('Profile photo removed')
    } catch { toast.error('Could not remove photo') }
    finally { setAvatarUploading(false) }
  }

  // ── Cover handlers ───────────────────────────────────────────────────────────
  function onCoverFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    void selectProfileImage(f, 'cover')
    setShowCoverSheet(false)
  }

  async function handleCoverCrop(blob: Blob) {
    setCropperState(null)
    try {
      const file = new File([blob], 'cover.jpg', { type: 'image/jpeg' })
      const error = await mediaUploadError(file, 'image')
      if (error) { toast.error(error); return }
      setCoverUploading(true)
      const fd = new FormData(); fd.append('cover', file)
      const res = await usersApi.uploadCover(fd)
      const newUrl = res.data.data.cover_url
      if (typeof newUrl !== 'string' || !newUrl) throw new Error('Cover upload did not return a media URL')
      setCoverUrl(newUrl)
      if (user) setUser({ ...user, cover_url: newUrl })
      toast.success('Cover photo updated')
    } catch (error: any) { toast.error(error?.response?.data?.error || error?.message || 'Upload failed') }
    finally { setCoverUploading(false) }
  }

  async function handleRemoveCover() {
    setShowCoverSheet(false)
    setCoverUploading(true)
    try {
      await usersApi.removeCover()
      setCoverUrl('')
      if (user) setUser({ ...user, cover_url: '' })
      toast.success('Cover photo removed')
    } catch { toast.error('Could not remove cover') }
    finally { setCoverUploading(false) }
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        full_name: form.fullName.trim(),
        course: form.course.trim(),
        department: form.course.trim(),
        bio: form.bio.trim(),
        year: Number(form.year),
        skills: form.skills,
        relationship_status: form.relationshipStatus,
        interests: [],
        social_links: { custom: form.links.filter((link) => link.url.trim()).map((link) => ({ label: link.label.trim() || 'Link', url: link.url.trim() })) },
      }
      if (form.fullName.trim().length < 2) {
        toast.error('Full name must be at least 2 characters')
        setLoading(false)
        return
      }
      if (!form.course.trim()) {
        toast.error('Select your course')
        setLoading(false)
        return
      }
      if (containsProhibitedLanguage(form.username)) {
        setLoading(false)
        return
      }
      if (form.skills.some((skill) => containsProhibitedLanguage(skill))) {
        setLoading(false)
        return
      }
      if (form.username.trim() && form.username.trim() !== user?.username) {
        const username = form.username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '')
        if (username.length < 5) {
          toast.error('Username must be at least 5 characters')
          setLoading(false)
          return
        }
        if (username.length > 30) {
          toast.error('Username must be 30 characters or fewer')
          setLoading(false)
          return
        }
        payload.username = username
      }
      const res = await usersApi.updateMe(payload)
      setUser(res.data.data)
      toast.success('Profile saved!')
      requestAppBack()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Save failed')
    } finally { setLoading(false) }
  }

  function toggleSkill(item: string) {
    setForm((f) => {
      if (f.skills.includes(item)) return { ...f, skills: f.skills.filter((s) => s !== item) }
      if (f.skills.length >= MAX_PROFILE_SKILLS) return f
      return { ...f, skills: [...f.skills, item] }
    })
  }

  function addLink() {
    if (form.links.length >= 2) return
    setForm((f) => ({ ...f, links: [...f.links, { label: '', url: '' }] }))
  }

  function updateLink(index: number, patch: Partial<ProfileLink>) {
    setForm((f) => ({ ...f, links: f.links.map((link, linkIndex) => linkIndex === index ? { ...link, ...patch } : link) }))
  }

  function removeLink(index: number) {
    setForm((f) => ({ ...f, links: f.links.filter((_, linkIndex) => linkIndex !== index) }))
  }

  const customSkills = form.skills.filter((skill) => !SKILL_OPTIONS.includes(skill))

  function addCustomSkill() {
    const value = customSkill.trim().replace(/\s+/g, ' ')
    if (!value || form.skills.length >= MAX_PROFILE_SKILLS || form.skills.includes(value) || containsProhibitedLanguage(value)) return
    setForm((f) => ({ ...f, skills: [...f.skills, value] }))
    setCustomSkill('')
  }

  function removeCustomSkill(skill: string) {
    setForm((f) => ({ ...f, skills: f.skills.filter((item) => item !== skill) }))
  }

  const courseCatalog = getCourseCatalogForCollege(user?.college_id)
  const normalizedCourseQuery = courseQuery.trim().toLowerCase()
  const filteredCourses = courseCatalog.filter((course) =>
    !normalizedCourseQuery || course.name.toLowerCase().includes(normalizedCourseQuery)
  )

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: '9999px',
    border: `1.5px solid ${active ? 'var(--color-blue-bright)' : 'var(--color-border-strong)'}`,
    background: active ? 'rgba(24,24,27,0.18)' : 'transparent',
    color: active ? 'var(--color-blue-light)' : colors.textSecondary,
    fontSize: '13px', cursor: 'pointer', transition: 'all 150ms',
  })

  // ── Render ───────────────────────────────────────────────────────────────────
  if (profileLoading) return <div style={{ minHeight: '100%', background: colors.bg }}><DetailPageSkeleton kind="form" /></div>

  return (
    <div style={{ paddingBottom: '32px', background: colors.bg, minHeight: '100%' }}>

      <header style={{ position: 'sticky', top: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, padding: '0 16px', background: 'var(--color-navbar-bg)', borderBottom: '1px solid var(--color-navbar-border)', backdropFilter: 'blur(20px)' }}>
        <button onClick={requestAppBack} aria-label="Close edit profile" style={{ border: 0, background: 'transparent', color: colors.textPrimary, display: 'flex', alignItems: 'center', padding: 6, cursor: 'pointer' }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>×</span>
        </button>
        <strong style={{ color: colors.textPrimary, fontFamily: typography.fontDisplay, fontSize: 17 }}>Edit profile</strong>
        <Button size="sm" onClick={handleSave} disabled={loading} style={{ minHeight: 32, padding: '0 13px', fontSize: 12 }}>
          {loading ? 'Saving…' : 'Save'}
        </Button>
      </header>

      {/* ── Cover photo ─────────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <div
          style={{ height: '140px', background: coverUrl ? `url(${coverUrl}) center/cover` : 'linear-gradient(135deg, #0c1a3a, #1a1a3a)', cursor: 'pointer' }}
          onClick={() => setShowCoverSheet(true)}
        >
          <div style={{ position: 'absolute', inset: 0, height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}>
            {coverUploading ? <LoadingSpinner /> : <Camera size={24} color="rgba(255,255,255,0.8)" />}
          </div>
        </div>
        {/* Remove cover button — only when cover exists */}
        {coverUrl && !coverUploading && (
          <button
            type="button"
            aria-label="Remove cover photo"
            title="Remove cover photo"
            onClick={(e) => { e.stopPropagation(); setShowCoverSheet(true) }}
            style={{
              position: 'absolute', top: 12, right: 12,
              width: 42, height: 42, padding: 0,
              background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(255,255,255,0.75)',
              borderRadius: '9999px', cursor: 'pointer', color: '#C84F59',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Trash2 size={17} strokeWidth={2.2} />
          </button>
        )}
        <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onCoverFileSelected} />
      </div>

      {/* ── Avatar ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px', marginTop: '-28px', marginBottom: '20px' }}>
        <div style={{ position: 'relative', width: 72, cursor: 'pointer' }} onClick={() => setShowAvatarSheet(true)}>
          <Avatar src={avatarUrl} name={form.fullName} size={72} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '9999px', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {avatarUploading ? <LoadingSpinner size={16} /> : <Camera size={16} color="#fff" />}
          </div>
          <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarFileSelected} />
        </div>
      </div>

      {/* ── Form sections ────────────────────────────────────────────────── */}
      <GlassCard style={{ margin: '0 16px 16px', borderRadius: '16px' }} padding="20px">
        <p style={{ margin: '0 0 16px', fontSize: '13px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Basic Info</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label htmlFor="profile-full-name" style={{ fontSize: '13px', fontWeight: 500, color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>Full Name</label>
            <input
              id="profile-full-name"
              value={form.fullName}
              onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value.slice(0, 50) }))}
              placeholder="Your full name"
              maxLength={50}
              autoComplete="name"
              style={inputStyle}
            />
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: colors.textMuted, textAlign: 'right' }}>{form.fullName.length}/50</p>
          </div>

          <div style={{ position: 'relative', zIndex: courseOpen ? 20 : 1 }}>
            <label id="profile-course-label" style={{ fontSize: '13px', fontWeight: 500, color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>Department / Course</label>
            <button
              type="button"
              aria-labelledby="profile-course-label"
              aria-haspopup="listbox"
              aria-expanded={courseOpen}
              onClick={() => { setCourseOpen((open) => !open); setCourseQuery('') }}
              style={{ ...inputStyle, minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer' }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: form.course ? colors.textPrimary : colors.textMuted }}>
                {form.course || 'Select your course'}
              </span>
              <ChevronDown size={18} style={{ flexShrink: 0, transform: courseOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />
            </button>
            {courseOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 30, padding: 8, borderRadius: 16, border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)', boxShadow: '0 18px 48px rgba(0,0,0,.24)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 11px', borderRadius: 11, border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                  <Search size={16} color={colors.textMuted} />
                  <input
                    autoFocus
                    value={courseQuery}
                    onChange={(event) => setCourseQuery(event.target.value)}
                    placeholder="Search courses…"
                    aria-label="Search courses"
                    style={{ flex: 1, minWidth: 0, height: 42, border: 0, outline: 0, background: 'transparent', color: colors.textPrimary, fontSize: 14 }}
                  />
                </div>
                <div role="listbox" aria-label="Courses" style={{ maxHeight: 250, overflowY: 'auto', marginTop: 7, overscrollBehavior: 'contain' }}>
                  {filteredCourses.length === 0 ? (
                    <p style={{ margin: 0, padding: 14, color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>No matching course</p>
                  ) : filteredCourses.map((course) => (
                    <button
                      key={course.name}
                      type="button"
                      role="option"
                      aria-selected={form.course === course.name}
                      onClick={() => {
                        setForm((current) => ({ ...current, course: course.name }))
                        setCourseOpen(false)
                        setCourseQuery('')
                      }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '11px 10px', border: 0, borderRadius: 10, background: form.course === course.name ? 'var(--color-surface-hover)' : 'transparent', color: colors.textPrimary, textAlign: 'left', cursor: 'pointer', fontSize: 13, lineHeight: 1.35 }}
                    >
                      <span style={{ flex: 1 }}>{course.name}</span>
                      <span style={{ color: colors.textMuted, fontSize: 11, whiteSpace: 'nowrap' }}>{course.durationYears}</span>
                      {form.course === course.name && <Check size={15} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 500, color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>Username</label>
            <input
              value={form.username}
               onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 30) }))}
              placeholder="username"
               maxLength={30}
              style={inputStyle}
            />
            {containsProhibitedLanguage(form.username) && (
              <p role="alert" style={{ margin: '6px 0 0', color: '#DC626B', fontSize: '12px', lineHeight: 1.45 }}>
                {USERNAME_BANNED_MESSAGE}
              </p>
            )}
             <p style={{ margin: '4px 0 0', fontSize: '11px', color: colors.textMuted, textAlign: 'right' }}>{form.username.length}/30</p>
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 500, color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="Tell people about yourself…"
              rows={3}
              maxLength={500}
              style={{ ...inputStyle, resize: 'none' } as React.CSSProperties}
            />
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: colors.textMuted, textAlign: 'right' }}>{form.bio.length}/500</p>
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 500, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>Year</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {YEAR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm((f) => ({ ...f, year: opt.value }))}
                  style={{
                    padding: '7px 16px', borderRadius: radii.pill, cursor: 'pointer', fontSize: '13px', fontWeight: 500, transition: 'all 150ms',
                    border: form.year === opt.value ? '1.5px solid var(--color-blue-bright)' : '1.5px solid rgba(255,255,255,0.12)',
                    background: form.year === opt.value ? 'rgba(24,24,27,0.18)' : 'transparent',
                    color: form.year === opt.value ? 'var(--color-blue-light)' : colors.textSecondary,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 500, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>Relationship status</label>
            <div className="relationship-status-options" role="radiogroup" aria-label="Relationship status">
              {RELATIONSHIP_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={form.relationshipStatus === option.value}
                  className={`relationship-status-option relationship-status-option-${option.value}${form.relationshipStatus === option.value ? ' is-selected' : ''}`}
                  onClick={() => {
                    relationshipTouchedRef.current = true
                    setForm((f) => ({ ...f, relationshipStatus: option.value }))
                  }}
                >
                  <span>{option.label}</span>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard style={{ margin: '0 16px 16px', borderRadius: '16px' }} padding="20px">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Links</p>
          <span style={{ fontSize: 11, color: colors.textMuted }}>{form.links.length}/2</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {form.links.map((link, index) => (
            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Link2 size={16} color={colors.textMuted} />
                <input value={link.label} onChange={(e) => updateLink(index, { label: e.target.value })} placeholder="Link name" style={{ ...inputStyle, flex: 1, padding: '9px 12px' }} />
                <button onClick={() => removeLink(index)} aria-label={`Remove link ${index + 1}`} style={{ border: 0, background: 'transparent', color: '#DC626B', display: 'flex', padding: 6, cursor: 'pointer' }}>
                  <Trash2 size={16} />
                </button>
              </div>
              <input value={link.url} onChange={(e) => updateLink(index, { url: e.target.value })} placeholder="https://example.com" inputMode="url" style={{ ...inputStyle, padding: '9px 12px' }} />
            </div>
          ))}
          {form.links.length < 2 && (
            <button onClick={addLink} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 42, borderRadius: 12, border: '1px dashed var(--color-border-strong)', background: 'transparent', color: colors.textSecondary, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={16} /> Add link
            </button>
          )}
        </div>
      </GlassCard>

      <GlassCard style={{ margin: '0 16px 24px', borderRadius: '16px' }} padding="20px">
        <p style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Skills</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {SKILL_OPTIONS.map((item) => {
            const selected = form.skills.includes(item)
            const limitReached = !selected && form.skills.length >= MAX_PROFILE_SKILLS
            return (
              <button
                key={item}
                type="button"
                onClick={() => toggleSkill(item)}
                disabled={limitReached}
                aria-pressed={selected}
                style={{ ...chipStyle(selected), cursor: limitReached ? 'not-allowed' : 'pointer', opacity: limitReached ? 0.45 : 1 }}
              >
                {item}
              </button>
            )
          })}
        </div>
        {customSkills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: 12 }} aria-label="Custom skills">
            {customSkills.map((skill) => (
              <div key={skill} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 8px 6px 14px', borderRadius: '9999px',
                border: '1.5px solid var(--color-blue-bright)',
                background: 'rgba(24,24,27,0.18)', color: 'var(--color-blue-light)',
                fontSize: '13px',
              }}>
                <span>{skill}</span>
                <button
                  type="button"
                  onClick={() => removeCustomSkill(skill)}
                  aria-label={`Remove custom skill ${skill}`}
                  title={`Remove ${skill}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, padding: 0, border: 0, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.12)', color: 'currentColor', cursor: 'pointer',
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1, marginTop: -1 }}>×</span>
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input
            value={customSkill}
            onChange={(e) => setCustomSkill(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomSkill() } }}
            placeholder={form.skills.length >= MAX_PROFILE_SKILLS ? 'Four skills added' : 'Add custom skill'}
            disabled={form.skills.length >= MAX_PROFILE_SKILLS}
            style={{ ...inputStyle, flex: 1, padding: '10px 12px' }}
          />
          <button onClick={addCustomSkill} disabled={form.skills.length >= MAX_PROFILE_SKILLS || !customSkill.trim()} style={{ border: 0, borderRadius: 12, padding: '0 13px', background: colors.textPrimary, color: colors.bg, fontWeight: 800, cursor: form.skills.length >= MAX_PROFILE_SKILLS ? 'not-allowed' : 'pointer', opacity: form.skills.length >= MAX_PROFILE_SKILLS || !customSkill.trim() ? 0.45 : 1 }}>
            Add
          </button>
        </div>
         {containsProhibitedLanguage(customSkill) && (
           <p role="alert" style={{ margin: '8px 0 0', color: '#DC626B', fontSize: '12px', lineHeight: 1.45 }}>
             {SKILL_BANNED_MESSAGE}
           </p>
         )}
         {form.skills.some((skill) => containsProhibitedLanguage(skill)) && (
           <p role="alert" style={{ margin: '8px 0 0', color: '#DC626B', fontSize: '12px', lineHeight: 1.45 }}>
             {SKILL_BANNED_MESSAGE}
           </p>
         )}
        <p style={{ margin: '8px 0 0', color: colors.textMuted, fontSize: 11 }}>Selected skills: {form.skills.length}/{MAX_PROFILE_SKILLS}</p>
      </GlassCard>

      {/* ── Avatar action sheet ───────────────────────────────────────────── */}
      {showAvatarSheet && (
        createPortal((
          <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200 }} onClick={() => setShowAvatarSheet(false)} />
          <div style={{
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: '430px', background: '#FFFFFF', color: '#111113',
            borderRadius: '24px 24px 0 0', border: '1px solid rgba(0,0,0,0.10)',
            padding: '20px 16px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            zIndex: 1001, animation: 'slideUp 250ms var(--ease-spring)',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#D8D8DC', margin: '0 auto 18px' }} />
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#111113', fontFamily: 'var(--font-display)', margin: '0 0 16px' }}>Profile Photo</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={() => { setShowAvatarSheet(false); void openProfilePhotoPicker('avatar') }} style={sheetBtn('#111113', '#FFFFFF')}>
                <Upload size={17} strokeWidth={2} /> Upload New Photo
              </button>
              {avatarUrl && (
                <button onClick={handleRemoveAvatar} style={sheetBtn('#FDEBEC', '#D75A63', '1.5px solid #F5C9CC')}>
                  <Trash2 size={17} strokeWidth={2} /> Remove Photo
                </button>
              )}
              <button onClick={() => setShowAvatarSheet(false)} style={sheetBtn('#F2F2F4', '#414145', '1.5px solid #E2E2E5')}>
                Cancel
              </button>
            </div>
          </div>
          </>
        ), document.body)
      )}

      {/* ── Cover action sheet ────────────────────────────────────────────── */}
      {showCoverSheet && (
        createPortal((
          <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200 }} onClick={() => setShowCoverSheet(false)} />
          <div style={{
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: '430px', background: '#FFFFFF', color: '#111113',
            borderRadius: '24px 24px 0 0', border: '1px solid rgba(0,0,0,0.10)',
            padding: '20px 16px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            zIndex: 1001, animation: 'slideUp 250ms var(--ease-spring)',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#D8D8DC', margin: '0 auto 18px' }} />
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#111113', fontFamily: 'var(--font-display)', margin: '0 0 16px' }}>Cover Photo</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={() => { setShowCoverSheet(false); void openProfilePhotoPicker('cover') }} style={sheetBtn('#111113', '#FFFFFF')}>
                <Upload size={17} strokeWidth={2} /> Upload New Cover
              </button>
              {coverUrl && (
                <button onClick={handleRemoveCover} style={sheetBtn('#FDEBEC', '#D75A63', '1.5px solid #F5C9CC')}>
                  <Trash2 size={17} strokeWidth={2} /> Remove Cover
                </button>
              )}
              <button onClick={() => setShowCoverSheet(false)} style={sheetBtn('#F2F2F4', '#414145', '1.5px solid #E2E2E5')}>
                Cancel
              </button>
            </div>
          </div>
          </>
        ), document.body)
      )}

      {/* ── Image Cropper ────────────────────────────────────────────────── */}
      {cropperState && (
        <ImageCropper
          file={cropperState.file}
          aspect={cropperState.aspect}
          outputSize={cropperState.forType === 'avatar' ? 800 : 1600}
          onConfirm={cropperState.forType === 'avatar' ? handleAvatarCrop : handleCoverCrop}
          onCancel={() => setCropperState(null)}
        />
      )}
    </div>
  )
}

/** Helper: shared sheet button style */
function sheetBtn(bg: string, color: string, border = 'none'): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '14px 18px', borderRadius: '14px',
    background: bg, border, color,
    fontSize: '15px', fontWeight: 600, fontFamily: 'var(--font-display)',
    cursor: 'pointer', width: '100%',
    WebkitTapHighlightColor: 'transparent',
    transition: 'opacity 150ms',
  }
}
