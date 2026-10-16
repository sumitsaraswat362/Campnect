export interface SharedPostPayload {
  postId?: string
  postUrl?: string
  thumbnail?: string
  thumbnailType?: 'image' | 'video'
  authorName?: string
  authorAvatar?: string
  caption?: string
}

const SHARED_POST_PREFIX = '__POST_SHARE__:'

export function parseSharedPostPayload(content?: string | null): SharedPostPayload | null {
  if (!content?.startsWith(SHARED_POST_PREFIX)) return null
  try {
    const parsed = JSON.parse(content.slice(SHARED_POST_PREFIX.length))
    return parsed && typeof parsed === 'object' ? parsed as SharedPostPayload : null
  } catch {
    return null
  }
}