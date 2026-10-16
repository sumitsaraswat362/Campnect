import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test, { after } from 'node:test'
import { build } from 'esbuild'
import express from 'express'
const apiDir = fileURLToPath(new URL('..', import.meta.url))

const apiSrc = new URL('../src/', import.meta.url)
const tempDir = await mkdtemp(join(apiDir, '.media-routes-test-'))
after(() => rm(tempDir, { recursive: true, force: true }))

const uploadBundlePath = join(tempDir, 'upload.mjs')
const limitsBundlePath = join(tempDir, 'limits.mjs')
await Promise.all([
  build({
    entryPoints: [fileURLToPath(new URL('../src/legacy-middleware/upload.ts', import.meta.url))],
    outfile: uploadBundlePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  }),
  build({
    entryPoints: [fileURLToPath(new URL('../src/legacy-services/mediaLimits.ts', import.meta.url))],
    outfile: limitsBundlePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  }),
])

const {
  assertImageMagic,
  assertMediaMagic,
  mediaUploadLimitError,
  sendMediaPolicyError,
  uploadAvatar,
  uploadPost,
} = await import(pathToFileURL(uploadBundlePath).href)
const { PHOTO_MAX_UPLOAD_BYTES, VIDEO_MAX_UPLOAD_BYTES } = await import(pathToFileURL(limitsBundlePath).href)

function pngBytes(length) {
  assert.ok(length >= 41)
  const bytes = Buffer.alloc(length)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(1, 16)
  bytes.writeUInt32BE(1, 20)
  bytes[24] = 8
  bytes[25] = 6
  bytes.writeUInt32BE(0, 33)
  bytes.write('IDAT', 37, 'ascii')
  return bytes
}

async function readSource(relativePath) {
  return readFile(new URL(relativePath, apiSrc), 'utf8')
}

function policyJson(res, error) {
  if (!sendMediaPolicyError(res, error)) return false
  return true
}

function testUploadApp() {
  const app = express()
  app.post('/mixed', uploadPost.single('media'), async (req, res) => {
    try {
      const mimeType = await assertMediaMagic(req.file)
      return res.json({ success: true, mimeType, bytes: req.file.buffer.length })
    } catch (error) {
      if (policyJson(res, error)) return
      return res.status(500).json({ success: false, error: 'Internal server error.' })
    }
  })
  app.post('/photo', uploadAvatar.single('avatar'), async (req, res) => {
    try {
      const mimeType = await assertImageMagic(req.file)
      return res.json({ success: true, mimeType, bytes: req.file.buffer.length })
    } catch (error) {
      if (policyJson(res, error)) return
      return res.status(500).json({ success: false, error: 'Internal server error.' })
    }
  })
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error)
    if (policyJson(res, error)) return
    const limitError = mediaUploadLimitError(error, req.path === '/photo')
    if (limitError) return policyJson(res, limitError)
    return next(error)
  })
  return app
}

async function upload(baseUrl, route, field, bytes, declaredMime, filename) {
  const form = new FormData()
  form.append(field, new Blob([bytes], { type: declaredMime }), filename)
  return fetch(`${baseUrl}${route}`, { method: 'POST', body: form })
}

