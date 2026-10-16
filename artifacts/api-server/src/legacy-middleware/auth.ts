// @ts-nocheck
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { db } from '../legacy-db/index.js'
import {
  adminFailure,
  hasAdminPermission,
  permissionsForRole,
  type AdminContext,
} from '../legacy-services/adminSecurity.js'
import { hashAdminToken, verifyAdminToken } from '../legacy-services/adminCredentials.js'

const secret = process.env.SESSION_SECRET
if (!secret && process.env.NODE_ENV !== 'test') {
  throw new Error('SESSION_SECRET environment variable is required.')
}
export const JWT_SECRET = secret || 'campnect_explicit_test_secret'
export const JWT_EXPIRY = '24h'
export const REFRESH_EXPIRY = '30d'

export interface JWTPayload {
  userId: string
  email: string
  username: string
  isAdmin: boolean
  role: string
  permissions: string[]
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
    }
  }
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY })
}

export function signRefreshToken(userId: string): string {
  // A refresh token must be unique even when two rotations happen in the same
  // JWT timestamp second. Without a nonce, a rotated token can equal its
  // predecessor and make replay protection ineffective.
  return jwt.sign({ userId, type: 'refresh', jti: crypto.randomUUID() }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY })
}

export function verifyToken(token: string): any | null {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

/**
 * Async middleware: verifies JWT signature AND confirms the user still exists
 * in the database. Returns 401 if the token is invalid, expired, or the user
 * account has been deleted/deprovisioned.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' })
  }
  const token = header.slice(7)
  const payload = verifyToken(token)
  if (!payload || !payload.userId) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' })
  }

  // Verify user still exists in Postgres (catches deleted/deprovisioned accounts)
  db.one<any>('SELECT id, email, username, is_admin, admin_role FROM users WHERE id = $1', [payload.userId])
    .then(user => {
      if (!user) {
        return res.status(401).json({ success: false, error: 'User not found' })
      }
      const role = Boolean(user.is_admin) ? String(user.admin_role || 'owner') : 'user'
      req.user = {
        ...payload,
        email: user.email,
        username: user.username,
        isAdmin: Boolean(user.is_admin),
        role,
        permissions: Boolean(user.is_admin) ? permissionsForRole(role) : [],
      }
      next()
    })
    .catch(() => {
      res.status(500).json({ success: false, error: 'Internal server error.' })
    })
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7)
    const payload = verifyToken(token)
    if (payload?.userId) {
      const role = Boolean(payload.isAdmin) ? String(payload.role || 'owner') : 'user'
      req.user = {
        ...payload,
        isAdmin: Boolean(payload.isAdmin),
        role,
        permissions: Boolean(payload.isAdmin)
          ? permissionsForRole(role)
          : [],
      } as JWTPayload
    }
  }
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin access required' })
    }
    next()
  })
}

/**
 * Verifies that an Admin request was forwarded by the trusted Admin Panel
 * server. Browser clients never receive this secret; they still need their
 * own admin session and permission checks after this boundary.
 */
export function requireAdminPanelService(req: Request, res: Response, next: NextFunction) {
  const configuredSecret = process.env.ADMIN_PANEL_SERVICE_SECRET
  const suppliedSecret = req.header('X-Admin-Panel-Service-Secret')

  if (!configuredSecret || !suppliedSecret) {
    return res.status(401).json({
      success: false,
      error: { code: 'ADMIN_PANEL_SERVICE_REQUIRED', message: 'Admin Panel service authentication required.' },
    })
  }

  const expected = Buffer.from(configuredSecret)
  const received = Buffer.from(suppliedSecret)
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({
      success: false,
      error: { code: 'ADMIN_PANEL_SERVICE_REQUIRED', message: 'Admin Panel service authentication required.' },
    })
  }

  next()
}

export function requireAdminPanel(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    if (req.originalUrl.startsWith('/api/v1/admin')) {
      return adminFailure(res, req, 401, 'ADMIN_SESSION_REQUIRED', 'Admin login required.')
    }
    return res.status(401).json({ success: false, error: 'Admin login required' })
  }
  const token = header.slice(7)

  const payload = verifyAdminToken(token)
  if (!payload) {
    if (req.originalUrl.startsWith('/api/v1/admin')) {
      return adminFailure(res, req, 401, 'ADMIN_SESSION_INVALID', 'Invalid or expired Admin session.')
    }
    return res.status(401).json({ success: false, error: 'Invalid or expired Admin session' })
  }

  db.one<any>(
    `SELECT id, admin_username, expires_at, revoked_at
     FROM admin_sessions
     WHERE token_hash = $1 AND admin_username = $2`,
    [hashAdminToken(token), payload.username],
  ).then((session) => {
    if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) {
      return adminFailure(res, req, 401, 'ADMIN_SESSION_INVALID', 'Invalid or expired Admin session.')
    }
    const identity = {
      id: payload.adminId,
      email: '',
      username: payload.username,
      name: 'CAMPNECT Administrator',
      role: payload.role,
      is_admin: 1,
    }
    const context: AdminContext = {
      adminId: identity.id,
      email: identity.email,
      name: identity.name,
      role: identity.role,
      permissions: permissionsForRole(identity.role),
      sessionId: session.id,
      sessionExpiresAt: new Date(session.expires_at).toISOString(),
    }
    req.admin = context
    req.user = {
      userId: identity.id,
      email: identity.email,
      username: identity.username,
      isAdmin: true,
      role: identity.role,
      permissions: context.permissions,
    }
    next()
  }).catch(() => res.status(500).json({ success: false, error: 'Internal server error.' }))
}

function setAdminRequestContext(req: Request, admin: any) {
  const context: AdminContext = {
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    role: String(admin.role || 'analyst'),
    permissions: permissionsForRole(admin.role),
  }
  req.admin = context
  req.user = {
    userId: context.adminId,
    email: context.email,
    username: context.email,
    isAdmin: true,
    role: context.role,
    permissions: context.permissions,
  }
}

export function requireAdminPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!hasAdminPermission(req.admin, permission)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ADMIN_PERMISSION_REQUIRED', message: 'You do not have permission for this action.', permission, requestId: req.requestId },
      })
    }
    next()
  }
}
