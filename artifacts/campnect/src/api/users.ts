import client from './client'

export interface FollowRequest {
  id: string
  username: string
  full_name: string
  avatar_url?: string | null
  college_name?: string | null
  created_at: string
}

export interface CommentModerationRecord {
  id?: string
  moderation_action_id?: string
  action?: string
  decision?: string
  operation?: string
  category?: string
  severity?: string
  reason?: string | null
  created_at?: string
  appeal_status?: string | null
  appealable?: boolean
  is_appealable?: boolean
  comment_id?: string | null
  target_comment_id?: string | null
}

export const usersApi = {
  getMe: () => client.get('/users/me'),
  updateMe: (data: Record<string, unknown>) => client.patch('/users/me', data),
  uploadAvatar: (formData: FormData) =>
    client.post('/users/me/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadCover: (formData: FormData) =>
    client.post('/users/me/cover', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  removeAvatar: () => client.delete('/users/me/avatar'),
  removeCover:  () => client.delete('/users/me/cover'),
  getByUsername: (username: string) => client.get(`/users/${username}`),
  /** Alias for getByUsername — used by ProfileScreen */
  getProfile: (username: string) => client.get(`/users/${username}`),
  follow: (id: string) => client.post(`/users/${id}/follow`),
  unfollow: (id: string) => client.delete(`/users/${id}/follow`),
  getFollowRequests: () => client.get<{ success: boolean; data: FollowRequest[] }>('/users/me/follow-requests'),
  acceptFollowRequest: (followerId: string) => client.post(`/users/follow-requests/${followerId}/accept`),
  deleteFollowRequest: (followerId: string) => client.delete(`/users/follow-requests/${followerId}`),
  /** Alias for follow — used by ProfileScreen */
  followUser: (id: string) => client.post(`/users/${id}/follow`),
  /** Alias for unfollow — used by ProfileScreen */
  unfollowUser: (id: string) => client.delete(`/users/${id}/follow`),
  getFollowers: (id: string) => client.get(`/users/${id}/followers`),
  getFollowing: (id: string) => client.get(`/users/${id}/following`),
  getUserPosts: (id: string, page = 1, view: 'posts' | 'tagged' = 'posts') =>
    client.get(`/users/${id}/posts`, { params: { page, view } }),
  getSavedPosts: (page = 1) => client.get('/users/me/saved', { params: { page } }),
  getActivity: () => client.get('/users/me/activity'),
  getSuggestions: () => client.get('/users/suggestions'),
  getIdSuggestions: (limit = 10) => client.get('/users/id-suggestions', { params: { limit } }),
  getMutualFollowers: (id: string) => client.get(`/users/${id}/mutual-followers`),
  getCloseMates: () => client.get('/users/me/close-mates'),
  addCloseMate: (id: string) => client.put(`/users/me/close-mates/${id}`),
  removeCloseMate: (id: string) => client.delete(`/users/me/close-mates/${id}`),
  searchUsers: (q: string) => client.get('/search', { params: { q, type: 'users' } }),
  /** Alias for searchUsers — used by ChatListScreen */
  search: (q: string) => client.get('/search', { params: { q, type: 'users' } }),
  /** Alumni conversion request */
  requestAlumniStatus: (message = '') => client.post('/users/me/alumni-request', { message }),
  getAlumniRequest: () => client.get('/users/me/alumni-request'),
  getMyAppeals: () => client.get('/users/me/appeals'),
  submitAppeal: (evidence: string) => client.post('/users/me/appeals', { evidence }),
  getCommentModerationHistory: () =>
    client.get<{ success: boolean; data: CommentModerationRecord[] }>('/users/me/comment-moderation'),
  submitCommentModerationAppeal: (moderationActionId: string, evidence: string) =>
    client.post('/users/me/appeals', { moderation_action_id: moderationActionId, evidence }),
  getMyModeratedContent: () => client.get('/users/me/moderated-content'),
  submitContentAppeal: (postId: string, evidence: string) =>
    client.post('/users/me/appeals', { post_id: postId, evidence }),
  block: (id: string) => client.post(`/users/block/${id}`),
  unblock: (id: string) => client.delete(`/users/block/${id}`),
  report: (id: string, reason: string, description = '') => client.post(`/users/${id}/report`, { reason, description }),
  restrict: (id: string) => client.post(`/users/${id}/restrict`),
  unrestrict: (id: string) => client.delete(`/users/${id}/restrict`),
}
