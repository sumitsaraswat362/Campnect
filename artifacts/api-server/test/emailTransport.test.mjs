import assert from 'node:assert/strict'
import test from 'node:test'
import nodemailer from 'nodemailer'

test('email transport preserves HTML security mail and its recipient', async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true })
  const result = await transport.sendMail({
    from: '"Campnect" <noreply@example.test>',
    to: 'student@example.test',
    subject: 'Your Campnect login code',
    html: '<p>Your code is <strong>123456</strong></p>',
  })
  assert.deepEqual(result.envelope.to, ['student@example.test'])
  const message = result.message.toString()
  assert.match(message, /Subject: Your Campnect login code/)
  assert.match(message, /Content-Type: text\/html/)
  assert.match(message, /<strong>123456<\/strong>/)
})

test('recipient comments and IDN normalization cannot change the validated domain', async () => {
  const transport = nodemailer.createTransport({ jsonTransport: true })
  for (const [to, expected] of [
    ['student@good-corp.com(x)evil.com', 'student@good-corp.com'],
    ['student@compa\u00adny.com', 'student@company.com'],
  ]) {
    const result = await transport.sendMail({
      from: 'noreply@example.test', to, subject: 'Security mail', text: 'Test',
    })
    assert.deepEqual(result.envelope.to, [expected])
  }
})

test('mail composition still enforces disabled file access', async () => {
  const transport = nodemailer.createTransport({
    streamTransport: true, buffer: true, disableFileAccess: true,
  })
  await assert.rejects(transport.sendMail({
    from: 'noreply@example.test',
    to: 'student@example.test',
    subject: 'Test',
    attachments: [{ path: '/must-not-be-read.txt' }],
  }), /file access rejected/i)
})