import client from './client'

const UPLOAD_TIMEOUT_MS = 120_000

export const eventsApi = {
  getAll: (params?: Record<string, string | number | boolean>) =>
    client.get('/events', { params }),
  getById: (id: string) => client.get(`/events/${id}`),
  create: (data: Record<string, unknown> | FormData, onUploadProgress?: (progress: number) => void) =>
    client.post('/events', data, {
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: onUploadProgress
        ? (event) => onUploadProgress(event.total ? Math.round((event.loaded / event.total) * 100) : 0)
        : undefined,
    }),
  rsvp: (id: string, status: 'going' | 'interested' | 'not_going') =>
    client.post(`/events/${id}/rsvp`, { status }),
  leave: (id: string) => client.delete(`/events/${id}/rsvp`),
  save: (id: string) => client.post(`/events/${id}/save`),
  unsave: (id: string) => client.delete(`/events/${id}/save`),
  getAttendees: (id: string, status?: string) =>
    client.get(`/events/${id}/attendees`, { params: status ? { status } : undefined }),
  getChat: (id: string) => client.get(`/events/${id}/chat`),
  promoteAttendee: (id: string, userId: string) => client.post(`/events/${id}/attendees/${userId}/promote`),
  removeAttendee: (id: string, userId: string) => client.delete(`/events/${id}/attendees/${userId}`),
  report: (id: string, reason: string, description?: string) =>
    client.post(`/events/${id}/report`, { reason, description }),
  cancel: (id: string, reason?: string) =>
    client.post(`/events/${id}/cancel`, { reason }),
  end: (id: string) =>
    client.post(`/events/${id}/end`),
  announce: (id: string, body: string) =>
    client.post(`/events/${id}/announcements`, { body }),
  invite: (id: string, username: string) =>
    client.post(`/events/${id}/invitations`, { username }),
  addHost: (id: string, username: string) =>
    client.post(`/events/${id}/hosts`, { username }),
  removeHost: (id: string, userId: string) =>
    client.delete(`/events/${id}/hosts/${userId}`),
  update: (id: string, data: Record<string, unknown> | FormData) =>
    client.patch(`/events/${id}`, data, { timeout: UPLOAD_TIMEOUT_MS }),
}

/** Generate and download an ICS calendar file from an event */
export function downloadICS(event: {
  id: string
  title: string
  description?: string
  location?: string
  starts_at: string
}) {
  const fmt = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Campnect//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@campnect`,
    `SUMMARY:${event.title}`,
    event.description ? `DESCRIPTION:${event.description.replace(/\n/g, '\\n').slice(0, 500)}` : '',
    event.location ? `LOCATION:${event.location}` : '',
    `DTSTART:${fmt(event.starts_at)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  const blob = new Blob([lines], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${event.title.replace(/[^a-z0-9]/gi, '_')}.ics`
  a.click()
  URL.revokeObjectURL(url)
}
