import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'
import { fileTypeFromBuffer } from 'file-type'
import { build } from 'esbuild'

const apiRoot = fileURLToPath(new URL('..', import.meta.url))
const mediaServiceEntry = fileURLToPath(new URL('../src/legacy-services/media.ts', import.meta.url))
const imageProcessingEntry = fileURLToPath(new URL('../src/legacy-services/imageProcessing.ts', import.meta.url))
const videoProcessingEntry = fileURLToPath(new URL('../src/legacy-services/videoProcessing.ts', import.meta.url))
const photoMaxBytes = 25 * 1024 * 1024

let buildDir
let fixtureDir
let storeMediaAsset
let makeJpegDownload
let processGlimpseVideo
let inspectVideo
let baseJpeg
let animatedGif
let audioBytes
let portraitInput
let harness
let previousNodeEnv

function mockStorage() {
  return {
    name: 'media-store-storage-test-double',
    setup(buildApi) {
      buildApi.onResolve({ filter: /supabaseStorage\.js$/ }, () => ({
        path: 'supabase-storage',
        namespace: 'media-store-test',
      }))
      buildApi.onLoad({ filter: /.*/, namespace: 'media-store-test' }, () => ({
        contents: `
          export function mediaStorageLocation(id, purpose, mimeType) {
            return { bucket: 'test-private-media', path: 'test/' + purpose + '/' + id + '/' + mimeType }
          }
          export async function uploadStoredMedia(input) {
            globalThis.__mediaStoreHarness.events.push({ type: 'storage-upload', input })
            globalThis.__mediaStoreHarness.uploads.push(input)
          }
          export async function deleteStoredMedia() {}
        `,
        loader: 'js',
      }))
    },
  }
}

function createTransaction() {
  return {
    events: harness.events,
    inserted: null,
    async one(sql, params = []) {
      if (sql.includes('SELECT id') && sql.includes('FROM media_assets')) {
        this.events.push({ type: 'existing-asset-lookup', sql, params })
        return null
      }
      if (sql.includes('INSERT INTO media_assets')) {
        this.events.push({ type: 'metadata-insert', sql, params })
        this.inserted = { sql, params }
        return { id: params[0] }
      }
      throw new Error(`Unexpected transaction query in media-store test: ${sql}`)
    },
    async run(sql) {
      throw new Error(`Unexpected transaction write in media-store test: ${sql}`)
    },
  }
}

async function store(fileBuffer, mimeType, originalName, extraFileFields = {}) {
  const tx = createTransaction()
  const url = await storeMediaAsset(
    tx,
    { buffer: fileBuffer, mimetype: mimeType, originalname: originalName, ...extraFileFields },
    'test-owner',
    'test-image',
    'test-entity',
  )
  return { tx, url }
}

