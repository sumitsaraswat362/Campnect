import client from './client'

export interface HighlightStory {
  id: string
  highlight_id: string
  story_id?: string
  media_url: string
  type: string
  added_at: string
}

export interface Highlight {
  id: string
  user_id: string
  title: string
  cover_url?: string
  created_at: string
  stories: HighlightStory[]
}

export const highlightsApi = {
  getUserHighlights: (userId: string) =>
    client.get(`/highlights/user/${userId}`),

  createHighlight: (data: {
    title: string
    cover_url?: string
    stories: { story_id?: string; media_url: string; type: string }[]
  }) => client.post('/highlights', data),

  updateHighlight: (id: string, data: { title?: string; cover_url?: string }) =>
    client.patch(`/highlights/${id}`, data),

  deleteHighlight: (id: string) =>
    client.delete(`/highlights/${id}`),
}
