import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Camera, Copy, RefreshCw, Link2, Users, Shield, FileText, ExternalLink, Trash2, LogOut, Check, MoreHorizontal, Image as ImageIcon } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore, Conversation } from '../../stores/chatStore'
import { Avatar } from '../../components/shared/Avatar'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../../components/shared/AuthenticatedVideo'
import { createLocalMediaPreview, disposeLocalMediaPreview } from '../../utils/localMediaPreview'
import { AuthenticatedFileLink } from '../../components/shared/AuthenticatedFileLink'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { DetailPageSkeleton, MediaGridSkeleton, PeopleRowsSkeleton } from '../../components/shared/AppSkeletons'
import { chatApi } from '../../api/chat'
import { TimeAgo } from '../../components/shared/TimeAgo'
import { useSocket } from '../../hooks/useSocket'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { mediaUploadError } from '../../utils/mediaUploadPolicy'

type Tab = 'info' | 'media' | 'files' | 'links'

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  owner:     { label: 'Owner',     color: 'var(--color-lime)' },
  admin:     { label: 'Admin',     color: 'rgba(210,210,215,0.90)' },
  moderator: { label: 'Mod',       color: '#52525B' },
  member:    { label: '',          color: '' },
}

function ManagementRow({ icon, label, value, onClick, danger = false }: {
  icon: React.ReactNode
  label: string
  value?: string
  onClick?: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 16px', background: 'transparent', border: 'none',
        borderBottom: '1px solid var(--color-border)', textAlign: 'left',
        color: danger ? '#F87171' : 'var(--color-text-primary)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: danger ? 'rgba(239,68,68,0.14)' : 'rgba(24,24,27,0.18)', color: danger ? '#F87171' : 'rgba(220,180,255,0.95)', flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{label}</span>
      {value && <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{value}</span>}
      {onClick && <span style={{ color: 'var(--color-text-muted)', fontSize: 22, lineHeight: 1 }}>›</span>}
    </button>
  )
}

