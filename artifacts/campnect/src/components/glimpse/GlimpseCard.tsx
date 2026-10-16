import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bookmark, CalendarDays, Heart, MessageCircle, MoreHorizontal, Play, Share2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { mediaUrl } from '../../utils/mediaUrl'
import { Avatar } from '../shared/Avatar'
import { AuthenticatedImage } from '../shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../shared/AuthenticatedVideo'
import { TimeAgo } from '../shared/TimeAgo'
import type { Glimpse } from '../../api/glimpses'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

interface GlimpseCardProps {
  glimpse: Glimpse
  onLike: () => void
  onSave: () => void
  onComment: () => void
  onShare: () => void
  onReport: () => void
  onNotInterested: () => void
  onOpen: () => void
  isOwner?: boolean
  onDelete?: () => void
}

export function GlimpseCard({ glimpse, onLike, onSave, onComment, onShare, onReport, onNotInterested, onOpen, isOwner, onDelete }: GlimpseCardProps) {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoVisibleRef = useRef(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [heartBurst, setHeartBurst] = useState(false)
  useBackDismiss(menuOpen, () => setMenuOpen(false), 150)
  const lastTap = useRef(0)
  const media = mediaUrl(glimpse.media?.[0])
  const cover = mediaUrl(glimpse.cover_url)
  const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(media || '') || Boolean(glimpse.duration)

  useEffect(() => {
    if (!videoRef.current) return
    const observer = new IntersectionObserver(([entry]) => {
      videoVisibleRef.current = entry.isIntersecting
      if (entry.isIntersecting) videoRef.current?.play().catch(() => {})
      else videoRef.current?.pause()
    }, { threshold: 0.55 })
    observer.observe(videoRef.current)
    return () => observer.disconnect()
  }, [])

  function tapMedia() {
    const now = Date.now()
    if (now - lastTap.current < 350 && !glimpse.is_liked) {
      onLike()
      setHeartBurst(true)
      window.setTimeout(() => setHeartBurst(false), 700)
    }
    lastTap.current = now
  }

  return (
    <article style={{
      margin: '0 12px 18px',
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,.11)',
      borderRadius: 26,
      background: 'linear-gradient(145deg, rgba(255,255,255,.085), rgba(255,255,255,.025))',
      boxShadow: '0 16px 44px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 11px' }}>
        <Avatar src={glimpse.avatar_url} name={glimpse.full_name} size={38} onClick={() => navigate(`/app/profile/${glimpse.username}`)} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <button onClick={() => navigate(`/app/profile/${glimpse.username}`)} style={{ display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0, border: 0, background: 'none', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-display)', cursor: 'pointer' }}>
            {glimpse.full_name}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-muted)', fontSize: 11, marginTop: 3 }}>
            <span>@{glimpse.username}</span><span>·</span><TimeAgo date={glimpse.created_at} />
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <button aria-label="Glimpse options" onClick={() => setMenuOpen(open => !open)} style={iconButton}>
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: 42, zIndex: 5, width: 170, padding: 6, border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, background: 'rgba(21,18,34,.98)', boxShadow: '0 16px 32px rgba(0,0,0,.45)' }}>
              <MenuButton label={glimpse.is_saved ? 'Remove save' : 'Save Glimpse'} onClick={() => { onSave(); setMenuOpen(false) }} />
              <MenuButton label="Not interested" onClick={() => { onNotInterested(); setMenuOpen(false) }} />
              {isOwner && onDelete && <MenuButton label="Delete Glimpse" danger onClick={() => { onDelete(); setMenuOpen(false) }} />}
              <MenuButton label="Report" danger onClick={() => { onReport(); setMenuOpen(false) }} />
            </div>
          )}
        </div>
      </div>

      <button onClick={() => { tapMedia(); onOpen() }} aria-label="Open Glimpse" style={{ display: 'block', width: '100%', padding: 0, border: 0, background: '#08070d', cursor: 'pointer', position: 'relative' }}>
        {isVideo ? (
          <AuthenticatedVideo
            ref={videoRef}
            src={media}
            poster={cover}
            muted
            loop
            playsInline
            onCanPlay={(event) => {
              if (videoVisibleRef.current) event.currentTarget.play().catch(() => {})
            }}
            style={{ display: 'block', width: '100%', aspectRatio: '9 / 16', objectFit: 'contain', background: '#08070d' }}
          />
        ) : (
          <AuthenticatedImage src={media} alt={glimpse.content || 'Campus Glimpse'} loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '9 / 16', objectFit: 'contain', background: '#08070d' }} />
        )}
        {isVideo && <span style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 9px', borderRadius: 999, background: 'rgba(0,0,0,.48)', color: '#fff', fontSize: 11, fontWeight: 800 }}><Play size={12} fill="currentColor" /> Glimpse</span>}
        {glimpse.event && (
          <span style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 6, maxWidth: 'calc(100% - 24px)', padding: '8px 11px', border: '1px solid rgba(187,255,0,.35)', borderRadius: 999, background: 'rgba(10,12,9,.78)', color: '#dfff8c', fontSize: 11, fontWeight: 800, backdropFilter: 'blur(10px)' }}>
            <CalendarDays size={13} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{glimpse.event.title}</span>
          </span>
        )}
        {heartBurst && <Heart size={78} fill="#fff" color="#fff" style={{ position: 'absolute', inset: 0, margin: 'auto', filter: 'drop-shadow(0 8px 22px rgba(255,48,120,.62))', animation: 'heartPop 700ms ease-out forwards' }} />}
      </button>

      {glimpse.content && <p style={{ margin: '12px 14px 0', color: 'var(--color-text-primary)', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{glimpse.content}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 17, padding: '12px 14px 14px' }}>
        <Action icon={<Heart size={20} fill={glimpse.is_liked ? '#ff3b7a' : 'none'} color={glimpse.is_liked ? '#ff3b7a' : 'var(--color-icon-inactive)'} />} count={glimpse.likes_count} active={glimpse.is_liked} onClick={onLike} />
        <Action icon={<MessageCircle size={20} color="var(--color-icon-inactive)" />} count={glimpse.comments_count} onClick={onComment} />
        <Action icon={<Share2 size={20} color="var(--color-icon-inactive)" />} count={glimpse.shares_count} onClick={onShare} />
        <span style={{ flex: 1 }} />
        <Action icon={<Bookmark size={20} fill={glimpse.is_saved ? 'var(--color-lime)' : 'none'} color={glimpse.is_saved ? 'var(--color-lime)' : 'var(--color-icon-inactive)'} />} onClick={onSave} />
      </div>
    </article>
  )
}

function Action({ icon, count, active, onClick }: { icon: ReactNode; count?: number; active?: boolean; onClick: () => void }) {
  return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0, border: 0, background: 'none', color: active ? '#ff3b7a' : 'var(--color-text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{icon}{count ? (count > 999 ? `${(count / 1000).toFixed(1)}k` : count) : ''}</button>
}

function MenuButton({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} style={{ width: '100%', padding: '10px 11px', textAlign: 'left', border: 0, borderRadius: 10, background: 'transparent', color: danger ? '#ff9fb8' : '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{label}</button>
}

const iconButton = { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,.10)', borderRadius: 11, background: 'rgba(255,255,255,.05)', color: 'var(--color-text-muted)', cursor: 'pointer' }