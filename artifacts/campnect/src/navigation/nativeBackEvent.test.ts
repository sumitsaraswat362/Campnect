import assert from 'node:assert/strict'
import test from 'node:test'
import { claimNativeBackDomEvent, claimNativeBackEvent } from './nativeBackEvent.ts'

test('a replayed physical Back event can be logically claimed only once', () => {
  const handled = new Set<number>()
  const detail = {
    id: 17,
    committedAtMs: 1000,
    lifecycleGeneration: 2,
    exitResetGeneration: 4,
  }

  assert.deepEqual(claimNativeBackEvent(handled, detail), {
    eventId: 17,
    committedAtMs: 1000,
    lifecycleGeneration: 2,
    exitResetGeneration: 4,
  })
  assert.equal(claimNativeBackEvent(handled, detail), null)
})

test('separate queued physical Back events retain distinct identities and timestamps', () => {
  const handled = new Set<number>()

  assert.deepEqual(claimNativeBackEvent(handled, {
    id: 18,
    committedAtMs: 1000,
    lifecycleGeneration: 2,
    exitResetGeneration: 4,
  }), {
    eventId: 18,
    committedAtMs: 1000,
    lifecycleGeneration: 2,
    exitResetGeneration: 4,
  })
  assert.deepEqual(claimNativeBackEvent(handled, {
    id: 19,
    committedAtMs: 1200,
    lifecycleGeneration: 2,
    exitResetGeneration: 4,
  }), {
    eventId: 19,
    committedAtMs: 1200,
    lifecycleGeneration: 2,
    exitResetGeneration: 4,
  })
})

test('malformed native Back metadata fails closed', () => {
  const handled = new Set<number>()
  assert.equal(claimNativeBackEvent(handled, { id: 20 }), null)
  assert.equal(claimNativeBackEvent(handled, {
    committedAtMs: 1000,
    lifecycleGeneration: 2,
    exitResetGeneration: 4,
  }), null)
})

test('the DOM event is canceled only after a valid native event is claimed', () => {
  const handled = new Set<number>()
  let cancellations = 0
  const preventDefault = () => {
    cancellations++
  }
  const detail = {
    id: 21,
    committedAtMs: 1000,
    lifecycleGeneration: 2,
    exitResetGeneration: 4,
  }

  assert.deepEqual(
    claimNativeBackDomEvent(handled, detail, preventDefault),
    {
      eventId: 21,
      committedAtMs: 1000,
      lifecycleGeneration: 2,
      exitResetGeneration: 4,
    },
  )
  assert.equal(cancellations, 1)

  assert.equal(claimNativeBackDomEvent(handled, detail, preventDefault), null)
  assert.equal(cancellations, 2)
  assert.equal(claimNativeBackDomEvent(handled, { id: 22 }, preventDefault), null)
  assert.equal(cancellations, 2)
})

test('an acknowledged delivery retry does not block the next physical Back event', () => {
  const handled = new Set<number>()
  let cancellations = 0
  let logicalBackRequests = 0
  const deliver = (detail: {
    id: number
    committedAtMs: number
    lifecycleGeneration: number
    exitResetGeneration: number
  }) => {
    const nativeEvent = claimNativeBackDomEvent(handled, detail, () => {
      cancellations++
    })
    if (nativeEvent) logicalBackRequests++
  }
  const first = {
    id: 30,
    committedAtMs: 1000,
    lifecycleGeneration: 2,
    exitResetGeneration: 4,
  }

  deliver(first)
  deliver(first)
  deliver({
    id: 31,
    committedAtMs: 1200,
    lifecycleGeneration: 2,
    exitResetGeneration: 4,
  })

  assert.equal(cancellations, 3)
  assert.equal(logicalBackRequests, 2)
})