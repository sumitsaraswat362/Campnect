import { create } from 'zustand'
import { storiesApi } from '../api/stories'

export interface StoryItem {
  id: string
  media_url: string
  created_at: string
  user_id?: string
  type?: string
  caption?: string
  views_count?: number
  duration?: number
  expires_at?: string
  is_viewed?: boolean
}

export interface StoryGroup {
  user_id: string
  username: string
  full_name: string
  avatar_url?: string
  stories: StoryItem[]
  has_unseen: boolean
}

interface StoriesState {
  groups: StoryGroup[]
  loading: boolean
  lastFetched: number
  fetchGroups: () => Promise<void>
  prependMyStory: (story: any, user: any) => void
  markViewed: (groupIdx: number, storyId: string, viewsCount?: number) => void
  removeStory: (storyId: string) => void
}

export const useStoriesStore = create<StoriesState>((set, get) => ({
  groups: [],
  loading: false,
  lastFetched: 0,

  fetchGroups: async () => {
    const { loading } = get()
    if (loading) return
    set({ loading: true })
    try {
      const res = await storiesApi.getFeed()
      set({ groups: res.data.data || [], loading: false, lastFetched: Date.now() })
    } catch {
      set({ loading: false })
    }
  },

  prependMyStory: (story: any, user: any) => {
    set((s) => {
      const myGroup = s.groups.find((g) => g.user_id === user.id)
      if (myGroup) {
        // Append to existing group
        return {
          groups: [
            { ...myGroup, stories: [...myGroup.stories, story], has_unseen: false },
            ...s.groups.filter((g) => g.user_id !== user.id),
          ],
        }
      } else {
        // Create new group and put it first
        const newGroup: StoryGroup = {
          user_id: user.id,
          username: user.username,
          full_name: user.full_name,
          avatar_url: user.avatar_url,
          stories: [story],
          has_unseen: false,
        }
        return { groups: [newGroup, ...s.groups] }
      }
    })
  },

  markViewed: (groupIdx: number, storyId: string, viewsCount?: number) => {
    set((s) => {
      const groups = [...s.groups]
      if (!groups[groupIdx]) return {}
      const group = { ...groups[groupIdx] }
      group.stories = group.stories.map((st) =>
        st.id === storyId ? { ...st, is_viewed: true, ...(viewsCount === undefined ? {} : { views_count: viewsCount }) } : st
      )
      group.has_unseen = group.stories.some((st) => !st.is_viewed)
      groups[groupIdx] = group
      return { groups }
    })
  },

  removeStory: (storyId: string) => {
    set((s) => {
      const groups = s.groups
        .map((g) => ({ ...g, stories: g.stories.filter((st) => st.id !== storyId) }))
        .filter((g) => g.stories.length > 0)
      return { groups }
    })
  },
}))
