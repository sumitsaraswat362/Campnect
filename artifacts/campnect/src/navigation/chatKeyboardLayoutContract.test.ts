import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const chatSource = readFileSync(
  new URL('../screens/main/ChatRoomScreen.tsx', import.meta.url),
  'utf8',
)
const globalStyles = readFileSync(
  new URL('../styles/globals.css', import.meta.url),
  'utf8',
)
const viewportSource = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8')

test('chat messages and composer render as independent sibling layers', () => {
  assert.match(chatSource, /className="chat-stage"/)
  assert.match(chatSource, /className="chat-message-viewport"/)
  assert.match(chatSource, /className="chat-composer-overlay"/)
  assert.match(globalStyles, /\.chat-message-viewport\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s)
  assert.match(globalStyles, /\.chat-composer-overlay\s*\{[^}]*position:\s*absolute;/s)
})

test('only the composer layer consumes the centralized full keyboard height', () => {
  assert.match(viewportSource, /--keyboard-height/)
  assert.match(viewportSource, /--stable-viewport-height/)
  assert.match(globalStyles, /\.chat-composer-overlay\s*\{[^}]*bottom:\s*var\(--keyboard-height\);/s)
  assert.doesNotMatch(globalStyles, /\.chat-room\s*\{[^}]*transform:/s)
  assert.doesNotMatch(globalStyles, /\.chat-message-viewport\s*\{[^}]*transform:/s)
})

test('composer growth changes message clearance without resizing the message viewport', () => {
  assert.match(chatSource, /--chat-composer-height/)
  assert.match(globalStyles, /var\(--chat-composer-height,\s*72px\)/)
  assert.doesNotMatch(chatSource, /className="chat-message-viewport"[^>]*flex:/s)
})

test('chat has no page-specific keyboard resize or scroll-restoration loop', () => {
  assert.doesNotMatch(chatSource, /visualViewport/)
  assert.doesNotMatch(chatSource, /window\.addEventListener\(['"]resize/)
  assert.doesNotMatch(chatSource, /keyboardWasOpen|transactionAnchor|restoreAnchor/)
  assert.match(chatSource, /campnect:keyboard-visibility/)
  assert.match(chatSource, /shouldAnchorLatestMessage/)
})
