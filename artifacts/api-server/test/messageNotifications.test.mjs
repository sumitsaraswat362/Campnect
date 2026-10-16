import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  dispatchMessageNotifications,
  messageNotificationContent,
  messageNotificationId,
} from '../src/legacy-services/messageNotifications.ts'

test('message notification content follows Campnect preview conventions', () => {
  assert.equal(messageNotificationContent('text', 'Hello there'), 'sent you a message: Hello there')
  assert.equal(messageNotificationContent('image'), 'sent you an image')
  assert.equal(messageNotificationContent('text', 'https://campnect.example'), 'sent you a link')
})

test('normal messages persist and emit one notification per non-sender recipient', async () => {
  const inserts = []
  const pushes = []
  const database = {
    async one(sql, params) {
      inserts.push({ sql, params })
      return { id: params[0] }
    },
  }
  await dispatchMessageNotifications({
    conversationId: 'conversation-1',
    messageId: 'message-1',
    senderId: 'sender-1',
    sender: { username: 'sender', full_name: 'Sender Name', avatar_url: '/avatar.png' },
    recipientIds: ['sender-1', 'recipient-1', 'recipient-1', 'recipient-2'],
    content: 'sent you a message: Hello',
  }, {
    database,
    emit: (recipientId, notification) => pushes.push({ recipientId, notification }),
  })

  assert.equal(inserts.length, 2)
  assert.equal(pushes.length, 2)
  assert.deepEqual(pushes.map(({ recipientId }) => recipientId), ['recipient-1', 'recipient-2'])
  assert.ok(pushes.every(({ notification }) =>
    notification.type === 'message'
    && notification.entity_type === 'conversation'
    && notification.entity_id === 'conversation-1'
    && notification.content === 'sent you a message: Hello'
    && notification.actor_id === 'sender-1'
    && notification.extra_data.message_id === 'message-1',
  ))
})

test('the same message-recipient pair has a stable notification ID and only emits after insert', async () => {
  assert.equal(
    messageNotificationId('message-1', 'recipient-1'),
    messageNotificationId('message-1', 'recipient-1'),
  )
  assert.notEqual(
    messageNotificationId('message-1', 'recipient-1'),
    messageNotificationId('message-1', 'recipient-2'),
  )

  const pushes = []
  await dispatchMessageNotifications({
    conversationId: 'conversation-1',
    messageId: 'message-1',
    senderId: 'sender-1',
    sender: {},
    recipientIds: ['recipient-1'],
    content: 'sent you a message: Hello',
  }, {
    database: { one: async () => null },
    emit: (...args) => pushes.push(args),
  })
  assert.equal(pushes.length, 0)
})

test('both ordinary-message delivery paths dispatch the shared notification flow', async () => {
  const [restRoute, socketHandler] = await Promise.all([
    readFile(new URL('../src/legacy-routes/chat.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/legacy-socket/index.ts', import.meta.url), 'utf8'),
  ])
  assert.match(restRoute, /await dispatchMessageNotifications\(\{\s*conversationId: req\.params\.id,/)
  assert.match(socketHandler, /await dispatchMessageNotifications\(\{\s*conversationId,/)
})