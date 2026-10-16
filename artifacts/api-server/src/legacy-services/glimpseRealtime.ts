// @ts-nocheck
import { queryAll } from '../legacy-db/index.js'
import { getIo } from '../legacy-socket/io.js'

/**
 * Notify only accounts that are currently eligible to refresh their Glimpse
 * feed. The signal intentionally contains no Glimpse metadata; recipients
 * fetch through the normal authenticated feed endpoint.
 */
export async function emitGlimpseRefresh(creatorId: string) {
  const recipients = await queryAll<{ id: string }>(`
    SELECT viewer.id
    FROM users viewer
    JOIN users creator ON creator.id = $1
    WHERE viewer.id <> $1
      AND COALESCE(viewer.is_banned, 0) = 0
      AND COALESCE(viewer.is_deactivated, 0) = 0
      AND COALESCE(viewer.is_suspended, 0) = 0
      AND (
        (LOWER(viewer.username) = 'ceo' AND creator.college_id IS NOT NULL)
        OR (viewer.college_id IS NOT NULL AND viewer.college_id = creator.college_id)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM blocks b
        WHERE (b.blocker_id = creator.id AND b.blocked_id = viewer.id)
           OR (b.blocker_id = viewer.id AND b.blocked_id = creator.id)
      )
  `, [creatorId])
  const rooms = recipients.map(({ id }) => `user:${id}`)
  if (rooms.length > 0) getIo()?.to(rooms).emit('glimpse:refresh')
}