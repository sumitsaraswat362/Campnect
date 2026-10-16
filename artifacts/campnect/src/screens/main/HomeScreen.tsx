import { DEMO_MODE } from '../../demo/config'
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Inbox } from 'lucide-react'
import { useFeedStore } from '../../stores/feedStore'
import { useAuthStore } from '../../stores/authStore'
import { postsApi } from '../../api/posts'
import { PostCard } from '../../components/feed/PostCard'
import { CommentSheet } from '../../components/feed/CommentSheet'
import { EmptyState } from '../../components/shared/EmptyState'
import { EventStoryRail } from '../../components/events/EventStoryRail'
import { FeedLoadingSkeletons } from '../../components/feed/PostLoadingState'
import { PromptDialog } from '../../components/shared/PromptDialog'
import toast from 'react-hot-toast'

export function HomeScreen() {
  const { user: me } = useAuthStore()
  const { posts, loading, refreshing, hasMore, fetchFeed, likePost, unlikePost, savePost, unsavePost, addComment, removePost, updatePost } = useFeedStore()
  const [commentPostId, setCommentPostId] = useState<string | null>(null)
  const [reportPostId, setReportPostId] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const pullStartRef = useRef(0)
  const scrollFrameRef = useRef<number | null>(null)
  const [pulling, setPulling] = useState(false)

  useEffect(() => {
    void fetchFeed()
  }, [fetchFeed])

  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loading) fetchFeed() },
      { rootMargin: '200px' }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loading, fetchFeed])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const scrollEl = (e.currentTarget as HTMLElement).closest('[data-scroll]')
    if ((scrollEl as HTMLElement)?.scrollTop === 0) pullStartRef.current = e.touches[0].clientY
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - pullStartRef.current
    if (dy > 80 && !refreshing) {
      setPulling(true)
      fetchFeed(true).finally(() => setPulling(false))
    }
    pullStartRef.current = 0
  }, [refreshing, fetchFeed])

  const stopOffscreenFeedVideos = useCallback((container: HTMLElement) => {
    if (scrollFrameRef.current !== null) return
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      const containerRect = container.getBoundingClientRect()
      container.querySelectorAll<HTMLVideoElement>('[data-feed-video]').forEach((video) => {
        const rect = video.getBoundingClientRect()
        const visibleTop = Math.max(rect.top, containerRect.top)
        const visibleBottom = Math.min(rect.bottom, containerRect.bottom)
        const visibleHeight = Math.max(0, visibleBottom - visibleTop)
        const visibleRatio = rect.height > 0 ? visibleHeight / rect.height : 0
        if (visibleRatio < 0.6) video.pause()
      })
    })
  }, [])

  useEffect(() => {
    const pauseAll = () => {
      document.querySelectorAll<HTMLVideoElement>('.campnect-feed [data-feed-video]').forEach((video) => video.pause())
    }
    const onVisibilityChange = () => {
      if (document.hidden) pauseAll()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', pauseAll)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', pauseAll)
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current)
      pauseAll()
    }
  }, [])

  const commentPost = commentPostId ? posts.find((p) => p.id === commentPostId) : null

  return (
    <div
      className="campnect-feed"
      data-scroll
      onScroll={(event) => stopOffscreenFeedVideos(event.currentTarget)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pulling || refreshing) && (
        <div className="feed-inline-loading" role="status" aria-label="Refreshing posts">
          <span /><span /><span />
        </div>
      )}

      <EventStoryRail />

      {posts.length === 0 && !loading && (
        <EmptyState
          icon={<Inbox size={28} color="var(--color-lime)" strokeWidth={1.6} />}
          title="Your feed is empty"
          description="New campus posts will appear here"
        />
      )}

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onLike={() => likePost(post.id)}
          onUnlike={() => unlikePost(post.id)}
          onSave={() => savePost(post.id)}
          onUnsave={() => unsavePost(post.id)}
          onCommentPress={() => setCommentPostId(post.id)}
          onReport={() => setReportPostId(post.id)}
          onEdit={post.user_id === me?.id ? async (patch) => {
            const res = await postsApi.updatePost(post.id, patch)
            updatePost(post.id, res.data.data)
          } : undefined}
          onDelete={post.user_id === me?.id ? async () => {
            await postsApi.deletePost(post.id)
            removePost(post.id)
          } : undefined}
        />
      ))}

      <div ref={sentinelRef} style={{ height: '1px' }} />

      {loading && posts.length > 0 && (
        <div className="feed-inline-loading" role="status" aria-label="Loading more posts">
          <span /><span /><span />
        </div>
      )}

      {loading && posts.length === 0 && (
        <FeedLoadingSkeletons />
      )}

      {!hasMore && posts.length > 0 && (
        <p style={{
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '13px',
          fontFamily: 'var(--font-body)',
          padding: '24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          You're all caught up
        </p>
      )}

      {commentPost && (
        <CommentSheet
          postId={commentPost.id}
          commentsCount={commentPost.comments_count}
          onClose={() => setCommentPostId(null)}
          onCommentAdded={() => addComment(commentPost.id, '')}
          onCommentDeleted={() => useFeedStore.getState().updatePost(commentPost.id, { comments_count: Math.max(0, commentPost.comments_count - 1) })}
        />
      )}
      <PromptDialog
        open={Boolean(reportPostId)}
        title="Report post"
        message="Tell us why this post should be reviewed. Our team will review the post and its media."
        placeholder="Reason for this report"
        submitLabel="Submit report"
        onCancel={() => setReportPostId(null)}
        onSubmit={async (reason, description) => {
          if (!reportPostId) return
          try {
            await postsApi.reportPost(reportPostId, reason, description)
            toast.success(DEMO_MODE ? 'Report saved to local demo intake. No moderation team is contacted.' : 'Report submitted. Thank you for helping keep Campnect safe.')
            setReportPostId(null)
          } catch {
            toast.error('Could not submit the report. Please try again.')
          }
        }}
      />

    </div>
  )
}
