import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ROOT_EXIT_CONFIRM_WINDOW_MS,
  ROOT_EXIT_MIN_CONFIRM_DELAY_MS,
  clearRootExitConfirmation,
  createRootExitConfirmation,
  requestRootExit,
} from './rootExitConfirmation.ts'

test('first root Back request arms exit instead of closing the app', () => {
  const state = createRootExitConfirmation()
  assert.equal(requestRootExit(state, 1000), 'arm')
})

test('a separate Back request in the confirmation window exits', () => {
  const state = createRootExitConfirmation()
  requestRootExit(state, 1000)
  assert.equal(requestRootExit(state, 1000 + ROOT_EXIT_MIN_CONFIRM_DELAY_MS), 'exit')
})

test('a quick intentional second gesture can confirm exit', () => {
  const state = createRootExitConfirmation()
  requestRootExit(state, 1000)
  assert.equal(requestRootExit(state, 1180), 'exit')
})

test('rapid queued requests do not confirm exit', () => {
  const state = createRootExitConfirmation()
  requestRootExit(state, 1000)
  assert.equal(requestRootExit(state, 1001), 'arm')
  assert.equal(requestRootExit(state, 1002), 'arm')
})

test('an expired confirmation window requires re-arming', () => {
  const state = createRootExitConfirmation()
  requestRootExit(state, 1000)
  assert.equal(requestRootExit(state, 1000 + ROOT_EXIT_CONFIRM_WINDOW_MS + 1), 'arm')
})

test('navigation or overlay dismissal clears an armed exit', () => {
  const state = createRootExitConfirmation()
  requestRootExit(state, 1000)
  clearRootExitConfirmation(state)
  assert.equal(requestRootExit(state, 1800), 'arm')
})