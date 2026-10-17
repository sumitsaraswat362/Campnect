import type { HelpCategory } from './helpArticles'

export interface HelpVisitState {
  query: string
  category: HelpCategory | null
  scrollTop: number
}

const emptyVisit = (): HelpVisitState => ({ query: '', category: null, scrollTop: 0 })
let owner: string | undefined
let visit = emptyVisit()

/** A single account-scoped, memory-only snapshot; never a search history. */
export function readHelpVisitState(ownerKey: string): HelpVisitState {
  if (owner !== ownerKey) {
    owner = ownerKey
    visit = emptyVisit()
  }
  return { ...visit }
}

export function writeHelpVisitState(ownerKey: string, patch: Partial<HelpVisitState>) {
  // An old page's cleanup must not overwrite a newer account's visit.
  if (owner !== ownerKey) return
  visit = {
    ...visit,
    ...patch,
    scrollTop: patch.scrollTop === undefined
      ? visit.scrollTop
      : Number.isFinite(patch.scrollTop) ? Math.max(0, patch.scrollTop) : 0,
  }
}

export function clearHelpVisitState() {
  owner = undefined
  visit = emptyVisit()
}