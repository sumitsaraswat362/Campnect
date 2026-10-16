// @ts-nocheck
import { v4 as uuidv4 } from 'uuid'
import { withTransaction } from '../legacy-db/index.js'
import type { DbExecutor } from '../legacy-db/index.js'
import { recordAdminAudit, recordModerationAction } from './adminSecurity.js'
import { recordEnforcement } from './enforcement.js'

const WARNING_LEVELS = new Set(['low', 'medium', 'high', 'critical'])

export class UserWarningValidationError extends Error {
  constructor(
    public readonly code: 'MODERATION_REASON_REQUIRED' | 'WARNING_LEVEL_INVALID',
    message: string,
  ) {
    super(message)
    this.name = 'UserWarningValidationError'
  }
}

export interface UserWarningInput {
  reason: string
  level: string
  category: string
  evidence: string
  reportId: string | null
  expiresAt: string | null
}

function text(value: unknown, max = 2000) {
  return String(value ?? '').trim().slice(0, max)
}

function dateOrNull(value: unknown) {
  const valueText = text(value, 80)
  if (!valueText) return null
  const date = new Date(valueText)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function normalizeWarningInput(body: any): UserWarningInput {
  const reason = text(body?.reason, 2000)
  if (!reason) {
    throw new UserWarningValidationError(
      'MODERATION_REASON_REQUIRED',
      'A reason is required for this action.',
    )
  }

  const level = text(body?.level, 20).toLowerCase() || 'medium'
  if (!WARNING_LEVELS.has(level)) {
    throw new UserWarningValidationError(
      'WARNING_LEVEL_INVALID',
      'Warning level must be low, medium, high, or critical.',
    )
  }

  return {
    reason,
    level,
    category: text(body?.category, 80) || 'policy',
    evidence: text(body?.evidence, 5000),
    reportId: text(body?.report_id, 200) || null,
    expiresAt: dateOrNull(body?.expires_at),
  }
}

export interface CreatedUserWarning {
  warning: any
  state: any
}

/**
 * Shared warning business logic. Callers that already own a transaction (such
 * as bulk User 360 actions) use the in-transaction helper below.
 */
export async function createUserWarning(req: any, userId: string, body: any): Promise<CreatedUserWarning | null> {
  const input = normalizeWarningInput(body)
  return withTransaction((tx) => createUserWarningInTransaction(req, tx, userId, input))
}

export async function createUserWarningInTransaction(
  req: any,
  tx: Pick<DbExecutor, 'one' | 'run'>,
  userId: string,
  input: UserWarningInput,
): Promise<CreatedUserWarning | null> {
  const user = await tx.one<any>(
    'SELECT id FROM users WHERE id = $1 FOR UPDATE',
    [userId],
  )
  if (!user) return null

  const id = uuidv4()
  const warning = await tx.one<any>(
    `INSERT INTO user_warnings
      (id, user_id, level, category, reason, evidence, linked_report_id, issued_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, user_id, level, category, reason, evidence, linked_report_id,
       issued_by, expires_at, created_at`,
    [
      id,
      userId,
      input.level,
      input.category,
      input.reason,
      input.evidence,
      input.reportId,
      req.admin!.adminId,
      input.expiresAt,
    ],
  )

  const state = await tx.one<any>(
    `UPDATE users
     SET warnings_count = COALESCE(warnings_count, 0) + 1, updated_at = NOW()
     WHERE id = $1
     RETURNING is_suspended, is_shadowbanned, warnings_count, suspension_reason`,
    [userId],
  )

  await tx.run(
    `INSERT INTO notifications (id, user_id, type, entity_type, content)
     VALUES ($1,$2,'system','moderation',$3)`,
    [uuidv4(), userId, `You received a ${input.level} moderation warning: ${input.reason}`],
  )

  await recordModerationAction(req, {
    action: 'user.warning.issue',
    targetType: 'user',
    targetId: userId,
    reason: input.reason,
    after: warning,
  }, tx)
  await recordAdminAudit(req, {
    action: 'user.warning.issue',
    resourceType: 'user_warning',
    resourceId: id,
    reason: input.reason,
    after: warning,
  }, tx)
  await recordEnforcement(req, tx, {
    userId,
    actionType: 'Warning',
    after: warning,
    reason: input.reason,
    expiresAt: warning?.expires_at,
    linkedReportId: warning?.linked_report_id,
  })

  return { warning, state }
}