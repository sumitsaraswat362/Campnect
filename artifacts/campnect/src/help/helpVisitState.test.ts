import assert from 'node:assert/strict'
import test from 'node:test'
import { clearHelpVisitState, readHelpVisitState, writeHelpVisitState } from './helpVisitState.ts'

test('Help visit query, category and position survive an article round trip in memory', () => {
  clearHelpVisitState()
  readHelpVisitState('reader:student')
  writeHelpVisitState('reader:student', { query: 'OTP', category: 'Account & Login', scrollTop: 325 })
  assert.deepEqual(readHelpVisitState('reader:student'), { query: 'OTP', category: 'Account & Login', scrollTop: 325 })
})

test('account or role changes cannot read another Help visit', () => {
  clearHelpVisitState()
  readHelpVisitState('reader:faculty')
  writeHelpVisitState('reader:faculty', { query: 'private concern' })
  assert.equal(readHelpVisitState('other:student').query, '')
  writeHelpVisitState('reader:faculty', { query: 'old cleanup' })
  assert.equal(readHelpVisitState('other:student').query, '')
  assert.equal(readHelpVisitState('other:faculty').query, '')
})

test('clear discards searches; snapshots cannot mutate the stored visit', () => {
  clearHelpVisitState()
  readHelpVisitState('reader')
  writeHelpVisitState('reader', { query: 'login', scrollTop: -1 })
  const snapshot = readHelpVisitState('reader')
  snapshot.query = 'mutated'
  assert.equal(readHelpVisitState('reader').query, 'login')
  assert.equal(snapshot.scrollTop, 0)
  writeHelpVisitState('reader', { scrollTop: NaN })
  assert.equal(readHelpVisitState('reader').scrollTop, 0)
  clearHelpVisitState()
  assert.equal(readHelpVisitState('reader').query, '')
})