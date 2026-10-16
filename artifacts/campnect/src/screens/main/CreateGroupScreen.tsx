import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestAppBack } from '../../navigation/appBackRequest'
import { ChevronLeft, Search, Check, Camera, X } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import { Avatar } from '../../components/shared/Avatar'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { PeopleRowsSkeleton } from '../../components/shared/AppSkeletons'
import { chatApi } from '../../api/chat'
import { createLocalMediaPreview, disposeLocalMediaPreview } from '../../utils/localMediaPreview'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { mediaUploadError } from '../../utils/mediaUploadPolicy'

export function CreateGroupScreen() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const upsertConversation = useChatStore((s) => s.upsertConversation)

  const [step, setStep] = useState<'members' | 'details'>('members')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selected, setSelected] = useState<any[]>([])
  const [groupName, setGroupName] = useState('')
  const [description, setDescription] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  useBackDismiss(step === 'details', () => setStep('members'), 150)

  useEffect(() => () => disposeLocalMediaPreview(avatarPreview), [avatarPreview])

  useEffect(() => {
    if (query.length < 2) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await chatApi.searchUsers(query)
        setSearchResults((res.data.data || []).filter((u: any) => u.id !== user?.id))
      } catch { setSearchResults([]) }
      finally { setSearchLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  function toggleSelect(u: any) {
    setSelected((prev) =>
      prev.some((s) => s.id === u.id) ? prev.filter((s) => s.id !== u.id) : [...prev, u]
    )
  }

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const validationError = await mediaUploadError(file, 'image')
    if (validationError) {
      setError(validationError)
      e.target.value = ''
      return
    }
    try {
      const preview = await createLocalMediaPreview(file)
      setAvatarFile(file)
      setAvatarPreview(preview)
    } catch {
      setError('That group photo could not be previewed. Choose another image.')
    } finally {
      e.target.value = ''
    }
  }

  async function handleCreate() {
    if (!groupName.trim()) { setError('Group name is required.'); return }
    if (avatarFile) {
      const validationError = await mediaUploadError(avatarFile, 'image')
      if (validationError) { setError(validationError); return }
    }
    setCreating(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('name', groupName.trim())
      fd.append('description', description.trim())
      fd.append('memberIds', JSON.stringify(selected.map((u) => u.id)))
      if (avatarFile) fd.append('avatar', avatarFile)
      const res = await chatApi.createGroup(fd)
      const conv = res.data.data
      upsertConversation(conv)
      navigate(`/app/chat/${conv.id}`, { replace: true })
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to create group.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="route-viewport" style={{ display: 'flex', flexDirection: 'column', position: 'absolute', inset: 0, zIndex: 50, background: 'var(--color-bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))', paddingBottom: '10px', paddingLeft: '14px', paddingRight: '14px', background: 'var(--color-navbar-bg)', borderBottom: '1px solid var(--color-navbar-border)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', flexShrink: 0 }}>
        <button
          onClick={requestAppBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', display: 'flex', padding: '6px', marginLeft: '-6px' }}
        >
          <ChevronLeft size={22} />
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
            {step === 'members' ? 'Add Members' : 'New Group'}
          </p>
          {step === 'members' && (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {selected.length} selected
            </p>
          )}
        </div>
        {step === 'members' && selected.length > 0 && (
          <button
            onClick={() => setStep('details')}
            style={{ padding: '8px 16px', background: 'var(--color-lime)', border: 'none', borderRadius: '10px', color: '#0D0B12', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-display)' }}
          >
            Next
          </button>
        )}
      </div>

      {step === 'members' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Search */}
          <div style={{ padding: '12px 16px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-input-bg)', border: '1.5px solid var(--color-input-border)', borderRadius: '14px', padding: '0 14px', height: '44px' }}>
              <Search size={16} color="var(--color-input-icon)" />
              <input
                autoFocus
                type="text"
                placeholder="Search students…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--color-text-primary)', fontSize: '14px', fontFamily: 'var(--font-body)', caretColor: 'var(--color-lime)' }}
              />
            </div>
          </div>

          {/* Selected chips */}
          {selected.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '0 16px 12px', flexShrink: 0, scrollbarWidth: 'none' }}>
              {selected.map((u) => (
                <div key={u.id} onClick={() => toggleSelect(u)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px 5px 6px', background: 'rgba(187,255,0,0.10)', border: '1px solid rgba(187,255,0,0.2)', borderRadius: '9999px', cursor: 'pointer', flexShrink: 0 }}>
                  <Avatar src={u.avatar_url} name={u.full_name} size={22} />
                  <span style={{ fontSize: '12px', color: 'var(--color-lime)', fontWeight: 600, fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' }}>{u.full_name.split(' ')[0]}</span>
                  <X size={12} color="var(--color-lime)" />
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {searchLoading && (
              <PeopleRowsSkeleton compact action={false} />
            )}
            {!searchLoading && query.length >= 2 && searchResults.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '14px', padding: '32px 0' }}>No students found</p>
            )}
            {query.length < 2 && (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', padding: '32px 0' }}>Type to search for students to add</p>
            )}
            {searchResults.map((u) => {
              const isSelected = selected.some((s) => s.id === u.id)
              return (
                <div
                  key={u.id}
                  onClick={() => toggleSelect(u)}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer', background: isSelected ? 'rgba(187,255,0,0.04)' : 'transparent', borderBottom: '1px solid var(--color-border)' }}
                >
                  <Avatar src={u.avatar_url} name={u.full_name} size={44} />
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>{u.full_name}</p>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>@{u.username?.toLowerCase()}</p>
                  </div>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${isSelected ? 'var(--color-lime)' : 'rgba(255,255,255,0.2)'}`, background: isSelected ? 'var(--color-lime)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 200ms' }}>
                    {isSelected && <Check size={14} color="#0D0B12" strokeWidth={3} />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        // Step 2 — Group details
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
          {/* Avatar picker */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
            <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
              {avatarPreview
                ? <img src={avatarPreview} alt="" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(187,255,0,0.3)' }} />
                : <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'var(--color-surface-hover)', border: '2px dashed var(--color-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={28} color="var(--color-input-icon)" />
                  </div>
              }
              <div style={{ position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: '50%', background: 'var(--color-lime)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={13} color="#0D0B12" />
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarPick} style={{ display: 'none' }} />
          </div>

          {/* Group name */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Group Name *</label>
            <input
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. CS Study Crew"
              maxLength={80}
              style={{ width: '100%', background: 'var(--color-input-bg)', border: '1.5px solid var(--color-input-border)', borderRadius: '14px', padding: '13px 16px', color: 'var(--color-input-text)', fontSize: '15px', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)', caretColor: 'var(--color-lime)' }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this group about?"
              maxLength={300}
              rows={3}
              style={{ width: '100%', background: 'var(--color-input-bg)', border: '1.5px solid var(--color-input-border)', borderRadius: '14px', padding: '13px 16px', color: 'var(--color-input-text)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)', caretColor: 'var(--color-lime)', resize: 'none' }}
            />
          </div>

          {/* Members preview */}
          <div style={{ marginBottom: '28px' }}>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '10px' }}>Members ({selected.length + 1})</p>
            <div style={{ display: 'flex', gap: '-6px' }}>
              <div style={{ position: 'relative', marginRight: '4px' }}>
                <Avatar src={user?.avatar_url} name={user?.full_name} size={36} />
                <span style={{ position: 'absolute', bottom: -2, right: -4, fontSize: '8px', background: 'var(--color-lime)', color: '#0D0B12', padding: '1px 3px', borderRadius: '4px', fontWeight: 800, fontFamily: 'var(--font-display)' }}>You</span>
              </div>
              {selected.slice(0, 8).map((u) => (
                <div key={u.id} style={{ marginRight: '4px' }}>
                  <Avatar src={u.avatar_url} name={u.full_name} size={36} />
                </div>
              ))}
              {selected.length > 8 && (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--color-text-secondary)' }}>+{selected.length - 8}</div>
              )}
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', color: '#EF4444', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={creating || !groupName.trim()}
            style={{ width: '100%', padding: '15px', background: creating || !groupName.trim() ? 'rgba(187,255,0,0.4)' : 'var(--color-lime)', border: 'none', borderRadius: '14px', color: '#0D0B12', fontSize: '15px', fontWeight: 800, cursor: creating || !groupName.trim() ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            {creating ? <><LoadingSpinner size={16} /> Creating…</> : `Create Group`}
          </button>
        </div>
      )}
    </div>
  )
}