export function GroupInfoScreen() {
  const { id: convId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { conversations, upsertConversation, removeConversation } = useChatStore()
  const { socket } = useSocket()

  const [conv, setConv] = useState<Conversation | null>(null)
  const [tab, setTab] = useState<Tab>('info')
  const [media, setMedia] = useState<any[]>([])
  const [files, setFiles] = useState<any[]>([])
  const [links, setLinks] = useState<any[]>([])
  const [joinRequests, setJoinRequests] = useState<any[]>([])
  const [tabLoading, setTabLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [memberActions, setMemberActions] = useState<any | null>(null)
  const [memberTag, setMemberTag] = useState('')
  const [savingMemberTag, setSavingMemberTag] = useState(false)
  const [adminEditorMember, setAdminEditorMember] = useState<any | null>(null)
  const [adminRights, setAdminRights] = useState<Record<string, boolean>>({})
  const ADMIN_RIGHTS = [
    ['change_group_info', 'Change group info'],
    ['delete_messages', 'Delete messages'],
    ['ban_users', 'Ban users'],
    ['invite_users', 'Invite users'],
    ['pin_messages', 'Pin messages'],
    ['manage_calls', 'Manage calls'],
  ] as const
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState('')
  const [descriptionVal, setDescriptionVal] = useState('')
  const [editingDescription, setEditingDescription] = useState(false)
  const [saving, setSaving] = useState(false)
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [cropSource, setCropSource] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  useBackDismiss(memberActions !== null, () => setMemberActions(null), 200)
  useBackDismiss(adminEditorMember !== null, () => setAdminEditorMember(null), 250)
  useBackDismiss(confirmLeave, () => setConfirmLeave(false), 300)
  useBackDismiss(confirmDelete, () => setConfirmDelete(false), 300)

  const myRole = conv?.my_role || conv?.members?.find((m) => m.id === user?.id)?.role || 'member'
  const isAdmin = ['owner', 'admin'].includes(myRole)
  const isOwner = myRole === 'owner'
  const ROLE_LEVEL: Record<string, number> = { member: 0, moderator: 1, admin: 2, owner: 3 }

  useEffect(() => {
    if (!convId) return
    const c = conversations.find((c) => c.id === convId)
    if (c) {
      setConv(c)
      setNameVal(c.name || '')
      setDescriptionVal(c.description || '')
      setRequiresApproval(Boolean(c.requires_approval))
      if (c.invite_link && c.invite_link_active) {
        const base = window.location.origin
        setInviteLink(`${base}/join/${c.invite_link}`)
      }
    } else {
      // Fetch if not in store
      chatApi.getConversation(convId).then((r) => {
        const fetched = r?.data?.data
        if (fetched) {
          upsertConversation(fetched)
          setConv(fetched)
          setNameVal(fetched.name || '')
          setDescriptionVal(fetched.description || '')
          setRequiresApproval(Boolean(fetched.requires_approval))
        }
      }).catch(() => {})
    }
  }, [convId, conversations])

  useEffect(() => {
    if (!socket || !convId) return
    socket.emit('join:conversation', convId)
    // Re-join after a socket reconnect — server-side room membership does
    // not carry over from the old connection.
    const rejoinOnReconnect = () => { socket.emit('join:conversation', convId) }
    socket.on('connect', rejoinOnReconnect)
    const onGroupUpdated = (updated: Conversation) => {
      if (updated?.id !== convId) return
      upsertConversation(updated)
      setConv(updated)
    }
    const onRoleChanged = (data: any) => {
      if (data.conversationId !== convId) return
      setConv((current) => {
        if (!current) return current
        const updated = {
          ...current,
          members: current.members.map((m) => m.id === data.userId
            ? { ...m, role: data.role, admin_rights: data.admin_rights || {} }
            : m),
        }
        upsertConversation(updated)
        return updated
      })
    }
    const onTagChanged = (data: any) => {
      if (data.conversationId !== convId) return
      setConv((current) => {
        if (!current) return current
        const updated = {
          ...current,
          members: current.members.map((m) => m.id === data.userId ? { ...m, tag: data.tag } : m),
        }
        upsertConversation(updated)
        return updated
      })
    }
    socket.on('group:updated', onGroupUpdated)
    socket.on('group:role_changed', onRoleChanged)
    socket.on('group:tag_changed', onTagChanged)
    return () => {
      socket.emit('leave:conversation', convId)
      socket.off('connect', rejoinOnReconnect)
      socket.off('group:updated', onGroupUpdated)
      socket.off('group:role_changed', onRoleChanged)
      socket.off('group:tag_changed', onTagChanged)
    }
  }, [socket, convId])

  useEffect(() => {
    if (tab === 'media' && media.length === 0) loadTab('media')
    if (tab === 'files' && files.length === 0) loadTab('files')
    if (tab === 'links' && links.length === 0) loadTab('links')
  }, [tab])

  useEffect(() => {
    if (isAdmin && convId) {
      chatApi.getJoinRequests(convId).then((r) => setJoinRequests(r.data.data || [])).catch(() => {})
    }
  }, [isAdmin, convId])

  async function loadTab(t: Tab) {
    if (!convId) return
    setTabLoading(true)
    try {
      if (t === 'media') { const r = await chatApi.getGroupMedia(convId); setMedia(r.data.data || []) }
      if (t === 'files') { const r = await chatApi.getGroupFiles(convId); setFiles(r.data.data || []) }
      if (t === 'links') { const r = await chatApi.getGroupLinks(convId); setLinks(r.data.data || []) }
    } catch { }
    finally { setTabLoading(false) }
  }

  async function handleGenerateLink() {
    if (!convId) return
    setGeneratingLink(true)
    try {
      const r = await chatApi.generateInviteLink(convId)
      const token = r.data.data.token
      const base = window.location.origin
      const url = `${base}/join/${token}`
      setInviteLink(url)
      // Update store conv
      if (conv) upsertConversation({ ...conv, invite_link: token, invite_link_active: 1 })
    } catch { }
    finally { setGeneratingLink(false) }
  }

  function copyLink() {
    if (!inviteLink) return
    navigator.clipboard?.writeText(inviteLink)
    setInviteCopied(true)
    setTimeout(() => setInviteCopied(false), 2000)
  }

  async function handleRevokeLink() {
    if (!convId) return
    await chatApi.revokeInviteLink(convId)
    setInviteLink(null)
    if (conv) upsertConversation({ ...conv, invite_link: undefined, invite_link_active: 0 })
  }

  async function handleSaveName() {
    if (!convId || !nameVal.trim()) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('name', nameVal.trim())
      fd.append('description', descriptionVal.trim())
      const r = await chatApi.updateGroup(convId, fd)
      upsertConversation(r.data.data)
      setEditingName(false)
    } catch { }
    finally { setSaving(false) }
  }

  async function handleToggleApproval() {
    if (!convId) return
    const next = !requiresApproval
    setRequiresApproval(next)
    try {
      const fd = new FormData()
      fd.append('requires_approval', String(next ? 1 : 0))
      await chatApi.updateGroup(convId, fd)
    } catch { setRequiresApproval(!next) }
  }

  async function handleSaveDescription() {
    if (!convId || !isAdmin) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('description', descriptionVal.trim())
      const r = await chatApi.updateGroup(convId, fd)
      upsertConversation(r.data.data)
      setConv(r.data.data)
      setEditingDescription(false)
    } catch { }
    finally { setSaving(false) }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !convId) return
    setAvatarError('')
    const validationError = await mediaUploadError(file, 'image')
    if (validationError) {
      setAvatarError(validationError)
      return
    }
    try {
      const source = await createLocalMediaPreview(file)
      setCropSource(previous => {
        disposeLocalMediaPreview(previous)
        return source
      })
    } catch {
      setAvatarError('That group photo could not be previewed. Choose another image.')
    }
  }

  async function uploadCroppedAvatar() {
    if (!cropSource || !convId) return
    const img = new window.Image()
    img.src = cropSource
    const loaded = await new Promise<boolean>(resolve => {
      img.onload = () => resolve(true)
      img.onerror = () => resolve(false)
    })
    if (!loaded) {
      setAvatarError('That image could not be read. Please choose another photo.')
      return
    }
    const size = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = 800; canvas.height = 800
    const context = canvas.getContext('2d')
    if (!context) {
      setAvatarError('Could not prepare that image. Please try again.')
      return
    }
    context.drawImage(img, (img.naturalWidth - size) / 2, (img.naturalHeight - size) / 2, size, size, 0, 0, 800, 800)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) {
      setAvatarError('Could not prepare that image. Please try again.')
      return
    }
    const fd = new FormData()
    const file = new File([blob], 'group-avatar.jpg', { type: 'image/jpeg' })
    const validationError = await mediaUploadError(file, 'image')
    if (validationError) {
      setAvatarError(validationError)
      return
    }
    fd.append('avatar', file)
    try {
      const r = await chatApi.updateGroup(convId, fd)
      const updated = r.data.data as Conversation
      upsertConversation(updated)
      setConv(updated)
      setCropSource(null)
      setAvatarError('')
    } catch (err: any) {
      setAvatarError(err?.response?.data?.error || 'Could not update the group photo.')
    }
  }

  async function handleChangeRole(memberId: string, newRole: string) {
    if (!convId) return
    try {
      await chatApi.changeMemberRole(convId, memberId, newRole)
      if (conv) {
        upsertConversation({
          ...conv,
          members: conv.members.map((m) => m.id === memberId ? { ...m, role: newRole } : m),
        })
      }
    } catch { }
    setMemberActions(null)
  }

  function openAdminEditor(member: any) {
    setAdminEditorMember(member)
    setAdminRights(member.admin_rights || {})
    setMemberActions(null)
  }

  async function saveAdminRights() {
    if (!adminEditorMember || !convId) return
    try {
      const result = await chatApi.changeMemberRole(convId, adminEditorMember.id, 'admin', adminRights)
      const saved = result.data.data
      if (conv) {
        const members = conv.members.map((m) => m.id === adminEditorMember.id
          ? { ...m, role: 'admin', admin_rights: saved.admin_rights || adminRights }
          : m)
        upsertConversation({ ...conv, members })
        setConv({ ...conv, members })
      }
      setAdminEditorMember(null)
    } catch { }
  }

  async function handleChangeTag() {
    if (!convId || !memberActions) return
    const tag = memberTag.trim().slice(0, 10)
    setSavingMemberTag(true)
    try {
      await chatApi.changeMemberTag(convId, memberActions.id, tag)
      if (conv) {
        upsertConversation({
          ...conv,
          members: conv.members.map((m) => m.id === memberActions.id ? { ...m, tag } : m),
        })
        setConv((current) => current ? {
          ...current,
          members: current.members.map((m) => m.id === memberActions.id ? { ...m, tag } : m),
        } : current)
      }
      setMemberActions(null)
    } catch { }
    finally { setSavingMemberTag(false) }
  }

  async function handleRemoveMember(memberId: string) {
    if (!convId) return
    try {
      await chatApi.removeMember(convId, memberId)
      if (conv) {
        upsertConversation({ ...conv, members: conv.members.filter((m) => m.id !== memberId) })
      }
    } catch { }
    setMemberActions(null)
  }

  async function handleLeave() {
    if (!convId || !user) return
    try {
      await chatApi.removeMember(convId, user.id)
      removeConversation(convId)
      navigate('/app/chat', { replace: true })
    } catch { }
  }

  async function handleDeleteGroup() {
    if (!convId) return
    try {
      await chatApi.deleteGroup(convId)
      removeConversation(convId)
      navigate('/app/chat', { replace: true })
    } catch { }
  }

  async function handleApproveRequest(reqId: string) {
    if (!convId) return
    await chatApi.approveJoinRequest(convId, reqId)
    setJoinRequests((p) => p.filter((r) => r.id !== reqId))
  }

  async function handleRejectRequest(reqId: string) {
    if (!convId) return
    await chatApi.rejectJoinRequest(convId, reqId)
    setJoinRequests((p) => p.filter((r) => r.id !== reqId))
  }

  if (!conv) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--color-bg)', overflowY: 'auto' }}>
        <DetailPageSkeleton kind="group" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'fixed', inset: 0, zIndex: 50, background: 'var(--color-bg)', overflow: 'hidden' }}>
      {/* Telegram-style header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))', paddingBottom: '12px', paddingLeft: '20px', paddingRight: '16px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <button onClick={requestAppBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', display: 'flex', padding: '6px', marginLeft: '-6px' }}>
          <ChevronLeft size={22} />
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>Manage Group</p>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>Customize your Campnect group</p>
        </div>
        {isAdmin && (
          <span style={{ fontSize: '14px', color: 'var(--color-lime)', fontWeight: 800 }}>Admin</span>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Telegram-style group identity editor */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 16px 24px', background: 'var(--color-bg)' }}>
          <button
            onClick={() => isAdmin && fileInputRef.current?.click()}
            disabled={!isAdmin}
            aria-label={isAdmin ? 'Set new group photo' : 'Group photo'}
            style={{ position: 'relative', width: 112, height: 112, padding: 0, border: 'none', borderRadius: '50%', background: 'transparent', cursor: isAdmin ? 'pointer' : 'default', marginBottom: 16 }}
          >
            <Avatar src={conv.avatar_url} name={conv.name} size={112} />
            {isAdmin && (
              <span style={{ position: 'absolute', right: 2, bottom: 2, width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface-hover)', border: '2px solid var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                <Camera size={15} />
              </span>
            )}
          </button>
          {isAdmin && (
            <button onClick={() => fileInputRef.current?.click()} style={{ border: 'none', background: 'none', color: 'var(--color-blue-bright)', fontSize: 16, fontWeight: 700, padding: '0 0 14px', cursor: 'pointer' }}>
              Set New Photo
            </button>
          )}
          {!isAdmin && <div style={{ height: 14 }} />}
          {avatarError && (
            <p style={{ margin: '-4px 0 14px', color: '#F87171', fontSize: 13, textAlign: 'center' }}>
              {avatarError}
            </p>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />

          <div style={{ width: '100%', maxWidth: 360, borderRadius: 22, background: 'var(--color-surface)', border: '1px solid var(--color-border)', overflow: 'hidden', textAlign: 'left' }}>
            {editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--color-border)' }}>
                <input
                  autoFocus
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveName() }}
                  style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--color-text-primary)', fontSize: 20, fontWeight: 700, outline: 'none', fontFamily: 'var(--font-display)' }}
                />
                <button onClick={handleSaveName} disabled={saving} aria-label="Save group name" style={{ border: 'none', background: 'none', color: 'var(--color-blue-bright)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                  {saving ? 'Saving…' : 'Done'}
                </button>
              </div>
            ) : (
              <button onClick={() => isAdmin && setEditingName(true)} disabled={!isAdmin} style={{ width: '100%', display: 'block', padding: '15px 18px', border: 'none', borderBottom: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 21, fontWeight: 700, textAlign: 'left', cursor: isAdmin ? 'text' : 'default', fontFamily: 'var(--font-display)' }}>
                {conv.name}
              </button>
            )}
            {editingDescription ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '12px 18px 14px' }}>
                <textarea
                  autoFocus
                  rows={2}
                  value={descriptionVal}
                  onChange={(e) => setDescriptionVal(e.target.value)}
                  placeholder="Description"
                  style={{ flex: 1, minWidth: 0, resize: 'none', background: 'transparent', border: 'none', color: 'var(--color-text-primary)', fontSize: 18, outline: 'none', fontFamily: 'var(--font-body)' }}
                />
                <button onClick={handleSaveDescription} disabled={saving} aria-label="Save group description" style={{ border: 'none', background: 'none', color: 'var(--color-blue-bright)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                  {saving ? 'Saving…' : 'Done'}
                </button>
              </div>
            ) : (
              <button onClick={() => isAdmin && setEditingDescription(true)} disabled={!isAdmin} style={{ width: '100%', display: 'block', padding: '13px 18px 16px', border: 'none', background: 'transparent', color: conv.description ? 'var(--color-text-secondary)' : 'var(--color-text-muted)', fontSize: 18, textAlign: 'left', lineHeight: 1.35, cursor: isAdmin ? 'text' : 'default', fontFamily: 'var(--font-body)' }}>
                {conv.description || 'Description'}
              </button>
            )}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--color-text-muted)' }}>{conv.members?.length} members · Group</p>
        </div>
          {cropSource && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'calc(14px + env(safe-area-inset-top, 0px)) 22px calc(18px + env(safe-area-inset-bottom, 0px))' }}>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => setCropSource(null)} style={{ border: 'none', borderRadius: 999, padding: '13px 24px', background: '#242426', color: '#F5F5F7', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button onClick={uploadCroppedAvatar} style={{ border: 'none', borderRadius: 999, padding: '13px 24px', background: '#242426', color: '#F5F5F7', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>Done</button>
              </div>
              <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
                <div style={{ width: 260, height: 260, borderRadius: '50%', background: '#071426', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <img src={cropSource} alt="New group photo preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <p style={{ margin: 0, color: '#4C8DFF', fontSize: 28, fontWeight: 500 }}>Set New Photo</p>
              </div>
            </div>
          )}

         {/* Shared content tabs — kept below the management header so the controls above feel like one settings page. */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          {(['info', 'media', 'files', 'links'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '12px 0', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--color-lime)' : 'transparent'}`, color: tab === t ? 'var(--color-lime)' : 'var(--color-text-muted)', fontSize: '13px', fontWeight: tab === t ? 700 : 400, cursor: 'pointer', fontFamily: 'var(--font-display)', textTransform: 'capitalize', letterSpacing: '0.02em' }}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: tab === 'info' ? '0' : '16px' }}>
          {tab === 'info' && (
            <>
              <div style={{ margin: '12px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 8px', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
                  Group management
                </div>
                {isAdmin && (
                  <ManagementRow icon={<Link2 size={16} />} label="Invite Links" value={inviteLink ? 'Active' : 'Create'} onClick={() => document.getElementById('group-invite-section')?.scrollIntoView({ behavior: 'smooth' })} />
                )}
                <ManagementRow icon={<Users size={16} />} label="Members" value={String(conv.members?.length ?? 0)} onClick={() => document.getElementById('group-members-section')?.scrollIntoView({ behavior: 'smooth' })} />
                <ManagementRow icon={<ImageIcon size={16} />} label="Shared Media" onClick={() => setTab('media')} />
                <ManagementRow icon={<FileText size={16} />} label="Files & Links" onClick={() => setTab('files')} />
                {isAdmin && <ManagementRow icon={<Shield size={16} />} label="Join approval" value={requiresApproval ? 'On' : 'Off'} onClick={handleToggleApproval} />}
              </div>

              {/* Join requests (admin only) */}
              {isAdmin && joinRequests.length > 0 && (
                 <div style={{ margin: '0 16px 12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 18, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <Users size={15} color="rgba(210,210,215,0.90)" />
                      <span style={{ fontSize: '13px', color: 'rgba(210,210,215,0.90)', fontWeight: 700 }}>Join Requests</span>
                      <span style={{ background: 'rgba(24,24,27,0.85)', color: '#fff', fontSize: '11px', fontWeight: 800, padding: '1px 6px', borderRadius: '9999px' }}>{joinRequests.length}</span>
                    </div>
                    {joinRequests.map((jr) => (
                      <div key={jr.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <Avatar src={jr.avatar_url} name={jr.full_name} size={36} />
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{jr.full_name}</p>
                          <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)' }}>@{jr.username?.toLowerCase()}</p>
                        </div>
                        <button onClick={() => handleApproveRequest(jr.id)} style={{ padding: '5px 10px', background: 'var(--color-lime-dim)', border: '1px solid rgba(187,255,0,0.25)', borderRadius: '7px', color: 'var(--color-lime)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                        <button onClick={() => handleRejectRequest(jr.id)} style={{ padding: '5px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '7px', color: '#EF4444', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Reject</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Members list */}
               <div id="group-members-section" style={{ margin: '0 16px 12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 18, overflow: 'hidden' }}>
                 <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={14} color="var(--color-text-muted)" />
                   <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 700 }}>Members</span>
                   <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--color-text-muted)' }}>{conv.members?.length}</span>
                </div>
                {conv.members?.map((m) => {
                  const rl = ROLE_LABEL[m.role]
                   const canManage = isOwner && m.id !== user?.id && m.role !== 'owner'
                  const canRemove = isAdmin && m.id !== user?.id && (ROLE_LEVEL[myRole] ?? 0) > (ROLE_LEVEL[m.role] ?? 0)
                  return (
                     <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderTop: '1px solid var(--color-border)' }}>
                      <Avatar src={m.avatar_url} name={m.full_name} size={40} online={Boolean(m.is_online)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.full_name}{m.id === user?.id ? ' (You)' : ''}
                          </span>
                           {(m.tag || rl?.label) && (
                             <span style={{ fontSize: '10px', fontWeight: 700, color: m.tag ? '#D4D4D8' : rl.color, padding: '1px 5px', border: `1px solid ${(m.tag ? '#D4D4D8' : rl.color)}40`, borderRadius: '4px', flexShrink: 0 }}>{m.tag || rl.label}</span>
                          )}
                        </div>

                        <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)' }}>@{m.username?.toLowerCase()}</p>
                      </div>

               {conv.members?.some((m) => m.role === 'admin') && (
                 <div id="group-administrators-section" style={{ margin: '0 16px 12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 18, overflow: 'hidden' }}>
                   <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                     <Shield size={14} color="rgba(210,210,215,0.9)" />
                     <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 700 }}>Administrators</span>
                     <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-text-muted)' }}>{conv.members.filter((m) => m.role === 'admin').length}</span>
                   </div>
                   {conv.members.filter((m) => m.role === 'admin').map((admin) => (
                     <div key={`admin-${admin.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: '1px solid var(--color-border)' }}>
                       <Avatar src={admin.avatar_url} name={admin.full_name} size={34} />
                       <div style={{ flex: 1, minWidth: 0 }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                           <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{admin.full_name}</span>
                           {admin.tag && <span style={{ fontSize: 10, color: '#D4D4D8', fontWeight: 700 }}>{admin.tag}</span>}
                         </div>
                         <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--color-text-muted)' }}>
                           {Object.entries(admin.admin_rights || {}).filter(([, enabled]) => enabled).map(([key]) => key.replace(/_/g, ' ')).join(' · ') || 'No custom rights'}
                         </p>
                       </div>
                       {isOwner && <button onClick={() => openAdminEditor(admin)} style={{ border: 0, background: 'transparent', color: '#D4D4D8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Edit</button>}
                     </div>
                   ))}
                 </div>
               )}
                      {(canManage || canRemove) && (
                         <button onClick={() => { setMemberActions(m); setMemberTag(m.tag || '') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: '4px' }}>
                          <MoreHorizontal size={18} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Invite link */}
              {isAdmin && (
                 <div id="group-invite-section" style={{ margin: '0 16px 12px', padding: '4px 16px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 18 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingTop: 12 }}>
                    <Link2 size={14} color="var(--color-text-muted)" />
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Invite Link</span>
                  </div>
                  {inviteLink ? (
                    <div>
                      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px 12px', marginBottom: '8px', wordBreak: 'break-all', fontSize: '12px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                        {inviteLink}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={copyLink} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px', background: inviteCopied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${inviteCopied ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '10px', color: inviteCopied ? '#22C55E' : '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                          {inviteCopied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                        </button>
                        <button onClick={handleGenerateLink} disabled={generatingLink} title="Regenerate link" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '10px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                          <RefreshCw size={14} />
                        </button>
                        <button onClick={handleRevokeLink} title="Revoke link" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '10px', color: '#EF4444', cursor: 'pointer' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={handleGenerateLink} disabled={generatingLink} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'rgba(187,255,0,0.08)', border: '1px solid rgba(187,255,0,0.2)', borderRadius: '10px', color: 'var(--color-lime)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                      {generatingLink ? <LoadingSpinner size={14} /> : <Link2 size={14} />}
                      {generatingLink ? 'Generating…' : 'Create Invite Link'}
                    </button>
                  )}
                </div>
              )}

              {/* Settings */}
              {isAdmin && (
                 <div style={{ margin: '0 16px 12px', padding: '4px 16px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 18 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingTop: 12 }}>
                    <Shield size={14} color="var(--color-text-muted)" />
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Settings</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: 500 }}>Require approval to join</p>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>New members must be approved by an admin</p>
                    </div>
                    <div
                      onClick={handleToggleApproval}
                      style={{ width: 44, height: 24, borderRadius: 12, background: requiresApproval ? 'var(--color-lime)' : 'var(--color-border-strong)', cursor: 'pointer', position: 'relative', transition: 'background 200ms', flexShrink: 0, marginLeft: 12 }}
                    >
                      <div style={{ position: 'absolute', top: 3, left: requiresApproval ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: requiresApproval ? '#0D0B12' : '#fff', transition: 'left 200ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {!isOwner && (
                  <button
                    onClick={() => setConfirmLeave(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: '12px', color: '#EF4444', fontSize: '14px', fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left' }}
                  >
                    <LogOut size={16} /> Leave Group
                  </button>
                )}
                {isOwner && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: '12px', color: '#EF4444', fontSize: '14px', fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left' }}
                  >
                    <Trash2 size={16} /> Delete Group
                  </button>
                )}
              </div>
            </>
          )}

          {tab === 'media' && (
            tabLoading ? <MediaGridSkeleton />
            : media.length === 0
            ? <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '40px 0', fontSize: '14px' }}>No shared media yet</p>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px' }}>
                {media.map((m) => (
                  <div key={m.id} style={{ aspectRatio: '1', background: 'var(--color-surface)', overflow: 'hidden', borderRadius: '4px' }}>
                    {m.type === 'image'
                      ? <AuthenticatedImage src={m.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <AuthenticatedVideo src={m.media_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    }
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'files' && (
            tabLoading ? <PeopleRowsSkeleton count={4} action={false} compact />
            : files.length === 0
            ? <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '40px 0', fontSize: '14px' }}>No shared files yet</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {files.map((f) => (
                  <AuthenticatedFileLink key={f.id} src={f.media_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', textDecoration: 'none' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(24,24,27,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileText size={18} color="rgba(210,210,215,0.90)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.media_url?.split('/').pop() || 'File'}</p>
                      <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)' }}><TimeAgo date={f.created_at} /></p>
                    </div>
                    <ExternalLink size={14} color="rgba(255,255,255,0.3)" />
                  </AuthenticatedFileLink>
                ))}
              </div>
            )
          )}

          {tab === 'links' && (
            tabLoading ? <PeopleRowsSkeleton count={4} action={false} compact />
            : links.length === 0
            ? <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '40px 0', fontSize: '14px' }}>No shared links yet</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {links.map((l, i) => (
                  <a key={i} href={/^https:\/\//i.test(l.url) ? l.url : undefined} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', textDecoration: 'none' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(24,24,27,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Link2 size={16} color="rgba(210,210,215,0.90)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '12px', color: 'rgba(210,210,215,0.90)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</p>
                    </div>
                    <ExternalLink size={13} color="rgba(255,255,255,0.3)" />
                  </a>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Administrator rights sheet */}
      {adminEditorMember && (
        <>
          <div onClick={() => setAdminEditorMember(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.58)', zIndex: 410, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 411, background: 'var(--color-surface)', borderRadius: '20px 20px 0 0', border: '1px solid var(--color-border)', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--color-border-strong)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 18px 14px', borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  {adminEditorMember.role === 'admin' ? 'Edit administrator' : 'New administrator'}
                </p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{adminEditorMember.full_name}</p>
              </div>
              <button onClick={() => setAdminEditorMember(null)} style={{ border: 0, background: 'transparent', color: 'var(--color-text-muted)', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
            <div style={{ padding: '14px 18px 6px', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              Administrator rights
            </div>
            {ADMIN_RIGHTS.map(([key, label]) => {
              const enabled = Boolean(adminRights[key])
              return (
                <button
                  key={key}
                  onClick={() => setAdminRights((current) => ({ ...current, [key]: !current[key] }))}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', border: 0, borderBottom: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-primary)', textAlign: 'left', cursor: 'pointer' }}
                >
                  <span style={{ flex: 1, fontSize: 15 }}>{label}</span>
                  <span style={{ width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center', background: enabled ? 'var(--color-lime)' : 'transparent', border: enabled ? '1px solid var(--color-lime)' : '1px solid var(--color-border-strong)', color: '#111', fontWeight: 900 }}>
                    {enabled ? '✓' : ''}
                  </span>
                </button>
              )
            })}
            <button onClick={() => void saveAdminRights()} style={{ margin: '16px 18px 0', width: 'calc(100% - 36px)', height: 46, border: 0, borderRadius: 12, background: 'var(--color-lime)', color: '#10130A', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
              Save administrator
            </button>
          </div>
        </>
      )}

      {/* Member actions sheet */}
      {memberActions && (
        <>
          <div onClick={() => setMemberActions(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 401, background: 'var(--color-surface)', borderRadius: '20px 20px 0 0', border: '1px solid var(--color-border)', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--color-border-strong)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 16px 14px' }}>
              <Avatar src={memberActions.avatar_url} name={memberActions.full_name} size={40} />
              <div>
                <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{memberActions.full_name}</p>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>@{memberActions.username?.toLowerCase()}</p>
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--color-border)' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
                <label style={{ display: 'block', marginBottom: 7, color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 700 }}>
                  Custom tag <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>(max 10 characters)</span>
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={memberTag}
                    maxLength={10}
                    onChange={(event) => setMemberTag(event.target.value.slice(0, 10))}
                    placeholder="e.g. Designer"
                    style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--color-border-strong)', background: 'var(--color-input-bg)', color: 'var(--color-text-primary)', outline: 'none', fontSize: 14 }}
                  />
                  <button
                    onClick={() => void handleChangeTag()}
                    disabled={savingMemberTag}
                    style={{ padding: '0 14px', border: 0, borderRadius: 10, background: 'var(--color-lime)', color: '#10130A', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {savingMemberTag ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
              {isOwner && memberActions.role !== 'admin' && (
                <button onClick={() => openAdminEditor(memberActions)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 20px', background: 'none', border: 'none', color: 'rgba(210,210,215,0.90)', fontSize: '15px', cursor: 'pointer', textAlign: 'left' }}>
                  <Shield size={16} /> Promote to Admin
                </button>
              )}
              {isOwner && memberActions.role === 'admin' && (
                <button onClick={() => handleChangeRole(memberActions.id, 'member')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 20px', background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '15px', cursor: 'pointer', textAlign: 'left' }}>
                  <Shield size={16} /> Demote to Member
                </button>
              )}
              {isOwner && memberActions.role !== 'moderator' && memberActions.role !== 'admin' && (
                <button onClick={() => handleChangeRole(memberActions.id, 'moderator')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 20px', background: 'none', border: 'none', color: '#52525B', fontSize: '15px', cursor: 'pointer', textAlign: 'left' }}>
                  <Shield size={16} /> Make Moderator
                </button>
              )}
              <button onClick={() => handleRemoveMember(memberActions.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 20px', background: 'none', border: 'none', color: '#EF4444', fontSize: '15px', cursor: 'pointer', textAlign: 'left' }}>
                <Trash2 size={16} /> Remove from Group
              </button>
            </div>
          </div>
        </>
      )}

      {/* Confirm leave */}
      {confirmLeave && (
        <>
          <div onClick={() => setConfirmLeave(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', background: 'var(--color-surface)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '20px', padding: '24px', zIndex: 401, width: 'calc(100% - 48px)', maxWidth: '320px', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 8px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>Leave Group?</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--color-text-secondary)', fontSize: '14px' }}>You'll need a new invite link to rejoin.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirmLeave(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--color-border-strong)', borderRadius: '12px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleLeave} style={{ flex: 1, padding: '12px', background: '#DC2626', border: 'none', borderRadius: '12px', color: 'var(--color-text-primary)', fontWeight: 700, cursor: 'pointer' }}>Leave</button>
            </div>
          </div>
        </>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <>
          <div onClick={() => setConfirmDelete(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', background: 'var(--color-surface)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '20px', padding: '24px', zIndex: 401, width: 'calc(100% - 48px)', maxWidth: '320px', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 8px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>Delete Group?</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--color-text-secondary)', fontSize: '14px' }}>All messages and media will be permanently deleted. This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--color-border-strong)', borderRadius: '12px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDeleteGroup} style={{ flex: 1, padding: '12px', background: '#DC2626', border: 'none', borderRadius: '12px', color: 'var(--color-text-primary)', fontWeight: 700, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
