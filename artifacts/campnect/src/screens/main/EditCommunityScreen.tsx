import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, Image as ImageIcon, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { communitiesApi } from '../../api/communities'
import { useCommunityStore } from '../../stores/communityStore'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { requestAppBack } from '../../navigation/appBackRequest'
import { radii } from '../../styles/tokens'
import { mediaUploadError } from '../../utils/mediaUploadPolicy'

const CATEGORIES = ['Technology', 'Design', 'Entrepreneurship', 'Sports', 'Music', 'Gaming', 'Photography', 'Academic', 'Arts', 'Wellness', 'Social', 'Other']

export function EditCommunityScreen() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { currentCommunity, fetchCommunity } = useCommunityStore()
  const avatarRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const [avatar, setAvatar] = useState<File | null>(null)
  const [cover, setCover] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', category: 'Other', is_private: false })

  useEffect(() => { if (slug && currentCommunity?.slug !== slug) void fetchCommunity(slug) }, [slug])
  useEffect(() => {
    if (!currentCommunity) return
    if (!['owner', 'admin'].includes(currentCommunity.member_role || '')) {
      navigate(`/app/community/${currentCommunity.slug}`, { replace: true })
      return
    }
    setForm({
      name: currentCommunity.name,
      description: currentCommunity.description || '',
      category: currentCommunity.category,
      is_private: Boolean(currentCommunity.is_private),
    })
  }, [currentCommunity?.id])

  if (!currentCommunity) return null
  const avatarPreview = avatar ? URL.createObjectURL(avatar) : null
  const coverPreview = cover ? URL.createObjectURL(cover) : null
  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: radii.md, border: '1px solid var(--color-input-border)', background: 'var(--color-input-bg)', color: 'var(--color-input-text)', fontSize: 15, outline: 'none' }

  async function save() {
    if (!form.name.trim()) {
      toast.error('Community name is required')
      return
    }
    for (const image of [avatar, cover]) {
      if (!image) continue
      const error = await mediaUploadError(image, 'image')
      if (error) { toast.error(error); return }
    }
    setSaving(true)
    try {
      const data = new FormData()
      data.append('name', form.name.trim())
      data.append('description', form.description.trim())
      data.append('category', form.category)
      data.append('is_private', String(form.is_private))
      if (avatar) data.append('avatar', avatar)
      if (cover) data.append('cover', cover)
      await communitiesApi.update(currentCommunity!.id, data)
      await fetchCommunity(currentCommunity!.slug)
      toast.success('Community updated')
      navigate(`/app/community/${currentCommunity!.slug}`, { replace: true })
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Could not update community')
    } finally { setSaving(false) }
  }

  async function chooseCommunityImage(file: File | undefined, kind: 'avatar' | 'cover') {
    if (!file) return
    const error = await mediaUploadError(file, 'image')
    if (error) { toast.error(error); return }
    if (kind === 'avatar') setAvatar(file)
    else setCover(file)
  }

  return (
    <div className="route-viewport" style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(10px + var(--sat)) 12px 10px', borderBottom: '1px solid var(--color-border)' }}>
        <button aria-label="Back" onClick={requestAppBack} style={{ width: 38, height: 38, border: 0, borderRadius: '50%', background: 'var(--color-surface)', color: 'var(--color-text-primary)', display: 'grid', placeItems: 'center' }}><ArrowLeft size={20} /></button>
        <h1 style={{ flex: 1, margin: 0, fontSize: 18, color: 'var(--color-text-primary)' }}>Edit community</h1>
        <button onClick={save} disabled={saving} style={{ minWidth: 72, padding: '9px 16px', border: 0, borderRadius: radii.pill, background: 'var(--color-lime)', color: 'var(--color-accent-contrast)', fontWeight: 700 }}>{saving ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Save'}</button>
      </header>
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 32 }}>
        <button onClick={() => coverRef.current?.click()} style={{ position: 'relative', width: '100%', height: 150, padding: 0, border: 0, background: 'var(--color-surface-hover)', overflow: 'hidden', cursor: 'pointer' }}>
          {(coverPreview || currentCommunity.cover_url) ? <AuthenticatedImage src={coverPreview || currentCommunity.cover_url!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageIcon size={32} color="var(--color-text-muted)" />}
          <span style={{ position: 'absolute', right: 12, bottom: 12, padding: '7px 10px', borderRadius: radii.pill, background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: 12, fontWeight: 700 }}>Change cover</span>
        </button>
        <div style={{ padding: '0 16px 20px' }}>
          <button onClick={() => avatarRef.current?.click()} style={{ width: 82, height: 82, marginTop: -36, position: 'relative', borderRadius: 22, overflow: 'hidden', border: '4px solid var(--color-bg)', background: 'var(--color-surface)', padding: 0 }}>
            {(avatarPreview || currentCommunity.avatar_url) ? <AuthenticatedImage src={avatarPreview || currentCommunity.avatar_url!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Camera size={27} color="var(--color-text-muted)" />}
          </button>
          <input ref={avatarRef} hidden type="file" accept="image/*" onChange={e => { void chooseCommunityImage(e.target.files?.[0], 'avatar'); e.currentTarget.value = '' }} />
          <input ref={coverRef} hidden type="file" accept="image/*" onChange={e => { void chooseCommunityImage(e.target.files?.[0], 'cover'); e.currentTarget.value = '' }} />
          <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
            <label style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 700 }}>Name<input value={form.name} maxLength={60} onChange={e => setForm({ ...form, name: e.target.value })} style={{ ...inputStyle, display: 'block', marginTop: 7 }} /></label>
            <label style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 700 }}>Description<textarea value={form.description} maxLength={500} rows={4} onChange={e => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, display: 'block', marginTop: 7, resize: 'none' }} /></label>
            <label style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 700 }}>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ ...inputStyle, display: 'block', marginTop: 7 }}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
            <button onClick={() => setForm({ ...form, is_private: !form.is_private })} style={{ display: 'flex', alignItems: 'center', textAlign: 'left', padding: 14, borderRadius: radii.md, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}>
              <span style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: 14 }}>Private community</strong><span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Only invited members can join</span></span>
              <span style={{ width: 44, height: 24, borderRadius: 20, padding: 2, boxSizing: 'border-box', background: form.is_private ? 'var(--color-lime)' : 'var(--color-border-strong)' }}><span style={{ display: 'block', width: 20, height: 20, borderRadius: '50%', background: '#fff', transform: `translateX(${form.is_private ? 20 : 0}px)`, transition: 'transform 160ms' }} /></span>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}