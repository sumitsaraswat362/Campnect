import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'
import express from 'express'

const apiRoot = fileURLToPath(new URL('..', import.meta.url))
const routeEntry = fileURLToPath(new URL('../src/legacy-routes/media.ts', import.meta.url))

function mediaRouteMocks() {
  return {
    name: 'media-delivery-test-mocks',
    setup(buildApi) {
      const mocks = {
        db: `
          export async function queryOne(sql, params) {
            return globalThis.__mediaDeliveryHarness.queryOne(sql, params)
          }
        `,
        auth: `
          export function optionalAuth(req, _res, next) {
            // Test-only identity injection; no session token or real claim is used.
            const userId = req.get('x-test-viewer')
            req.user = userId ? { userId } : null
            next()
          }
        `,
        media: `export function verifyMediaAccess() { return null }`,
        imageProcessing: `export async function makeJpegDownload(bytes) { return bytes }`,
        storage: `
          export async function createStoredMediaAccessUrl(bucket, path) {
            const harness = globalThis.__mediaDeliveryHarness
            harness.storageCalls.push({ bucket, path })
            if (harness.storageFailure) throw new Error('simulated Storage outage')
            return harness.storageDestination
          }
          export async function readStoredMedia() {
            throw new Error('readStoredMedia is not configured in this route test')
          }
        `,
      }
      const imports = [
        [/legacy-db\/index\.js$/, 'db'],
        [/legacy-middleware\/auth\.js$/, 'auth'],
        [/legacy-services\/media\.js$/, 'media'],
        [/legacy-services\/imageProcessing\.js$/, 'imageProcessing'],
        [/legacy-services\/supabaseStorage\.js$/, 'storage'],
      ]
      for (const [filter, key] of imports) {
        buildApi.onResolve({ filter }, () => ({ path: key, namespace: 'media-test' }))
      }
      buildApi.onLoad({ filter: /.*/, namespace: 'media-test' }, args => ({
        contents: mocks[args.path],
        loader: 'js',
      }))
    },
  }
}

function createHarness() {
  const harness = {
    assets: new Map(),
    bytes: new Map(),
    messages: new Set(),
    posts: new Map(),
    glimpses: new Map(),
    queries: [],
    storageCalls: [],
    storageFailure: false,
    storageDestination: 'https://storage.test/signed/private-object?token=test-capability',
    queryOne(sql, params = []) {
      this.queries.push({ sql, params })
      if (sql.includes('SELECT mime_type, original_name, byte_size, checksum, purpose')) {
        const asset = this.assets.get(params[0])
        return asset ? { ...asset, is_verification_media: false } : null
      }
      if (sql.includes('FROM conversation_members cm')) {
        return this.messages.has(`${params[1]}:${params[0]}`) ? { ok: 1 } : null
      }
      if (sql.includes('FROM posts p JOIN users u ON u.id=p.user_id')) {
        return this.posts.get(params[0]) || null
      }
      if (sql.includes('FROM posts p') && sql.includes("p.type = 'glimpse'")) {
        return this.glimpses.get(params[0]) || null
      }
      if (sql.includes('SELECT octet_length(data) AS byte_size')) {
        return { byte_size: this.bytes.get(params[0])?.length || 0 }
      }
      if (sql.includes('substring(data FROM $2 FOR $3)')) {
        const data = this.bytes.get(params[0])
        const start = Number(params[1]) - 1
        const length = Number(params[2])
        return { data: data?.subarray(start, start + length) }
      }
      if (sql.includes('SELECT data FROM media_assets WHERE id=$1')) {
        return { data: this.bytes.get(params[0]) }
      }
      if (sql.includes("SELECT 1 FROM posts WHERE id = $1 AND visibility = 'public'")) {
        return { ok: 1 }
      }
      throw new Error(`Unexpected read in media route test: ${sql}`)
    },
  }
  globalThis.__mediaDeliveryHarness = harness
  return harness
}