test('route upload middleware validates signature-derived MIME and actual Buffer size', async t => {
  const server = createServer(testUploadApp())
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    await t.test('a spoofed video Content-Type cannot change an actual PNG classification', async () => {
      const bytes = pngBytes(128)
      const response = await upload(baseUrl, '/mixed', 'media', bytes, 'video/mp4', 'spoofed.mp4')
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), {
        success: true,
        mimeType: 'image/png',
        bytes: 128,
      })
    })

    await t.test('25 MiB photos are accepted; actual bytes above the limit fail even when file.size lies', async () => {
      const accepted = pngBytes(PHOTO_MAX_UPLOAD_BYTES)
      assert.equal(await assertImageMagic({
        buffer: accepted,
        size: 1,
        mimetype: 'video/mp4',
      }), 'image/png')

      const oversized = pngBytes(PHOTO_MAX_UPLOAD_BYTES + 1)
      await assert.rejects(
        () => assertMediaMagic({
          buffer: oversized,
          size: 1,
          mimetype: 'video/mp4',
        }),
        error => error.code === 'PHOTO_TOO_LARGE' &&
          error.status === 413,
      )
    })

    await t.test('image-only Multer overflow returns the stable photo policy payload', async () => {
      const response = await upload(
        baseUrl,
        '/photo',
        'avatar',
        pngBytes(PHOTO_MAX_UPLOAD_BYTES + 1),
        'image/png',
        'large.png',
      )
      assert.equal(response.status, 413)
      assert.deepEqual(await response.json(), {
        success: false,
        error: 'Photo must be 25 MB or smaller.',
        code: 'PHOTO_TOO_LARGE',
      })
    })

    await t.test('fileFilter rejections use safe stable media policy errors', async () => {
      const response = await upload(
        baseUrl,
        '/photo',
        'avatar',
        Buffer.from('not an image'),
        'video/mp4',
        'wrong-type.mp4',
      )
      assert.equal(response.status, 400)
      assert.deepEqual(await response.json(), {
        success: false,
        error: 'Only image files are allowed (jpg, png, webp, gif).',
        code: 'INVALID_IMAGE',
      })
    })

    await t.test('malformed magic bytes become safe 400 policy errors', async () => {
      await assert.rejects(
        () => assertImageMagic({ buffer: Buffer.from('not an image'), size: 12, mimetype: 'image/png' }),
        error => error.code === 'INVALID_IMAGE' && error.status === 400,
      )
      await assert.rejects(
        () => assertMediaMagic({ buffer: Buffer.from('not media'), size: 9, mimetype: 'video/mp4' }),
        error => error.code === 'INVALID_MEDIA' && error.status === 400,
      )
    })
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

test('Multer overflow categories return stable statuses and codes', () => {
  const multerError = { code: 'LIMIT_FILE_SIZE' }
  assert.deepEqual(
    (({ status, code, message }) => ({ status, code, message }))(mediaUploadLimitError(multerError, true)),
    { status: 413, code: 'PHOTO_TOO_LARGE', message: 'Photo must be 25 MB or smaller.' },
  )
  assert.deepEqual(
    (({ status, code, message }) => ({ status, code, message }))(mediaUploadLimitError(multerError, false, true)),
    { status: 413, code: 'VIDEO_TOO_LARGE', message: 'Video must be 100 MB or smaller.' },
  )
  assert.deepEqual(
    (({ status, code, message }) => ({ status, code, message }))(mediaUploadLimitError(multerError)),
    {
      status: 413,
      code: 'MEDIA_TOO_LARGE',
      message: 'Photos must be 25 MB or smaller; videos must be 100 MB or smaller.',
    },
  )
  assert.equal(mediaUploadLimitError({ code: 'LIMIT_UNEXPECTED_FILE' }), null)
  assert.equal(VIDEO_MAX_UPLOAD_BYTES, 100 * 1024 * 1024)

  let status = 0
  let body
  const response = {
    status(value) { status = value; return this },
    json(value) { body = value; return this },
  }
  assert.equal(sendMediaPolicyError(response, mediaUploadLimitError(multerError)), true)
  assert.equal(status, 413)
  assert.deepEqual(body, {
    success: false,
    error: 'Photos must be 25 MB or smaller; videos must be 100 MB or smaller.',
    code: 'MEDIA_TOO_LARGE',
  })
})

