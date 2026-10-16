/**
 * The profile Posts statistic intentionally includes ordinary posts and Clips
 * (stored as `reel` and `video`). Glimpses have their own surface and are not
 * included in this total.
 */
export const PROFILE_POSTS_COUNT_SQL = `SELECT COUNT(*)::int AS count
  FROM posts
  WHERE user_id = $1
    AND visibility = 'public'
    AND COALESCE(type, '') <> 'glimpse'`

export function countsTowardProfilePosts(type) {
  return type !== 'glimpse'
}
