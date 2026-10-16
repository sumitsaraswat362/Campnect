import assert from 'node:assert/strict'
import test from 'node:test'
import { isConversationMemberOnline, reconcileFetchedConversationPresence, updateConversationPresence } from './chatPresence'

const conversations = [{
  id: 'conversation-1',
  members: [
    { id: 'friend', is_online: 1, last_seen: '2026-09-04T18:50:00.000Z' },
    { id: 'viewer', is_online: 1, last_seen: '2026-09-04T18:55:00.000Z' },
  ],
}]

test('offline presence replaces stale last seen with the persisted disconnect time', () => {
  const lastSeen = '2026-09-05T04:00:00.000Z'
  const next = updateConversationPresence(conversations, 'friend', false, lastSeen)

  assert.equal(next[0].members[0].is_online, 0)
  assert.equal(next[0].members[0].last_seen, lastSeen)
  assert.equal(next[0].members[1], conversations[0].members[1])
})

test('online presence updates member state without inventing a last-seen time', () => {
  const next = updateConversationPresence(conversations, 'friend', true)

  assert.equal(next[0].members[0].is_online, 1)
  assert.equal(next[0].members[0].last_seen, conversations[0].members[0].last_seen)
})

test('unrelated presence events preserve the original conversation array', () => {
  assert.equal(updateConversationPresence(conversations, 'unknown', false), conversations)
})

test('a fresh online presence transition overrides an old last-seen value in the header state', () => {
  const updated = updateConversationPresence(conversations, 'friend', true)

  assert.equal(
    isConversationMemberOnline(updated[0].members[0], new Set()),
    true,
    'a sender who is currently connected must render as active, not last seen',
  )
  assert.equal(updated[0].members[0].last_seen, '2026-09-04T18:50:00.000Z')
})

test('a late conversation fetch cannot overwrite a newer socket presence update', () => {
  const staleFetch = updateConversationPresence(conversations, 'friend', false, '2026-09-05T04:00:00.000Z')
  const reconciled = reconcileFetchedConversationPresence(staleFetch, {
    friend: { online: true },
  })

  assert.equal(reconciled[0].members[0].is_online, 1)
  assert.equal(isConversationMemberOnline(reconciled[0].members[0], new Set()), true)
})