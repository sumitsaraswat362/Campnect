import assert from 'node:assert/strict'
import test from 'node:test'
import { preserveTextareaFocusOnTextSendPointerDown } from './composerTextSendPointer.ts'

test('text-send pointer activation prevents the textarea from blurring', () => {
  let preventDefaultCalls = 0
  preserveTextareaFocusOnTextSendPointerDown({ preventDefault: () => { preventDefaultCalls += 1 } }, true)
  assert.equal(preventDefaultCalls, 1)
})

test('voice or media pointer activation keeps default pointer behavior', () => {
  let preventDefaultCalls = 0
  preserveTextareaFocusOnTextSendPointerDown({ preventDefault: () => { preventDefaultCalls += 1 } }, false)
  assert.equal(preventDefaultCalls, 0)
})