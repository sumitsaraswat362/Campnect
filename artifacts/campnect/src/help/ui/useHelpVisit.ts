import { useCallback, useEffect, useRef, useState } from 'react'
import type { HelpCategory } from '../helpArticles'
import { readHelpVisitState, writeHelpVisitState } from '../helpVisitState'
import './helpAuthScope'

const blank = { query: '', category: null as HelpCategory | null, scrollTop: 0 }

/** Reads the visit snapshot per owner; persists query/category on change and scroll on real scroll events. */
export function useHelpVisit(ownerKey: string | undefined) {
  const [state, setState] = useState(() => {
    const snap = ownerKey ? readHelpVisitState(ownerKey) : blank
    return { owner: ownerKey, query: snap.query, category: snap.category, scrollTop: snap.scrollTop }
  })
  if (state.owner !== ownerKey) {
    const snap = ownerKey ? readHelpVisitState(ownerKey) : blank
    setState({ owner: ownerKey, query: snap.query, category: snap.category, scrollTop: snap.scrollTop })
  }
  const anchorRef = useRef<HTMLElement | null>(null)
  const ownerRef = useRef(ownerKey)
  ownerRef.current = ownerKey
  const restoreTo = useRef(state.scrollTop)

  useEffect(() => {
    const region = anchorRef.current?.closest('.app-scroll-region') as HTMLElement | null
    if (!region) return
    const target = restoreTo.current
    let raf2 = 0
    let ready = target <= 0
    const onScroll = () => { if (ready && ownerRef.current) writeHelpVisitState(ownerRef.current, { scrollTop: region.scrollTop }) }
    const raf1 = requestAnimationFrame(() => {
      if (target > 0) region.scrollTop = target
      raf2 = requestAnimationFrame(() => {
        if (target > 0) region.scrollTop = target
        ready = true
      })
    })
    region.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      region.removeEventListener('scroll', onScroll)
    }
  }, [])

  const setQuery = useCallback((value: string) => {
    setState((s) => ({ ...s, query: value }))
    if (ownerRef.current) writeHelpVisitState(ownerRef.current, { query: value })
  }, [])
  const setCategory = useCallback((value: HelpCategory | null) => {
    setState((s) => ({ ...s, category: value }))
    if (ownerRef.current) writeHelpVisitState(ownerRef.current, { category: value })
  }, [])

  return { query: state.query, setQuery, category: state.category, setCategory, anchorRef }
}
