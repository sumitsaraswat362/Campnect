import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeOpenMojiSticker } from '../src/legacy-services/openmoji.ts'
import { normalizeGiphyMessageReference } from '../src/legacy-services/giphy.ts'

test('normalizes a valid curated OpenMoji sticker', () => {
  assert.equal(
    normalizeOpenMojiSticker(JSON.stringify({ stickerPack: 'openmoji', stickerId: '1F602' })),
    JSON.stringify({ stickerPack: 'openmoji', stickerId: '1F602' }),
  )
})

test('rejects malformed and unsupported sticker payloads', () => {
  assert.equal(normalizeOpenMojiSticker('not-json'), null)
  assert.equal(normalizeOpenMojiSticker(JSON.stringify({ stickerPack: 'openmoji', stickerId: 'NOT_REAL' })), null)
  assert.equal(normalizeOpenMojiSticker(JSON.stringify({ stickerPack: 'other-pack', stickerId: '1F602' })), null)
})

test('strips client-provided fields so a sticker cannot become a remote URL', () => {
  assert.equal(
    normalizeOpenMojiSticker({ stickerPack: 'openmoji', stickerId: '1F44D', assetUrl: 'https://untrusted.example/sticker.svg' }),
    JSON.stringify({ stickerPack: 'openmoji', stickerId: '1F44D' }),
  )
})

test('normalizes a GIPHY reference without persisting query data', () => {
  assert.equal(
    normalizeGiphyMessageReference({
      provider: 'giphy',
      providerId: 'abc123',
      renditionUrl: 'https://media2.giphy.com/media/v1.current-giphy-context/abc123/200w.webp?cid=public',
      width: 200,
      height: 120,
      altText: 'Happy reaction',
      creatorName: 'campnect-creator',
      creatorUrl: 'https://giphy.com/campnect-creator',
    }),
    JSON.stringify({
      provider: 'giphy',
      providerId: 'abc123',
      renditionUrl: 'https://media.giphy.com/media/abc123/200w.webp',
      width: 200,
      height: 120,
      altText: 'Happy reaction',
      creatorName: 'campnect-creator',
      creatorUrl: 'https://giphy.com/campnect-creator',
    }),
  )
})

test('rejects non-GIPHY, mismatched, and untrusted GIPHY message references', () => {
  const base = { provider: 'giphy', providerId: 'abc123', width: 200, height: 120, altText: 'Reaction', creatorName: 'creator', creatorUrl: 'https://giphy.com/creator' }
  assert.equal(normalizeGiphyMessageReference({ ...base, renditionUrl: 'https://example.com/media/abc123/200w.webp' }), null)
  assert.equal(normalizeGiphyMessageReference({ ...base, renditionUrl: 'https://media.giphy.com/media/v1.context/other-id/200w.webp' }), null)
  assert.equal(normalizeGiphyMessageReference({ ...base, renditionUrl: 'https://media.giphy.com/media/abc123/200w.webp', unsafeUrl: 'https://example.com' }), null)
})