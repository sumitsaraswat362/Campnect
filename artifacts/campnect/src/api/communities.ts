import client from './client'

export const communitiesApi = {
  getAll: (params?: Record<string, string | number>) =>
    client.get('/communities', { params }),
  getCategories: () => client.get('/communities/categories'),
  getBySlug: (slug: string) => client.get(`/communities/${slug}`),
  join: (id: string) => client.post(`/communities/${id}/join`),
  leave: (id: string) => client.delete(`/communities/${id}/join`),
  getMembers: (id: string, page = 1) =>
    client.get(`/communities/${id}/members`, { params: { page } }),
  getPosts: (id: string, page = 1) =>
    client.get(`/communities/${id}/posts`, { params: { page } }),
  create: (data: { name: string; description: string; category: string; is_private?: boolean }) =>
    client.post('/communities', data),
  update: (id: string, data: FormData) =>
    client.patch(`/communities/${id}`, data),
}
