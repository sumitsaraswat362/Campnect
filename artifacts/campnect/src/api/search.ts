import client from './client'

export const searchApi = {
  search: (q: string, type: string = 'all', params?: Record<string, string>) =>
    client.get('/search', { params: { q, type, ...params } }),
  trending: () =>
    client.get('/search', { params: { q: '', type: 'all' } }),
}
