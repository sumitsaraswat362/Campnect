import assert from 'node:assert/strict'
import test from 'node:test'
import type { Message } from '../stores/chatStore'
import { mergeChatMessages, orderChatMessages } from './chatMessageOrder'

function message(id: string, createdAt: string): Message {
  return {
    id,
    conversation_id: 'conversation-1',
    sender_id: 'user-1',
    type: 'text',
    content: id,
    is_deleted: 0,
    is_edited: 0,
    is_pinned: 0,
    username: 'user',
    full_name: 'User',
    reactions: [],
    created_at: createdAt,
  }
}

test('orders messages by authoritative server timestamp with a stable ID tie-breaker', () => {
  const ordered = orderChatMessages([
    message('b', '2026-09-09T09:00:00.000Z'),
    message('c', '2026-09-09T10:00:00.000Z'),
    message('a', '2026-09-09T09:00:00.000Z'),
  ])
  assert.deepEqual(ordered.map((item) => item.id), ['a', 'b', 'c'])
})

test('REST history merges a realtime message without duplicating it', () => {
  const realtime = message('realtime', '2026-09-09T10:00:00.000Z')
  const history = [message('earlier', '2026-09-09T09:00:00.000Z'), realtime]
  const merged = mergeChatMessages([realtime], history)
  assert.deepEqual(merged.map((item) => item.id), ['earlier', 'realtime'])
})