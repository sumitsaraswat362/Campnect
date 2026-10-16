import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  mediaUploadDurationError,
  mediaUploadSizeError,
  PHOTO_MAX_UPLOAD_BYTES,
  VIDEO_MAX_DURATION_SECONDS,
  VIDEO_MAX_UPLOAD_BYTES,
} from './mediaUploadPolicy.ts'

test('shared upload policy uses 25 MiB photos, 100 MiB videos, and 60 seconds', () => {
  assert.equal(PHOTO_MAX_UPLOAD_BYTES, 25 * 1024 * 1024)
  assert.equal(VIDEO_MAX_UPLOAD_BYTES, 100 * 1024 * 1024)
  assert.equal(VIDEO_MAX_DURATION_SECONDS, 60)
})

test('size policy accepts the exact limits and rejects only oversized photos and videos', () => {
  assert.equal(mediaUploadSizeError({ name: 'photo.jpg', type: 'image/jpeg', size: PHOTO_MAX_UPLOAD_BYTES }), null)
  assert.equal(mediaUploadSizeError({ name: 'photo.jpg', type: 'image/jpeg', size: PHOTO_MAX_UPLOAD_BYTES + 1 }), 'Photo must be 25 MB or smaller.')
  assert.equal(mediaUploadSizeError({ name: 'clip.mp4', type: 'video/mp4', size: VIDEO_MAX_UPLOAD_BYTES }), null)
  assert.equal(mediaUploadSizeError({ name: 'clip.mp4', type: 'video/mp4', size: VIDEO_MAX_UPLOAD_BYTES + 1 }), 'Video must be 100 MB or smaller.')
})

test('duration policy accepts 60 seconds exactly and rejects longer video', () => {
  assert.equal(mediaUploadDurationError(VIDEO_MAX_DURATION_SECONDS), null)
  assert.equal(mediaUploadDurationError(VIDEO_MAX_DURATION_SECONDS + 0.001), 'Video must be 60 seconds or shorter.')
})

test('audio and external references are not classified as photos or videos', () => {
  assert.equal(mediaUploadSizeError({ name: 'note.m4a', type: 'audio/mp4', size: 500 * 1024 * 1024 }), null)
  assert.equal(mediaUploadSizeError({ name: 'external-giphy-reference', type: 'text/uri-list', size: 500 * 1024 * 1024 }), null)
})

test('Android Glimpse capture defaults to and clamps at the shared 60 second client limit', () => {
  const pluginSource = readFileSync(new URL('../../../../android/app/src/main/java/com/campnect/app/GlimpseCameraPlugin.java', import.meta.url), 'utf8')
  const activitySource = readFileSync(new URL('../../../../android/app/src/main/java/com/campnect/app/GlimpseCameraActivity.java', import.meta.url), 'utf8')
  assert.match(pluginSource, /call\.getInt\("maxVideoSeconds",\s*MAX_VIDEO_SECONDS\)/)
  assert.match(pluginSource, /Math\.min\([^,]+,\s*MAX_VIDEO_SECONDS\)/)
  assert.match(activitySource, /private static final int MAX_VIDEO_SECONDS = 60/)
  assert.match(activitySource, /getIntent\(\)\.getIntExtra\("maxVideoSeconds",\s*MAX_VIDEO_SECONDS\)/)
  assert.match(activitySource, /Math\.min\([^,]+,\s*MAX_VIDEO_SECONDS\)/)
})