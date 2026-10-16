import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export interface DismissEntry {
  id: number
  priority: number
  dismiss: () => void
}

export function selectTopDismissEntry(entries: DismissEntry[]) {
  return [...entries].sort((a, b) => b.priority - a.priority || b.id - a.id)[0] ?? null
}

export function dismissTopDismissEntry(entries: Map<number, DismissEntry>) {
  for (;;) {
    const top = selectTopDismissEntry([...entries.values()])
    if (!top) return false
    entries.delete(top.id)
    try {
      top.dismiss()
      return true
    } catch (error) {
      console.error('Campnect overlay Back dismissal failed.', error)
    }
  }
}

interface OverlayDismissRegistryValue {
  dismissTopOverlay: () => boolean
  registerDismiss: (dismiss: () => void, priority?: number) => () => void
  hasActiveOverlay: boolean
}

const OverlayDismissRegistryContext = createContext<OverlayDismissRegistryValue | null>(null)

export function OverlayDismissRegistryProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<number, DismissEntry>())
  const sequence = useRef(0)
  const [hasActiveOverlay, setHasActiveOverlay] = useState(false)

  const registerDismiss = useCallback((dismiss: () => void, priority = 100) => {
    const id = ++sequence.current
    entries.current.set(id, { id, priority, dismiss })
    setHasActiveOverlay(true)
    return () => {
      entries.current.delete(id)
      setHasActiveOverlay(entries.current.size > 0)
    }
  }, [])

  const dismissTopOverlay = useCallback(() => {
    const dismissed = dismissTopDismissEntry(entries.current)
    setHasActiveOverlay(entries.current.size > 0)
    return dismissed
  }, [])

  const value = useMemo(
    () => ({ dismissTopOverlay, registerDismiss, hasActiveOverlay }),
    [dismissTopOverlay, hasActiveOverlay, registerDismiss],
  )

  return (
    <OverlayDismissRegistryContext.Provider value={value}>
      {children}
    </OverlayDismissRegistryContext.Provider>
  )
}

export function useOverlayDismissRegistry() {
  const context = useContext(OverlayDismissRegistryContext)
  if (!context) {
    throw new Error('useOverlayDismissRegistry must be used inside OverlayDismissRegistryProvider')
  }
  return context
}

export function useBackDismiss(open: boolean, dismiss: () => void, priority = 100) {
  const { registerDismiss } = useOverlayDismissRegistry()
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss

  useLayoutEffect(() => {
    if (!open) return
    return registerDismiss(() => dismissRef.current(), priority)
  }, [open, priority, registerDismiss])
}