before(async () => {
  previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  buildDir = await mkdtemp(join(apiRoot, '.media-store-test-'))
  fixtureDir = await mkdtemp(join(tmpdir(), 'campnect-media-store-fixtures-'))
  // One bundle entry shares videoProcessing's module-scoped WeakMap between
  // processGlimpseVideo and the optimizer called by storeMediaAsset.
  await build({
    stdin: {
      contents: `
        export { storeMediaAsset } from ${JSON.stringify(mediaServiceEntry)}
        export { makeJpegDownload } from ${JSON.stringify(imageProcessingEntry)}
        export { processGlimpseVideo, inspectVideo } from ${JSON.stringify(videoProcessingEntry)}
      `,
      resolveDir: apiRoot,
      sourcefile: 'mediaStoreHarness.ts',
      loader: 'ts',
    },
    outfile: join(buildDir, 'mediaStoreHarness.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    plugins: [mockStorage()],
    logLevel: 'silent',
  })
  const mediaHarnessModule = await import(pathToFileURL(join(buildDir, 'mediaStoreHarness.mjs')).href)
  storeMediaAsset = mediaHarnessModule.storeMediaAsset
  makeJpegDownload = mediaHarnessModule.makeJpegDownload
  processGlimpseVideo = mediaHarnessModule.processGlimpseVideo
  inspectVideo = mediaHarnessModule.inspectVideo
  harness = { events: [], uploads: [] }
  globalThis.__mediaStoreHarness = harness

  const jpegPath = join(fixtureDir, 'base.jpg')
  execFileSync('magick', ['-size', '32x24', 'xc:red', jpegPath], { stdio: 'ignore' })
  baseJpeg = await readFile(jpegPath)

  const gifPath = join(fixtureDir, 'animated.gif')
  execFileSync('magick', [
    '-delay', '10', '-size', '16x12', 'xc:red',
    '-delay', '10', '-size', '16x12', 'xc:blue',
    '-loop', '0', gifPath,
  ], { stdio: 'ignore' })
  animatedGif = await readFile(gifPath)

  const audioPath = join(fixtureDir, 'valid-audio.mp3')
  execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
    '-t', '0.12', '-c:a', 'libmp3lame', '-b:a', '32k', '-f', 'mp3', audioPath,
  ], { stdio: 'ignore', timeout: 30_000 })
  audioBytes = await readFile(audioPath)

  const portraitPath = join(fixtureDir, 'high-complexity-portrait.mp4')
  execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i',
    'testsrc2=size=540x960:rate=24,noise=alls=80:allf=t+u',
    '-t', '2', '-c:v', 'mpeg4', '-q:v', '2', '-threads', '2',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', portraitPath,
  ], { stdio: 'ignore', timeout: 60_000 })
  portraitInput = await readFile(portraitPath)
})

after(async () => {
  delete globalThis.__mediaStoreHarness
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = previousNodeEnv
  if (buildDir) await rm(buildDir, { recursive: true, force: true })
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true })
})

test('actual storeMediaAsset optimizes JPEGs up to and including the 25 MiB original limit', async t => {
  assert.equal((await fileTypeFromBuffer(baseJpeg))?.mime, 'image/jpeg')
  for (const [label, inputLength] of [
    ['24.9 MiB', Math.floor(24.9 * 1024 * 1024)],
    ['25 MiB', photoMaxBytes],
  ]) {
    await t.test(`${label} source is accepted and the optimized WebP representation is uploaded`, async () => {
      harness.events.length = 0
      harness.uploads.length = 0
      const input = Buffer.alloc(inputLength)
      baseJpeg.copy(input)
      const { tx, url } = await store(input, 'image/jpeg', `${label}.jpg`)
      const uploadedBytes = harness.uploads[0].bytes

      assert.match(url, /^\/api\/media\/[0-9a-f-]{36}$/i)
      assert.equal(tx.inserted.params[5].length, 0)
      assert.notEqual(uploadedBytes, input)
      assert.equal(tx.inserted.params[6], 'image/webp')
      assert.equal(tx.inserted.params[8], uploadedBytes.length)
      assert.equal(tx.inserted.params[10], 'image/jpeg')
      assert.equal(tx.inserted.params[11], inputLength)
      assert.equal(tx.inserted.params[12], 'optimized')
      assert.equal(harness.uploads[0].mimeType, 'image/webp')
      assert.equal((await fileTypeFromBuffer(uploadedBytes))?.mime, 'image/webp')
      assert.deepEqual(harness.events.map(event => event.type), [
        'existing-asset-lookup',
        'storage-upload',
        'metadata-insert',
      ])
    })
  }
})

test('25 MiB plus one byte is rejected before Storage upload or metadata insert', async () => {
  harness.events.length = 0
  harness.uploads.length = 0
  const oversized = Buffer.alloc(photoMaxBytes + 1)
  baseJpeg.copy(oversized)

  await assert.rejects(
    () => store(oversized, 'image/jpeg', 'too-large.jpg'),
    error => {
      assert.equal(error.code, 'PHOTO_TOO_LARGE')
      assert.equal(error.status, 413)
      assert.equal(error.message, 'Photo must be 25 MB or smaller.')
      return true
    },
  )
  assert.equal(harness.uploads.length, 0)
  assert.deepEqual(harness.events, [])
})

