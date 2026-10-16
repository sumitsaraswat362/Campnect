import assert from 'node:assert/strict'
import test from 'node:test'
import { createPresenceRegistry } from '../src/legacy-services/presence.ts'

test('a user remains online until their final socket disconnects', () => {
  const registry = createPresenceRegistry()
  assert.deepEqual(registry.connect('user-a', 'socket-1'), { wasOnline: false, connectionCount: 1 })
  assert.deepEqual(registry.connect('user-a', 'socket-2'), { wasOnline: true, connectionCount: 2 })
  assert.equal(registry.isOnline('user-a'), true)
  assert.deepEqual(registry.disconnect('user-a', 'socket-1'), { becameOffline: false, connectionCount: 1 })
  assert.equal(registry.isOnline('user-a'), true)
  assert.deepEqual(registry.disconnect('user-a', 'socket-2'), { becameOffline: true, connectionCount: 0 })
  assert.equal(registry.isOnline('user-a'), false)
})

test('a stale or duplicate disconnect cannot mark an active user offline', () => {
  const registry = createPresenceRegistry()
  registry.connect('user-a', 'socket-1')
  registry.connect('user-a', 'socket-2')

  assert.deepEqual(registry.disconnect('user-a', 'unknown-socket'), { becameOffline: false, connectionCount: 2 })
  assert.equal(registry.isOnline('user-a'), true)
  assert.deepEqual(registry.disconnect('user-a', 'socket-1'), { becameOffline: false, connectionCount: 1 })
  assert.equal(registry.isOnline('user-a'), true)
})