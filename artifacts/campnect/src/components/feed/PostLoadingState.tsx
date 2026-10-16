import { Image as ImageIcon } from 'lucide-react'
import type { CSSProperties } from 'react'

export function PostMediaLoadingPlaceholder({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`post-media-loading-placeholder${className ? ` ${className}` : ''}`}
      style={style}
      role="img"
      aria-label="Loading post media"
    >
      <span className="post-media-loading-icon" aria-hidden="true">
        <ImageIcon size={21} strokeWidth={1.8} />
      </span>
    </div>
  )
}

export function FeedLoadingSkeletons({ count = 2 }: { count?: number }) {
  return (
    <div className="feed-loading-list" aria-busy="true" aria-label="Loading posts">
      {Array.from({ length: count }, (_, index) => (
        <article className="post-loading-card" key={index}>
          <div className="post-loading-header">
            <span className="post-loading-avatar skeleton" />
            <div className="post-loading-author">
              <span className="post-loading-line post-loading-line-name skeleton" />
              <span className="post-loading-line post-loading-line-meta skeleton" />
            </div>
            <span className="post-loading-menu skeleton" />
          </div>
          <div className="post-loading-copy">
            <span className="post-loading-line post-loading-line-caption skeleton" />
            <span className="post-loading-line post-loading-line-caption-short skeleton" />
          </div>
          <PostMediaLoadingPlaceholder />
          <div className="post-loading-actions">
            <span className="post-loading-action skeleton" />
            <span className="post-loading-action skeleton" />
            <span className="post-loading-action skeleton" />
            <span className="post-loading-action post-loading-action-save skeleton" />
          </div>
        </article>
      ))}
    </div>
  )
}

export function ProfilePostsLoadingSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="profile-post-grid profile-post-grid-loading"
      aria-busy="true"
      aria-label="Loading posts"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px' }}
    >
      {Array.from({ length: count }, (_, index) => (
        <PostMediaLoadingPlaceholder key={index} style={{ aspectRatio: '1', minHeight: 0 }} />
      ))}
    </div>
  )
}

export function ProfileLoadingSkeleton() {
  return (
    <div className="profile-loading-skeleton" aria-busy="true" aria-label="Loading profile">
      <div className="profile-loading-cover skeleton" />
      <div className="profile-loading-identity">
        <span className="profile-loading-avatar skeleton" />
        <div className="profile-loading-identity-copy">
          <span className="post-loading-line profile-loading-name skeleton" />
          <span className="post-loading-line profile-loading-handle skeleton" />
        </div>
      </div>
      <div className="profile-loading-bio">
        <span className="post-loading-line profile-loading-bio-line skeleton" />
        <span className="post-loading-line profile-loading-bio-line-short skeleton" />
      </div>
      <div className="profile-loading-stats">
        <span className="profile-loading-stat skeleton" />
        <span className="profile-loading-stat skeleton" />
        <span className="profile-loading-stat skeleton" />
      </div>
      <ProfilePostsLoadingSkeleton />
    </div>
  )
}