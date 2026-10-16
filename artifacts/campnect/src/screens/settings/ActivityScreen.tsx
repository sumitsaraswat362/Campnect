import { useEffect, useMemo, useState } from 'react'
import { Clock3, Film, Heart, MessageCircle, PlayCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usersApi } from '../../api/users'
import { Post } from '../../stores/feedStore'
import { FeedLoadingSkeletons } from '../../components/feed/PostLoadingState'
import { EmptyState } from '../../components/shared/EmptyState'
import { Avatar } from '../../components/shared/Avatar'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { colors, radii } from '../../styles/tokens'

type ActivityTab = 'liked' | 'comments' | 'watched'
type ActivityData = {
  liked: Post[]
  comments: Array<Post & { comment_text?: string }>
  watched: Array<Post & { watch_pct?: number; watch_seconds?: number }>
}

export function ActivityScreen() {
  const navigate = useNavigate()
  const [activity, setActivity] = useState<ActivityData>({ liked: [], comments: [], watched: [] })
  const [tab, setTab] = useState<ActivityTab>('liked')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    usersApi.getActivity()
      .then((res) => setActivity(res.data.data || { liked: [], comments: [], watched: [] }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const items = useMemo(() => activity[tab], [activity, tab])
  const labels: Record<ActivityTab, string> = { liked: 'Liked', comments: 'Comments', watched: 'Watched' }

  return (
    <div style={{ minHeight: '100%', background: colors.bg, paddingBottom: 32 }}>
      <div style={{ padding: '14px 16px 10px' }}>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: 13 }}>Review what you’ve interacted with on Campnect.</p>
      </div>
      <div style={{ display: 'flex', padding: '0 16px', borderBottom: `1px solid ${colors.border}` }}>
        {(['liked', 'comments', 'watched'] as ActivityTab[]).map((value) => (
          <button key={value} onClick={() => setTab(value)} style={{ flex: 1, border: 'none', borderBottom: `2px solid ${tab === value ? colors.lime : 'transparent'}`, background: 'transparent', color: tab === value ? colors.lime : colors.textMuted, padding: '12px 4px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {labels[value]}
          </button>
        ))}
      </div>
      {loading ? (
        <div style={{ padding: '14px 12px' }}><FeedLoadingSkeletons count={3} /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={tab === 'liked' ? <Heart size={28} color="#FF3B7A" /> : tab === 'comments' ? <MessageCircle size={28} color={colors.lime} /> : <PlayCircle size={28} color={colors.lime} />} title={`No ${labels[tab].toLowerCase()} activity yet`} description="Your interactions will appear here as you use Campnect." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 12px' }}>
          {items.map((post, index) => (
            <ActivityRow key={`${post.id}-${index}`} post={post} tab={tab} onOpen={() => navigate(`/app/post/${post.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ActivityRow({ post, tab, onOpen }: { post: Post & { comment_text?: string; watch_pct?: number }; tab: ActivityTab; onOpen: () => void }) {
  const media = post.media?.[0]
  const isVideo = post.type === 'reel' || post.type === 'video'
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', border: `1px solid ${colors.border}`, background: 'var(--color-surface)', borderRadius: radii.xl, padding: 10, display: 'flex', gap: 12, color: colors.textPrimary, cursor: 'pointer' }}>
      <div style={{ width: 70, height: 70, flexShrink: 0, borderRadius: radii.lg, overflow: 'hidden', background: '#151020', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {media ? <AuthenticatedImage src={media} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : isVideo ? <Film size={23} color={colors.textMuted} /> : <Clock3 size={23} color={colors.textMuted} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar src={post.avatar_url} name={post.full_name} size={23} />
          <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.full_name || `@${post.username}`}</span>
          {tab === 'liked' && <Heart size={14} fill="#FF3B7A" color="#FF3B7A" />}
        </div>
        <p style={{ margin: '8px 0 0', color: colors.textSecondary, fontSize: 13, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {tab === 'comments' ? `“${post.comment_text || 'Commented on this post'}”` : post.content || (tab === 'watched' ? `Watched ${isVideo ? 'this video' : 'this post'}` : 'Liked this post')}
        </p>
        {tab === 'watched' && post.watch_pct ? <span style={{ display: 'block', marginTop: 5, color: colors.lime, fontSize: 11, fontWeight: 700 }}>{Math.round(post.watch_pct)}% watched</span> : null}
      </div>
    </button>
  )
}