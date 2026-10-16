import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSharedPostPayload } from './sharedPostPayload.ts'

test('parses the rich shared-post reply payload', () => {
  const post = parseSharedPostPayload('__POST_SHARE__:{"postId":"post-1","thumbnail":"/api/media/1","authorName":"Areen","caption":"Campus update"}')
  assert.deepEqual(post, {
    postId: 'post-1',
    thumbnail: '/api/media/1',
    authorName: 'Areen',
    caption: 'Campus update',
  })
})

test('does not treat plain or malformed content as a shared post', () => {
  assert.equal(parseSharedPostPayload('Hello'), null)
  assert.equal(parseSharedPostPayload('__POST_SHARE__:{bad json'), null)
})