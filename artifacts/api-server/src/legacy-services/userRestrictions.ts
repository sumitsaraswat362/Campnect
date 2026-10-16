// @ts-nocheck
import type { Request, Response } from 'express'
import { db } from '../legacy-db/index.js'

export type UserRestrictionType = 'messaging' | 'posting' | 'comments' | 'events' | 'groups' | 'read_only'

export async function hasActiveUserRestriction(userId: string, restrictionType: UserRestrictionType) {
  const row = await db.one(
    `SELECT id
     FROM user_restrictions
     WHERE user_id = $1 AND restriction_type IN ($2, 'read_only')
       AND removed_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [userId, restrictionType],
  )
  return Boolean(row)
}

export async function enforceUserRestriction(
  req: Request,
  res: Response,
  restrictionType: UserRestrictionType,
  message = 'This action is temporarily restricted for your account.',
) {
  if (!req.user?.userId) return false
  if (!(await hasActiveUserRestriction(req.user.userId, restrictionType))) return false
  res.status(403).json({ success: false, error: message, code: 'USER_ACTION_RESTRICTED', restriction_type: restrictionType })
  return true
}