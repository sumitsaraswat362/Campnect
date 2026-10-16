// @ts-nocheck
import { v4 as uuidv4 } from 'uuid'
import { db } from '../legacy-db/index.js'
import type { DbExecutor } from '../legacy-db/index.js'
import type { Request } from 'express'

export const ADMIN_PERMISSIONS = {
  owner: ['*', 'users.manage'],
  super_admin: ['dashboard.read', 'analytics.read', 'users.read', 'users.moderate', 'users.manage', 'content.read', 'content.moderate', 'verifications.read', 'verifications.review', 'reports.read', 'reports.review', 'cases.read', 'cases.manage', 'appeals.read', 'appeals.manage', 'audit.read', 'audit.export', 'security.read', 'settings.read', 'settings.manage', 'colleges.manage', 'admins.manage', 'notifications.read', 'notifications.manage', 'search.read'],
  trust_safety_lead: ['dashboard.read', 'analytics.read', 'users.read', 'users.moderate', 'users.manage', 'content.read', 'content.moderate', 'reports.read', 'reports.review', 'cases.read', 'cases.manage', 'appeals.read', 'appeals.manage', 'audit.read', 'notifications.read'],
  moderator: ['dashboard.read', 'analytics.read', 'users.read', 'users.moderate', 'content.read', 'content.moderate', 'reports.read', 'reports.review', 'cases.read', 'cases.manage', 'appeals.read', 'appeals.manage', 'audit.read'],
  verification_team: ['dashboard.read', 'analytics.read', 'users.read', 'verifications.read', 'verifications.review', 'audit.read'],
  verification_reviewer: ['dashboard.read', 'analytics.read', 'users.read', 'verifications.read', 'verifications.review', 'audit.read'],
  support_agent: ['dashboard.read', 'users.read', 'reports.read', 'reports.review', 'cases.read', 'appeals.read', 'audit.read'],
  support: ['dashboard.read', 'users.read', 'reports.read', 'reports.review', 'cases.read', 'appeals.read', 'audit.read'],
  community_manager: ['dashboard.read', 'users.read', 'content.read', 'content.moderate', 'reports.read', 'reports.review', 'cases.read', 'audit.read', 'notifications.read', 'notifications.manage'],
  analytics: ['dashboard.read', 'analytics.read', 'users.read', 'content.read', 'reports.read', 'cases.read', 'search.read'],
  read_only: ['dashboard.read', 'analytics.read', 'users.read', 'content.read', 'verifications.read', 'reports.read', 'cases.read', 'appeals.read', 'audit.read', 'security.read', 'search.read'],
  analyst: ['dashboard.read', 'analytics.read', 'users.read', 'content.read', 'reports.read', 'cases.read', 'search.read'],
} as const

export type AdminPermission = string

export interface AdminContext {
  adminId: string
  email: string
  name: string
  role: string
  permissions: string[]
  sessionId?: string
  sessionExpiresAt?: string
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminContext
      requestId?: string
    }
  }
}

function canonicalRole(role: string | null | undefined) {
  return String(role || 'analyst').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function permissionsForRole(role: string | null | undefined): string[] {
  const canonical = canonicalRole(role)
  return [...(ADMIN_PERMISSIONS[canonical as keyof typeof ADMIN_PERMISSIONS] || ADMIN_PERMISSIONS.analyst)]
}

export function hasAdminPermission(admin: AdminContext | undefined, permission: AdminPermission) {
  return Boolean(admin && (admin.permissions.includes('*') || admin.permissions.includes(permission)))
}

export function requestIp(req: Request) {
  return String(req.ip || req.headers['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 200)
}

export function requestUserAgent(req: Request) {
  return String(req.headers['user-agent'] || '').slice(0, 500)
}

export function safeJson(value: unknown, fallback: Record<string, unknown> = {}) {
  try {
    return JSON.stringify(value ?? fallback)
  } catch {
    return JSON.stringify(fallback)
  }
}

export function safeSummary(value: any) {
  if (!value || typeof value !== 'object') return {}
  const allowed = [
    'status', 'action', 'enabled', 'role', 'is_active', 'is_suspended', 'is_banned',
    'is_shadowbanned', 'is_deactivated', 'is_college_verified', 'verification_status',
    'warnings_count', 'reason', 'review_notes', 'deactivated_at', 'expires_at',
    'restriction_type', 'status', 'is_hidden', 'is_flagged', 'age_restricted',
    'sensitive_flag', 'priority', 'assigned_to', 'decision', 'score',
  ]
  return Object.fromEntries(allowed.filter((key) => key in value).map((key) => [key, String(value[key]).slice(0, 500)]))
}

export async function recordAdminAudit(req: Request, input: {
  action: string
  resourceType?: string
  resourceId?: string
  reason?: string
  before?: any
  after?: any
}, executor: Pick<DbExecutor, 'run'> = db) {
  if (!req.admin) return
  await executor.run(
    `INSERT INTO admin_audit_logs
      (id, admin_id, action, resource_type, resource_id, reason, before_summary, after_summary, request_id, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      uuidv4(), req.admin.adminId, input.action, input.resourceType || 'system',
      input.resourceId || null, String(input.reason || '').slice(0, 2000),
      safeJson(safeSummary(input.before)), safeJson(safeSummary(input.after)),
      req.requestId || null, requestIp(req), requestUserAgent(req),
    ],
  )
}

export async function recordModerationAction(req: Request, input: {
  action: string
  targetType: string
  targetId: string
  reason?: string
  before?: any
  after?: any
  metadata?: any
}, executor: Pick<DbExecutor, 'run'> = db) {
  if (!req.admin) return
  await executor.run(
    `INSERT INTO moderation_actions
      (id, admin_id, action, target_type, target_id, reason, before_summary, after_summary, metadata, request_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      uuidv4(), req.admin.adminId, input.action, input.targetType, input.targetId,
      String(input.reason || '').slice(0, 2000), safeJson(safeSummary(input.before)),
      safeJson(safeSummary(input.after)), safeJson(input.metadata || {}), req.requestId || null,
    ],
  )
}

export async function recordSecurityEvent(req: Request, eventType: string, input: {
  adminId?: string
  email?: string
  metadata?: any
} = {}) {
  await db.run(
    `INSERT INTO admin_security_events
      (id, admin_id, event_type, email, ip_address, user_agent, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      uuidv4(), input.adminId || req.admin?.adminId || null, eventType,
      String(input.email || '').slice(0, 320), requestIp(req), requestUserAgent(req),
      safeJson(input.metadata || {}),
    ],
  )
}

export function adminSuccess(res: any, req: Request, data: any, meta: Record<string, any> = {}) {
  const normalizedMeta = {
    ...meta,
    ...(meta.limit !== undefined && meta.pageSize === undefined ? { pageSize: meta.limit } : {}),
    requestId: req.requestId,
  }
  return res.json({ success: true, data, meta: normalizedMeta })
}

export function adminFailure(res: any, req: Request, status: number, code: string, message: string, details?: any) {
  return res.status(status).json({
    success: false,
    error: { code, message, ...(details === undefined ? {} : { details }), requestId: req.requestId },
  })
}