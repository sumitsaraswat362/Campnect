import assert from 'node:assert/strict'
import test from 'node:test'
import { getReplySwipeDistance } from './MessageBubble.tsx'

test('reply swipes move inward for both incoming and own messages', () => {
  assert.equal(getReplySwipeDistance(54, false), 54)
  assert.equal(getReplySwipeDistance(-54, true), 54)
})

test('reply swipes reject movement away from either message side', () => {
  assert.equal(getReplySwipeDistance(-54, false), -54)
  assert.equal(getReplySwipeDistance(54, true), -54)
})