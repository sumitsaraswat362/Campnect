import { DEMO_MODE } from '../demo/config'
import { create } from 'zustand'

export interface ActiveCall {
  conversationId: string
  callId: string
  type: 'voice' | 'video'
  incoming?: boolean
  fromUserId?: string
  fromName?: string
  fromAvatar?: string | null
  startedAt?: string
}

interface CallState {
  activeCall: ActiveCall | null
  setActiveCall: (call: ActiveCall) => void
  clearActiveCall: () => void
}

function readStoredCall(): ActiveCall | null {
  try {
    const raw = localStorage.getItem((DEMO_MODE ? 'campnect-demo-active-call' : 'campnect:active-call'))
    if (!raw) return null
    const call = JSON.parse(raw) as ActiveCall
    return call?.conversationId && call?.callId ? call : null
  } catch { return null }
}

export const useCallStore = create<CallState>((set) => ({
  activeCall: readStoredCall(),
  setActiveCall: (activeCall) => {
    const persisted = { ...activeCall, startedAt: activeCall.startedAt || new Date().toISOString() }
    try { localStorage.setItem((DEMO_MODE ? 'campnect-demo-active-call' : 'campnect:active-call'), JSON.stringify(persisted)) } catch {}
    set({ activeCall: persisted })
  },
  clearActiveCall: () => {
    try { localStorage.removeItem((DEMO_MODE ? 'campnect-demo-active-call' : 'campnect:active-call')) } catch {}
    set({ activeCall: null })
  },
}))