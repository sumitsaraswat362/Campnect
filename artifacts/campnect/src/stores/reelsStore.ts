import { create } from 'zustand'
import client from '../api/client'
import { Post } from './feedStore'

interface ReelsState {
  reels: Post[]
  cursor: string | null
  hasMore: boolean
  loading: boolean
  likedIds: Set<string>
  savedIds: Set<string>

  fetchReels: (reset?: boolean) => Promise<void>
  likeReel: (id: string) => Promise<void>
  unlikeReel: (id: string) => Promise<void>
  saveReel: (id: string) => Promise<void>
  unsaveReel: (id: string) => Promise<void>
  removeReel: (id: string) => void
  updateReel: (id: string, patch: Partial<Post>) => void
  prependReel: (post: Post) => void
}

export const useReelsStore = create<ReelsState>((set, get) => ({
  reels: [],
  cursor: null,
  hasMore: true,
  loading: false,
  likedIds: new Set(),
  savedIds: new Set(),

  fetchReels: async (reset = false) => {
    const { loading, hasMore, cursor } = get()
    if (loading) return
    if (!reset && !hasMore) return
    set({ loading: true })
    try {
      const params: Record<string, string | number> = { limit: 10 }
      if (!reset && cursor) params.before = cursor
      // Use the chronological reel-compatible feed path. The default
      // recommendation mode ignores the legacy `type` query parameter.
      const res = await client.get('/posts/feed', { params: { ...params, type: 'reel', mode: 'all' } })
      const posts: Post[] = res.data.data || []
      const newCursor = posts.length > 0 ? posts[posts.length - 1].created_at : null
      set((s) => ({
        reels: reset ? posts : [...s.reels, ...posts],
        cursor: newCursor,
        hasMore: posts.length === 10,
        loading: false,
        likedIds: new Set([...s.likedIds, ...posts.filter((p) => p.is_liked).map((p) => p.id)]),
        savedIds: new Set([...s.savedIds, ...posts.filter((p) => p.is_saved).map((p) => p.id)]),
      }))
    } catch {
      set({ loading: false })
    }
  },

  likeReel: async (id) => {
    set((s) => { const n = new Set(s.likedIds); n.add(id); return { likedIds: n, reels: s.reels.map((r) => r.id === id ? { ...r, is_liked: true, likes_count: r.likes_count + 1 } : r) } })
    try { await client.post(`/posts/${id}/like`) } catch {
      set((s) => { const n = new Set(s.likedIds); n.delete(id); return { likedIds: n, reels: s.reels.map((r) => r.id === id ? { ...r, is_liked: false, likes_count: Math.max(0, r.likes_count - 1) } : r) } })
    }
  },

  unlikeReel: async (id) => {
    set((s) => { const n = new Set(s.likedIds); n.delete(id); return { likedIds: n, reels: s.reels.map((r) => r.id === id ? { ...r, is_liked: false, likes_count: Math.max(0, r.likes_count - 1) } : r) } })
    try { await client.delete(`/posts/${id}/like`) } catch {
      set((s) => { const n = new Set(s.likedIds); n.add(id); return { likedIds: n, reels: s.reels.map((r) => r.id === id ? { ...r, is_liked: true, likes_count: r.likes_count + 1 } : r) } })
    }
  },

  saveReel: async (id) => {
    set((s) => { const n = new Set(s.savedIds); n.add(id); return { savedIds: n } })
    try { await client.post(`/posts/${id}/save`) } catch {
      set((s) => { const n = new Set(s.savedIds); n.delete(id); return { savedIds: n } })
    }
  },

  unsaveReel: async (id) => {
    set((s) => { const n = new Set(s.savedIds); n.delete(id); return { savedIds: n } })
    try { await client.delete(`/posts/${id}/save`) } catch {
      set((s) => { const n = new Set(s.savedIds); n.add(id); return { savedIds: n } })
    }
  },

  removeReel: (id) => set((s) => ({ reels: s.reels.filter((r) => r.id !== id) })),
  updateReel: (id, patch) => set((s) => ({ reels: s.reels.map((r) => r.id === id ? { ...r, ...patch } : r) })),
  prependReel: (post) => set((s) => ({
    reels: [post, ...s.reels.filter(existing => existing.id !== post.id)],
    hasMore: true,
  })),
}))
