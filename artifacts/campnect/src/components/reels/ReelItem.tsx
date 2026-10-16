import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Heart, MessageCircle, Share2, Bookmark, VolumeX, Volume2, UserPlus, Music2, MoreVertical, Pencil, Trash2, X } from 'lucide-react'
import { ShareSheet } from '../feed/ShareSheet'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../shared/Avatar'
import { AuthenticatedImage } from '../shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../shared/AuthenticatedVideo'
import { VerifiedBadge } from '../shared/VerifiedBadge'
import { Post } from '../../stores/feedStore'
import { colors } from '../../styles/tokens'
import { CommentSheet } from '../feed/CommentSheet'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

interface ReelItemProps {
  post: Post
  isActive: boolean
  isLiked: boolean
  isSaved: boolean
  onLike: () => void
  onUnlike: () => void
  onSave: () => void
  onUnsave: () => void
  onEdit?: (patch: { content: string }) => Promise<void>
  onDelete?: () => Promise<void>
}

export function ReelItem({ post, isActive, isLiked, isSaved, onLike, onUnlike, onSave, onUnsave, onEdit, onDelete }: ReelItemProps) {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastTapRef = useRef(0)
  const [muted, setMuted] = useState(true)
  const [heartBurst, setHeartBurst] = useState(false)
  const [captionExpanded, setCaptionExpanded] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [localLikeCount, setLocalLikeCount] = useState(post.likes_count)
  const [localLiked, setLocalLiked] = useState(isLiked)
  const [showMenu, setShowMenu] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showEditSheet, setShowEditSheet] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editContent, setEditContent] = useState(post.content || '')
  const [actionSaving, setActionSaving] = useState(false)
  useBackDismiss(showMenu, () => setShowMenu(false), 150)
  useBackDismiss(showEditSheet, () => setShowEditSheet(false), 250)
  useBackDismiss(showDeleteConfirm, () => setShowDeleteConfirm(false), 300)

  useEffect(() => { setLocalLiked(isLiked) }, [isLiked])

  // Play/pause based on active state
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (isActive) {
      v.currentTime = 0
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [isActive])

  const triggerHeart = useCallback(() => {
    setHeartBurst(true)
    setTimeout(() => setHeartBurst(false), 700)
  }, [])

  const handleTap = useCallback(() => {
    const now = Date.now()
    if (now - lastTapRef.current < 350) {
      lastTapRef.current = 0
      triggerHeart()
      if (!localLiked) {
        setLocalLiked(true)
        setLocalLikeCount((c) => c + 1)
        onLike()
      }
      return
    }
    lastTapRef.current = now
  }, [localLiked, onLike, triggerHeart])

  const mediaUrl = Array.isArray(post.media) && post.media.length > 0 ? post.media[0] : null

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        width: '100%',
        background: '#000',
        flexShrink: 0,
        scrollSnapAlign: 'start',
        overflow: 'hidden',
      }}
    >
      {/* Video / fallback image */}
      {mediaUrl && (post.type === 'reel' || post.type === 'video') ? (
        <AuthenticatedVideo
          ref={videoRef}
          src={mediaUrl}
          poster={post.cover_url || undefined}
          autoPlay={isActive}
          onCanPlay={(event) => {
            if (isActive) event.currentTarget.play().catch(() => {})
          }}
          loop
          muted={muted}
          playsInline
          onClick={handleTap}
          style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
        />
      ) : (
        <div
          onClick={handleTap}
          style={{ width: '100%', height: '100%', cursor: 'pointer', position: 'relative' }}
        >
          {mediaUrl
             ? <AuthenticatedImage src={mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0c0c18, #1a1a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '16px', textAlign: 'center', padding: '0 32px' }}>{post.content}</p>
              </div>
          }
        </div>
      )}

      {/* Gradient overlays */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 35%, transparent 60%)' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '80px', pointerEvents: 'none', background: 'linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)' }} />

      {/* Heart burst */}
      {heartBurst && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 20 }}>
          <div style={{ animation: 'reelHeart 700ms var(--ease-spring) forwards' }}>
            <Heart size={90} fill="#EF4444" color="#EF4444" />
          </div>
          <style>{`
            @keyframes reelHeart {
              0%   { opacity:0; transform:scale(0) rotate(-20deg); }
              35%  { opacity:1; transform:scale(1.3) rotate(5deg); }
              65%  { opacity:1; transform:scale(1) rotate(0deg); }
              100% { opacity:0; transform:scale(0.8); }
            }
          `}</style>
        </div>
      )}

      {/* ⋯ for own reel — top right */}
      {(onEdit || onDelete) && (
        <button
          onClick={() => setShowMenu(true)}
          style={{ position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', right: '14px', zIndex: 20, background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)' }}
        >
          <MoreVertical size={18} color="#fff" />
        </button>
      )}

      {/* Right action column */}
      <div style={{
        position: 'absolute', right: '12px', bottom: '120px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', zIndex: 10,
      }}>
        {/* Author avatar */}
        <div style={{ position: 'relative' }}>
          <Avatar src={post.avatar_url} name={post.full_name} size={44} onClick={() => navigate(`/app/profile/${post.username}`)} />
          <div style={{
            position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
            width: 18, height: 18, borderRadius: '50%', background: colors.blueCore,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #000',
          }}>
            <UserPlus size={9} color="#fff" />
          </div>
        </div>

        <ActionBtn icon={<Heart size={28} fill={localLiked ? '#EF4444' : 'none'} color={localLiked ? '#EF4444' : '#fff'} />} count={localLikeCount} onClick={() => {
          if (localLiked) { setLocalLiked(false); setLocalLikeCount((c) => Math.max(0, c - 1)); onUnlike() }
          else { setLocalLiked(true); setLocalLikeCount((c) => c + 1); onLike() }
        }} />
        <ActionBtn icon={<MessageCircle size={28} color="#fff" />} count={post.comments_count} onClick={() => setShowComments(true)} />
        <ActionBtn icon={<Bookmark size={28} fill={isSaved ? 'rgba(210,210,215,0.90)' : 'none'} color={isSaved ? 'rgba(210,210,215,0.90)' : '#fff'} />} onClick={isSaved ? onUnsave : onSave} />
        <ActionBtn icon={<Share2 size={28} color="#fff" />} onClick={() => setShowShare(true)} />

      </div>

      {/* Keep audio control clear of the bottom navigation and action area. */}
      {(post.type === 'reel' || post.type === 'video') && (
        <button
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? 'Turn video sound on' : 'Mute video'}
          style={muteButton}
        >
          {muted ? <VolumeX size={16} color="#fff" /> : <Volume2 size={16} color="#fff" />}
        </button>
      )}

      {/* Bottom info */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: '80px', padding: '0 16px 28px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }} onClick={() => navigate(`/app/profile/${post.username}`)}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#fff' }}>{post.full_name}</span>
          {(Boolean(post.is_college_verified) || ['ceo', 'cmo'].includes(post.username?.toLowerCase() || '')) && <VerifiedBadge size={13} />}
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>@{post.username?.toLowerCase()}</span>
        </div>

        {post.content && (
          <div>
            <p
              style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px', lineHeight: 1.4, margin: '0 0 2px', whiteSpace: captionExpanded ? 'pre-wrap' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {post.content}
            </p>
            {post.content.length > 80 && (
              <button onClick={() => setCaptionExpanded((e) => !e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: '13px', padding: 0 }}>
                {captionExpanded ? 'less' : 'more'}
              </button>
            )}
          </div>
        )}

        {/* Audio pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: isActive ? 'spin 3s linear infinite' : 'none',
          }}>
            <Music2 size={11} color="#fff" />
          </div>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Original audio</span>
        </div>
      </div>

      {/* Comment sheet */}
      {showComments && (
        <CommentSheet postId={post.id} commentsCount={post.comments_count} onClose={() => setShowComments(false)} onCommentAdded={() => {}} />
      )}

      {/* Share sheet */}
      {showShare && (
        <ShareSheet
          url={`${window.location.origin}/app/post/${post.id}`}
          title={post.content?.slice(0, 80)}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* ⋯ menu sheet */}
      {showMenu && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowMenu(false)} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(13,11,22,0.97)', borderRadius: '20px 20px 0 0', border: '1px solid rgba(255,255,255,0.10)', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: '9999px', background: 'rgba(255,255,255,0.2)' }} />
            </div>
            {onEdit && (
              <button onClick={() => { setShowMenu(false); setEditContent(post.content || ''); setShowEditSheet(true) }}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 20px', color: 'rgba(255,255,255,0.85)', fontSize: '15px', fontWeight: 500, textAlign: 'left' }}>
                <Pencil size={18} style={{ opacity: 0.7 }} /> Edit caption
              </button>
            )}
            {onDelete && (
              <button onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 20px', color: '#EF4444', fontSize: '15px', fontWeight: 500, textAlign: 'left' }}>
                <Trash2 size={18} style={{ opacity: 0.7 }} /> Delete glimpse
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit caption sheet */}
      {showEditSheet && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowEditSheet(false)} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(13,11,22,0.98)', borderRadius: '20px 20px 0 0', border: '1px solid rgba(255,255,255,0.10)', padding: '16px 16px calc(28px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#fff' }}>Edit caption</h3>
              <button onClick={() => setShowEditSheet(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex' }}><X size={20} /></button>
            </div>
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              placeholder="Add a caption…"
              rows={3}
              maxLength={5000}
              autoFocus
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px', padding: '12px 14px', color: '#fff', fontSize: '15px', fontFamily: 'var(--font-body)', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: '12px' }}
            />
            <button
              onClick={async () => {
                if (!onEdit) return
                setActionSaving(true)
                try { await onEdit({ content: editContent }); setShowEditSheet(false) }
                catch {} finally { setActionSaving(false) }
              }}
              disabled={actionSaving}
              style={{ width: '100%', padding: '13px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #18181B, #C44DCC)', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', opacity: actionSaving ? 0.7 : 1 }}
            >
              {actionSaving ? 'Saving…' : 'Save caption'}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowDeleteConfirm(false)} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(13,11,22,0.98)', borderRadius: '20px 20px 0 0', border: '1px solid rgba(239,68,68,0.25)', padding: '20px 16px calc(32px + env(safe-area-inset-bottom))', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Trash2 size={22} color="#EF4444" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700, color: '#fff' }}>Delete glimpse?</h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>This can't be undone.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: '13px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={async () => {
                  if (!onDelete) return
                  setActionSaving(true)
                  try { await onDelete(); setShowDeleteConfirm(false) }
                  catch {} finally { setActionSaving(false) }
                }}
                disabled={actionSaving}
                style={{ flex: 1, padding: '13px', borderRadius: '14px', border: 'none', background: '#DC2626', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', opacity: actionSaving ? 0.7 : 1 }}
              >
                {actionSaving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const muteButton: React.CSSProperties = {
  position: 'absolute',
  left: 16,
  bottom: 'calc(154px + env(safe-area-inset-bottom, 0px))',
  zIndex: 12,
  width: 34,
  height: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: '1px solid rgba(255,255,255,.22)',
  borderRadius: '50%',
  background: 'rgba(0,0,0,.5)',
  color: '#fff',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
}

function ActionBtn({ icon, count, onClick }: { icon: React.ReactNode; count?: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: 0 }}
    >
      {icon}
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
        </span>
      )}
    </button>
  )
}

// CSS spin animation — inject once
const spinStyle = document.createElement('style')
spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg); } }'
if (!document.head.querySelector('[data-reel-spin]')) {
  spinStyle.setAttribute('data-reel-spin', '1')
  document.head.appendChild(spinStyle)
}
