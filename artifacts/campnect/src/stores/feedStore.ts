import { create } from 'zustand'
import { postsApi } from '../api/posts'

export interface Post {
  id: string
  user_id: string
  username: string
  full_name: string
  avatar_url?: string
  college_name?: string
  college_id?: string
  is_college_verified: number
  type: 'text' | 'photo' | 'carousel' | 'video' | 'reel' | 'glimpse' | 'poll' | 'campus_update'
  content?: string
  /** Parsed array of media URLs — field name matches backend enrichPost output */
  media: string[]
  cover_url?: string | null
  duration?: number | null
  trim_start?: number | null
  trim_end?: number | null
  playback_speed?: number | null
  /** Parsed array of tag strings */
  tags: string[]
  tagged_users?: {
    id: string
    username: string
    full_name: string
    avatar_url?: string
    college_name?: string
    is_college_verified?: number
  }[]
  likes_count: number
  comments_count: number
  saves_count: number
  is_liked?: boolean
  is_saved?: boolean
  /** Parsed array of poll option strings (null for non-poll posts) */
  poll_options: string[] | null
  poll_votes?: Record<string, number> | null
  created_at: string
  visibility: string
}

interface FeedState {
  posts: Post[]
  nextCursor: string | null
  hasMore: boolean
  loading: boolean
  refreshing: boolean
  error: string | null
  hasLoadedInitial: boolean

  fetchFeed: (reset?: boolean) => Promise<void>
  clearFeed: () => void
  likePost: (id: string) => Promise<void>
  unlikePost: (id: string) => Promise<void>
  savePost: (id: string) => Promise<void>
  unsavePost: (id: string) => Promise<void>
  addComment: (id: string, content: string, parentId?: string) => Promise<void>
  removePost: (id: string) => void
  prependPost: (post: Post) => void
  updatePost: (id: string, patch: Partial<Post>) => void
}

export const useFeedStore = create<FeedState>((set, get) => ({
  posts: [],
  nextCursor: null,
  hasMore: true,
  loading: false,
  refreshing: false,
  error: null,
  hasLoadedInitial: false,

  fetchFeed: async (reset = false) => {
    const { loading, refreshing, nextCursor, hasMore, hasLoadedInitial } = get()
    if (loading || refreshing) return
    if (!reset && !nextCursor && hasLoadedInitial) return
    if (!reset && !hasMore) return

    const existingIds = new Set(get().posts.map((post) => post.id))
    set(reset ? { refreshing: true, error: null } : { loading: true, error: null })

    try {
      const res = await postsApi.getFeed(reset ? null : nextCursor)
      const newPosts: Post[] = res.data.data
      set((s) => ({
        posts: (() => {
          const concurrentPosts = reset ? s.posts.filter((post) => !existingIds.has(post.id)) : s.posts
          const merged = [...newPosts, ...concurrentPosts]
          const byId = new Map(merged.map((post) => [post.id, post]))
          return [...byId.values()].sort((a, b) =>
            b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
          )
        })(),
        nextCursor: res.data.meta?.nextCursor ?? null,
        hasMore: res.data.meta?.hasMore ?? newPosts.length === 15,
        loading: false,
        refreshing: false,
        hasLoadedInitial: true,
      }))
    } catch (e: any) {
      set({ loading: false, refreshing: false, error: e?.message || 'Failed to load feed' })
    }
  },

  clearFeed: () => set({
    posts: [],
    nextCursor: null,
    hasMore: true,
    loading: false,
    refreshing: false,
    error: null,
    hasLoadedInitial: false,
  }),

  likePost: async (id) => {
    // Optimistic update
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === id ? { ...p, is_liked: true, likes_count: p.likes_count + 1 } : p
      ),
    }))
    try {
      await postsApi.likePost(id)
    } catch {
      set((s) => ({
        posts: s.posts.map((p) =>
          p.id === id ? { ...p, is_liked: false, likes_count: Math.max(0, p.likes_count - 1) } : p
        ),
      }))
    }
  },

  unlikePost: async (id) => {
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === id ? { ...p, is_liked: false, likes_count: Math.max(0, p.likes_count - 1) } : p
      ),
    }))
    try {
      await postsApi.unlikePost(id)
    } catch {
      set((s) => ({
        posts: s.posts.map((p) =>
          p.id === id ? { ...p, is_liked: true, likes_count: p.likes_count + 1 } : p
        ),
      }))
    }
  },

  savePost: async (id) => {
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === id ? { ...p, is_saved: true, saves_count: p.saves_count + 1 } : p
      ),
    }))
    try {
      await postsApi.savePost(id)
    } catch {
      set((s) => ({
        posts: s.posts.map((p) =>
          p.id === id ? { ...p, is_saved: false, saves_count: Math.max(0, p.saves_count - 1) } : p
        ),
      }))
    }
  },

  unsavePost: async (id) => {
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === id ? { ...p, is_saved: false, saves_count: Math.max(0, p.saves_count - 1) } : p
      ),
    }))
    try {
      await postsApi.unsavePost(id)
    } catch {
      set((s) => ({
        posts: s.posts.map((p) =>
          p.id === id ? { ...p, is_saved: true, saves_count: p.saves_count + 1 } : p
        ),
      }))
    }
  },

  addComment: async (id, content, parentId) => {
    if (content) await postsApi.addComment(id, content, parentId)
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === id ? { ...p, comments_count: p.comments_count + 1 } : p
      ),
    }))
  },

  removePost: (id) =>
    set((s) => ({ posts: s.posts.filter((p) => p.id !== id) })),

  prependPost: (post) =>
    set((s) => {
      const byId = new Map(s.posts.map((existing) => [existing.id, existing]))
      byId.set(post.id, { ...byId.get(post.id), ...post })
      return {
        posts: [...byId.values()].sort((a, b) =>
          b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
        ),
      }
    }),

  updatePost: (id, patch) =>
    set((s) => ({ posts: s.posts.map((p) => p.id === id ? { ...p, ...patch } : p) })),
}))
