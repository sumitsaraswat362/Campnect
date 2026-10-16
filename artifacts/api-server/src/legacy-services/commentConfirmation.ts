// @ts-nocheck
import crypto from 'node:crypto'

const ISSUER = 'campnect-comment-warning'
const WINDOW_SECONDS = 120

function key() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('A configured SESSION_SECRET of at least 32 characters is required for comment confirmations.')
  }
  return Buffer.from(secret)
}

export function hashCommentContent(content: string) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

function signature(encodedPayload: string) {
  return crypto.createHmac('sha256', key()).update(`${ISSUER}.${encodedPayload}`).digest('base64url')
}

export function createCommentConfirmation(input: {
  userId: string
  postId: string
  parentId: string | null
  commentId: string | null
  operation: 'create' | 'edit'
  contentHash: string
  attemptId: string
}, nowMs = Date.now()) {
  const issuedAt = Math.floor(nowMs / 1000)
  const nonce = crypto.randomBytes(24).toString('base64url')
  const claims = {
    v: 1,
    sub: input.userId,
    post: input.postId,
    parent: input.parentId,
    comment: input.commentId,
    operation: input.operation,
    hash: input.contentHash,
    attempt: input.attemptId,
    nonce,
    iat: issuedAt,
    exp: issuedAt + WINDOW_SECONDS,
  }
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const token = `${encoded}.${signature(encoded)}`
  const nonceHash = crypto.createHash('sha256').update(nonce).digest('hex')
  return { token, nonceHash, expiresAt: new Date((issuedAt + WINDOW_SECONDS) * 1000).toISOString() }
}

export function verifyCommentConfirmation(token: unknown, expected: {
  userId: string
  postId: string
  parentId: string | null
  commentId: string | null
  operation: 'create' | 'edit'
  contentHash: string
}, nowMs = Date.now()) {
  if (typeof token !== 'string' || token.length > 2048) return null
  const [encoded, supplied, extra] = token.split('.')
  if (!encoded || !supplied || extra !== undefined) return null
  let wanted: Buffer
  try { wanted = Buffer.from(signature(encoded)) } catch { return null }
  const actual = Buffer.from(supplied)
  if (wanted.length !== actual.length || !crypto.timingSafeEqual(wanted, actual)) return null

  try {
    const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    const now = Math.floor(nowMs / 1000)
    if (
      claims?.v !== 1 ||
      typeof claims.nonce !== 'string' ||
      !/^[A-Za-z0-9_-]{30,64}$/.test(claims.nonce) ||
      !/^[a-f0-9]{64}$/.test(claims.hash) ||
      typeof claims.attempt !== 'string' ||
      !Number.isSafeInteger(claims.exp) ||
      claims.iat > now + 5 ||
      claims.exp <= now ||
      claims.exp - claims.iat > WINDOW_SECONDS ||
      claims.sub !== expected.userId ||
      claims.post !== expected.postId ||
      claims.parent !== expected.parentId ||
      claims.comment !== expected.commentId ||
      claims.operation !== expected.operation ||
      claims.hash !== expected.contentHash
    ) return null
    return { attemptId: claims.attempt, nonceHash: crypto.createHash('sha256').update(claims.nonce).digest('hex'), expiresAt: new Date(claims.exp * 1000).toISOString() }
  } catch {
    return null
  }
}

export const COMMENT_CONFIRMATION_TTL_SECONDS = WINDOW_SECONDS