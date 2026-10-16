import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Link, Share2, Send, ExternalLink } from 'lucide-react'
import { Avatar } from '../shared/Avatar'
import { AuthenticatedImage } from '../shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../shared/AuthenticatedVideo'
import { useAuthStore } from '../../stores/authStore'
import { usersApi } from '../../api/users'
import { chatApi } from '../../api/chat'
import toast from 'react-hot-toast'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { PeopleRowsSkeleton } from '../shared/AppSkeletons'

export interface PostMeta {
  postId: string
  thumbnail?: string
  thumbnailType?: 'image' | 'video'
  authorName: string
  authorAvatar?: string
  caption?: string
}

interface ShareSheetProps {
  url: string
  title?: string
  /** When set, sends a rich post-preview card instead of a raw URL */
  postMeta?: PostMeta
  onClose: () => void
}

interface FollowUser {
  id: string
  username: string
  full_name: string
  avatar_url?: string
}

export function ShareSheet({ url, title, postMeta, onClose }: ShareSheetProps) {
  useBackDismiss(true, onClose, 220)
  const { user: me } = useAuthStore()
  const [search, setSearch] = useState('')
  const [people, setPeople] = useState<FollowUser[]>([])
  const [loading, setLoading] = useState(true)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState<string | null>(null)

  useEffect(() => {
    if (!me?.id) { setLoading(false); return }
    usersApi.getFollowing(me.id)
      .then(res => setPeople(res.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [me?.id])

  const filtered = people.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.username.toLowerCase().includes(search.toLowerCase())
  )

  const sendToUser = useCallback(async (userId: string) => {
    if (sent.has(userId) || sending) return
    setSending(userId)
    try {
      const convRes = await chatApi.createDM(userId)
      const convId = convRes.data.data?.id
      if (!convId) throw new Error('no conv')
      const fd = new FormData()
      if (postMeta) {
        // Rich post-share: encode as a special prefixed JSON string
        const payload = JSON.stringify({
          postId: postMeta.postId,
          postUrl: url,
          thumbnail: postMeta.thumbnail,
          thumbnailType: postMeta.thumbnailType,
          authorName: postMeta.authorName,
          authorAvatar: postMeta.authorAvatar,
          caption: postMeta.caption?.slice(0, 180),
        })
        fd.append('content', `__POST_SHARE__:${payload}`)
      } else {
        fd.append('content', url)
      }
      await chatApi.sendMessage(convId, fd)
      setSent(prev => { const s = new Set(prev); s.add(userId); return s })
    } catch {
      toast.error('Could not send')
    } finally {
      setSending(null)
    }
  }, [url, postMeta, sent, sending])

  async function copyToClipboard() {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        return true
      } catch {
        // Some embedded browsers only allow the legacy clipboard mechanism.
      }
    }

    const textarea = document.createElement('textarea')
    textarea.value = url
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  }

  async function copyLink() {
    if (await copyToClipboard()) {
      toast.success('Link copied!')
      onClose()
    } else {
      toast.error('Could not copy the link')
    }
  }

  async function nativeShare() {
    if (!navigator.share) {
      const copied = await copyToClipboard()
      if (copied) {
        toast.success('Sharing is unavailable here — link copied instead')
        onClose()
      } else {
        toast.error('Sharing is not available on this device')
      }
      return
    }

    try {
      await navigator.share({ url, title: title || 'Check this out on Campnect' })
      onClose()
    } catch (error: any) {
      if (error?.name !== 'AbortError') toast.error('Could not open the share menu')
    }
  }

  return createPortal((
    <>
      <div
        className="share-sheet-backdrop"
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--share-backdrop)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <div className="share-sheet" style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '430px',
        background: 'var(--share-sheet-bg)',
        backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
        borderRadius: '20px 20px 0 0',
        border: '1px solid var(--share-border)',
        boxShadow: 'var(--share-shadow)',
        zIndex: 1001,
        maxHeight: 'min(85dvh, 720px)',
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom)',
        animation: 'sheetUp 260ms cubic-bezier(0.34,1.2,0.64,1)',
      }}>

        {/* Header */}
        <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--share-handle)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--share-text-primary)', fontFamily: 'var(--font-display)' }}>Share</h3>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--share-text-secondary)', display: 'flex', padding: '4px', WebkitTapHighlightColor: 'transparent' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Post preview card (when sharing a post) */}
          {postMeta && (
            <div style={{
              display: 'flex', gap: '10px', alignItems: 'center',
              background: 'var(--share-card-bg)', border: '1px solid var(--share-card-border)',
              borderRadius: '14px', padding: '10px', marginBottom: '14px',
            }}>
              {postMeta.thumbnail && postMeta.thumbnailType === 'video' ? (
                <AuthenticatedVideo src={postMeta.thumbnail} muted playsInline preload="metadata" style={{ width: 56, height: 56, borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} />
              ) : postMeta.thumbnail ? (
                <AuthenticatedImage src={postMeta.thumbnail} alt="" style={{ width: 56, height: 56, borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: '10px', background: 'var(--share-empty-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ExternalLink size={20} color="var(--share-empty-icon)" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: 700, color: 'var(--share-text-primary)', fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {postMeta.authorName}
                </p>
                {postMeta.caption && (
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--share-text-secondary)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {postMeta.caption}
                  </p>
                )}
                <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--share-text-faint)' }}>Post on Campnect</p>
              </div>
            </div>
          )}

          {/* Quick action row */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
            {[
              { icon: <Link size={20} color="var(--share-icon)" />, label: 'Copy link', onClick: copyLink },
              { icon: <Share2 size={20} color="var(--share-icon)" />, label: 'More', onClick: nativeShare },
            ].map(({ icon, label, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--share-text-secondary)', fontSize: '12px',
                  fontFamily: 'var(--font-body)', WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{
                  width: 54, height: 54, borderRadius: '50%',
                  background: 'var(--share-action-bg)',
                  border: '1px solid var(--share-action-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {icon}
                </div>
                {label}
              </button>
            ))}
          </div>

          <div style={{ height: 1, background: 'var(--share-divider)', marginBottom: '12px' }} />

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search people…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--share-input-bg)',
              border: '1px solid var(--share-input-border)',
              borderRadius: '12px', padding: '10px 14px',
              color: 'var(--share-input-text)', fontSize: '14px', outline: 'none',
              fontFamily: 'var(--font-body)', marginBottom: '6px',
              caretColor: 'var(--color-lime)',
            }}
          />
        </div>

        {/* People list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <PeopleRowsSkeleton />
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--share-text-muted)', fontSize: '14px', padding: '24px 16px', margin: 0, lineHeight: 1.6 }}>
              {search ? 'No matching people' : 'Follow people to send them posts via DM'}
            </p>
          ) : (
            filtered.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', gap: '12px' }}>
                <Avatar src={p.avatar_url} name={p.full_name} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--share-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.full_name}
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--share-text-secondary)' }}>@{p.username?.toLowerCase()}</p>
                </div>
                <button
                  onClick={() => sendToUser(p.id)}
                  disabled={sending === p.id || sent.has(p.id)}
                  style={{
                    padding: '8px 18px', borderRadius: '20px', border: 'none',
                    cursor: sent.has(p.id) ? 'default' : 'pointer',
                    background: sent.has(p.id) ? 'var(--color-lime-dim)' : 'var(--color-lime)',
                    color: sent.has(p.id) ? 'var(--color-lime)' : 'var(--color-bg)',
                    fontSize: '13px', fontWeight: 700,
                    opacity: sending === p.id ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    minWidth: 76, flexShrink: 0,
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'background 150ms, color 150ms',
                  }}
                >
                  {sent.has(p.id) ? 'Sent' : sending === p.id ? '…' : <><Send size={13} />Send</>}
                </button>
              </div>
            ))
          )}
          <div style={{ height: 16 }} />
        </div>
      </div>
    </>
  ), document.body)
}
