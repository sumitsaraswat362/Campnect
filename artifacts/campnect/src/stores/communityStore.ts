import { create } from 'zustand'
import { communitiesApi } from '../api/communities'

export interface Community {
  id: string
  name: string
  slug: string
  description?: string
  category: string
  avatar_url?: string
  cover_url?: string
  members_count: number
  posts_count: number
  is_private: number
  is_member: boolean
  member_role?: string | null
  top_members?: any[]
}

export interface CommunityMember {
  id: string
  username: string
  full_name: string
  avatar_url?: string
  college_name?: string
  is_college_verified: number
  role: string
  joined_at: string
}

interface CommunityState {
  communities: Community[]
  categories: { name: string; count: number }[]
  currentCommunity: Community | null
  currentMembers: CommunityMember[]
  loading: boolean

  fetchCommunities: (params?: Record<string, string | number>) => Promise<void>
  fetchCategories: () => Promise<void>
  fetchCommunity: (slug: string) => Promise<void>
  fetchMembers: (id: string) => Promise<void>
  joinCommunity: (id: string) => Promise<void>
  leaveCommunity: (id: string) => Promise<void>
}

export const useCommunityStore = create<CommunityState>((set) => ({
  communities: [],
  categories: [],
  currentCommunity: null,
  currentMembers: [],
  loading: false,

  fetchCommunities: async (params) => {
    set({ loading: true })
    try {
      const res = await communitiesApi.getAll(params)
      set({ communities: res.data.data || [], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchCategories: async () => {
    try {
      const res = await communitiesApi.getCategories()
      set({ categories: res.data.data || [] })
    } catch {}
  },

  fetchCommunity: async (slug) => {
    set({ loading: true, currentCommunity: null })
    try {
      const res = await communitiesApi.getBySlug(slug)
      set({ currentCommunity: res.data.data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchMembers: async (id) => {
    try {
      const res = await communitiesApi.getMembers(id)
      set({ currentMembers: res.data.data || [] })
    } catch {}
  },

  joinCommunity: async (id) => {
    await communitiesApi.join(id)
    set((s) => ({
      communities: s.communities.map((c) =>
        c.id === id ? { ...c, is_member: true, members_count: c.members_count + 1 } : c
      ),
      currentCommunity: s.currentCommunity?.id === id
        ? { ...s.currentCommunity, is_member: true, members_count: s.currentCommunity.members_count + 1 }
        : s.currentCommunity,
    }))
  },

  leaveCommunity: async (id) => {
    await communitiesApi.leave(id)
    set((s) => ({
      communities: s.communities.map((c) =>
        c.id === id ? { ...c, is_member: false, members_count: Math.max(1, c.members_count - 1) } : c
      ),
      currentCommunity: s.currentCommunity?.id === id
        ? { ...s.currentCommunity, is_member: false, members_count: Math.max(1, s.currentCommunity.members_count - 1) }
        : s.currentCommunity,
    }))
  },
}))
