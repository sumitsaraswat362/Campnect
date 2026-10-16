// @ts-nocheck
import { Router } from 'express'
import { db, withTransaction } from '../legacy-db/index.js'
import { requireAuth } from '../legacy-middleware/auth.js'
import { createReportWithCase } from '../legacy-services/reporting.js'

export const reportingRouter = Router()

async function createReport(req: any, res: any, entityType: string, entityId: string) {
  const reason = String(req.body?.reason || '').trim()
  if (!reason) return res.status(400).json({ success: false, error: 'Reason required.' })
  const target = await db.one<any>(
    entityType === 'user'
      ? 'SELECT id FROM users WHERE id = $1'
      : entityType === 'comment'
        ? 'SELECT id FROM comments WHERE id = $1'
        : entityType === 'event'
          ? 'SELECT id FROM events WHERE id = $1'
          : 'SELECT id FROM communities WHERE id = $1 OR slug = $1',
    [entityId],
  )
  if (!target) return res.status(404).json({ success: false, error: `${entityType} not found.` })
  const result = await withTransaction((tx) => createReportWithCase(tx, {
    reporterId: req.user!.userId,
    entityId: target.id,
    entityType,
    reason,
    description: req.body?.description,
  }))
  return res.status(201).json({ success: true, data: { report_id: result.reportId, case_id: result.caseId } })
}

reportingRouter.post('/users/:id/report', requireAuth, (req, res) => createReport(req, res, 'user', req.params.id))
reportingRouter.post('/comments/:id/report', requireAuth, (req, res) => createReport(req, res, 'comment', req.params.id))
reportingRouter.post('/events/:id/report', requireAuth, (req, res) => createReport(req, res, 'event', req.params.id))
reportingRouter.post('/communities/:id/report', requireAuth, (req, res) => createReport(req, res, 'group', req.params.id))