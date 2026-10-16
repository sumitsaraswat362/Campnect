// @ts-nocheck
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'

export const ADMIN_ROLE = 'owner'
export const ADMIN_TOKEN_EXPIRY = '12h'

export interface AdminTokenPayload {
  adminId: string
  username: string
  isAdmin: true
  role: typeof ADMIN_ROLE
  permissions: ['*']
  type: 'admin'
  jti: string
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is required for Admin sessions.')
  return secret
}

function normalizeUsername(value: string) {
  return String(value || '').trim().toLowerCase().replace(/^@/, '')
}

function constantTimeEqual(actual: string, expected: string) {
  const actualDigest = crypto.createHash('sha256').update(actual).digest()
  const expectedDigest = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(actualDigest, expectedDigest)
}

export function adminCredentialsConfigured() {
  return Boolean(String(process.env.ADMIN_PANEL_USERNAME || '').trim() && process.env.ADMIN_PANEL_PASSWORD)
}

export function authenticateAdminCredentials(identifier: string, password: string) {
  const configuredUsername = normalizeUsername(process.env.ADMIN_PANEL_USERNAME || '')
  const configuredPassword = String(process.env.ADMIN_PANEL_PASSWORD || '')
  const suppliedUsername = normalizeUsername(identifier)
  if (!configuredUsername || !configuredPassword) return null
  if (!constantTimeEqual(suppliedUsername, configuredUsername)) return null
  if (!constantTimeEqual(String(password || ''), configuredPassword)) return null
  return buildAdminIdentity(configuredUsername)
}

export function buildAdminIdentity(username: string) {
  const normalizedUsername = normalizeUsername(username)
  return {
    adminId: `admin:${normalizedUsername}`,
    username: normalizedUsername,
    email: '',
    name: 'CAMPNECT Administrator',
    role: ADMIN_ROLE,
    permissions: ['*'] as ['*'],
  }
}

export function signAdminToken(username: string) {
  const identity = buildAdminIdentity(username)
  const jti = uuidv4()
  const token = jwt.sign(
    {
      adminId: identity.adminId,
      username: identity.username,
      isAdmin: true,
      role: identity.role,
      permissions: identity.permissions,
      type: 'admin',
      jti,
    },
    sessionSecret(),
    { expiresIn: ADMIN_TOKEN_EXPIRY },
  )
  return { token, jti, identity }
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const payload = jwt.verify(token, sessionSecret()) as Partial<AdminTokenPayload>
    const configuredUsername = normalizeUsername(process.env.ADMIN_PANEL_USERNAME || '')
    if (
      payload.type !== 'admin'
      || payload.isAdmin !== true
      || payload.role !== ADMIN_ROLE
      || !payload.username
      || !payload.adminId
      || !payload.jti
      || !configuredUsername
      || normalizeUsername(payload.username) !== configuredUsername
      || payload.adminId !== `admin:${configuredUsername}`
    ) return null
    return {
      adminId: payload.adminId,
      username: normalizeUsername(payload.username),
      isAdmin: true,
      role: ADMIN_ROLE,
      permissions: ['*'],
      type: 'admin',
      jti: payload.jti,
    }
  } catch {
    return null
  }
}

export function hashAdminToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}