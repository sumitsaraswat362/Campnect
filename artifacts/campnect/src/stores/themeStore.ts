import { DEMO_MODE } from '../demo/config'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light' | 'system'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  getEffective: () => 'dark' | 'light'
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'light' as ThemeMode,
      setMode: (mode) => set({ mode }),
      getEffective: () => {
        const { mode } = get()
        if (mode === 'system') {
          if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
            return 'dark'
          }
          return 'light'
        }
        return mode
      },
    }),
    { name: DEMO_MODE ? 'campnect-demo-theme' : 'campnect-theme', version: 2 }
  )
)
