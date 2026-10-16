// @ts-nocheck
import { v4 as uuidv4 } from 'uuid'
import type { DbExecutor } from '../legacy-db/index.js'

const REPORT_CATEGORIES = new Set([
  'spam', 'scam', 'harassment', 'violence', 'adult_content', 'fake_account',
  'impersonation', 'self_harm', 'drugs', 'weapons', 'copyright', 'hate_speech',
  'misinformation', 'other',
])

function category(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase().slice(0, 60)
  return REPORT_CATEGORIES.has(normalized) ? normalized : 'other'
}

export async function createReportWithCase(
  tx: DbExecutor,
  input: {
    reporterId: string
    entityId: string
    entityType: string
    reason: string
    description?: string
  },
) {
  const reportId = uuidv4()
  const reason = String(input.reason || '').trim().slice(0, 120)
  const description = String(input.description || '').trim().slice(0, 5000)
  const entityType = String(input.entityType || 'other').trim().slice(0, 40)

  await tx.run(
    `INSERT INTO reports (id, reporter_id, entity_id, entity_type, reason, description)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [reportId, input.reporterId, input.entityId, entityType, reason, description],
  )
  const moderationCase = await tx.one<{ id: string }>(
    `INSERT INTO moderation_cases
      (id, report_id, case_type, category, target_type, target_id, summary, created_by)
     VALUES ($1,$2,'report',$3,$4,$5,$6,$7)
      ON CONFLICT (report_id) WHERE report_id IS NOT NULL DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [uuidv4(), reportId, category(reason), entityType, input.entityId, description || reason, input.reporterId],
  )
  return { reportId, caseId: moderationCase?.id || null }
}