import assert from 'node:assert/strict'
import test from 'node:test'
import { getReplyReferenceDestination } from './replyReferenceNavigation.ts'

test('a reply to a shared post opens the original post', () => {
  assert.deepEqual(
    getReplyReferenceDestination({
      messageId: 'message-1',
      content: '__POST_SHARE__:{"postId":"post-1","caption":"Campus update"}',
    }),
    { kind: 'post', postId: 'post-1' },
  )
})

test('a reply to a regular message locates its original chat row', () => {
  assert.deepEqual(
    getReplyReferenceDestination({ messageId: 'message-1', content: 'Hello' }),
    { kind: 'message', messageId: 'message-1' },
  )
})