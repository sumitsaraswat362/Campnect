import type { CSSProperties, ReactNode } from 'react'
import { FeedLoadingSkeletons, PostMediaLoadingPlaceholder } from '../feed/PostLoadingState'

function Region({ label, className = '', style, children }: { label: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={`app-skeleton-region${className ? ` ${className}` : ''}`} style={style} aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  )
}

function Block({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`skeleton app-skeleton-block${className ? ` ${className}` : ''}`} style={style} />
}

export function PeopleRowsSkeleton({ count = 5, action = true, compact = false }: { count?: number; action?: boolean; compact?: boolean }) {
  return (
    <Region label="Loading people" className="people-rows-skeleton">
      {Array.from({ length: count }, (_, index) => (
        <div className="people-row-skeleton" key={index} style={{ minHeight: compact ? 62 : 70 }}>
          <Block className="people-row-avatar" style={{ width: compact ? 42 : 46, height: compact ? 42 : 46 }} />
          <div className="people-row-copy">
            <Block style={{ width: `${52 + (index % 3) * 9}%`, height: 11 }} />
            <Block style={{ width: `${38 + (index % 2) * 10}%`, height: 8 }} />
          </div>
          {action && <Block className="people-row-action" />}
        </div>
      ))}
    </Region>
  )
}

export function ConversationRowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Region label="Loading conversations" className="conversation-skeleton-list">
      {Array.from({ length: count }, (_, index) => (
        <div className="conversation-row-skeleton" key={index}>
          <Block className="conversation-avatar-skeleton" />
          <div className="conversation-copy-skeleton">
            <div className="conversation-line-skeleton">
              <Block style={{ width: `${42 + (index % 3) * 8}%`, height: 11 }} />
              <Block style={{ width: 34, height: 7 }} />
            </div>
            <Block style={{ width: `${58 + (index % 2) * 16}%`, height: 8 }} />
          </div>
        </div>
      ))}
    </Region>
  )
}

export function MessageRequestsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Region label="Loading message requests" className="message-request-skeleton-list">
      {Array.from({ length: count }, (_, index) => (
        <div className="message-request-skeleton" key={index}>
          <div className="message-request-person-skeleton">
            <Block className="message-request-avatar-skeleton" />
            <div className="people-row-copy">
              <Block style={{ width: `${46 + index * 5}%`, height: 11 }} />
              <Block style={{ width: '68%', height: 8 }} />
            </div>
          </div>
          <Block className="message-request-chevron-skeleton" />
        </div>
      ))}
    </Region>
  )
}

export function ChatMessagesSkeleton() {
  const bubbles = [
    { side: 'left', width: '62%', height: 54 },
    { side: 'left', width: '44%', height: 40 },
    { side: 'right', width: '70%', height: 68 },
    { side: 'right', width: '38%', height: 40 },
    { side: 'left', width: '76%', height: 82 },
  ]
  return (
    <Region label="Loading messages" className="chat-messages-skeleton">
      <Block className="chat-date-skeleton" />
      {bubbles.map((bubble, index) => (
        <div className={`chat-bubble-skeleton-row chat-bubble-skeleton-${bubble.side}`} key={index}>
          {bubble.side === 'left' && <Block className="chat-bubble-avatar-skeleton" />}
          <Block className="chat-bubble-skeleton" style={{ width: bubble.width, height: bubble.height }} />
        </div>
      ))}
    </Region>
  )
}

export function GlimpseGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Region label="Loading Glimpses" className="glimpse-grid-skeleton">
      <div className="glimpse-heading-skeleton">
        <div><Block style={{ width: 132, height: 14 }} /><Block style={{ width: 186, height: 8 }} /></div>
        <Block style={{ width: 82, height: 30, borderRadius: 999 }} />
      </div>
      <div className="glimpse-cards-skeleton">
        {Array.from({ length: count }, (_, index) => (
          <div className="glimpse-card-skeleton" key={index}>
            <PostMediaLoadingPlaceholder style={{ minHeight: 0, height: '100%' }} />
            <div className="glimpse-card-copy-skeleton">
              <Block className="glimpse-card-avatar-skeleton" />
              <Block style={{ width: `${50 + (index % 2) * 16}%`, height: 9 }} />
            </div>
          </div>
        ))}
      </div>
    </Region>
  )
}

export function EventCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Region label="Loading events" className="event-cards-skeleton">
      {Array.from({ length: count }, (_, index) => (
        <article className="event-card-skeleton" key={index}>
          <Block className="event-cover-skeleton" />
          <div className="event-card-copy-skeleton">
            <Block style={{ width: 48, height: 42, borderRadius: 10 }} />
            <div className="event-card-text-skeleton">
              <Block style={{ width: `${66 + (index % 2) * 12}%`, height: 12 }} />
              <Block style={{ width: '54%', height: 8 }} />
              <Block style={{ width: '72%', height: 8 }} />
            </div>
          </div>
        </article>
      ))}
    </Region>
  )
}

