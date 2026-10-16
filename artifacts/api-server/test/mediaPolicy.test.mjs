import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PHOTO_MAX_UPLOAD_BYTES, VIDEO_MAX_UPLOAD_BYTES, assertMediaUploadSize,
  assertVideoDuration, MediaPolicyError,
} from '../src/legacy-services/mediaLimits.ts'
import { inspectVideo, optimizePlaybackVideo, processGlimpseVideo } from '../src/legacy-services/videoProcessing.ts'

const dir = await mkdtemp(join(tmpdir(), 'campnect-policy-test-'))
after(() => rm(dir, { recursive: true, force: true }))
let fixtureIndex = 0
async function fixture({ duration = 1, size = '320x180', audio = false, codec = 'libx264', fps = 10, faststart = true } = {}) {
  const path = join(dir, `fixture-${fixtureIndex++}.mp4`)
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=${fps}`]
  if (audio) args.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000')
  args.push('-t', String(duration), '-c:v', codec, '-threads', '2', '-pix_fmt', 'yuv420p')
  if (codec === 'libx264') args.push('-preset', 'ultrafast', '-crf', '30')
  if (audio) args.push('-c:a', 'aac', '-b:a', '64k')
  if (faststart) args.push('-movflags', '+faststart')
  args.push(path)
  execFileSync('ffmpeg', args, { timeout: 120000, stdio: ['ignore', 'ignore', 'pipe'] })
  return readFile(path)
}

test('photo and video original-byte boundaries are inclusive, independent of audio policy', () => {
  for (const bytes of [Math.floor(24.9 * 1024 ** 2), PHOTO_MAX_UPLOAD_BYTES]) {
    assert.doesNotThrow(() => assertMediaUploadSize('image/jpeg', bytes))
  }
  assert.throws(() => assertMediaUploadSize('image/png', PHOTO_MAX_UPLOAD_BYTES + 1),
    { code: 'PHOTO_TOO_LARGE', status: 413, message: 'Photo must be 25 MB or smaller.' })
  for (const bytes of [Math.floor(99.9 * 1024 ** 2), VIDEO_MAX_UPLOAD_BYTES]) {
    assert.doesNotThrow(() => assertMediaUploadSize('video/mp4', bytes))
  }
  assert.throws(() => assertMediaUploadSize('video/webm', VIDEO_MAX_UPLOAD_BYTES + 1),
    { code: 'VIDEO_TOO_LARGE', status: 413, message: 'Video must be 100 MB or smaller.' })
  assert.doesNotThrow(() => assertMediaUploadSize('audio/mpeg', VIDEO_MAX_UPLOAD_BYTES + 1))
})

test('duration validation is strict and fail-closed', () => {
  for (const duration of [59, 60]) assert.doesNotThrow(() => assertVideoDuration(duration))
  assert.throws(() => assertVideoDuration(60.001), { code: 'VIDEO_TOO_LONG' })
  for (const duration of [0, -1, NaN, Infinity]) {
    assert.throws(() => assertVideoDuration(duration), { code: 'INVALID_VIDEO' })
  }
})

test('real 59s and 60s videos pass metadata validation; >60s is rejected before editor trim', async () => {
  for (const duration of [59, 60]) {
    const bytes = await fixture({ duration, size: '32x32', fps: 1 })
    assert.equal((await inspectVideo(bytes)).duration, duration)
  }
  const overlong = await fixture({ duration: 61, size: '32x32', fps: 1 })
  await assert.rejects(() => processGlimpseVideo(overlong, { start: 0, end: 1, speed: 1, filter: 'none' }),
    { code: 'VIDEO_TOO_LONG', message: 'Video must be 60 seconds or shorter.' })
})

test('1080p landscape and portrait videos produce H264 MP4 without changing aspect ratio', async () => {
  for (const size of ['1920x1080', '1080x1920']) {
    const bytes = await fixture({ size, codec: 'mpeg4', audio: true })
    const source = await inspectVideo(bytes)
    const result = await optimizePlaybackVideo(bytes)
    const output = await inspectVideo(result.buffer)
    assert.equal(output.mimeType, 'video/mp4')
    assert.equal(output.video.codec_name, 'h264')
    assert.ok(output.video.width <= 720)
    assert.ok(Math.abs(output.video.width / output.video.height - source.video.width / source.video.height) < 0.01)
    assert.equal(output.audio[0].codec_name, 'aac')
    assert.ok(Math.abs(output.duration - source.duration) < 0.15)
    assert.equal(result.optimizationStatus, 'optimized')
    const deliveryPath = join(dir, `delivery-${size}.mp4`)
    await writeFile(deliveryPath, result.buffer)
    execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', deliveryPath,
      '-map', '0:v:0', '-map', '0:a?', '-f', 'null', '-'],
    { timeout: 120000, stdio: ['ignore', 'ignore', 'pipe'] })
  }
})

test('already compliant 720px H264/AAC stream-friendly video is not reencoded', async () => {
  const bytes = await fixture({ size: '720x404', audio: true })
  const result = await optimizePlaybackVideo(bytes)
  assert.equal(result.optimizationStatus, 'original')
  assert.equal(result.buffer, bytes)
})

test('a 60s source with audio retains its duration and stays valid after optimization', async () => {
  const bytes = await fixture({ duration: 60, size: '32x32', fps: 1, codec: 'mpeg4', audio: true })
  const result = await optimizePlaybackVideo(bytes)
  const info = await inspectVideo(result.buffer)
  assert.equal(info.duration, 60)
  assert.equal(info.audio[0].codec_name, 'aac')
  const repeated = await optimizePlaybackVideo(result.buffer)
  assert.equal(repeated.buffer, result.buffer, 'a server-optimized representation must not lose another generation of quality')
})

test('a missing encoder yields a safe optimization error, never a raw-upload fallback', async () => {
  const bytes = await fixture({ codec: 'mpeg4' })
  const tools = await mkdtemp(join(dir, 'tools-'))
  const probe = execFileSync('sh', ['-c', 'command -v ffprobe'], { encoding: 'utf8' }).trim()
  await symlink(probe, join(tools, 'ffprobe'))
  const path = process.env.PATH
  try {
    process.env.PATH = tools
    await assert.rejects(() => optimizePlaybackVideo(bytes), {
      code: 'OPTIMIZATION_FAILED',
      message: 'The video could not be optimized. Please try another video.',
    })
  } finally {
    process.env.PATH = path
  }
})

test('a valid 100MiB original is accepted and optimized; oversized originals fail before probing', async () => {
  const base = await fixture({ codec: 'mpeg4', size: '32x32', fps: 1 })
  const bytes = Buffer.alloc(VIDEO_MAX_UPLOAD_BYTES)
  base.copy(bytes)
  bytes.writeUInt32BE(bytes.length - base.length, base.length)
  bytes.write('free', base.length + 4, 'ascii')
  assert.equal((await inspectVideo(bytes)).duration, 1)
  const result = await optimizePlaybackVideo(bytes)
  assert.ok(result.buffer.length < bytes.length / 10)
  await assert.rejects(() => inspectVideo(Buffer.alloc(VIDEO_MAX_UPLOAD_BYTES + 1)), { code: 'VIDEO_TOO_LARGE' })
})

test('corrupt videos fail with safe errors, not tool details or filesystem paths', async () => {
  await assert.rejects(() => optimizePlaybackVideo(Buffer.from('not-a-video')), error => {
    assert.ok(error instanceof MediaPolicyError)
    assert.equal(error.code, 'INVALID_VIDEO')
    assert.equal(error.message, 'This video could not be processed. Please try another video.')
    return true
  })
})

test('editor trims cannot hide a corrupt tail with otherwise readable video metadata', async () => {
  const damaged = execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10',
    '-t', '5', '-c:v', 'mpeg4', '-q:v', '6', '-threads', '2',
    '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1',
  ], { maxBuffer: 50_000_000, timeout: 120000 })
  let last
  for (let offset = 0; offset + 8 <= damaged.length;) {
    const size = damaged.readUInt32BE(offset)
    assert.ok(size >= 8 && offset + size <= damaged.length)
    if (damaged.toString('ascii', offset + 4, offset + 8) === 'mdat') last = { offset, size }
    offset += size
  }
  assert.ok(last)
  damaged.fill(0, last.offset + Math.floor(last.size * 0.3), last.offset + Math.floor(last.size * 0.8))
  assert.equal((await inspectVideo(damaged)).duration, 5)
  await assert.rejects(() => processGlimpseVideo(damaged, { start: 0, end: 0.5, speed: 1, filter: 'none' }), { code: 'INVALID_VIDEO' })
})

test('mutating a processor result invalidates its trusted handoff', async () => {
  const source = await fixture({ codec: 'mpeg4' })
  const result = await optimizePlaybackVideo(source)
  result.buffer.fill(0)
  await assert.rejects(() => optimizePlaybackVideo(result.buffer), { code: 'INVALID_VIDEO' })
})

test('compliant trailing-moov MP4 is remuxed losslessly rather than reencoded', async () => {
  const source = await fixture({ faststart: false, audio: true })
  const before = await inspectVideo(source)
  const result = await optimizePlaybackVideo(source)
  const after = await inspectVideo(result.buffer)
  assert.equal(result.optimizationStatus, 'remuxed')
  assert.equal(after.video.bit_rate, before.video.bit_rate)
  assert.equal(after.audio[0].bit_rate, before.audio[0].bit_rate)
  assert.equal(after.duration, before.duration)
})

test('intentional editor trim and slow playback preserve the selected duration and audio', async () => {
  const source = await fixture({ duration: 3, audio: true })
  const result = await processGlimpseVideo(source, { start: 1, end: 2, speed: 0.5, filter: 'none' })
  const info = await inspectVideo(result.buffer)
  assert.ok(Math.abs(info.duration - 2) < 0.15)
  assert.equal(info.audio[0].codec_name, 'aac')
})