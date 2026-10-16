// @ts-nocheck
import { Router } from 'express'
import { db } from '../legacy-db/index.js'
import { requireAdminPanel } from '../legacy-middleware/auth.js'
import {
  adminFailure,
  adminSuccess,
  recordAdminAudit,
  recordSecurityEvent,
} from '../legacy-services/adminSecurity.js'
import {
  authenticateAdminCredentials,
  adminCredentialsConfigured,
  hashAdminToken,
  signAdminToken,
} from '../legacy-services/adminCredentials.js'

export const adminAuthRouter = Router()

// The separate Admin Panel uses credentials stored in Replit Secrets. It is
// intentionally not a CAMPNECT users row, does not have an app profile, and
// does not use email OTP.
adminAuthRouter.post('/login', async (req, res) => {
  const identifier = String(req.body?.username || req.body?.identifier || '').trim()
  const password = String(req.body?.password || '')
  if (!adminCredentialsConfigured()) {
    return adminFailure(res, req, 503, 'ADMIN_NOT_CONFIGURED', 'Admin credentials are not configured.')
  }
  try {
    const identity = authenticateAdminCredentials(identifier, password)
    if (!identity) {
      await recordSecurityEvent(req, 'admin_login_failed', {
        metadata: { identifier: identifier.slice(0, 100) },
      })
      return adminFailure(res, req, 401, 'ADMIN_INVALID_CREDENTIALS', 'Invalid Admin credentials.')
    }

    const { token, jti } = signAdminToken(identity.username)
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    await db.run(
      `INSERT INTO admin_sessions (id, admin_username, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        jti,
        identity.username,
        hashAdminToken(token),
        expiresAt,
        String(req.ip || ''),
        String(req.headers['user-agent'] || '').slice(0, 500),
      ],
    )
    await recordSecurityEvent(req, 'admin_login', {
      adminId: identity.adminId,
      metadata: { admin_username: identity.username },
    })
    return adminSuccess(res, req, {
      token,
      refreshToken: null,
      admin: {
        id: identity.adminId,
        username: identity.username,
        role: identity.role,
        permissions: identity.permissions,
      },
    })
  } catch (error) {
    console.error('Admin login failed:', error instanceof Error ? error.message : 'unknown error')
    return adminFailure(res, req, 500, 'ADMIN_INTERNAL_ERROR', 'Unable to sign in to the Admin Panel.')
  }
})

adminAuthRouter.get('/me', requireAdminPanel, async (req, res) => {
  if (!req.admin) return adminFailure(res, req, 401, 'ADMIN_SESSION_REQUIRED', 'Admin login required.')
  return adminSuccess(res, req, {
    id: req.admin.adminId,
    username: req.user?.username,
    name: req.admin.name,
    role: req.admin.role,
    permissions: req.admin.permissions,
    session_expires_at: req.admin.sessionExpiresAt || null,
  })
})

adminAuthRouter.post('/logout', requireAdminPanel, async (req, res) => {
  await db.run('UPDATE admin_sessions SET revoked_at = NOW() WHERE id = $1', [req.admin!.sessionId])
  await recordSecurityEvent(req, 'admin_logout')
  await recordAdminAudit(req, { action: 'admin.logout', resourceType: 'admin', resourceId: req.admin?.adminId })
  return adminSuccess(res, req, { logged_out: true })
})

// These endpoints expose sessions for the secret-backed Admin identity.
adminAuthRouter.get('/sessions', requireAdminPanel, async (req, res) => {
  try {
    const sessions = await db.all<any>(
       `SELECT id, created_at, expires_at, ip_address, user_agent,
          (id = $2) AS current
        FROM admin_sessions
        WHERE admin_username = $1 AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.user!.username, req.admin!.sessionId],
    )
    return adminSuccess(res, req, sessions)
  } catch {
     return adminFailure(res, req, 500, 'ADMIN_INTERNAL_ERROR', 'Unable to load Admin sessions.')
  }
})

adminAuthRouter.delete('/sessions/:id', requireAdminPanel, async (req, res) => {
  try {
    const session = await db.one<any>(
      'SELECT id, admin_username FROM admin_sessions WHERE id = $1',
      [req.params.id],
    )
     if (!session) return adminFailure(res, req, 404, 'ADMIN_SESSION_NOT_FOUND', 'Admin session not found.')
    if (
      session.admin_username !== req.user!.username
      && !req.admin!.permissions.includes('*')
      && !req.admin!.permissions.includes('admins.manage')
    ) {
       return adminFailure(res, req, 403, 'ADMIN_PERMISSION_REQUIRED', 'You cannot revoke another Admin session.')
    }
    await db.run('UPDATE admin_sessions SET revoked_at = NOW() WHERE id = $1', [session.id])
    await recordSecurityEvent(req, 'admin_session_revoked', { metadata: { session_id: session.id } })
    await recordAdminAudit(req, { action: 'admin.session.revoke', resourceType: 'user_session', resourceId: session.id })
    return adminSuccess(res, req, { session_id: session.id, revoked: true })
  } catch {
     return adminFailure(res, req, 500, 'ADMIN_INTERNAL_ERROR', 'Unable to revoke Admin session.')
  }
})

adminAuthRouter.post('/sessions/revoke-others', requireAdminPanel, async (req, res) => {
  try {
    await db.run(
      'UPDATE admin_sessions SET revoked_at = NOW() WHERE admin_username = $1 AND id <> $2 AND revoked_at IS NULL',
      [req.user!.username, req.admin!.sessionId],
    )
    await recordSecurityEvent(req, 'admin_other_sessions_revoked')
    await recordAdminAudit(req, { action: 'admin.sessions.revoke_others', resourceType: 'user', resourceId: req.admin!.adminId })
    return adminSuccess(res, req, { revoked: true })
  } catch {
     return adminFailure(res, req, 500, 'ADMIN_INTERNAL_ERROR', 'Unable to revoke other Admin sessions.')
  }
})