export function CommunityCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Region label="Loading communities" className="community-cards-skeleton">
      {Array.from({ length: count }, (_, index) => (
        <article className="community-card-skeleton" key={index}>
          <Block className="community-card-cover-skeleton" />
          <div className="community-card-body-skeleton">
            <Block className="community-card-avatar-skeleton" />
            <Block style={{ width: `${56 + (index % 2) * 13}%`, height: 11 }} />
            <Block style={{ width: '82%', height: 8 }} />
            <Block style={{ width: '64%', height: 8 }} />
          </div>
        </article>
      ))}
    </Region>
  )
}

export function NotificationRowsSkeleton({ count = 7 }: { count?: number }) {
  return (
    <Region label="Loading notifications" className="notification-skeleton-list">
      {Array.from({ length: count }, (_, index) => (
        <div className="notification-row-skeleton" key={index}>
          <Block className="notification-avatar-skeleton" />
          <div className="notification-copy-skeleton">
            <Block style={{ width: `${78 - (index % 3) * 9}%`, height: 9 }} />
            <Block style={{ width: `${54 + (index % 2) * 11}%`, height: 8 }} />
          </div>
          {index % 2 === 0 && <Block className="notification-thumb-skeleton" />}
        </div>
      ))}
    </Region>
  )
}

export function DetailPageSkeleton({ kind = 'content' }: { kind?: 'content' | 'post' | 'event' | 'community' | 'group' | 'form' }) {
  if (kind === 'post') return <FeedLoadingSkeletons count={1} />
  return (
    <Region label={`Loading ${kind}`} className={`detail-page-skeleton detail-page-skeleton-${kind}`}>
      <Block className="detail-hero-skeleton" />
      <div className="detail-title-row-skeleton">
        <Block className="detail-avatar-skeleton" />
        <div>
          <Block style={{ width: 180, height: 14 }} />
          <Block style={{ width: 126, height: 8 }} />
        </div>
      </div>
      <div className="detail-copy-skeleton">
        <Block style={{ width: '92%', height: 10 }} />
        <Block style={{ width: '76%', height: 10 }} />
        <Block style={{ width: '84%', height: 10 }} />
      </div>
      <div className="detail-actions-skeleton"><Block /><Block /></div>
      <PeopleRowsSkeleton count={kind === 'form' ? 4 : 3} action={false} compact />
    </Region>
  )
}

export function SettingsRowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Region label="Loading settings" className="settings-rows-skeleton">
      {Array.from({ length: count }, (_, index) => (
        <div className="settings-row-skeleton" key={index}>
          <Block className="settings-icon-skeleton" />
          <div className="people-row-copy">
            <Block style={{ width: `${48 + (index % 3) * 8}%`, height: 10 }} />
            <Block style={{ width: `${66 - (index % 2) * 12}%`, height: 8 }} />
          </div>
          <Block className="settings-control-skeleton" />
        </div>
      ))}
    </Region>
  )
}

export function MediaGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <Region label="Loading media" className="media-grid-skeleton">
      {Array.from({ length: count }, (_, index) => (
        <PostMediaLoadingPlaceholder key={index} style={{ minHeight: 0, aspectRatio: '1' }} />
      ))}
    </Region>
  )
}

export function CommentRowsSkeleton({ count = 5 }: { count?: number }) {
  return <PeopleRowsSkeleton count={count} action={false} compact />
}

export function MediaViewerSkeleton({ label = 'Loading media' }: { label?: string }) {
  return (
    <Region label={label} className="media-viewer-skeleton">
      <Block className="media-viewer-back-skeleton" />
      <div className="media-viewer-author-skeleton">
        <Block className="media-viewer-avatar-skeleton" />
        <div><Block style={{ width: 108, height: 9 }} /><Block style={{ width: 70, height: 7 }} /></div>
      </div>
      <div className="media-viewer-actions-skeleton">
        <Block /><Block /><Block /><Block />
      </div>
      <div className="media-viewer-copy-skeleton">
        <Block style={{ width: '64%', height: 9 }} />
        <Block style={{ width: '42%', height: 8 }} />
      </div>
    </Region>
  )
}

export function ClipsLoadingSkeleton() {
  return (
    <main className="clips-loading-skeleton" aria-busy="true" aria-label="Loading Clips">
      <div className="clips-loading-stage">
        <div className="clips-loading-header" aria-hidden="true">
          <Block className="clips-loading-circle" />
          <Block className="clips-loading-title" />
          <Block className="clips-loading-circle" />
        </div>
        <Block className="clips-loading-media" />
        <div className="clips-loading-actions" aria-hidden="true">
          <Block className="clips-loading-action" />
          <Block className="clips-loading-action" />
          <Block className="clips-loading-action" />
          <Block className="clips-loading-action" />
          <Block className="clips-loading-action-small" />
        </div>
        <div className="clips-loading-copy" aria-hidden="true">
          <div className="clips-loading-author">
            <Block className="clips-loading-avatar" />
            <Block className="clips-loading-name" />
            <Block className="clips-loading-follow" />
          </div>
          <Block className="clips-loading-caption" />
          <Block className="clips-loading-caption-short" />
        </div>
      </div>
    </main>
  )
}