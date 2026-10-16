// @ts-nocheck
import { Router } from 'express'
import { queryOne } from '../legacy-db/index.js'
import { optionalAuth } from '../legacy-middleware/auth.js'
import { verifyMediaAccess } from '../legacy-services/media.js'
import { makeJpegDownload } from '../legacy-services/imageProcessing.js'
import { createStoredMediaAccessUrl, readStoredMedia } from '../legacy-services/supabaseStorage.js'

export const mediaRouter = Router()

/**
 * Emit small, structured delivery records that can be correlated with database
 * egress without putting media bytes, URLs, account details, or headers in
 * logs. `reason` is intentionally derived server-side rather than trusted from
 * a client header.
 */
function recordMediaMetric(input: {
  assetId: string
  mimeType: string | null
  purpose: string
  status: number
  rangeBytes: number | null
  responseBytes: number
  cache: 'hit' | 'miss' | 'not-applicable'
  endpoint: 'media' | 'jpeg-download'
  reason: 'full' | 'range' | 'etag-revalidation' | 'jpeg-download' | 'storage-redirect'
  deliverySource?: 'legacy_bytea' | 'storage'
}) {
  console.info(JSON.stringify({ event: 'media_response', deliverySource: input.deliverySource || 'legacy_bytea', ...input }))
}

function isTruthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

