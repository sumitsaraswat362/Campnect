import { useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { Avatar } from '../shared/Avatar'
import { useAuthStore } from '../../stores/authStore'
import { useStoriesStore, StoryGroup } from '../../stores/storiesStore'

// Re-export StoryGroup for consumers that still import from here
export type { StoryGroup }

// Minimal Story type for external consumers
export interface Story {
  id: string
  media_url: string
  created_at: string
  user_id?: string
  type?: string
  caption?: string
  views_count?: number
  duration?: number
}

interface StoriesBarProps {
  onStoryGroupPress: (groups: StoryGroup[], index: number) => void
  onAddStory?: () => void
}

export function StoriesBar({ onStoryGroupPress, onAddStory }: StoriesBarProps) {
  const { user } = useAuthStore()
  const { groups, fetchGroups, lastFetched } = useStoriesStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (Date.now() - lastFetched > 60_000) {
      fetchGroups()
    }
  }, [])

  return (
    <div
      ref={scrollRef}
      className="no-scrollbar"
      style={{
        display:     'flex',
        gap:         '12px',
        overflowX:   'auto',
        padding:     '14px 16px 12px',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch' as any,
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* Add story slot */}
      <div
        onClick={onAddStory}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '5px', scrollSnapAlign: 'start', flexShrink: 0,
          cursor: onAddStory ? 'pointer' : 'default',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ position: 'relative' }}>
          {/* Animated gradient ring */}
          <div style={{
            width: 66, height: 66, borderRadius: '50%',
            background: 'linear-gradient(135deg, #18181B 0%, #C44DCC 50%, #E040A0 100%)',
            padding: '2px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(24,24,27,0.40), 0 0 32px rgba(24,24,27,0.14)',
          }}>
            <div style={{
              width: '100%', height: '100%', borderRadius: '50%',
              background: 'var(--color-bg)',
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Avatar src={user?.avatar_url} name={user?.full_name} size={60} />
            </div>
          </div>
          {/* Plus badge */}
          <div style={{
            position: 'absolute', bottom: 1, right: 1,
            width: 20, height: 20, borderRadius: '9999px',
            background: 'var(--color-lime)',
            border: '2px solid var(--color-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 8px var(--color-lime-glow, var(--color-lime-glow, rgba(187,255,0,0.50)))',
          }}>
            <Plus size={10} color="#09070F" strokeWidth={3} />
          </div>
        </div>
        <span style={{
          fontSize: '11px', color: 'var(--color-text-secondary)',
          maxWidth: '62px', textAlign: 'center',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
        }}>
          Your story
        </span>
      </div>

      {/* Story groups */}
      {groups.map((group, i) => (
        <StoryAvatar
          key={group.user_id}
          group={group}
          onPress={() => onStoryGroupPress(groups, i)}
        />
      ))}
    </div>
  )
}

function StoryAvatar({ group, onPress }: { group: StoryGroup; onPress: () => void }) {
  return (
    <div
      onClick={onPress}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '5px', scrollSnapAlign: 'start', flexShrink: 0, cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        width: 66, height: 66, borderRadius: '50%',
        background: group.has_unseen
          ? 'linear-gradient(135deg, #C44DCC 0%, #18181B 50%, #E040A0 100%)'
          : 'rgba(255,255,255,0.12)',
        padding: '2px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: group.has_unseen
          ? '0 0 14px rgba(24,24,27,0.45), 0 0 28px rgba(24,24,27,0.16)'
          : 'none',
        transition: 'box-shadow 300ms ease',
      }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: '50%',
          background: 'var(--color-bg)', padding: '1px',
          overflow: 'hidden',
        }}>
          <Avatar src={group.avatar_url} name={group.full_name} size={60} />
        </div>
      </div>
      <span style={{
        fontSize: '11px',
        color: group.has_unseen ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        maxWidth: '62px', textAlign: 'center',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontFamily: 'var(--font-display)',
        fontWeight: group.has_unseen ? 600 : 400,
      }}>
        {group.full_name.split(' ')[0]}
      </span>
    </div>
  )
}
