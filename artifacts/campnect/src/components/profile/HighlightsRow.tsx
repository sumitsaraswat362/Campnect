import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Trash2 } from 'lucide-react'
import { highlightsApi, Highlight, HighlightStory } from '../../api/highlights'
import { storiesApi } from '../../api/stories'
import { StoriesViewer } from '../../screens/main/StoriesViewerScreen'
import { StoryGroup } from '../../stores/storiesStore'
import toast from 'react-hot-toast'
import { AuthenticatedImage } from '../shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../shared/AuthenticatedVideo'
import { MediaGridSkeleton } from '../shared/AppSkeletons'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

interface Props {
  userId: string
  isMe: boolean
  profileUser: {
    user_id: string
    username: string
    full_name: string
    avatar_url?: string
  }
}

export function HighlightsRow({ userId, isMe, profileUser }: Props) {
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [viewerGroup, setViewerGroup] = useState<StoryGroup | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useBackDismiss(menuId !== null, () => setMenuId(null), 200)
  useBackDismiss(showCreate, () => setShowCreate(false), 200)

  useEffect(() => {
    highlightsApi.getUserHighlights(userId)
      .then(res => setHighlights(res.data.data || []))
      .catch(() => {})
  }, [userId])

  function openHighlight(h: Highlight) {
    if (h.stories.length === 0) {
      toast('This highlight has no stories')
      return
    }
    const group: StoryGroup = {
      user_id: profileUser.user_id,
      username: profileUser.username,
      full_name: h.title,
      avatar_url: h.cover_url || (h.stories[0]?.type !== 'video' ? h.stories[0]?.media_url : undefined) || profileUser.avatar_url || '',
      has_unseen: false,
      stories: h.stories.map((s: HighlightStory) => ({
        id: s.story_id || s.id,
        media_url: s.media_url,
        type: s.type === 'video' ? 'video' : 'image',
        created_at: s.added_at,
        expires_at: '2099-12-31T00:00:00.000Z',
        is_viewed: true,
        caption: '',
        views_count: 0,
        user_id: profileUser.user_id,
      })),
    }
    setViewerGroup(group)
  }

  async function deleteHighlight(id: string) {
    setDeleting(true)
    try {
      await highlightsApi.deleteHighlight(id)
      setHighlights(prev => prev.filter(h => h.id !== id))
      setMenuId(null)
      toast.success('Highlight deleted')
    } catch {
      toast.error('Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  function startLongPress(id: string) {
    if (!isMe) return
    longPressRef.current = setTimeout(() => setMenuId(id), 500)
  }

  function cancelLongPress() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  if (!isMe && highlights.length === 0) return null

  return (
    <>
      {/* Horizontal scroll row */}
      <div style={{ overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
        <div style={{ display: 'flex', gap: '14px', padding: '10px 16px 14px', minWidth: 'min-content' }}>

          {/* New highlight button — own profile only */}
          {isMe && (
            <button
              onClick={() => setShowCreate(true)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                background: 'none', border: 'none', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent', flexShrink: 0,
              }}
            >
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--color-surface)',
                border: '1.5px dashed var(--color-border-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Plus size={22} color="rgba(255,255,255,0.5)" strokeWidth={1.8} />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', maxWidth: 64, textAlign: 'center', lineHeight: 1.2 }}>
                New
              </span>
            </button>
          )}

          {/* Existing highlights */}
          {highlights.map(h => {
            const cover = h.cover_url || (h.stories.length > 0 ? h.stories[0].media_url : undefined)
            const coverIsVideo = !h.cover_url && h.stories[0]?.type === 'video'
            return (
              <button
                key={h.id}
                onClick={() => { cancelLongPress(); openHighlight(h) }}
                onTouchStart={() => startLongPress(h.id)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
                onContextMenu={isMe ? (e) => { e.preventDefault(); setMenuId(h.id) } : undefined}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent', flexShrink: 0,
                }}
              >
                <div style={{
                  width: 64, height: 64, borderRadius: '50%', overflow: 'hidden',
                  border: '2px solid var(--color-border-strong)',
                  background: 'linear-gradient(135deg, rgba(24,24,27,0.7), rgba(196,77,204,0.5))',
                  position: 'relative', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {cover && coverIsVideo ? (
                    <AuthenticatedVideo
                      src={cover}
                      muted
                      playsInline
                      preload="metadata"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : cover ? (
                    <AuthenticatedImage
                      src={cover}
                      alt={h.title}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1, zIndex: 1 }}>
                      {h.title[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: '11px', color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-body)', textAlign: 'center',
                  maxWidth: 64, lineHeight: 1.2,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                } as React.CSSProperties}>
                  {h.title}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Long-press delete menu */}
      {menuId && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setMenuId(null)}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: 480,
            background: 'rgba(13,11,22,0.98)', borderRadius: '20px 20px 0 0',
            border: '1px solid var(--color-border-strong)', zIndex: 201,
            paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
            animation: 'hlMenuUp 200ms ease',
          }}>
            <style>{`@keyframes hlMenuUp { from { transform: translateX(-50%) translateY(100%); } to { transform: translateX(-50%) translateY(0); } }`}</style>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.2)' }} />
            </div>
            <p style={{ margin: '4px 20px 2px', fontSize: '13px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              {highlights.find(h => h.id === menuId)?.title}
            </p>
            <button
              onClick={() => !deleting && deleteHighlight(menuId)}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px', width: '100%',
                background: 'none', border: 'none', cursor: 'pointer', padding: '14px 20px',
                color: '#EF4444', fontSize: '15px', fontWeight: 500,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Trash2 size={18} style={{ opacity: 0.7 }} />
              {deleting ? 'Deleting…' : 'Delete highlight'}
            </button>
            <button
              onClick={() => setMenuId(null)}
              style={{
                display: 'flex', alignItems: 'center', width: '100%',
                background: 'none', border: 'none', cursor: 'pointer', padding: '14px 20px',
                color: 'var(--color-text-secondary)', fontSize: '15px', fontWeight: 500,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Highlight viewer — rendered via portal so position:fixed covers the full viewport
          even when a parent has overflow:hidden (iOS Safari stacking context bug) */}
      {viewerGroup && createPortal(
        <StoriesViewer
          groups={[viewerGroup]}
          initialGroupIndex={0}
          onClose={() => setViewerGroup(null)}
        />,
        document.body
      )}

      {/* Create highlight sheet */}
      {showCreate && (
        <CreateHighlightSheet
          userId={userId}
          onClose={() => setShowCreate(false)}
          onCreated={h => { setHighlights(prev => [h, ...prev]); setShowCreate(false) }}
        />
      )}
    </>
  )
}

/* ─── Create Highlight Sheet ─────────────────────────────────────────────── */

interface AnyStory {
  id: string
  media_url: string
  type?: string
  thumbnail_url?: string
}

function CreateHighlightSheet({
  userId,
  onClose,
  onCreated,
}: {
  userId: string
  onClose: () => void
  onCreated: (h: Highlight) => void
}) {
  const [stories, setStories] = useState<AnyStory[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    storiesApi.getByUser(userId)
      .then(res => setStories(res.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId])

  function toggle(id: string) {
    setSelected(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  async function create() {
    if (!title.trim()) { toast.error('Enter a name for the highlight'); return }
    if (selected.size === 0) { toast.error('Select at least one story'); return }
    setCreating(true)
    try {
      const sel = stories.filter(s => selected.has(s.id))
      const res = await highlightsApi.createHighlight({
        title: title.trim(),
        cover_url: sel[0]?.media_url,
        stories: sel.map(s => ({ story_id: s.id, media_url: s.media_url, type: s.type || 'photo' })),
      })
      onCreated(res.data.data)
      toast.success('Highlight created!')
    } catch {
      toast.error('Failed to create highlight')
      setCreating(false)
    }
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480,
        background: 'rgba(13,11,22,0.98)', borderRadius: '20px 20px 0 0',
        border: '1px solid var(--color-border-strong)', zIndex: 201,
        maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom)',
        animation: 'hlMenuUp 220ms cubic-bezier(0.34,1.2,0.64,1)',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.2)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
              New Highlight
            </h3>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', WebkitTapHighlightColor: 'transparent' }}
            >
              <X size={20} />
            </button>
          </div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Name (e.g. Campus, Trips, Food)"
            maxLength={40}
            autoFocus
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)',
              borderRadius: '12px', padding: '12px 14px',
              color: 'var(--color-text-primary)', fontSize: '15px', outline: 'none',
              fontFamily: 'var(--font-body)', marginBottom: '12px',
              caretColor: 'var(--color-lime)',
            }}
          />
        </div>

        {/* Story grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 12px' }}>
          {loading ? (
            <MediaGridSkeleton count={6} />
          ) : stories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', margin: 0, lineHeight: 1.7 }}>
                No active stories.<br />Post a story first to add it to a highlight.
              </p>
            </div>
          ) : (
            <>
              <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Select stories ({selected.size} selected)
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px' }}>
                {stories.map(s => (
                  <div
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    style={{
                      aspectRatio: '9/16', borderRadius: '8px', overflow: 'hidden',
                      cursor: 'pointer', position: 'relative',
                      border: `2.5px solid ${selected.has(s.id) ? 'var(--color-lime)' : 'transparent'}`,
                      boxSizing: 'border-box', background: 'rgba(24,24,27,0.15)',
                    }}
                  >
                    {s.type === 'video' ? (
                      <AuthenticatedVideo
                        src={s.media_url}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        muted playsInline
                        poster={s.thumbnail_url}
                      />
                    ) : (
                      <AuthenticatedImage
                        src={s.media_url}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    )}
                    {selected.has(s.id) && (
                      <div style={{
                        position: 'absolute', top: 6, right: 6,
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'var(--color-lime)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0D0B12', lineHeight: 1 }}>✓</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Create button */}
        <div style={{ padding: '12px 16px', flexShrink: 0, borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={create}
            disabled={creating || !title.trim() || selected.size === 0}
            style={{
              width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
              background: title.trim() && selected.size > 0 && !creating
                ? 'var(--color-lime)'
                : 'rgba(187,255,0,0.2)',
              color: '#0D0B12', fontSize: '15px', fontWeight: 700,
              cursor: title.trim() && selected.size > 0 ? 'pointer' : 'default',
              transition: 'background 150ms',
            }}
          >
            {creating ? 'Creating…' : 'Create Highlight'}
          </button>
        </div>
      </div>
    </>
  )
}
