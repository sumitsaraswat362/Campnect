import assert from 'node:assert/strict'
import test from 'node:test'
import { formatChatDateDivider, formatChatLastSeen, formatChatMessageTime, getChatDateGroup, parseServerTimestamp } from './chatTimestamp'

test('formats a timezone-qualified server timestamp once in the device timezone', () => {
  assert.equal(formatChatMessageTime('2026-09-09T00:30:00.000Z', 'America/Los_Angeles'), '5:30 PM')
  assert.equal(parseServerTimestamp('2026-09-09T00:30:00.000Z').toISOString(), '2026-09-09T00:30:00.000Z')
})

test('groups near-midnight timestamps by local calendar day', () => {
  const now = new Date('2026-09-09T06:00:00.000Z')
  assert.equal(getChatDateGroup('2026-09-09T00:30:00.000Z', now, 'Asia/Kolkata'), 'today')
  assert.equal(getChatDateGroup('2026-09-08T00:30:00.000Z', now, 'Asia/Kolkata'), 'yesterday')
  assert.equal(formatChatDateDivider('2026-09-09T00:30:00.000Z', now, 'Asia/Kolkata'), 'Today')
})

test('uses the correct daylight-saving local clock time and safe invalid fallbacks', () => {
  assert.equal(formatChatMessageTime('2026-07-01T12:00:00.000Z', 'America/Los_Angeles'), '5:00 AM')
  assert.equal(formatChatMessageTime('not-a-timestamp', 'America/Los_Angeles'), 'Unknown time')
  assert.equal(formatChatLastSeen('not-a-timestamp'), 'Last seen recently')
})