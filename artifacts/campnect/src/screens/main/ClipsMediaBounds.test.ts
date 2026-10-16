import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { clipMountedWindow } from '../../hooks/useClipPlayback'

const screenSource = await readFile(new URL('./ClipsScreen.tsx', import.meta.url), 'utf8')

test('Clips mounts no more than the active item, one previous item, and two upcoming items', () => {
  for (let length = 0; length <= 40; length += 1) {
    for (let active = 0; active < Math.max(1, length); active += 1) {
      const mounted = clipMountedWindow(active, length)
      assert.ok(mounted.length <= 4, `length=${length}, active=${active}: ${mounted}`)
      assert.deepEqual(mounted, length
        ? Array.from(
          { length: Math.min(length - 1, active + 2) - Math.max(0, active - 1) + 1 },
          (_, offset) => Math.max(0, active - 1) + offset,
        )
        : [])
    }
  }
})

test('Clips JSX limits automatic preparation and assigned video src values to at most two items', () => {
  assert.match(
    screenSource,
    /mounted=\{clipMountedWindow\(active, clips\.length\)\.includes\(i\)\}/,
  )
  assert.match(
    screenSource,
    /preloadMode=\{i === active \|\| i === active \+ 1 \? 'auto' : 'metadata'\}/,
  )
  assert.match(
    screenSource,
    /src=\{active \|\| \(preloadMode === 'auto' && prepared\) \? clip\.media\?\.\[0\] : undefined\}/,
  )
})