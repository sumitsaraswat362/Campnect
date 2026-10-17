export interface HelpNavState { helpFromHome?: boolean }

interface Deps {
  state: unknown
  requestBack: () => boolean
  replaceToHelp: () => void
}

/** Back to Help: use the shared Back when the article came from Help; replace to Help only for cold entries. */
export function returnToHelp({ state, requestBack, replaceToHelp }: Deps) {
  const fromHome = (state as HelpNavState | null | undefined)?.helpFromHome === true
  if (fromHome && requestBack()) return
  replaceToHelp()
}
