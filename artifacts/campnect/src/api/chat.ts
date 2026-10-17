import client from './client'

export const chatApi = {
  // Conversations
  getConversations: () => client.get('/chat/conversations'),
  getConversation: (id: string) => client.get(`/chat/conversations/${id}`),
  muteConversation: (id: string, muted: boolean) => client.post(`/chat/conversations/${id}/mute`, { muted }),
  createDM: (userId: string) => client.post('/chat/conversations', { userId, type: 'private' }),
  searchUsers: (q: string, limit = 20) =>
    client.get('/chat/users/search', { params: { q, limit } }),

  // Messages
  getMessages: (convId: string, before?: string, limit = 30) =>
    client.get(`/chat/conversations/${convId}/messages`, { params: { before, limit } }),
  sendMessage: (convId: string, formData: FormData) =>
    client.post(`/chat/conversations/${convId}/messages`, formData),
  getMessageSeenBy: (messageId: string) =>
    client.get(`/chat/messages/${messageId}/seen-by`),
  getLinkPreview: (url: string) =>
    client.get('/chat/link-preview', { params: { url } }),
  editMessage: (msgId: string, content: string) =>
    client.patch(`/chat/messages/${msgId}`, { content }),
  deleteMessage: (msgId: string, forEveryone: boolean) =>
    client.delete(`/chat/messages/${msgId}`, { data: { forEveryone } }),
  reactToMessage: (msgId: string, emoji: string) =>
    client.post(`/chat/messages/${msgId}/react`, { emoji }),
  pinMessage: (msgId: string) => client.post(`/chat/messages/${msgId}/pin`),
  unpinMessage: (msgId: string) => client.delete(`/chat/messages/${msgId}/pin`),
  reportMessage: (msgId: string, reason: string, description?: string) =>
    client.post(`/chat/messages/${msgId}/report`, { reason, description }),

  // Message requests
  getRequests: () => client.get('/chat/requests'),
  acceptRequest: (convId: string) => client.post(`/chat/requests/${convId}/accept`),
  declineRequest: (convId: string) => client.post(`/chat/requests/${convId}/decline`),
  blockRequest: (convId: string) => client.post(`/chat/requests/${convId}/block`),

  // Groups — create & settings
  createGroup: (formData: FormData) =>
    client.post('/chat/groups', formData),
  updateGroup: (groupId: string, formData: FormData) =>
    client.patch(`/chat/groups/${groupId}`, formData),
  deleteGroup: (groupId: string) => client.delete(`/chat/groups/${groupId}`),

  // Groups — invite link
  generateInviteLink: (groupId: string) => client.post(`/chat/groups/${groupId}/invite-link`),
  revokeInviteLink: (groupId: string) => client.delete(`/chat/groups/${groupId}/invite-link`),

  // Groups — join via invite link
  previewJoin: (token: string) => client.get(`/chat/groups/join/${token}`),
  joinViaLink: (token: string) => client.post(`/chat/groups/join/${token}`),

  // Groups — members
  getMembers: (groupId: string) => client.get(`/chat/groups/${groupId}/members`),
  addMembers: (groupId: string, userIds: string[]) => client.post(`/chat/groups/${groupId}/members`, { userIds }),
  removeMember: (groupId: string, userId: string) => client.delete(`/chat/groups/${groupId}/members/${userId}`),
  changeMemberRole: (groupId: string, userId: string, role: string, rights?: Record<string, boolean>) =>
    client.patch(`/chat/groups/${groupId}/members/${userId}/role`, { role, rights }),
  changeMemberTag: (groupId: string, userId: string, tag: string) =>
    client.patch(`/chat/groups/${groupId}/members/${userId}/tag`, { tag }),

  // Groups — shared content
  getGroupMedia: (groupId: string, before?: string) => client.get(`/chat/groups/${groupId}/media`, { params: { before } }),
  getGroupFiles: (groupId: string, before?: string) => client.get(`/chat/groups/${groupId}/files`, { params: { before } }),
  getGroupLinks: (groupId: string) => client.get(`/chat/groups/${groupId}/links`),

  // Groups — join requests (admin)
  getJoinRequests: (groupId: string) => client.get(`/chat/groups/${groupId}/join-requests`),
  approveJoinRequest: (groupId: string, reqId: string) => client.post(`/chat/groups/${groupId}/join-requests/${reqId}/approve`),
  rejectJoinRequest: (groupId: string, reqId: string) => client.post(`/chat/groups/${groupId}/join-requests/${reqId}/reject`),
}
