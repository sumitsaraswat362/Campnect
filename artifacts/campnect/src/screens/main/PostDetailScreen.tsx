import { DEMO_MODE } from '../../demo/config'
import { useDemoPost } from '../../demo/useDemoPost'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { postsApi } from '../../api/posts'
import { Post, useFeedStore } from '../../stores/feedStore'
import { PostCard } from '../../components/feed/PostCard'
import { CommentSheet } from '../../components/feed/CommentSheet'
import { DetailPageSkeleton } from '../../components/shared/AppSkeletons'
import { EmptyState } from '../../components/shared/EmptyState'
import { useAuthStore } from '../../stores/authStore'
import { requestAppBack } from '../../navigation/appBackRequest'
import { loadCachedPost, patchCachedPost } from '../../cache/contentCache'
import { PromptDialog } from '../../components/shared/PromptDialog'
import toast from 'react-hot-toast'

export function PostDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user: me } = useAuthStore()
  const { posts, removePost, updatePost } = useFeedStore()
  const [rawPost, setPost]       = useState<Post | null>(null)
  const post = useDemoPost(rawPost)
  const [loading, setLoading] = useState(true)
  // Opening a post should show the post, not cover it with the comments sheet.
  // The MessageCircle action in PostCard is the explicit way to open comments.
  const [showComments, setShowComments] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    const feedPost = posts.find((item) => item.id === id)
    if (feedPost) {
      setPost(feedPost)
      setLoading(false)
      return
    }
    if (!me?.id) return
    setLoading(true)
    loadCachedPost(me.id, id)
      .then(setPost)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, me?.id, posts])

  async function like() {
    if (!post) return
    if (post.is_liked) {
      await postsApi.unlikePost(post.id)
      setPost((p) => {
        const patch = { is_liked: false, likes_count: Math.max(0, (p?.likes_count ?? 0) - 1) }
        if (p && me?.id) patchCachedPost(me.id, p.id, patch)
        return p ? { ...p, ...patch } : p
      })
    } else {
      await postsApi.likePost(post.id)
      setPost((p) => {
        const patch = { is_liked: true, likes_count: (p?.likes_count ?? 0) + 1 }
        if (p && me?.id) patchCachedPost(me.id, p.id, patch)
        return p ? { ...p, ...patch } : p
      })
    }
  }

  async function save() {
    if (!post) return
    if (post.is_saved && DEMO_MODE) {
      await postsApi.unsavePost(post.id)
      setPost(p => p ? { ...p, is_saved: false, saves_count: Math.max(0, p.saves_count - 1) } : p)
    } else if (!post.is_saved) {
      await postsApi.savePost(post.id)
      setPost((p) => {
        const patch = { is_saved: true, saves_count: (p?.saves_count ?? 0) + 1 }
        if (p && me?.id) patchCachedPost(me.id, p.id, patch)
        return p ? { ...p, ...patch } : p
      })
    }
  }

  const isOwner = !!me && !!post && String(post.user_id) === String(me.id)

  if (loading) return <DetailPageSkeleton kind="post" />
  if (!post) return (
    <EmptyState
      icon={<Inbox size={28} color="var(--color-lime)" strokeWidth={1.6} />}
      title="Post not found"
      description="This post may have been deleted"
    />
  )

  return (
    <div>
      <PostCard
        post={post}
        onLike={like}
        onUnlike={like}
        onSave={save}
        onUnsave={save}
        onCommentPress={() => setShowComments(true)}
        onReport={() => setReportOpen(true)}
        onEdit={isOwner ? async (patch) => {
          const res = await postsApi.updatePost(post.id, patch)
          const updated = res.data.data
          setPost((p) => p ? { ...p, ...updated } : p)
          updatePost(post.id, updated)
          if (me?.id) patchCachedPost(me.id, post.id, updated)
        } : undefined}
        onDelete={isOwner ? async () => {
          await postsApi.deletePost(post.id)
          removePost(post.id)
          requestAppBack()
        } : undefined}
      />
      {showComments && (
        <CommentSheet
          postId={post.id}
          commentsCount={post.comments_count}
          onClose={() => setShowComments(false)}
          onCommentAdded={() => setPost((p) => p ? { ...p, comments_count: p.comments_count + 1 } : p)}
          onCommentDeleted={() => setPost((p) => p ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p)}
        />
      )}
      <PromptDialog
        open={reportOpen}
        title="Report post"
        message="Tell us why this post should be reviewed. Our team will review the post and its media."
        placeholder="Reason for this report"
        submitLabel="Submit report"
        onCancel={() => setReportOpen(false)}
        onSubmit={async (reason, description) => {
          try {
            await postsApi.reportPost(post.id, reason, description)
            toast.success(DEMO_MODE ? 'Report saved to local demo intake. No moderation team is contacted.' : 'Report submitted. Thank you for helping keep Campnect safe.')
            setReportOpen(false)
          } catch {
            toast.error('Could not submit the report. Please try again.')
          }
        }}
      />
    </div>
  )
}