test('every legacy route upload maps to the expected Multer middleware ceiling', async () => {
  const middleware = await readSource('legacy-middleware/upload.ts')
  const limitsFor = (exportName, byteLimit) => {
    const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const block = middleware.match(new RegExp(`export const ${escaped} = multer\\(\\{([\\s\\S]*?)\\n\\}\\)`))
    assert.ok(block, `missing upload middleware ${exportName}`)
    assert.match(block[1], new RegExp(`fileSize:\\s*${byteLimit}(?:,|\\s*\\})`))
  }

  limitsFor('uploadAvatar', 'PHOTO_MAX_UPLOAD_BYTES')
  limitsFor('uploadCover', 'PHOTO_MAX_UPLOAD_BYTES')
  limitsFor('uploadVerify', 'PHOTO_MAX_UPLOAD_BYTES')
  limitsFor('uploadGroup', 'PHOTO_MAX_UPLOAD_BYTES')
  limitsFor('uploadPost', 'VIDEO_MAX_UPLOAD_BYTES')
  limitsFor('uploadStory', 'VIDEO_MAX_UPLOAD_BYTES')
  limitsFor('uploadMessage', 'VIDEO_MAX_UPLOAD_BYTES')

  const [posts, clips, glimpses, stories, chat, users, auth, events, groups, communities] = await Promise.all([
    readSource('legacy-routes/posts.ts'),
    readSource('legacy-routes/clips.ts'),
    readSource('legacy-routes/glimpses.ts'),
    readSource('legacy-routes/stories.ts'),
    readSource('legacy-routes/chat.ts'),
    readSource('legacy-routes/users.ts'),
    readSource('legacy-routes/auth.ts'),
    readSource('legacy-routes/events.ts'),
    readSource('legacy-routes/groups.ts'),
    readSource('legacy-routes/communities.ts'),
  ])

  assert.match(posts, /postsRouter\.post\('\/video-preview', requireAuth, uploadPost\.single\('media'\)/)
  assert.match(posts, /postsRouter\.post\('\/', requireAuth, uploadPost\.array\('media', 10\)/)
  assert.match(clips, /clipsRouter\.post\('\/', requireAuth, uploadPost\.single\('video'\)/)
  assert.match(clips, /const MAX_CLIP_BYTES = VIDEO_MAX_UPLOAD_BYTES/)
  assert.match(clips, /total_bytes > MAX_CLIP_BYTES/)
  assert.match(clips, /const CLIP_CHUNK_BYTES = 4 \* 1024 \* 1024/)
  assert.match(clips, /Math\.ceil\(total_bytes \/ CLIP_CHUNK_BYTES\)/)
  assert.match(clips, /raw\(\{ type: 'application\/octet-stream', limit: CLIP_CHUNK_BYTES \+ 1024 \}\)/)
  assert.match(clips, /end: VIDEO_MAX_DURATION_SECONDS,[\s\S]*?maxDuration: VIDEO_MAX_DURATION_SECONDS/)
  assert.match(clips, /validate and publish the complete[\s\S]*?duration/)
  assert.match(clips, /catch \{\s*throw new MediaPolicyError\('OPTIMIZATION_FAILED', 'The video could not be optimized\. Please try another video\.'\)/)
  assert.match(glimpses, /glimpsesRouter\.post\('\/', requireAuth, uploadPost\.array\('media', 1\)/)
  assert.match(glimpses, /const MAX_VIDEO_SECONDS = VIDEO_MAX_DURATION_SECONDS/)
  assert.match(stories, /storiesRouter\.post\('\/', requireAuth, uploadStory\.single\('media'\)/)
  assert.match(stories, /const isVideo\s*=\s*detected\.startsWith\('video\/'\)/)
  assert.match(glimpses, /const isVideo = detected\.startsWith\('video\/'\)/)
  assert.match(glimpses, /catch \{\s*throw new MediaPolicyError\('OPTIMIZATION_FAILED', 'The video could not be optimized\. Please try another video\.'\)/)
  assert.match(posts, /catch \{\s*throw new MediaPolicyError\('OPTIMIZATION_FAILED', 'The video could not be optimized\. Please try another video\.'\)/)
  assert.match(chat, /chatRouter\.post\('\/conversations\/:id\/messages', requireAuth, uploadMessage\.single\('media'\)/)
  assert.match(users, /usersRouter\.post\('\/me\/avatar', requireAuth, uploadAvatar\.single\('avatar'\)/)
  assert.match(users, /usersRouter\.post\('\/me\/cover', requireAuth, uploadCover\.single\('cover'\)/)
  assert.match(users, /usersRouter\.post\('\/me\/verify-college', requireAuth, uploadVerify\.single\('id_card'\)/)
  assert.match(auth, /authRouter\.post\('\/college-verify', requireAuth, uploadVerify\.fields/)
  assert.match(events, /eventsRouter\.post\('\/', requireAuth, uploadCover\.single\('cover'\)/)
  assert.match(events, /eventsRouter\.patch\('\/:id', requireAuth, uploadCover\.single\('cover'\)/)
  assert.match(groups, /groupsRouter\.post\('\/', requireAuth, uploadGroup\.single\('avatar'\)/)
  assert.match(groups, /groupsRouter\.patch\('\/:id', requireAuth, uploadGroup\.single\('avatar'\)/)
  assert.match(communities, /communitiesRouter\.patch\('\/:id', requireAuth, uploadGroup\.fields/)
})