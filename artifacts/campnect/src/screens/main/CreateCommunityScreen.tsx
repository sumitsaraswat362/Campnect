import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { communitiesApi } from '../../api/communities'
import { radii, typography } from '../../styles/tokens'
import { requestAppBack } from '../../navigation/appBackRequest'

const CATEGORIES = ['Technology', 'Design', 'Entrepreneurship', 'Sports', 'Music', 'Gaming', 'Photography', 'Academic', 'Arts', 'Wellness', 'Social', 'Other']

export function CreateCommunityScreen() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'Technology',
    is_private: false,
  })

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--color-input-bg)', border: `1px solid var(--color-input-border)`,
    borderRadius: radii.md, padding: '12px 14px', color: 'var(--color-input-text)',
    fontSize: '15px', fontFamily: typography.fontFamily, outline: 'none', boxSizing: 'border-box',
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setLoading(true)
    try {
      const res = await communitiesApi.create({
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        is_private: form.is_private,
      })
      toast.success('Community created!')
      navigate(`/app/community/${res.data.data.slug || res.data.data.id}`)
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to create community')
    } finally {
      setLoading(false) }
  }

  return (
    <div className="route-viewport" style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: 'calc(14px + var(--sat)) 16px 14px', borderBottom: `1px solid var(--color-border)`, flexShrink: 0 }}>
        <button onClick={requestAppBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex' }}><ArrowLeft size={22} /></button>
        <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Create Community</h2>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ background: 'var(--color-lime)', border: 'none', borderRadius: radii.pill, padding: '9px 20px', color: 'var(--color-accent-contrast)', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {loading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
          {loading ? 'Creating…' : 'Create'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>Community name *</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. MIT Builders" style={inputStyle} maxLength={60} />
        </div>

        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>Description</label>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What's your community about?" rows={3} style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }} maxLength={500} />
        </div>

        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px' }}>Category</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setForm((f) => ({ ...f, category: cat }))}
                style={{
                  padding: '7px 14px', borderRadius: radii.pill,
                  border: `1px solid ${form.category === cat ? 'transparent' : 'var(--color-border)'}`,
                  background: form.category === cat ? 'var(--color-lime)' : 'transparent',
                  color: form.category === cat ? 'var(--color-accent-contrast)' : 'var(--color-text-secondary)',
                  fontSize: '13px', cursor: 'pointer', fontWeight: form.category === cat ? 600 : 400,
                  WebkitTapHighlightColor: 'transparent'
                }}
              >{cat}</button>
            ))}
          </div>
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface-hover)', borderRadius: radii.md, padding: '12px 14px', border: `1px solid var(--color-border)`, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          onClick={() => setForm((f) => ({ ...f, is_private: !f.is_private }))}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '14px' }}>Private community</p>
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '12px' }}>Only invited members can join</p>
          </div>
          <div style={{ width: 44, height: 24, borderRadius: radii.pill, position: 'relative', background: form.is_private ? 'var(--color-lime)' : 'var(--color-border-strong)', transition: 'background 200ms' }}>
            <div style={{ position: 'absolute', top: 2, left: form.is_private ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: form.is_private ? 'var(--color-accent-contrast)' : '#fff', transition: 'left 200ms' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
