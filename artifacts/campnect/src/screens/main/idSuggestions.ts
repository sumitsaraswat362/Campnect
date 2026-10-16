export const COLLAPSED_ID_SUGGESTIONS_LIMIT = 8
export const EXPANDED_ID_SUGGESTIONS_LIMIT = 30
const inFlightIdSuggestionRequests = new Map<string, Promise<unknown>>()

export interface IdSuggestionRequestState {
  expanded: boolean
  loadedLimit: number
  loadingLimit: number
}

export function getIdSuggestionsLimit(expanded: boolean) {
  return expanded ? EXPANDED_ID_SUGGESTIONS_LIMIT : COLLAPSED_ID_SUGGESTIONS_LIMIT
}

/**
 * Returns the next endpoint limit only when the currently available or
 * in-flight data does not already satisfy the requested presentation.
 */
export function getNextIdSuggestionRequestLimit({
  expanded,
  loadedLimit,
  loadingLimit,
}: IdSuggestionRequestState): number | null {
  const requestedLimit = getIdSuggestionsLimit(expanded)
  if (loadedLimit >= requestedLimit || loadingLimit >= requestedLimit) return null
  return requestedLimit
}

/**
 * Deduplicates only pending requests for one authenticated account and limit.
 * Settled responses are deliberately not retained, so a later visit refreshes
 * from the API rather than sharing data across sessions or accounts.
 */
export function requestIdSuggestionsInFlight<T>(
  accountId: string,
  limit: number,
  loader: () => Promise<T>,
): Promise<T> {
  const key = `${accountId}\u0000${limit}`
  const existing = inFlightIdSuggestionRequests.get(key)
  if (existing) return existing as Promise<T>

  let promise: Promise<T>
  try {
    promise = Promise.resolve(loader())
  } catch (error) {
    promise = Promise.reject(error)
  }
  inFlightIdSuggestionRequests.set(key, promise)
  promise.then(
    () => {
      if (inFlightIdSuggestionRequests.get(key) === promise) inFlightIdSuggestionRequests.delete(key)
    },
    () => {
      if (inFlightIdSuggestionRequests.get(key) === promise) inFlightIdSuggestionRequests.delete(key)
    },
  )
  return promise
}