function addAsset(harness, id, overrides = {}) {
  const bytes = Buffer.from(Array.from({ length: 64 }, (_, index) => index))
  harness.bytes.set(id, bytes)
  harness.assets.set(id, {
    mime_type: 'video/mp4',
    original_name: 'test.mp4',
    byte_size: bytes.length,
    checksum: `checksum-${id}`,
    purpose: 'clip_media',
    entity_id: `entity-${id}`,
    owner_id: 'creator',
    storage_bucket: 'private-media',
    storage_path: `clips/${id}/video.mp4`,
    storage_status: 'storage_ready',
    ...overrides,
  })
  return bytes
}

function addPublicClipPost(harness, entityId) {
  harness.posts.set(entityId, {
    visibility: 'public',
    user_id: 'creator',
    college_id: 'campus-1',
    type: 'reel',
    moderation_status: 'approved',
    discovery_restricted: 0,
    is_private: 0,
    moderation_hidden: 0,
    blocked: 0,
    follows_author: 0,
  })
}

test('media delivery route preserves Storage, BYTEA Range/ETag, and private authorization behavior', async t => {
  const tempDir = await mkdtemp(join(apiRoot, '.media-delivery-test-'))
  const routeBundle = join(tempDir, 'media-route.mjs')
  const originalInfo = console.info
  const originalWarn = console.warn
  console.info = () => {}
  console.warn = () => {}

  let server
  let harness
  try {
    await build({
      entryPoints: [routeEntry],
      outfile: routeBundle,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      plugins: [mediaRouteMocks()],
      logLevel: 'silent',
    })
    const { mediaRouter } = await import(pathToFileURL(routeBundle).href)
    const app = express()
    app.use('/api/media', mediaRouter)
    server = createServer(app)
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    const baseUrl = `http://127.0.0.1:${address.port}/api/media`
    harness = createHarness()

    await t.test('private media authorization gates the signed Storage redirect', async () => {
      const id = 'private-message-asset'
      addAsset(harness, id, {
        purpose: 'message_media',
        entity_id: 'private-message',
      })
      harness.messages.add('member:private-message')

      const anonymous = await fetch(`${baseUrl}/${id}`, { redirect: 'manual' })
      assert.equal(anonymous.status, 401)
      assert.equal(anonymous.headers.get('location'), null)

      const otherViewer = await fetch(`${baseUrl}/${id}`, {
        headers: { 'x-test-viewer': 'not-a-member' },
        redirect: 'manual',
      })
      assert.equal(otherViewer.status, 403)
      assert.equal(otherViewer.headers.get('location'), null)

      const member = await fetch(`${baseUrl}/${id}`, {
        headers: { 'x-test-viewer': 'member' },
        redirect: 'manual',
      })
      assert.equal(member.status, 302)
      assert.equal(member.headers.get('location'), harness.storageDestination)
      assert.equal(member.headers.get('cache-control'), 'private, no-store')
      assert.equal(member.headers.get('etag'), `"checksum-${id}"`)
      assert.equal(member.headers.get('accept-ranges'), 'bytes')
      assert.doesNotMatch(await member.text(), /private-media|clips\/private-message-asset\/video\.mp4/)
      assert.equal(harness.queries.some(({ sql }) => sql.includes('SELECT data FROM media_assets')), false)
    })

    await t.test('Clip and Glimpse assets retain the /api/media/:id Storage redirect contract', async () => {
      const clipId = 'migrated-clip-asset'
      addAsset(harness, clipId, { entity_id: 'migrated-clip' })
      addPublicClipPost(harness, 'migrated-clip')
      const clipResponse = await fetch(`${baseUrl}/${clipId}`, {
        headers: { 'x-test-viewer': 'creator' },
        redirect: 'manual',
      })
      assert.equal(clipResponse.status, 302)
      assert.equal(clipResponse.headers.get('location'), harness.storageDestination)
      assert.doesNotMatch(await clipResponse.text(), /private-media|clips\/migrated-clip-asset\/video\.mp4/)

      const glimpseId = 'migrated-glimpse-asset'
      addAsset(harness, glimpseId, {
        purpose: 'glimpse',
        entity_id: 'migrated-glimpse',
      })
      harness.glimpses.set('migrated-glimpse', {
        user_id: 'creator',
        visibility: 'public',
        moderation_status: 'approved',
        discovery_restricted: 0,
        creator_college_id: 'campus-1',
        is_private: 0,
        viewer_college_id: 'campus-1',
        viewer_username: 'viewer',
        is_following: 0,
        is_blocked: 0,
      })
      const glimpseResponse = await fetch(`${baseUrl}/${glimpseId}`, {
        headers: { 'x-test-viewer': 'viewer' },
        redirect: 'manual',
      })
      assert.equal(glimpseResponse.status, 302)
      assert.equal(glimpseResponse.headers.get('location'), harness.storageDestination)
      assert.doesNotMatch(await glimpseResponse.text(), /private-media|clips\/migrated-glimpse-asset\/video\.mp4/)
    })

    await t.test('Storage failure serves only the requested BYTEA video range, even with a matching ETag', async () => {
      harness.queries.length = 0
      harness.storageCalls.length = 0
      harness.storageFailure = true
      const id = 'range-fallback-asset'
      const bytes = addAsset(harness, id, { entity_id: 'range-fallback-clip' })
      addPublicClipPost(harness, 'range-fallback-clip')

      const response = await fetch(`${baseUrl}/${id}`, {
        headers: {
          'x-test-viewer': 'creator',
          Range: 'bytes=5-10',
          'If-None-Match': `"checksum-${id}"`,
        },
        redirect: 'manual',
      })
      assert.equal(response.status, 206)
      assert.match(response.headers.get('content-type') || '', /^video\/mp4\b/)
      assert.equal(response.headers.get('content-range'), `bytes 5-10/${bytes.length}`)
      assert.equal(response.headers.get('content-length'), '6')
      assert.equal(response.headers.get('accept-ranges'), 'bytes')
      assert.equal(response.headers.get('etag'), `"checksum-${id}"`)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(5, 11))

      const rangeReads = harness.queries.filter(({ sql }) => sql.includes('substring(data FROM $2 FOR $3)'))
      assert.equal(rangeReads.length, 1)
      assert.deepEqual(rangeReads[0].params, [id, 6, 6])
      assert.equal(harness.queries.some(({ sql }) => sql.includes('SELECT data FROM media_assets')), false)
      assert.equal(harness.storageCalls.length, 1)
    })

    await t.test('normal non-Range fallback serves complete bytes and matching ETag revalidation returns 304', async () => {
      harness.queries.length = 0
      const id = 'full-fallback-asset'
      const bytes = addAsset(harness, id, { entity_id: 'full-fallback-clip' })
      addPublicClipPost(harness, 'full-fallback-clip')

      const full = await fetch(`${baseUrl}/${id}`, {
        headers: { 'x-test-viewer': 'creator' },
        redirect: 'manual',
      })
      assert.equal(full.status, 200)
      assert.equal(full.headers.get('content-length'), String(bytes.length))
      assert.equal(full.headers.get('accept-ranges'), 'bytes')
      assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes)
      assert.equal(harness.queries.some(({ sql }) => sql.includes('SELECT data FROM media_assets')), true)

      harness.queries.length = 0
      const revalidated = await fetch(`${baseUrl}/${id}`, {
        headers: {
          'x-test-viewer': 'creator',
          'If-None-Match': `"checksum-${id}"`,
        },
        redirect: 'manual',
      })
      assert.equal(revalidated.status, 304)
      assert.equal(revalidated.headers.get('etag'), `"checksum-${id}"`)
      assert.equal(revalidated.headers.get('cache-control'), 'private, max-age=0, must-revalidate')
      assert.equal(harness.queries.some(({ sql }) =>
        sql.includes('octet_length(data)') ||
        sql.includes('substring(data FROM $2 FOR $3)') ||
        sql.includes('SELECT data FROM media_assets'),
      ), false)
    })
  } finally {
    if (server?.listening) {
      await new Promise(resolve => server.close(resolve))
    }
    delete globalThis.__mediaDeliveryHarness
    console.info = originalInfo
    console.warn = originalWarn
    await rm(tempDir, { recursive: true, force: true })
  }
})