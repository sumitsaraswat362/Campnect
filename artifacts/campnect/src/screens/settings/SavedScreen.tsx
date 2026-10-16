import { useEffect, useMemo, useState } from 'react'
import { Bookmark, Film, Grid3X3, MoreHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usersApi } from '../../api/users'
import { Post } from '../../stores/feedStore'
import { useFeedStore } from '../../stores/feedStore'
import { FeedLoadingSkeletons } from '../../components/feed/PostLoadingState'
import { EmptyState } from '../../components/shared/EmptyState'
import { Avatar } from '../../components/shared/Avatar'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { colors, radii } from '../../styles/tokens'

type SavedTab = 'all' | 'posts'

export function SavedScreen() {
  const navigate = useNavigate()
  const { unsavePost } = useFeedStore()
  const [posts, setPosts] = useState<Post[]>([])
  const [tab, setTab] = useState<SavedTab>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    usersApi.getSavedPosts()
      .then((res) => setPosts(res.data.data || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [])

  const visiblePosts = useMemo(() => posts.filter((post) => {
    if (tab === 'posts') return post.type !== 'reel'
    return true
  }), [posts, tab])

  async function removeSaved(postId: string) {
    setPosts((current) => current.filter((post) => post.id !== postId))
    await unsavePost(postId)
  }

  return (
    <div style={{ minHeight: '100%', background: colors.bg, paddingBottom: 32 }}>
      <div style={{ padding: '14px 16px 10px' }}>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: 13 }}>
           Keep the posts you want to come back to.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', overflowX: 'auto' }}>
        {([
          ['all', 'All saved', Bookmark],
          ['posts', 'Posts', Grid3X3],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            style={{
              border: `1px solid ${tab === value ? 'rgba(187,255,0,.45)' : colors.border}`,
              background: tab === value ? 'rgba(187,255,0,.12)' : 'var(--color-surface)',
              color: tab === value ? colors.lime : colors.textSecondary,
              borderRadius: radii.pill, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer',
            }}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {loading ? (
        <div style={{ padding: '0 12px' }}><FeedLoadingSkeletons count={3} /></div>
      ) : visiblePosts.length === 0 ? (
        <EmptyState icon={<Bookmark size={28} color={colors.lime} />} title="Nothing saved yet" description="Tap the bookmark on a post to save it here." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 12px' }}>
          {visiblePosts.map((post) => (
            <SavedRow key={post.id} post={post} onOpen={() => navigate(`/app/post/${post.id}`)} onRemove={() => removeSaved(post.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function SavedRow({ post, onOpen, onRemove }: { post: Post; onOpen: () => void; onRemove: () => void }) {
  const media = post.media?.[0]
  const isVideo = post.type === 'reel' || post.type === 'video'
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen() }} style={{ width: '100%', textAlign: 'left', border: `1px solid ${colors.border}`, background: 'var(--color-surface)', borderRadius: radii.xl, padding: 10, display: 'flex', gap: 12, color: colors.textPrimary, cursor: 'pointer' }}>
      <div style={{ width: 86, height: 86, flexShrink: 0, borderRadius: radii.lg, overflow: 'hidden', background: 'linear-gradient(135deg,#1b102d,#0d0b16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {media ? <AuthenticatedImage src={media} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Grid3X3 size={24} color={colors.textMuted} />}
        {isVideo && <Film size={15} color="#fff" style={{ position: 'absolute', margin: 58, filter: 'drop-shadow(0 1px 3px #000)' }} />}
      </div>
      <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar src={post.avatar_url} name={post.full_name} size={24} />
          <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.full_name || `@${post.username}`}</span>
        </div>
        <p style={{ margin: '9px 0 0', color: colors.textSecondary, fontSize: 13, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.content || (isVideo ? 'Saved video' : 'Saved post')}</p>
      </div>
      <button onClick={(event) => { event.stopPropagation(); onRemove() }} aria-label="Remove from saved" style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: colors.textMuted, padding: 4, cursor: 'pointer' }}>
        <MoreHorizontal size={18} />
      </button>
    </div>
  )
}