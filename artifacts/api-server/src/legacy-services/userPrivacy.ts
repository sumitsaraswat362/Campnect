// @ts-nocheck
/**
 * Explicit user projections keep authentication and profile responses from
 * inheriting newly added database columns by accident.
 */
import { db } from '../legacy-db/index.js'
import { signedMediaUrl } from './media.js'

export const PRESENCE_TIMEOUT_MS = 2 * 60 * 1000

export function privacySettings(value: unknown): Record<string, any> {
  try {
    return typeof value === 'string' ? JSON.parse(value || '{}') : (value || {})
  } catch {
    return {}
  }
}

export function isFreshOnline(lastSeen: unknown, isOnline: unknown): boolean {
  if (!isOnline) return false
  if (!lastSeen) return false
  const time = new Date(String(lastSeen)).getTime()
  return Number.isFinite(time) && Date.now() - time <= PRESENCE_TIMEOUT_MS
}

export function visiblePresence(user: any, viewerId?: string | null) {
  if (!user) return user
  const isSelf = viewerId && viewerId === user.id
  const settings = privacySettings(user.privacy_settings)
  // These are independent switches: hiding the live "online" dot must not
  // also erase "last seen" — hiding online status should fall back to a
  // last-seen label (per user request), not blank it out.
  const showOnline = isSelf || settings.showOnlineStatus !== false
  const showSeen = isSelf || settings.showLastSeen !== false
  return {
    ...user,
    is_online: showOnline && isFreshOnline(user.last_seen, user.is_online) ? 1 : 0,
    last_seen: showSeen ? user.last_seen : null,
  }
}

export const PUBLIC_USER_COLUMNS = [
  'id',
  'username',
  'full_name',
  'avatar_url',
  'cover_url',
  'bio',
  'college_id',
  'college_name',
  'department',
  'course',
  'institute_post',
  'semester',
  'year',
  'interests',
  'skills',
  'social_links',
  'relationship_status',
  'is_college_verified',
  'account_type',
  'user_role',
  'is_private',
  'who_can_message',
  'last_seen',
  'followers_count',
  'following_count',
  'posts_count',
  'created_at',
  'updated_at',
].join(', ')

export const AUTH_USER_COLUMNS = [
  PUBLIC_USER_COLUMNS,
  'email',
  'password_hash',
  'google_id',
  'is_email_verified',
  'verification_status',
  'privacy_settings',
  'notification_prefs',
  'is_admin',
  'admin_role',
  'is_suspended',
  'is_banned',
  'is_shadowbanned',
  'is_deactivated',
  'suspension_reason',
  'suspension_ends_at',
  'warnings_count',
].join(', ')

const PUBLIC_USER_KEYS = [
  'id',
  'username',
  'full_name',
  'avatar_url',
  'cover_url',
  'bio',
  'college_id',
  'college_name',
  'department',
  'course',
  'institute_post',
  'semester',
  'year',
  'interests',
  'skills',
  'social_links',
  'relationship_status',
  'is_college_verified',
  'account_type',
  'user_role',
  'is_private',
  'who_can_message',
  'last_seen',
  'followers_count',
  'following_count',
  'posts_count',
  'created_at',
  'updated_at',
] as const

export function publicUser(user: any) {
  if (!user) return null
  return Object.fromEntries(PUBLIC_USER_KEYS.map((key) => [key, user[key]]))
}

export function selfUser(user: any) {
  if (!user) return null
  return {
    ...publicUser(user),
    email: user.email,
    is_email_verified: user.is_email_verified,
    verification_status: user.verification_status,
    privacy_settings: user.privacy_settings,
    notification_prefs: user.notification_prefs,
    is_suspended: user.is_suspended,
    is_banned: user.is_banned,
    is_deactivated: user.is_deactivated,
    suspension_reason: user.suspension_reason,
    suspension_ends_at: user.suspension_ends_at,
    warnings_count: user.warnings_count,
  }
}

/**
 * The users table keeps a legacy denormalized college_name for compatibility,
 * but college_id is the authoritative institution relationship. Resolve the
 * display name from that relationship before returning authenticated user
 * data so location and profile surfaces cannot show a stale or blank campus.
 */
export async function withCanonicalCollegeName(user: any) {
  if (!user || !user.college_id) return user
  const college = await db.one<{ name: string | null }>(
    'SELECT name FROM colleges WHERE id = $1',
    [user.college_id],
  )
  if (!college?.name) return user
  return { ...user, college_name: college.name }
}

export function withViewerMediaUrls(user: any, viewerId?: string | null) {
  if (!user || !viewerId) return user
  return {
    ...user,
    avatar_url: signedMediaUrl(user.avatar_url, viewerId) || user.avatar_url || null,
    cover_url: signedMediaUrl(user.cover_url, viewerId) || user.cover_url || null,
  }
}