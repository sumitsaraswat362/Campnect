import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dispatchAppBack,
  registerAppBackHandler,
  requestAppBack,
} from './appBackRequest.ts'

test('UI Back invokes the currently registered application coordinator', () => {
  let requests = 0
  const unregister = registerAppBackHandler(() => { requests += 1 })

  assert.equal(requestAppBack(), true)
  assert.equal(requests, 1)

  unregister()
  assert.equal(requestAppBack(), false)
})

test('Android and UI Back share the same registered coordinator', () => {
  const requests: Array<number | undefined> = []
  const unregister = registerAppBackHandler((nativeEvent) => {
    requests.push(nativeEvent?.id)
  })

  requestAppBack()
  dispatchAppBack({
    id: 42,
    committedAtMs: 1,
    lifecycleGeneration: 1,
    exitResetGeneration: 1,
  })

  assert.deepEqual(requests, [undefined, 42])
  unregister()
})

test('an older provider cleanup cannot unregister a newer coordinator', () => {
  let selected = ''
  const unregisterOld = registerAppBackHandler(() => { selected = 'old' })
  const unregisterNew = registerAppBackHandler(() => { selected = 'new' })

  unregisterOld()
  requestAppBack()

  assert.equal(selected, 'new')
  unregisterNew()
})