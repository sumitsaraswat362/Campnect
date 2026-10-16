// @ts-nocheck
import { v4 as uuidv4 } from 'uuid'
import type { DbExecutor } from '../legacy-db/index.js'

function text(value: unknown, max = 2000) {
  return String(value ?? '').trim().slice(0, max)
}

function dateOrNull(value: unknown) {
  const valueText = text(value, 80)
  if (!valueText) return null
  const date = new Date(valueText)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function recordEnforcement(req: any, tx: Pick<DbExecutor, 'run'>, input: {
  userId: string
  actionType: string
  before?: any
  after?: any
  reason?: string
  expiresAt?: any
  active?: boolean
  removed?: boolean
  linkedReportId?: string
  linkedAppealId?: string
}) {
  const id = uuidv4()
  const auditId = uuidv4()
  await tx.run(
    `INSERT INTO enforcement_history
      (id,user_id,action_type,previous_status,new_status,reason,moderator_id,expires_at,is_active,is_removed,linked_report_id,linked_appeal_id,audit_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id,
      input.userId,
      input.actionType,
      JSON.stringify(input.before || {}),
      JSON.stringify(input.after || {}),
      text(input.reason),
      req.admin?.adminId || null,
      dateOrNull(input.expiresAt),
      input.active === false ? 0 : 1,
      input.removed ? 1 : 0,
      input.linkedReportId || null,
      input.linkedAppealId || null,
      auditId,
    ],
  )
  return id
}