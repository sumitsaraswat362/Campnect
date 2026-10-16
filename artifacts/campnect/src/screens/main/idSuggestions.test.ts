import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COLLAPSED_ID_SUGGESTIONS_LIMIT,
  EXPANDED_ID_SUGGESTIONS_LIMIT,
  getIdSuggestionsLimit,
  getNextIdSuggestionRequestLimit,
  requestIdSuggestionsInFlight,
} from './idSuggestions.ts'

test('ID suggestions use the collapsed and expanded endpoint limits', () => {
  assert.equal(COLLAPSED_ID_SUGGESTIONS_LIMIT, 8)
  assert.equal(EXPANDED_ID_SUGGESTIONS_LIMIT, 30)
  assert.equal(getIdSuggestionsLimit(false), 8)
  assert.equal(getIdSuggestionsLimit(true), 30)
})

test('ID suggestion expansion requests 30 once and avoids duplicate requests', () => {
  assert.equal(getNextIdSuggestionRequestLimit({ expanded: false, loadedLimit: 0, loadingLimit: 0 }), 8)
  assert.equal(getNextIdSuggestionRequestLimit({ expanded: true, loadedLimit: 8, loadingLimit: 0 }), 30)
  assert.equal(getNextIdSuggestionRequestLimit({ expanded: true, loadedLimit: 8, loadingLimit: 30 }), null)
  assert.equal(getNextIdSuggestionRequestLimit({ expanded: true, loadedLimit: 30, loadingLimit: 0 }), null)
})

test('pending ID suggestion requests dedupe by account and limit, then refresh after completion', async () => {
  let resolveFirstRequest!: () => void
  let sameAccountCalls = 0
  const sameAccountLoader = () => {
    sameAccountCalls += 1
    return new Promise<void>((resolve) => { resolveFirstRequest = resolve })
  }

  const first = requestIdSuggestionsInFlight('account-a', 8, sameAccountLoader)
  const duplicate = requestIdSuggestionsInFlight('account-a', 8, sameAccountLoader)
  assert.equal(sameAccountCalls, 1)
  assert.strictEqual(duplicate, first)

  let otherAccountCalls = 0
  const otherAccount = requestIdSuggestionsInFlight('account-b', 8, async () => { otherAccountCalls += 1 })
  assert.equal(otherAccountCalls, 1)

  resolveFirstRequest()
  await Promise.all([first, otherAccount])

  await requestIdSuggestionsInFlight('account-a', 8, async () => { sameAccountCalls += 1 })
  assert.equal(sameAccountCalls, 2)
})