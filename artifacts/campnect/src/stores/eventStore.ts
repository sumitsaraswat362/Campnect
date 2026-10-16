import { create } from 'zustand'
import { eventsApi } from '../api/events'

// Keep retries brief on mobile. A native transport failure should become a
// recoverable UI state, not hold the Events rail on a loading skeleton for
// more than two minutes.
const MAX_TRANSIENT_FETCH_RETRIES = 3
const TRANSIENT_RETRY_DELAYS = [1000, 2000, 4000]
let latestEventFetch = 0

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isTransientFetchError(error: any) {
  const status = error?.response?.status
  if (!status) return true
  if (status >= 502 && status <= 504) return true
  // Vite's startup proxy error is a 500 HTML response. A JSON 500 from the
  // Events API is a real server error and should still reach the user.
  return status === 500 && typeof error?.response?.data !== 'object'
}

export interface Event {
  id: string
  title: string
  description?: string
  type: string
  category?: string
  visibility?: 'public' | 'private'
  organizer_id: string
  organizer_username: string
  organizer_name: string
  organizer_avatar?: string
  college_id?: string
  college_name?: string
  location?: string
  address?: string
  location_type?: 'inside' | 'outside'
  latitude?: number
  longitude?: number
  is_online: number
  meeting_link?: string
  starts_at: string
  ends_at?: string
  cancelled_at?: string
  attendees_count: number
  max_attendees?: number
  allow_waitlist?: boolean
  waitlist_count?: number
  status?: string
  event_state?: 'upcoming' | 'live' | 'ended' | 'cancelled'
  cancel_reason?: string
  ended_at?: string
  cover_url?: string
  tags: string[]
  is_attending: boolean
  is_saved?: boolean
  user_status?: 'going' | 'interested' | 'not_going' | 'waitlist' | null
  attendees_preview?: { id: string; username: string; full_name: string; avatar_url?: string }[]
  attendees?: { id: string; username: string; full_name: string; avatar_url?: string; college_name?: string; status: string }[]
  hosts?: { id: string; username: string; full_name: string; avatar_url?: string; college_name?: string; role?: string }[]
  announcements?: { id: string; body: string; created_at: string; author_name?: string; author_avatar?: string }[]
  counts?: { going: number; interested: number; waitlist: number }
  conversation_id?: string | null
}

interface EventState {
  events: Event[]
  currentEvent: Event | null
  loading: boolean
  error: string | null

  fetchEvents: (params?: Record<string, string | number | boolean>) => Promise<void>
  fetchEvent: (id: string) => Promise<void>
  rsvp: (id: string, status: 'going' | 'interested' | 'not_going') => Promise<string | undefined>
  save: (id: string) => Promise<void>
  unsave: (id: string) => Promise<void>
  updateEvent: (event: Event) => void
}

export const useEventStore = create<EventState>((set) => ({
  events: [],
  currentEvent: null,
  loading: false,
  error: null,

  fetchEvents: async (params) => {
    const requestId = ++latestEventFetch
    set({ loading: true, error: null, events: [] })
    for (let attempt = 0; attempt <= MAX_TRANSIENT_FETCH_RETRIES; attempt += 1) {
      try {
        const res = await eventsApi.getAll(params)
        if (requestId === latestEventFetch) {
          set({ events: res.data.data || [], loading: false, error: null })
        }
        return
      } catch (error: any) {
        const canRetry = attempt < MAX_TRANSIENT_FETCH_RETRIES && isTransientFetchError(error)
        if (!canRetry) {
          if (requestId === latestEventFetch) {
            set({ loading: false, error: error?.response?.data?.error || 'Unable to load events.' })
          }
          return
        }
        await wait(TRANSIENT_RETRY_DELAYS[Math.min(attempt, TRANSIENT_RETRY_DELAYS.length - 1)])
      }
    }
  },

  fetchEvent: async (id) => {
    set({ loading: true, currentEvent: null, error: null })
    try {
      const res = await eventsApi.getById(id)
      set({ currentEvent: res.data.data, loading: false, error: null })
    } catch (error: any) {
      set({ loading: false, error: error?.response?.data?.error || 'Unable to load this event.' })
    }
  },

  rsvp: async (id, status) => {
    try {
      const res = await eventsApi.rsvp(id, status)
      const nextStatus = res.data.data?.status || status
      const count = Number(res.data.data?.attendees_count ?? 0)
      set((s) => ({
        currentEvent: s.currentEvent?.id === id
          ? { ...s.currentEvent, user_status: nextStatus, is_attending: nextStatus === 'going' || nextStatus === 'interested', attendees_count: count }
          : s.currentEvent,
        events: s.events.map((event) => event.id === id
          ? { ...event, user_status: nextStatus, is_attending: nextStatus === 'going' || nextStatus === 'interested', attendees_count: count }
          : event),
      }))
      return nextStatus
    } catch {
      throw new Error('Unable to update your RSVP.')
    }
  },

  save: async (id) => {
    await eventsApi.save(id)
    set((s) => ({
      currentEvent: s.currentEvent?.id === id ? { ...s.currentEvent, is_saved: true } : s.currentEvent,
      events: s.events.map((event) => event.id === id ? { ...event, is_saved: true } : event),
    }))
  },

  unsave: async (id) => {
    await eventsApi.unsave(id)
    set((s) => ({
      currentEvent: s.currentEvent?.id === id ? { ...s.currentEvent, is_saved: false } : s.currentEvent,
      events: s.events.map((event) => event.id === id ? { ...event, is_saved: false } : event),
    }))
  },

  updateEvent: (event) => set((s) => ({
    currentEvent: s.currentEvent?.id === event.id ? event : s.currentEvent,
    events: s.events.map((item) => item.id === event.id ? event : item),
  })),
}))
