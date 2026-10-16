import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dismissTopDismissEntry,
  selectTopDismissEntry,
  type DismissEntry,
} from './overlayDismissRegistry.tsx'

test('the highest-priority overlay consumes Back first', () => {
  const low = { id: 1, priority: 100, dismiss: () => {} }
  const high = { id: 2, priority: 300, dismiss: () => {} }

  assert.equal(selectTopDismissEntry([low, high]), high)
})

test('the newest overlay wins when priorities match', () => {
  const older = { id: 4, priority: 200, dismiss: () => {} }
  const newer = { id: 5, priority: 200, dismiss: () => {} }

  assert.equal(selectTopDismissEntry([newer, older]), newer)
})

test('an empty registry leaves Back for route navigation', () => {
  assert.equal(selectTopDismissEntry([]), null)
})

test('a stale throwing overlay cannot block the next valid dismissal', () => {
  let dismissed = false
  const entries = new Map<number, DismissEntry>([
    [1, { id: 1, priority: 100, dismiss: () => { dismissed = true } }],
    [2, { id: 2, priority: 200, dismiss: () => { throw new Error('stale') } }],
  ])
  const originalError = console.error
  console.error = () => {}
  try {
    assert.equal(dismissTopDismissEntry(entries), true)
  } finally {
    console.error = originalError
  }
  assert.equal(dismissed, true)
  assert.equal(entries.size, 0)
})

test('only failing stale overlays leave Back available for route navigation', () => {
  const entries = new Map<number, DismissEntry>([
    [1, { id: 1, priority: 100, dismiss: () => { throw new Error('stale') } }],
  ])
  const originalError = console.error
  console.error = () => {}
  try {
    assert.equal(dismissTopDismissEntry(entries), false)
  } finally {
    console.error = originalError
  }
  assert.equal(entries.size, 0)
})