// All media requests attempt to load the caller's session (optionalAuth).
// Whether a session is *required* depends on the asset's purpose and the
// visibility of the entity it belongs to.
async function serveMedia(req: any, res: any, downloadJpeg = false) {
  try {
    const asset = await queryOne<any>(
      `SELECT mime_type, original_name, byte_size, checksum, purpose, entity_id, owner_id,
              storage_bucket, storage_path, storage_status
        , EXISTS(
          SELECT 1 FROM college_verifications cv
          WHERE cv.id_photo_url = '/api/media/' || media_assets.id
             OR cv.selfie_url   = '/api/media/' || media_assets.id
        ) AS is_verification_media
       FROM media_assets WHERE id = $1`,
      [req.params.id],
    )

    if (!asset) return res.status(404).type('text').send('Media not found')

    // Verification documents are never served through this endpoint.
    if (
      asset.purpose === 'verification_id_photo' ||
      asset.purpose === 'verification_selfie' ||
      asset.is_verification_media
    ) {
      return res.status(404).type('text').send('Media not found')
    }

    const headerUserId: string | null = (req as any).user?.userId ?? null
    const signedAccess = verifyMediaAccess(req.query?.access, req.params.id)
    if (req.query?.access && !signedAccess) {
      return res.status(403).type('text').send('Forbidden')
    }
    if (signedAccess && headerUserId && signedAccess.viewerId !== headerUserId) {
      return res.status(403).type('text').send('Forbidden')
    }
    const userId: string | null = headerUserId || signedAccess?.viewerId || null
    let isPublicEventCover = false
    let isAuthorizedGlimpseMedia = false
    let isProfileMedia = false

    // -----------------------------------------------------------------------
    // Authorization checks per purpose
    // -----------------------------------------------------------------------

    if (asset.purpose === 'message_media') {
      // Chat attachments are private to conversation members only.
      if (!userId) return res.status(401).type('text').send('Unauthorized')

      const membership = await queryOne<any>(
        `SELECT 1 FROM conversation_members cm
         JOIN messages m ON m.conversation_id = cm.conversation_id
         WHERE m.id = $1 AND cm.user_id = $2`,
        [asset.entity_id, userId],
      )
      if (!membership) return res.status(403).type('text').send('Forbidden')
    }

    else if (asset.purpose === 'post_media' || asset.purpose === 'post_cover' || asset.purpose === 'clip_media' || asset.purpose === 'clip_cover') {
      // Post media visibility mirrors the post's own visibility setting.
      const post = await queryOne<any>(`SELECT p.visibility, p.user_id, p.college_id,
          p.type, p.moderation_status, p.discovery_restricted, u.is_private,
          EXISTS(SELECT 1 FROM content_moderation cm
            WHERE cm.content_type = 'post' AND cm.content_id = p.id
              AND (cm.status = 'deleted' OR cm.is_hidden = 1)) AS moderation_hidden,
          EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$2)) AS blocked,
          EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id AND f.status='active') AS follows_author
        FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=$1`, [asset.entity_id, userId])

      // If the post no longer exists treat the media as inaccessible.
      if (!post) return res.status(404).type('text').send('Media not found')
      // Old opaque media URLs must not keep exposing moderated content after
      // the post itself has been hidden or deleted. The author can still view
      // their own media; moderators use the separately authorized admin APIs.
      if (
        userId !== post.user_id &&
        (['hidden', 'deleted'].includes(post.moderation_status) || isTruthy(post.moderation_hidden))
      ) return res.status(404).type('text').send('Media not found')
      // Clip assets must never bypass the discovery/moderation, profile privacy,
      // or block checks that protect the Clips feed.
      if ((asset.purpose === 'clip_media' || asset.purpose === 'clip_cover') && userId !== post.user_id && (
        !userId || post.moderation_status !== 'approved' || isTruthy(post.discovery_restricted) ||
        isTruthy(post.blocked) || (isTruthy(post.is_private) && !isTruthy(post.follows_author))
      )) return res.status(403).type('text').send('Forbidden')

      if (post.visibility !== 'public') {
        // Non-public posts always require an authenticated session.
        if (!userId) return res.status(401).type('text').send('Unauthorized')

        // The post owner always has access to their own media.
        if (userId !== post.user_id) {
          if (post.visibility === 'friends') {
            const friendship = await queryOne<any>(
              `SELECT 1
               WHERE EXISTS (
                 SELECT 1 FROM follows
                 WHERE follower_id = $1 AND following_id = $2 AND status = 'active'
               )
               AND EXISTS (
                 SELECT 1 FROM follows
                 WHERE follower_id = $2 AND following_id = $1 AND status = 'active'
               )`,
              [userId, post.user_id],
            )
            if (!friendship) return res.status(403).type('text').send('Forbidden')
          } else if (post.visibility === 'college') {
            const sameCollege = await queryOne<any>(
              `SELECT 1 FROM users u1
               JOIN users u2 ON u2.id = $2
               WHERE u1.id = $1 AND u1.college_id IS NOT NULL
                 AND u1.college_id = u2.college_id`,
              [userId, post.user_id],
            )
            if (!sameCollege) return res.status(403).type('text').send('Forbidden')
          }
        }
      }
    }

    else if (asset.purpose === 'story_media') {
      if (!userId) return res.status(401).type('text').send('Unauthorized')
      // Do not let the opaque media URL bypass story expiry, audience,
      // profile privacy, or relationship restrictions used by story discovery.
      const story = await queryOne<any>(
        `SELECT s.user_id, s.visibility, u.is_private,
           EXISTS(
             SELECT 1 FROM follows f
             WHERE f.follower_id = $2 AND f.following_id = s.user_id
               AND f.status = 'active'
           ) AS is_following,
           EXISTS(
             SELECT 1 FROM close_mates cm
             WHERE cm.user_id = s.user_id AND cm.close_mate_id = $2
           ) AS is_close_mate,
           EXISTS(
             SELECT 1 FROM blocks b
             WHERE (b.blocker_id = $2 AND b.blocked_id = s.user_id)
                OR (b.blocker_id = s.user_id AND b.blocked_id = $2)
           ) AS is_blocked
         FROM stories s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.expires_at > NOW()
           AND COALESCE(u.is_banned, 0) = 0
           AND COALESCE(u.is_deactivated, 0) = 0
           AND COALESCE(u.is_suspended, 0) = 0`,
        [asset.entity_id, userId],
      )
      if (!story) return res.status(404).type('text').send('Media not found')
      const isOwner = story.user_id === userId
      if (!isOwner && (
        isTruthy(story.is_blocked) ||
        (story.visibility !== 'normal' && !isTruthy(story.is_close_mate)) ||
        (isTruthy(story.is_private) && !isTruthy(story.is_following))
      )) return res.status(403).type('text').send('Forbidden')
    }

    else if (asset.purpose === 'event_cover') {
      const event = await queryOne<any>(
        `SELECT e.visibility, e.organizer_id,
           COALESCE(e.hidden_at IS NOT NULL, FALSE) AS is_hidden,
           COALESCE(u.is_banned, 0) AS is_banned,
           COALESCE(u.is_deactivated, 0) AS is_deactivated,
           COALESCE(usc.event_visibility, COALESCE(u.is_shadowbanned, 0)) AS event_visibility
         FROM events e
         JOIN users u ON u.id = e.organizer_id
         LEFT JOIN user_shadowban_controls usc ON usc.user_id = u.id
         WHERE e.id = $1`,
        [asset.entity_id],
      )
      if (!event || event.is_hidden || event.is_banned || event.is_deactivated || event.event_visibility) {
        return res.status(404).type('text').send('Media not found')
      }
      isPublicEventCover = event.visibility === 'public'
      if (userId) {
        const blocked = await queryOne<any>(
          `SELECT 1 FROM blocks
           WHERE (blocker_id = $1 AND blocked_id = $2)
              OR (blocker_id = $2 AND blocked_id = $1)
           LIMIT 1`,
          [userId, event.organizer_id],
        )
        if (blocked) return res.status(403).type('text').send('Forbidden')
      }
      if (!isPublicEventCover) {
        if (!userId) return res.status(401).type('text').send('Unauthorized')
        const hasAccess = await queryOne<any>(
          `SELECT 1
           WHERE $1 = $2
              OR EXISTS(SELECT 1 FROM event_hosts WHERE event_id = $3 AND user_id = $1)
              OR EXISTS(SELECT 1 FROM event_attendees WHERE event_id = $3 AND user_id = $1)
              OR EXISTS(SELECT 1 FROM event_invitations WHERE event_id = $3 AND invited_user_id = $1 AND status IN ('pending','accepted'))
           LIMIT 1`,
          [userId, event.organizer_id, asset.entity_id],
        )
        if (!hasAccess) return res.status(403).type('text').send('Forbidden')
      }
    }

    else if (asset.purpose === 'glimpse' || asset.purpose === 'glimpse-cover') {
      const glimpse = await queryOne<any>(
        `SELECT p.user_id, p.visibility, p.moderation_status, p.discovery_restricted,
                 u.college_id AS creator_college_id, u.is_private,
                 viewer.college_id AS viewer_college_id, viewer.username AS viewer_username,
                 EXISTS (
                   SELECT 1 FROM follows f
                   WHERE f.follower_id = $2
                     AND f.following_id = p.user_id
                     AND f.status = 'active'
                 ) AS is_following,
                 EXISTS (
                   SELECT 1 FROM blocks b
                   WHERE (b.blocker_id = $2 AND b.blocked_id = p.user_id)
                      OR (b.blocker_id = p.user_id AND b.blocked_id = $2)
                 ) AS is_blocked
           FROM posts p
           JOIN users u ON u.id = p.user_id
           LEFT JOIN users viewer ON viewer.id = $2
          WHERE p.id = $1
            AND p.type = 'glimpse'
            AND p.created_at > NOW() - INTERVAL '24 hours'`,
        [asset.entity_id, userId],
      )
      if (!glimpse) return res.status(404).type('text').send('Media not found')

      const isOwner = userId === glimpse.user_id
      const isDiscoverable =
        glimpse.visibility === 'public' &&
        glimpse.moderation_status === 'approved' &&
        !isTruthy(glimpse.discovery_restricted)
      const isCeo = String(glimpse.viewer_username || '').toLowerCase() === 'ceo'
      const sameCampus =
        Boolean(glimpse.creator_college_id) &&
        Boolean(glimpse.viewer_college_id) &&
        glimpse.creator_college_id === glimpse.viewer_college_id
      const campusAllowed = sameCampus || (isCeo && Boolean(glimpse.creator_college_id))
      const privateAllowed = !isTruthy(glimpse.is_private) || isTruthy(glimpse.is_following)

      if (!isOwner && (
        !isDiscoverable ||
        !campusAllowed ||
        !privateAllowed ||
        isTruthy(glimpse.is_blocked)
      )) {
        return res.status(403).type('text').send('Forbidden')
      }
      isAuthorizedGlimpseMedia = true
    }

    else if (asset.purpose === 'group_avatar') {
      // Group avatars are only visible to authenticated users.
      if (!userId) return res.status(401).type('text').send('Unauthorized')
    }

    else if (asset.purpose === 'user_avatar' || asset.purpose === 'user_cover') {
      // Profile photos from private accounts require authentication.
      const owner = await queryOne<any>(
        `SELECT is_private FROM users WHERE id = $1`,
        [asset.owner_id],
      )
      if (!owner) return res.status(404).type('text').send('Media not found')
      if (userId && userId !== asset.owner_id) {
        const blocked = await queryOne<any>(
          `SELECT 1 FROM blocks
           WHERE (blocker_id = $1 AND blocked_id = $2)
              OR (blocker_id = $2 AND blocked_id = $1)
           LIMIT 1`,
          [userId, asset.owner_id],
        )
        if (blocked) return res.status(403).type('text').send('Forbidden')
      }
      if (owner?.is_private && !userId) {
        return res.status(401).type('text').send('Unauthorized')
      }
      if (owner?.is_private && userId !== asset.owner_id) {
        const followsOwner = await queryOne<any>(
          `SELECT 1 FROM follows
           WHERE follower_id = $1 AND following_id = $2 AND status = 'active'`,
          [userId, asset.owner_id],
        )
        if (!followsOwner) return res.status(403).type('text').send('Forbidden')
      }
      isProfileMedia = true
    }

    else {
      // Any other unrecognised purpose requires authentication at minimum.
      if (!userId) return res.status(401).type('text').send('Unauthorized')
    }

    // -----------------------------------------------------------------------
    // Serve the asset.
    //
    // Access-controlled media used to be sent as `private, no-store`, which
    // forbids the browser from keeping any cache entry at all — every view of
    // the same photo/video (reopening a chat, revisiting a profile, reloading
    // the feed, replaying a Glimpse) re-transferred the full byte payload out
    // of Postgres. That is the dominant source of Supabase egress: media is
    // stored as bytea in `media_assets` and every byte read from it counts as
    // database egress, and this app's average request size (~1.6 MB) matches
    // photo/video content, not JSON.
    //
    // `private` still forbids shared/CDN caches from ever storing this, so no
    // other user can be served another user's authorized copy. `must-revalidate`
    // still forces the browser to hit this route on every load — the full
    // authorization chain above still runs every single time. The only change
    // is that a revalidation which matches the current ETag now returns 304
    // with no body instead of re-sending the asset, which is what removes the
    // repeat-view egress.
    // -----------------------------------------------------------------------
    const isPublicPostMedia =
      (asset.purpose === 'post_media' || asset.purpose === 'post_cover') &&
      (await queryOne<any>(`SELECT 1 FROM posts WHERE id = $1 AND visibility = 'public'`, [asset.entity_id]))

    if (downloadJpeg) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(asset.mime_type)) {
        return res.status(415).type('text').send('JPEG downloads are only available for images')
      }
      let source: Buffer | undefined
      if (asset.storage_status === 'storage_ready' && asset.storage_bucket && asset.storage_path) {
        try {
          source = await readStoredMedia(asset.storage_bucket, asset.storage_path)
        } catch (error: any) {
          // Migrated rows retain their original BYTEA as a rollback copy. New
          // storage-first rows have no such copy, so fail explicitly instead
          // of returning a corrupt empty JPEG.
          const legacy = await queryOne<any>('SELECT data FROM media_assets WHERE id = $1', [req.params.id])
          if (legacy?.data?.length) source = legacy.data
          else throw new Error(`Storage JPEG source unavailable: ${error?.message || 'unknown error'}`)
        }
      } else {
        source = (await queryOne<any>('SELECT data FROM media_assets WHERE id = $1', [req.params.id]))?.data
      }
      const jpeg = await makeJpegDownload(source, asset.mime_type)
      const safeName = String(asset.original_name || 'image').replace(/[^a-z0-9._-]/gi, '_').replace(/\.[^.]*$/, '')
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Content-Length', String(jpeg.length))
      res.setHeader('Cache-Control', 'private, no-store')
      recordMediaMetric({
        assetId: req.params.id,
        mimeType: asset.mime_type,
        purpose: asset.purpose,
        status: 200,
        rangeBytes: null,
        responseBytes: jpeg.length,
        cache: 'not-applicable',
        endpoint: 'jpeg-download',
        reason: 'jpeg-download',
        deliverySource: asset.storage_status === 'storage_ready' ? 'storage' : 'legacy_bytea',
      })
      res.setHeader('Content-Disposition', `attachment; filename="${safeName || 'image'}.jpg"`)
      return res.send(jpeg)
    }

    // Post moderation can change while an opaque URL remains unchanged, so
    // never let public post media live indefinitely in a browser cache.
    const cacheControl = isPublicEventCover
      ? 'public, max-age=31536000, immutable'
      : 'private, max-age=0, must-revalidate'
    const etag = `"${asset.checksum}"`
    const total = Number(asset.byte_size)
    const isVideo = String(asset.mime_type || '').startsWith('video/')
    const rangeHeader = isVideo ? req.headers.range : undefined
    let range: { start: number, end: number } | null = null
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim())
      if (!match || (!match[1] && !match[2])) {
        res.setHeader('Content-Range', `bytes */${total}`)
        return res.status(416).end()
      }
      const suffixLength = match[1] ? null : Number(match[2])
      const end = suffixLength === null ? (match[2] ? Number(match[2]) : total - 1) : total - 1
      const start = suffixLength === null ? Number(match[1]) : Math.max(0, total - suffixLength)
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= total) {
        res.setHeader('Content-Range', `bytes */${total}`)
        return res.status(416).end()
      }
      range = { start, end: Math.min(end, total - 1) }
    }

    // Video elements may include If-None-Match on a byte-range request. A
    // range response must always contain its requested bytes and Content-Range;
    // returning 304 here leaves the media engine without playable data.
    const clientETag = req.headers['if-none-match']
    if (!range && clientETag && String(clientETag) === etag) {
      res.setHeader('Cache-Control', cacheControl)
      res.setHeader('ETag', etag)
      recordMediaMetric({
        assetId: req.params.id,
        mimeType: asset.mime_type,
        purpose: asset.purpose,
        status: 304,
        rangeBytes: null,
        responseBytes: 0,
        cache: 'hit',
        endpoint: 'media',
        reason: 'etag-revalidation',
      })
      return res.status(304).end()
    }

    // Storage-backed media stays behind the exact same Campnect ACL checks
    // above. Once authorized, redirect the browser/WebView to a short-lived
    // private Storage URL so large bytes never transit Postgres or this API.
    // If a legacy migration's storage object is temporarily unavailable, its
    // retained BYTEA copy continues through the compatibility path below.
    if (asset.storage_status === 'storage_ready' && asset.storage_bucket && asset.storage_path) {
      try {
        const location = await createStoredMediaAccessUrl(asset.storage_bucket, asset.storage_path)
        res.setHeader('Cache-Control', 'private, no-store')
        res.setHeader('ETag', etag)
        res.setHeader('Accept-Ranges', 'bytes')
        recordMediaMetric({
          assetId: req.params.id,
          mimeType: asset.mime_type,
          purpose: asset.purpose,
          status: 302,
          rangeBytes: null,
          responseBytes: 0,
          cache: 'not-applicable',
          endpoint: 'media',
          reason: 'storage-redirect',
          deliverySource: 'storage',
        })
        return res.redirect(302, location)
      } catch (error: any) {
        const legacy = await queryOne<any>('SELECT octet_length(data) AS byte_size FROM media_assets WHERE id = $1', [req.params.id])
        if (!Number(legacy?.byte_size)) {
          throw new Error(`Storage delivery unavailable: ${error?.message || 'unknown error'}`)
        }
        console.warn(`Storage delivery fell back to legacy media for ${req.params.id}`)
      }
    }

    // Do not warm a full Clip BYTEA into process memory. A browser can ask for
    // a tiny Range while buffering, and the historical cache warm-up would
    // still make Postgres send the complete file. Each range below reads only
    // the requested segment.
    res.setHeader('Content-Type', asset.mime_type || 'application/octet-stream')
    res.setHeader('Accept-Ranges', isVideo ? 'bytes' : 'none')
    res.setHeader('Content-Length', String(range ? range.end - range.start + 1 : total))
    res.setHeader('Cache-Control', cacheControl)
    res.setHeader('ETag', etag)
    res.setHeader(
      'Cross-Origin-Resource-Policy',
      isPublicPostMedia || isPublicEventCover || isAuthorizedGlimpseMedia || isProfileMedia || Boolean(signedAccess)
        ? 'cross-origin'
        : 'same-origin',
    )
    if (range) {
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${total}`)
      const responseBytes = range.end - range.start + 1
      recordMediaMetric({
        assetId: req.params.id,
        mimeType: asset.mime_type,
        purpose: asset.purpose,
        status: 206,
        rangeBytes: responseBytes,
        responseBytes: req.method === 'HEAD' ? 0 : responseBytes,
        cache: 'miss',
        endpoint: 'media',
        reason: 'range',
      })
      if (req.method === 'HEAD') return res.status(206).end()
      const bytes = (await queryOne<any>('SELECT substring(data FROM $2 FOR $3) AS data FROM media_assets WHERE id=$1', [req.params.id, range.start + 1, responseBytes]))?.data
      return res.status(206).send(bytes)
    }
    recordMediaMetric({
      assetId: req.params.id,
      mimeType: asset.mime_type,
      purpose: asset.purpose,
      status: 200,
      rangeBytes: null,
      responseBytes: req.method === 'HEAD' ? 0 : total,
      cache: 'miss',
      endpoint: 'media',
      reason: 'full',
    })
    if (req.method === 'HEAD') return res.end()
    const bytes = (await queryOne<any>('SELECT data FROM media_assets WHERE id=$1', [req.params.id]))?.data
    res.send(bytes)
  } catch (error: any) {
    console.error('media delivery error:', error.message)
    res.status(500).type('text').send('Unable to load media')
  }
}

// Keep this more-specific route before the opaque-asset route. Both invoke the
// same authorization path; a representation request cannot bypass media ACLs.
mediaRouter.get('/:id/download.jpg', optionalAuth, (req, res) => serveMedia(req, res, true))
mediaRouter.get('/:id', optionalAuth, (req, res) => serveMedia(req, res, false))
mediaRouter.head('/:id', optionalAuth, (req, res) => serveMedia(req, res, false))
