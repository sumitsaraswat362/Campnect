import { AuthenticatedImage } from '../shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../shared/AuthenticatedVideo'
import { parseSharedPostPayload } from './sharedPostPayload'

export function SharedPostReplyPreview({
  content,
  fallbackAuthor,
}: {
  content?: string | null
  fallbackAuthor: string
}) {
  const post = parseSharedPostPayload(content)
  if (!post) return null

  const author = post.authorName || fallbackAuthor
  return (
    <div
      aria-label={`Replying to ${author}'s shared post`}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        minHeight: 62,
        overflow: 'hidden',
        borderRadius: 8,
        opacity: 0.62,
        filter: 'saturate(0.72)',
        background: 'var(--chat-soft-surface)',
        border: '1px solid var(--chat-divider)',
      }}
    >
      <div style={{ width: 68, minHeight: 62, flexShrink: 0, background: 'var(--chat-media-bg)' }}>
        {post.thumbnailType === 'video' ? (
          <AuthenticatedVideo
            src={post.thumbnail}
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          />
        ) : (
          <AuthenticatedImage
            src={post.thumbnail}
            alt=""
            placeholderLabel="Post"
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
            placeholderStyle={{ width: '100%', height: '100%' }}
          />
        )}
      </div>
      <div style={{ minWidth: 0, padding: '7px 9px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--chat-text-secondary)', fontSize: 11 }}>
          {author}
        </strong>
        <span style={{ marginTop: 1, color: 'var(--chat-text-muted)', fontSize: 10, fontWeight: 700 }}>Shared post</span>
        <p style={{ margin: '3px 0 0', color: 'var(--chat-text-secondary)', fontSize: 11, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {post.caption || 'Shared a post'}
        </p>
      </div>
    </div>
  )
}