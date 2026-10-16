import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const socketRequire = createRequire(require.resolve('socket.io'))
const { Server } = socketRequire('engine.io')
const engineRequire = createRequire(socketRequire.resolve('engine.io'))
const WebSocket = engineRequire('ws')

test('Engine.IO rejects mismatched or missing protocol revisions on transport upgrade', async (t) => {
  const httpServer = createServer()
  const engine = new Server()
  engine.attach(httpServer)
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    engine.close()
    await new Promise((resolve) => httpServer.close(resolve))
  })
  const origin = `127.0.0.1:${httpServer.address().port}`

  for (const revision of ['3', null]) {
    const handshake = await fetch(`http://${origin}/engine.io/?EIO=4&transport=polling`)
    assert.equal(handshake.status, 200)
    const packet = await handshake.text()
    assert.equal(packet[0], '0')
    const { sid } = JSON.parse(packet.slice(1))

    await new Promise((resolve, reject) => {
      const query = new URLSearchParams({ transport: 'websocket', sid })
      if (revision !== null) query.set('EIO', revision)
      const socket = new WebSocket(`ws://${origin}/engine.io/?${query}`)
      const timer = setTimeout(() => {
        socket.terminate()
        reject(new Error('Protocol mismatch upgrade did not finish'))
      }, 3000)
      socket.on('error', reject)
      socket.on('open', () => {
        clearTimeout(timer)
        socket.close()
        reject(new Error('Protocol mismatch upgrade was accepted'))
      })
      socket.on('unexpected-response', (_request, response) => {
        clearTimeout(timer)
        response.resume()
        socket.terminate()
        try {
          assert.equal(response.statusCode, 400)
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })
    engine.clients[sid]?.close()
  }

  // Rejected upgrades must leave the server able to accept normal sessions.
  const healthy = await fetch(`http://${origin}/engine.io/?EIO=4&transport=polling`)
  assert.equal(healthy.status, 200)
  assert.equal((await healthy.text())[0], '0')
})