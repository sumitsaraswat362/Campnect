import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const mountedWindowSource = readFileSync(new URL('../../hooks/useClipPlayback.ts', import.meta.url), 'utf8')
const preparationSource = readFileSync(new URL('../../hooks/useClipPreloadScheduler.ts', import.meta.url), 'utf8')
const clipViewSource = readFileSync(new URL('./ClipsScreen.tsx', import.meta.url), 'utf8')
const uploadSource = readFileSync(new URL('../../api/clips.ts', import.meta.url), 'utf8')
const clipCreatorSource = readFileSync(new URL('./ClipCreateScreen.tsx', import.meta.url), 'utf8')
const glimpseCreatorSource = readFileSync(new URL('./CreatePostScreen.tsx', import.meta.url), 'utf8')

test('Clips keep at most four mounted video elements around the active index', () => {
  assert.match(mountedWindowSource, /Math\.max\(0,\s*active\s*-\s*1\)/)
  assert.match(mountedWindowSource, /Math\.min\(length\s*-\s*1,\s*active\s*\+\s*2\)/)
  assert.match(clipViewSource, /mounted=\{clipMountedWindow\(active,\s*clips\.length\)\.includes\(i\)\}/)
})

test('Clips give network-capable sources only to active and immediate-next videos', () => {
  assert.match(preparationSource, /const ordered = \[active,\s*active \+ 1\]/)
  assert.match(clipViewSource, /src=\{active \|\| \(preloadMode === 'auto' && prepared\) \? clip\.media\?\.\[0\] : undefined\}/)
  assert.match(clipViewSource, /mounted neighbors deliberately have no src/)
})

test('Clip uploads preserve the server-negotiated 4 MiB chunk protocol and byte-preserving retries', () => {
  assert.match(uploadSource, /chunk_size:\s*number/)
  assert.match(uploadSource, /index \* upload\.chunk_size/)
  assert.match(uploadSource, /video\.slice\(start,\s*Math\.min\(video\.size,\s*start \+ upload\.chunk_size\),\s*'application\/octet-stream'\)/)
  assert.match(uploadSource, /\/clips\/uploads\/\$\{upload\.id\}\/chunks\/\$\{index\}/)
  assert.match(uploadSource, /retryUploadRequest/)
})

test('video normalization and recovery validate original and normalized duration instead of trimming long sources', () => {
  assert.match(clipCreatorSource, /sourceError = await mediaUploadError\(file,\s*'video'\)/)
  assert.match(clipCreatorSource, /normalizedError = await mediaUploadError\(normalized,\s*'video'\)/)
  assert.match(glimpseCreatorSource, /sourceError = await mediaUploadError\(file,\s*'video'\)/)
  assert.match(glimpseCreatorSource, /normalizedError = await mediaUploadError\(normalized,\s*'video'\)/)
  assert.match(glimpseCreatorSource, /if \(d > VIDEO_MAX_DURATION_SECONDS\)/)
})