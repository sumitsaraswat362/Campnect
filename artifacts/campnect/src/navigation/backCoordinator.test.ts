import assert from 'node:assert/strict'
import test from 'node:test'
import { executeAppBack, type BackCoordinatorDependencies } from './backCoordinator.ts'
import type { NativeBackEvent } from './nativeBackEvent.ts'

const firstBack: NativeBackEvent = {
  eventId: 41,
  committedAtMs: 1_537_433_827,
  lifecycleGeneration: 1,
  exitResetGeneration: 3,
}

function coordinator(overrides: Partial<BackCoordinatorDependencies> = {}) {
  const calls = {
    clear: 0,
    navigate: [] as Array<number | string>,
    arm: [] as NativeBackEvent[],
    exit: [] as NativeBackEvent[],
    hint: 0,
    dismiss: 0,
  }
  const dependencies: BackCoordinatorDependencies = {
    isExitPending: () => false,
    dismissTopOverlay: () => false,
    resolveRouteAction: () => ({ type: 'exit' }),
    clearExitConfirmation: () => { calls.clear += 1 },
    navigate: (target) => { calls.navigate.push(target) },
    requestRootExit: () => 'arm',
    armNativeExit: (event) => { calls.arm.push(event) },
    showRootExitHint: () => { calls.hint += 1 },
    claimExit: () => true,
    releaseExit: () => {},
    exitNativeApp: (event) => { calls.exit.push(event) },
    now: () => firstBack.committedAtMs,
    ...overrides,
  }
  return { calls, dependencies }
}

test('one true-root native Back arms once without clearing native exit state', () => {
  const { calls, dependencies } = coordinator()

  assert.equal(executeAppBack(dependencies, firstBack), 'arm')
  assert.equal(calls.clear, 0)
  assert.deepEqual(calls.arm, [firstBack])
  assert.equal(calls.hint, 1)
  assert.deepEqual(calls.exit, [])
})

test('a distinct confirmed root Back exits once without a preceding clear', () => {
  const secondBack = { ...firstBack, eventId: 42, committedAtMs: firstBack.committedAtMs + 500 }
  const { calls, dependencies } = coordinator({ requestRootExit: () => 'exit' })

  assert.equal(executeAppBack(dependencies, secondBack), 'exit')
  assert.equal(calls.clear, 0)
  assert.deepEqual(calls.arm, [])
  assert.deepEqual(calls.exit, [secondBack])
})

test('nested and overlay Back each perform one action and do not arm exit', () => {
  const nested = coordinator({ resolveRouteAction: () => ({ type: 'history' }) })
  assert.equal(executeAppBack(nested.dependencies, firstBack), 'history')
  assert.equal(nested.calls.clear, 1)
  assert.deepEqual(nested.calls.navigate, [-1])
  assert.deepEqual(nested.calls.arm, [])

  const overlay = coordinator({ dismissTopOverlay: () => true })
  assert.equal(executeAppBack(overlay.dependencies, firstBack), 'overlay')
  assert.equal(overlay.calls.clear, 1)
  assert.deepEqual(overlay.calls.navigate, [])
  assert.deepEqual(overlay.calls.arm, [])
})