test('malformed MP4 input is rejected before Storage upload or metadata insert', async () => {
  harness.events.length = 0
  harness.uploads.length = 0
  const invalidVideo = Buffer.from([
    0, 0, 0, 24, ...Buffer.from('ftypisom'),
    0, 0, 0, 0, 0, 0, 0, 0,
  ])
  assert.equal((await fileTypeFromBuffer(invalidVideo))?.mime, 'video/mp4')

  await assert.rejects(
    () => store(invalidVideo, 'video/mp4', 'broken.mp4', { campnectDeliveryOptimized: true }),
    error => {
      assert.equal(error.code, 'INVALID_VIDEO')
      assert.equal(error.message, 'This video could not be processed. Please try another video.')
      return true
    },
  )
  assert.equal(harness.uploads.length, 0)
  assert.deepEqual(harness.events, [])
})

test('valid audio stays byte-for-byte original and bypasses image/video optimizers', async () => {
  harness.events.length = 0
  harness.uploads.length = 0
  assert.equal((await fileTypeFromBuffer(audioBytes))?.mime, 'audio/mpeg')
  const { tx } = await store(audioBytes, 'audio/mpeg', 'voice.mp3')

  assert.equal(tx.inserted.params[5].length, 0)
  assert.equal(tx.inserted.params[6], 'audio/mpeg')
  assert.equal(tx.inserted.params[8], audioBytes.length)
  assert.equal(tx.inserted.params[10], null)
  assert.equal(tx.inserted.params[11], null)
  assert.equal(tx.inserted.params[12], null)
  assert.equal(harness.uploads[0].bytes, audioBytes)
})

test('animated GIF upload preserves all frames, and JPEG download conversion remains available', async () => {
  harness.events.length = 0
  harness.uploads.length = 0
  assert.equal((await fileTypeFromBuffer(animatedGif))?.mime, 'image/gif')
  const { tx } = await store(animatedGif, 'image/gif', 'animated.gif')

  assert.equal(tx.inserted.params[5].length, 0)
  assert.equal(tx.inserted.params[6], 'image/gif')
  assert.equal(tx.inserted.params[12], 'original')
  assert.equal(harness.uploads[0].bytes, animatedGif)
  const storedGifPath = join(fixtureDir, 'stored.gif')
  await writeFile(storedGifPath, harness.uploads[0].bytes)
  const frames = execFileSync('magick', ['identify', '-format', '%f\\n', storedGifPath], { encoding: 'utf8' })
    .trim().split(/\r?\n/)
  assert.equal(frames.length, 2)

  const jpegDownload = await makeJpegDownload(animatedGif, 'image/gif')
  assert.equal((await fileTypeFromBuffer(jpegDownload))?.mime, 'image/jpeg')
})

test('the same bundled video-processing handoff stores the exact portrait editor output without another encode', async () => {
  harness.events.length = 0
  harness.uploads.length = 0
  const processed = await processGlimpseVideo(portraitInput, {
    start: 0.1,
    end: 1.9,
    maxDuration: 60,
    speed: 1,
    filter: 'none',
    preserveOriginal: false,
  })
  const metadata = await inspectVideo(processed.buffer)

  assert.equal(processed.optimizationStatus, 'optimized')
  assert.equal(metadata.video.codec_name, 'h264')
  assert.ok(metadata.video.height > metadata.video.width, 'fixture output must remain portrait')
  // This short high-complexity encode reports above the ordinary delivery
  // bitrate threshold, so a fresh optimizer pass would perform another encode.
  assert.ok(Number(metadata.video.bit_rate) > 1_600_000)

  const { tx } = await store(processed.buffer, 'video/mp4', 'processed-portrait.mp4')
  assert.equal(harness.uploads.length, 1)
  assert.equal(harness.uploads[0].bytes, processed.buffer, 'Storage must receive the exact processed Buffer instance')
  assert.equal(tx.inserted.params[5].length, 0)
  assert.equal(tx.inserted.params[6], 'video/mp4')
  assert.equal(tx.inserted.params[8], processed.buffer.length)
  assert.equal(tx.inserted.params[10], 'video/mp4')
  assert.equal(tx.inserted.params[11], processed.buffer.length)
  assert.equal(tx.inserted.params[12], 'optimized')
})