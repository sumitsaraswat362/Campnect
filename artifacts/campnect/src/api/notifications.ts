import client from './client'

export const notificationsApi = {
  getAll: (params?: Record<string, string | number>) =>
    client.get('/notifications', { params }),
  markRead: (id: string) =>
    client.patch(`/notifications/${id}/read`),
  markAllRead: () =>
    client.post('/notifications/read-all'),
  delete: (id: string) =>
    client.delete(`/notifications/${id}`),
}
