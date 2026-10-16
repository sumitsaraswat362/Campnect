import { db } from '../legacy-db/index.js'

function isTruthy(value: unknown) {
  return value === true || value === 1 || value === '1'
}

export async function canAccessGlimpse(userId: string, glimpse: any) {
  if (!glimpse) return false
  const createdAt = new Date(glimpse.created_at).getTime()
  if (!Number.isFinite(createdAt) || createdAt <= Date.now() - (24 * 60 * 60 * 1000)) return false

  const blocked = await db.one(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [userId, glimpse.user_id],
  )
  if (blocked) return false
  if (glimpse.user_id === userId) return true
  if (glimpse.moderation_status !== 'approved' || isTruthy(glimpse.discovery_restricted)) return false
  if (glimpse.visibility !== 'public') return false

  const isCeo = String(glimpse.viewer_username || '').toLowerCase() === 'ceo'
  if (!isCeo && (!glimpse.viewer_college_id || !glimpse.creator_college_id)) return false
  if (!isCeo && glimpse.viewer_college_id !== glimpse.creator_college_id) return false
  if (!isTruthy(glimpse.is_private)) return true

  const permission = await db.one(
    `SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'active'`,
    [userId, glimpse.user_id],
  )
  return Boolean(permission)
}

export async function loadGlimpseAccessRow(glimpseId: string, viewerId: string) {
  return db.one<any>(
    `SELECT p.*, u.college_id AS creator_college_id, u.is_private,
            viewer.college_id AS viewer_college_id, viewer.username AS viewer_username
       FROM posts p
       JOIN users u ON u.id = p.user_id
       JOIN users viewer ON viewer.id = $2
      WHERE p.id = $1
        AND p.type = 'glimpse'
        AND p.created_at > NOW() - INTERVAL '24 hours'`,
    [glimpseId, viewerId],
  )
}

export async function loadAccessibleGlimpse(glimpseId: string, viewerId: string) {
  const glimpse = await loadGlimpseAccessRow(glimpseId, viewerId)
  return glimpse && await canAccessGlimpse(viewerId, glimpse) ? glimpse : null
}