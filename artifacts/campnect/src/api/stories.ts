import client from './client'

export const storiesApi = {
  getFeed: () => client.get('/stories/feed'),
  createStory: (formData: FormData) =>
    client.post('/stories', formData, { timeout: 120_000 }),
  updateStory: (id: string, caption: string) => client.patch(`/stories/${id}`, { caption }),
  deleteStory: (id: string) => client.delete(`/stories/${id}`),
  viewStory: (id: string) => client.post(`/stories/${id}/view`),
  getByUser: (userId: string) => client.get(`/stories/user/${userId}`),
  getViewers: (id: string) => client.get(`/stories/${id}/viewers`),
  replyStory: (id: string, content: string) => client.post(`/stories/${id}/reply`, { content }),
}
