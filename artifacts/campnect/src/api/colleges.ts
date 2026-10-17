import client from './client'

export interface College {
  id: string
  name: string
  short_name?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  logo_url?: string | null
  students_count?: number | null
}

export const collegesApi = {
  getAll: (params?: Record<string, string | number | boolean>) =>
    client.get('/colleges', { params }),
}