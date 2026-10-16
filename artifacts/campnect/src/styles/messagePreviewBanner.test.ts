import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('message preview banner is positioned below the shared top bar', () => {
  const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
  const bannerRule = css.match(/\.message-preview-banner\s*\{[^}]*\}/)?.[0] ?? ''
  const enterKeyframes = css.match(/@keyframes messagePreviewIn\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
  const exitKeyframes = css.match(/@keyframes messagePreviewOut\s*\{[\s\S]*?\n\}/)?.[0] ?? ''

  assert.match(bannerRule, /top:\s*max\(12px,\s*calc\(var\(--topbar-h\)\s*\+\s*var\(--sat\)\s*\+\s*12px\)\)/)
  assert.doesNotMatch(enterKeyframes, /translateY/)
  assert.doesNotMatch(exitKeyframes, /translateY/)
})