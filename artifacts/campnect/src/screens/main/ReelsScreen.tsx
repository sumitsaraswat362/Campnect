import { useEffect, useRef, useState, useCallback } from 'react'
import { useReelsStore } from '../../stores/reelsStore'
import { useAuthStore } from '../../stores/authStore'
import { postsApi } from '../../api/posts'
import { ReelItem } from '../../components/reels/ReelItem'
import { MediaViewerSkeleton } from '../../components/shared/AppSkeletons'
import { colors } from '../../styles/tokens'

export function ReelsScreen() {
  const { reels, loading, hasMore, likedIds, savedIds, fetchReels, likeReel, unlikeReel, saveReel, unsaveReel, removeReel, updateReel } = useReelsStore()
  const { user: me } = useAuthStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (reels.length === 0) fetchReels(true)
  }, [fetchReels, reels.length])

  // Track active reel via IntersectionObserver on each child
  const observerRef = useRef<IntersectionObserver | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  const setupObserver = useCallback(() => {
    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = itemRefs.current.findIndex((el) => el === entry.target)
            if (idx !== -1) setActiveIndex(idx)
          }
        }
      },
      { root: containerRef.current, threshold: 0.6 }
    )
    itemRefs.current.forEach((el) => el && observerRef.current?.observe(el))
  }, [])

  useEffect(() => {
    setupObserver()
    return () => observerRef.current?.disconnect()
  }, [reels.length, setupObserver])

  // Load more when reaching last reel
  useEffect(() => {
    if (activeIndex >= reels.length - 2 && hasMore && !loading) {
      fetchReels()
    }
  }, [activeIndex, reels.length, hasMore, loading, fetchReels])

  if (loading && reels.length === 0) {
    return (
      <div className="route-viewport" style={{ background: '#000' }}>
        <MediaViewerSkeleton label="Loading Glimpses" />
      </div>
    )
  }

  if (!loading && reels.length === 0) {
    return (
      <div className="route-viewport" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', flexDirection: 'column', gap: '16px', padding: '0 32px', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(187,255,0,0.08)',
          border: '1.5px solid rgba(187,255,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-lime)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
            <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
            <line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/>
            <line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/>
            <line x1="17" y1="7" x2="22" y2="7"/>
          </svg>
        </div>
        <div>
          <p style={{ color: '#fff', fontSize: '17px', fontWeight: 700, fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>No glimpses yet</p>
          <p style={{ color: colors.textSecondary, fontSize: '14px', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
            Create a glimpse from the post screen — choose a video and select the Glimpse type.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        overflowY: 'scroll',
        scrollSnapType: 'y mandatory',
        background: '#000',
        // Hide scrollbar
        scrollbarWidth: 'none',
      }}
    >
      <style>{`
        div:has(> [data-reel]) { scrollbar-width: none; }
        div:has(> [data-reel])::-webkit-scrollbar { display: none; }
      `}</style>
      {reels.map((post, i) => (
        <div
          key={post.id}
          data-reel
          ref={(el) => { itemRefs.current[i] = el }}
        >
          <ReelItem
            post={post}
            isActive={i === activeIndex}
            isLiked={likedIds.has(post.id) || Boolean(post.is_liked)}
            isSaved={savedIds.has(post.id) || Boolean(post.is_saved)}
            onLike={() => likeReel(post.id)}
            onUnlike={() => unlikeReel(post.id)}
            onSave={() => saveReel(post.id)}
            onUnsave={() => unsaveReel(post.id)}
            onEdit={post.user_id === me?.id ? async (patch) => {
              const res = await postsApi.updatePost(post.id, patch)
              updateReel(post.id, res.data.data)
            } : undefined}
            onDelete={post.user_id === me?.id ? async () => {
              await postsApi.deletePost(post.id)
              removeReel(post.id)
            } : undefined}
          />
        </div>
      ))}
      {loading && reels.length > 0 && (
        <div style={{ height: '100%', background: '#000', scrollSnapAlign: 'start', flexShrink: 0 }}>
          <MediaViewerSkeleton label="Loading more Glimpses" />
        </div>
      )}
    </div>
  )
}
