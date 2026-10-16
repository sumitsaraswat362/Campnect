import assert from 'node:assert/strict'
import test from 'node:test'
import { clampPostCrop, DEFAULT_POST_CROP, INSTAGRAM_POST_MIN_ASPECT_RATIO, INSTAGRAM_POST_MAX_ASPECT_RATIO } from './instagramPostCrop.ts'

test('post framing preserves the current portrait-to-landscape aspect ratio bounds', () => {
  assert.equal(INSTAGRAM_POST_MIN_ASPECT_RATIO, 0.8)
  assert.equal(INSTAGRAM_POST_MAX_ASPECT_RATIO, 1.91)
  assert.deepEqual(DEFAULT_POST_CROP, { zoom: 1, x: 0, y: 0 })
})

test('post crop controls remain within usable bounds', () => {
  assert.deepEqual(clampPostCrop({ zoom: 8, x: -4, y: 3 }), { zoom: 3, x: -1, y: 1 })
})