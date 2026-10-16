import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('the main app scroller does not reserve a visible right-edge scrollbar', () => {
  const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
  const standardRule = css.match(/\.app-scroll-region\s*\{[^}]*\}/)?.[0] ?? ''
  const webkitRule = css.match(/\.app-scroll-region::\-webkit-scrollbar\s*\{[^}]*\}/)?.[0] ?? ''

  assert.match(standardRule, /scrollbar-width:\s*none/)
  assert.match(webkitRule, /display:\s*none/)
})