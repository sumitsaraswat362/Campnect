import assert from 'node:assert/strict'
import test from 'node:test'
import { claimExit, createExitGuard, releaseExit } from './exitGuard.ts'

test('rapid root Back requests can claim native exit only once', () => {
  const guard = createExitGuard()
  assert.equal(claimExit(guard), true)
  assert.equal(claimExit(guard), false)
  assert.equal(claimExit(guard), false)
})

test('an explicitly failed native exit can release the guard', () => {
  const guard = createExitGuard()
  assert.equal(claimExit(guard), true)
  releaseExit(guard)
  assert.equal(claimExit(guard), true)
})