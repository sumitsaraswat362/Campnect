import client from './client'
import type { AxiosRequestConfig } from 'axios'

export const postsApi = {
  getFeed: (cursor?: string | null, limit = 15, type?: string) =>
    client.get('/posts/feed', { params: { cursor: cursor || undefined, limit, type, mode: 'latest' } }),

  createPost: (formData: FormData, config?: AxiosRequestConfig) =>
    client.post('/posts', formData, { timeout: 120_000, ...config }),

  prepareGlimpseVideo: (file: File) => {
    const formData = new FormData()
    formData.append('media', file)
    return client.post('/posts/video-preview', formData, {
      timeout: 120_000,
      responseType: 'blob',
    })
  },

  getPost: (id: string) => client.get(`/posts/${id}`),

  updatePost: (id: string, data: { content?: string; visibility?: string; location?: string }) =>
    client.patch(`/posts/${id}`, data),
  deletePost: (id: string) => client.delete(`/posts/${id}`),

  likePost: (id: string) => client.post(`/posts/${id}/like`),
  unlikePost: (id: string) => client.delete(`/posts/${id}/like`),

  savePost: (id: string) => client.post(`/posts/${id}/save`),
  unsavePost: (id: string) => client.delete(`/posts/${id}/save`),

  getComments: (id: string) => client.get(`/posts/${id}/comments`),
  getCommentReplies: (id: string, commentId: string) =>
    client.get(`/posts/${id}/comments/${commentId}/replies`),
  addComment: (id: string, content: string, parentId?: string, moderationConfirmation?: string) =>
    client.post(`/posts/${id}/comments`, {
      content,
      parent_id: parentId,
      ...(moderationConfirmation ? { moderationConfirmation } : {}),
    }),
  updateComment: (commentId: string, content: string, moderationConfirmation?: string) =>
    client.patch(`/posts/comments/${commentId}`, {
      content,
      ...(moderationConfirmation ? { moderationConfirmation } : {}),
    }),
  deleteComment: (commentId: string) => client.delete(`/posts/comments/${commentId}`),
  likeComment: (commentId: string) => client.post(`/posts/comments/${commentId}/like`),
  unlikeComment: (commentId: string) => client.delete(`/posts/comments/${commentId}/like`),

  reportPost: (id: string, reason: string, description?: string) => client.post(`/posts/${id}/report`, { reason, description }),
  votePoll: (id: string, optionIndex: number) =>
    client.post(`/posts/${id}/poll-vote`, { option_index: optionIndex }),
}
