import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { glimpsesApi, type Glimpse } from '../../api/glimpses'
import { postsApi } from '../../api/posts'
import { ShareSheet } from '../../components/feed/ShareSheet'
import { CommentSheet } from '../../components/feed/CommentSheet'
import { GlimpseStory } from '../../components/feed/GlimpseStory'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { MediaViewerSkeleton } from '../../components/shared/AppSkeletons'
import { navigateToAppRoot } from '../../navigation/appSectionNavigation'
import { PromptDialog } from '../../components/shared/PromptDialog'

export function GlimpseViewerScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id = '' } = useParams()
  const [glimpse, setGlimpse] = useState<Glimpse | null>(null)
  const [loading, setLoading] = useState(true)
  const [shareOpen, setShareOpen] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  useBackDismiss(menuOpen, () => setMenuOpen(false), 150)

  useEffect(() => {
    if (!id) return
    glimpsesApi.getById(id)
      .then(response => {
        setGlimpse(response.data.data)
        void glimpsesApi.view(id)
      })
      .catch(() => toast.error('This Glimpse is no longer available'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!glimpse) return
    const expiresAt = new Date(glimpse.created_at).getTime() + (24 * 60 * 60 * 1000)
    const delay = expiresAt - Date.now()
    if (delay <= 0) {
      setGlimpse(null)
      setShareOpen(false)
      setCommentOpen(false)
      setMenuOpen(false)
      return
    }
    const timer = window.setTimeout(() => {
      setGlimpse(null)
      setShareOpen(false)
      setCommentOpen(false)
      setMenuOpen(false)
      toast.error('This Glimpse is no longer available')
    }, delay + 25)
    return () => window.clearTimeout(timer)
  }, [glimpse?.id, glimpse?.created_at])

  async function toggleLike() {
    if (!glimpse) return
    const liked = !glimpse.is_liked
    setGlimpse({ ...glimpse, is_liked: liked, likes_count: Math.max(0, glimpse.likes_count + (liked ? 1 : -1)) })
    try {
      if (liked) await postsApi.likePost(glimpse.id)
      else await postsApi.unlikePost(glimpse.id)
    } catch {
      setGlimpse({ ...glimpse, is_liked: !liked, likes_count: glimpse.likes_count })
    }
  }

  async function toggleSave() {
    if (!glimpse) return
    const saved = !glimpse.is_saved
    setGlimpse({ ...glimpse, is_saved: saved, saves_count: Math.max(0, glimpse.saves_count + (saved ? 1 : -1)) })
    try {
      if (saved) await postsApi.savePost(glimpse.id)
      else await postsApi.unsavePost(glimpse.id)
    } catch {}
  }

  async function report(reason: string, description?: string) {
    if (!glimpse) return
    try {
      await glimpsesApi.report(glimpse.id, reason, description)
      toast.success('Thanks — we’ll review this Glimpse.')
      setMenuOpen(false)
      setReportOpen(false)
    } catch {
      toast.error('Could not send the report')
    }
  }

  if (loading) return <div className="route-viewport" style={{ background: '#08070d' }}><MediaViewerSkeleton label="Loading Glimpse" /></div>
  if (!glimpse) return <div className="route-viewport route-scroll" style={{ display: 'grid', placeItems: 'center', padding: 24, background: '#08070d', color: '#fff', textAlign: 'center' }}><div><h2>Glimpse unavailable</h2><button onClick={() => navigateToAppRoot(navigate, location.pathname, '/app/glimpse')} style={buttonStyle}>Back to Glimpse</button></div></div>

  return (
    <div className="route-viewport" style={{ background: '#020205', color: '#fff', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <GlimpseStory
        glimpse={glimpse}
        position={1}
        total={1}
        onClose={requestAppBack}
        onProfile={() => navigate(`/app/profile/${glimpse.username}`)}
        onLike={toggleLike}
        onComment={() => setCommentOpen(true)}
        onShare={async () => { await glimpsesApi.share(glimpse.id).catch(() => {}); setShareOpen(true) }}
        onSave={toggleSave}
        onMenu={() => setMenuOpen(open => !open)}
        liked={Boolean(glimpse.is_liked)}
        saved={Boolean(glimpse.is_saved)}
      />

      {menuOpen && (
        <div style={{ position: 'absolute', zIndex: 20, top: 72, right: 14, width: 190, padding: 7, border: '1px solid rgba(255,255,255,.14)', borderRadius: 15, background: 'rgba(27,18,39,.96)', boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
          <button onClick={() => navigate(`/app/profile/${glimpse.username}`)} style={{ width: '100%', padding: '10px', textAlign: 'left', border: 0, background: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Open profile</button>
          <button onClick={() => { setMenuOpen(false); setReportOpen(true) }} style={{ width: '100%', padding: '10px', textAlign: 'left', border: 0, background: 'none', color: '#ffb0c5', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Report Glimpse</button>
        </div>
      )}

      {commentOpen && <CommentSheet postId={glimpse.id} commentsCount={glimpse.comments_count} onClose={() => setCommentOpen(false)} onCommentAdded={() => setGlimpse(previous => previous ? { ...previous, comments_count: previous.comments_count + 1 } : previous)} />}
      {shareOpen && <ShareSheet url={`${window.location.origin}/app/glimpse/${glimpse.id}`} title={glimpse.content || 'A Glimpse from campus'} postMeta={{ postId: glimpse.id, thumbnail: glimpse.cover_url || glimpse.media[0], thumbnailType: glimpse.cover_url ? 'image' : (Boolean(glimpse.duration) || /\.(mp4|mov|webm|m4v)(?:\?|$)/i.test(glimpse.media[0] || '') ? 'video' : 'image'), authorName: glimpse.full_name, authorAvatar: glimpse.avatar_url || undefined, caption: glimpse.content }} onClose={() => setShareOpen(false)} />}
      <PromptDialog open={reportOpen} title="Report Glimpse" message="Tell us why this Glimpse should be reviewed. Our team will review the caption and media." placeholder="Reason for this report" submitLabel="Submit report" onCancel={() => setReportOpen(false)} onSubmit={report} />
    </div>
  )
}

const buttonStyle = { minHeight: 44, padding: '0 18px', border: 0, borderRadius: 999, background: 'var(--color-lime)', color: '#101507', fontWeight: 900, cursor: 'pointer' }