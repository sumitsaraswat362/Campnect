import { create } from 'zustand'

interface FeedAudioState {
  muted: boolean
  setMuted: (muted: boolean) => void
  toggleMuted: () => void
}

// This deliberately is not persisted: every new app session begins with
// feed sound enabled, while all feed video cards share the current setting.
export const useFeedAudioStore = create<FeedAudioState>((set) => ({
  muted: false,
  setMuted: (muted) => set({ muted }),
  toggleMuted: () => set((state) => ({ muted: !state.muted })),
}))