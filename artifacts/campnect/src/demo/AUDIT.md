# Campnect student demo audit and implementation checklist

The active application is `artifacts/campnect`, a React/Vite app. No administrator, legacy frontend, sandbox, database or backend source was modified. The production endpoint wrapper contracts in `api/*.ts`, store interfaces, and response consumers define the local adapter contracts. The main root tabs and nested routes remain in `App.tsx`; React Router, back coordinator and overlay registry remain in use.

## Runtime audit

- Axios: shared `api/client.ts`; JSON envelopes use `{ success, data, meta? }`. App-update and maintenance use a raw object. Protected media requests use binary Blob responses.
- Direct fetch: maintenance polling, optional GIPHY tracking and local/native media conversions. Maintenance and GIPHY tracking are disabled in demo. Local blob reads remain supported. A fetch guard rejects application data requests and external data origins.
- Socket.IO: `hooks/useSocket.ts`; demo skips socket creation and uses REST-shaped local reads and writes. No JWT refresh in demo.
- Push: native OneSignal initialization, identity sync and permission entry points return before setup in demo.
- Authentication: Zustand persist normally reads `campnect-auth`. Demo uses `campnect-demo-auth-v1`, local `demo:<id>` session identifiers, and the same verified `AuthUser` fields. ProtectedRoute refreshes resolve locally.
- Media: static original illustrations and animation under `/demo`; uploaded binary files are in IndexedDB, addressed through local `/api/media/demo-*` adapter identifiers. These identifiers are never fetched from an HTTP server. Existing authenticated media cache owns object URLs and revocation.
- Vite: `0.0.0.0:5000` for Replit, no API process. Demo Vite proxy is disabled. Production proxy is retained when the flag is false. Native build/signing, deployment and production secrets are outside this task.
- Existing tests: Node `node:test` through tsx, many source-contract tests and pure utility tests; Playwright added for browser journeys.
- Startup blockers addressed: session endpoint, maintenance poll, socket creation, push sync, upload health probes and protected media transport. Unknown demo calls reject with an explicit error and never fall through to a remote transport.

## Feature checklist and response sources

| Route family                                                              | Dependencies                                     | Implementation                                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `/login`, `/signup`, `/`                                                  | auth store, verified AuthUser                    | three predefined local accounts, shared data retained on switch                                              |
| `/app/feed`, `/app/post/:id`, `/app/create/post`                          | posts, comments, media, feedStore.Post           | chronological pagination, publish/edit/delete, likes, comments/replies, saves, shares, local reports         |
| `/app/search`, `/app/search/id-suggestions`                               | search objects, suggestions                      | query matching for students, colleges, communities, events, posts                                            |
| `/app/profile`, `/app/profile/:username`, follower lists, edit profile    | users, follows, posts, clips, glimpses           | own edits/media, public/private access, requests, block/unblock, relationship counts                         |
| `/app/college/:id`                                                        | college, course summaries, students              | local campus/course membership                                                                               |
| `/app/events` and detail/attendees/confirmation/create/edit               | eventStore.Event, colleges, chat                 | event records, RSVP, saves, attendees, owner edits/cancellation, local chat                                  |
| `/app/communities`, create, `/app/community/:slug`, edit                  | communityStore.Community, members, posts, events | public join/leave, create/edit, member roles, community posts and shared chat                                |
| `/app/glimpse`, create, `/:id`                                            | Glimpse and quota, post engagement               | image/video selection, preview, publish/delete, view tracking, likes/comments                                |
| `/app/clips`, create, `/:id`                                              | feedStore.Post/Clip, media                       | real local video playback and uploads, engagement, comments, delete                                          |
| `/app/chat`, new, requests, new-group, `/:id`, info                       | chatStore.Conversation/Message                   | persisted DM/group history, sends, reply references, attachments, edits/deletion, reactions, reads, requests |
| `/join/:token`                                                            | group preview/join                               | local invitation data; joining requires a demo account                                                       |
| `/app/notifications`                                                      | Notification[], follow requests                  | actor projections, unread counts, mark read, related content navigation                                      |
| `/app/settings` and account/privacy/notifications/security/saved/activity | users, local preferences                         | demo controls, reset, privacy/preferences/saved/activity; real security operations explicitly unavailable    |
| Help/article/legal/about                                                  | static help content, version                     | original static experience retained                                                                          |
| Call overlay                                                              | callStore.ActiveCall                             | explicitly simulated controls; no device access or WebRTC                                                    |
| Retired stories/reels/close-mates routes                                  | redirects in App                                 | preserved retirement; no replacement legacy UI                                                               |

## Discovered route path literals

- `/`
- `/onboarding`
- `/join/:token`
- `/login`
- `/signup`
- `/verify-email`
- `/verify-login`
- `/verify-college`
- `/forgot-password`
- `/reset-password`
- `/app`
- `feed`
- `search`
- `search/id-suggestions`
- `college/:id`
- `create`
- `create/post`
- `create-story`
- `glimpse`
- `glimpse/create`
- `glimpse/:id`
- `clips`
- `clips/create`
- `clips/:id`
- `chat`
- `chat/new`
- `chat/requests`
- `chat/new-group`
- `chat/:id`
- `chat/:id/info`
- `profile`
- `profile/:username`
- `profile/:username/followers`
- `profile/:username/following`
- `edit-profile`
- `post/:id`
- `communities`
- `communities/create`
- `community/:slug/edit`
- `community/:slug`
- `events`
- `events/create`
- `events/:id/confirmation`
- `events/:id/attendees`
- `events/:id/edit`
- `events/:id`
- `notifications`
- `settings`
- `settings/account`
- `settings/privacy`
- `settings/notifications`
- `settings/security`
- `settings/about`
- `settings/help`
- `settings/help/article/:slug`
- `settings/legal`
- `settings/saved`
- `settings/activity`
- `settings/content-appeals`
- `settings/close-mates`
- `*`

## Network callsite inventory

Current direct callsites are listed below. Wrapper methods retain their parameter and return types in their source files. Retired routes and explicitly unsupported security operations do not become remote fallbacks.

- `api/appUpdate.ts:14` — `get: () => client.get<AppUpdateNotice>('/app-update'), `
- `api/chat.ts:5` — `getConversations: () => client.get('/chat/conversations'), `
- `api/chat.ts:6` — `getConversation: (id: string) => client.get(/chat/conversations/${id}), `
- `api/chat.ts:7` — `muteConversation: (id: string, muted: boolean) => client.post(/chat/conversations/${id}/mute, { muted }), `
- `api/chat.ts:8` — `createDM: (userId: string) => client.post('/chat/conversations', { userId, type: 'private' }), `
- `api/chat.ts:10` — `client.get('/chat/users/search', { params: { q, limit } }), `
- `api/chat.ts:14` — `client.get(/chat/conversations/${convId}/messages, { params: { before, limit } }), `
- `api/chat.ts:16` — `client.post(/chat/conversations/${convId}/messages, formData), `
- `api/chat.ts:18` — `client.get(/chat/messages/${messageId}/seen-by), `
- `api/chat.ts:20` — `client.get('/chat/link-preview', { params: { url } }), `
- `api/chat.ts:22` — `client.patch(/chat/messages/${msgId}, { content }), `
- `api/chat.ts:24` — `client.delete(/chat/messages/${msgId}, { data: { forEveryone } }), `
- `api/chat.ts:26` — `client.post(/chat/messages/${msgId}/react, { emoji }), `
- `api/chat.ts:27` — `pinMessage: (msgId: string) => client.post(/chat/messages/${msgId}/pin), `
- `api/chat.ts:28` — `unpinMessage: (msgId: string) => client.delete(/chat/messages/${msgId}/pin), `
- `api/chat.ts:30` — `client.post(/chat/messages/${msgId}/report, { reason, description }), `
- `api/chat.ts:33` — `getRequests: () => client.get('/chat/requests'), `
- `api/chat.ts:34` — `acceptRequest: (convId: string) => client.post(/chat/requests/${convId}/accept), `
- `api/chat.ts:35` — `declineRequest: (convId: string) => client.post(/chat/requests/${convId}/decline), `
- `api/chat.ts:36` — `blockRequest: (convId: string) => client.post(/chat/requests/${convId}/block), `
- `api/chat.ts:40` — `client.post('/chat/groups', formData), `
- `api/chat.ts:42` — `client.patch(/chat/groups/${groupId}, formData), `
- `api/chat.ts:43` — `deleteGroup: (groupId: string) => client.delete(/chat/groups/${groupId}), `
- `api/chat.ts:46` — `generateInviteLink: (groupId: string) => client.post(/chat/groups/${groupId}/invite-link), `
- `api/chat.ts:47` — `revokeInviteLink: (groupId: string) => client.delete(/chat/groups/${groupId}/invite-link), `
- `api/chat.ts:50` — `previewJoin: (token: string) => client.get(/chat/groups/join/${token}), `
- `api/chat.ts:51` — `joinViaLink: (token: string) => client.post(/chat/groups/join/${token}), `
- `api/chat.ts:54` — `getMembers: (groupId: string) => client.get(/chat/groups/${groupId}/members), `
- `api/chat.ts:55` — `addMembers: (groupId: string, userIds: string[]) => client.post(/chat/groups/${groupId}/members, { userIds }), `
- `api/chat.ts:56` — `removeMember: (groupId: string, userId: string) => client.delete(/chat/groups/${groupId}/members/${userId}), `
- `api/chat.ts:58` — `client.patch(/chat/groups/${groupId}/members/${userId}/role, { role, rights }), `
- `api/chat.ts:60` — `client.patch(/chat/groups/${groupId}/members/${userId}/tag, { tag }), `
- `api/chat.ts:63` — `getGroupMedia: (groupId: string, before?: string) => client.get(/chat/groups/${groupId}/media, { params: { before } }), `
- `api/chat.ts:64` — `getGroupFiles: (groupId: string, before?: string) => client.get(/chat/groups/${groupId}/files, { params: { before } }), `
- `api/chat.ts:65` — `getGroupLinks: (groupId: string) => client.get(/chat/groups/${groupId}/links), `
- `api/chat.ts:68` — `getJoinRequests: (groupId: string) => client.get(/chat/groups/${groupId}/join-requests), `
- `api/chat.ts:69` — `approveJoinRequest: (groupId: string, reqId: string) => client.post(/chat/groups/${groupId}/join-requests/${reqId}/approve), `
- `api/chat.ts:70` — `rejectJoinRequest: (groupId: string, reqId: string) => client.post(/chat/groups/${groupId}/join-requests/${reqId}/reject), `
- `api/client.ts:173` — `const res = await axios.post(${API_BASE}/auth/refresh, { refreshToken }) `
- `api/clips.ts:52` — `await client.get('/healthz', { timeout: 15_000, signal }) `
- `api/clips.ts:86` — `client.get<{ data: Clip[]; meta: ClipFeedMeta }>('/clips', { params: { cursor: cursor || undefined, limit } }), `
- `api/clips.ts:87` — `get: (id: string) => client.get<{ data: Clip }>(/clips/${id}), `
- `api/clips.ts:88` — `getUserClips: (username: string) => client.get<{ data: Clip[] }>(/clips/users/${encodeURIComponent(username)}), `
- `api/clips.ts:92` — `return client.post<{ data: Clip }>('/clips', fd, config) `
- `api/clips.ts:102` — `() => client.post<{ data: { id: string; chunk_size: number; total_chunks: number } }>('/clips/uploads', { `
- `api/clips.ts:115` — `() => client.put(/clips/uploads/${upload.id}/chunks/${index}, chunk, { `
- `api/clips.ts:125` — `() => client.post<{ data: Clip }>(/clips/uploads/${upload.id}/complete, undefined, { `
- `api/clips.ts:132` — `delete: (id: string) => client.delete(/clips/${id}), `
- `api/clips.ts:133` — `report: (id: string, reason: string, description?: string) => client.post(/clips/${id}/report, { reason, description }), `
- `api/clips.ts:134` — `recordView: (id: string) => client.post(/clips/${id}/view), `
- `api/colleges.ts:16` — `client.get('/colleges', { params }), `
- `api/communities.ts:5` — `client.get('/communities', { params }), `
- `api/communities.ts:6` — `getCategories: () => client.get('/communities/categories'), `
- `api/communities.ts:7` — `getBySlug: (slug: string) => client.get(/communities/${slug}), `
- `api/communities.ts:8` — `join: (id: string) => client.post(/communities/${id}/join), `
- `api/communities.ts:9` — `leave: (id: string) => client.delete(/communities/${id}/join), `
- `api/communities.ts:11` — `client.get(/communities/${id}/members, { params: { page } }), `
- `api/communities.ts:13` — `client.get(/communities/${id}/posts, { params: { page } }), `
- `api/communities.ts:15` — `client.post('/communities', data), `
- `api/communities.ts:17` — `client.patch(/communities/${id}, data), `
- `api/events.ts:7` — `client.get('/events', { params }), `
- `api/events.ts:8` — `getById: (id: string) => client.get(/events/${id}), `
- `api/events.ts:10` — `client.post('/events', data, { `
- `api/events.ts:17` — `client.post(/events/${id}/rsvp, { status }), `
- `api/events.ts:18` — `leave: (id: string) => client.delete(/events/${id}/rsvp), `
- `api/events.ts:19` — `save: (id: string) => client.post(/events/${id}/save), `
- `api/events.ts:20` — `unsave: (id: string) => client.delete(/events/${id}/save), `
- `api/events.ts:22` — `client.get(/events/${id}/attendees, { params: status ? { status } : undefined }), `
- `api/events.ts:23` — `getChat: (id: string) => client.get(/events/${id}/chat), `
- `api/events.ts:24` — `promoteAttendee: (id: string, userId: string) => client.post(/events/${id}/attendees/${userId}/promote), `
- `api/events.ts:25` — `removeAttendee: (id: string, userId: string) => client.delete(/events/${id}/attendees/${userId}), `
- `api/events.ts:27` — `client.post(/events/${id}/report, { reason, description }), `
- `api/events.ts:29` — `client.post(/events/${id}/cancel, { reason }), `
- `api/events.ts:31` — `client.post(/events/${id}/end), `
- `api/events.ts:33` — `client.post(/events/${id}/announcements, { body }), `
- `api/events.ts:35` — `client.post(/events/${id}/invitations, { username }), `
- `api/events.ts:37` — `client.post(/events/${id}/hosts, { username }), `
- `api/events.ts:39` — `client.delete(/events/${id}/hosts/${userId}), `
- `api/events.ts:41` — `client.patch(/events/${id}, data, { timeout: UPLOAD_TIMEOUT_MS }), `
- `api/glimpses.ts:80` — `await client.get('/healthz', { timeout: 15_000, signal }) `
- `api/glimpses.ts:98` — `client.get<{ success: boolean; data: Glimpse[]; meta: { page: number; limit: number; hasMore: boolean } }>('/glimpses', { `
- `api/glimpses.ts:102` — `getQuota: () => client.get<{ success: boolean; data: GlimpseQuota }>('/glimpses/quota'), `
- `api/glimpses.ts:103` — `getById: (id: string) => client.get<{ success: boolean; data: Glimpse }>(/glimpses/${id}), `
- `api/glimpses.ts:104` — `getInsights: (id: string) => client.get<{ success: boolean; data: GlimpseInsights }>(/glimpses/${id}/insights), `
- `api/glimpses.ts:105` — `delete: (id: string) => client.delete(/glimpses/${id}), `
- `api/glimpses.ts:114` — `return await client.post<{ success: boolean; data: Glimpse; meta?: { quota?: GlimpseQuota }; message?: string }>('/glimpses', data, requestConfig) `
- `api/glimpses.ts:119` — `return client.post<{ success: boolean; data: Glimpse; meta?: { quota?: GlimpseQuota }; message?: string }>('/glimpses', data, requestConfig) `
- `api/glimpses.ts:123` — `client.post(/glimpses/${id}/view, { watch_pct: watchPct, watch_seconds: watchSeconds }), `
- `api/glimpses.ts:124` — `share: (id: string) => client.post(/glimpses/${id}/share), `
- `api/glimpses.ts:126` — `client.post(/glimpses/${id}/report, { reason, description }), `
- `api/highlights.ts:23` — `client.get(/highlights/user/${userId}), `
- `api/highlights.ts:29` — `}) => client.post('/highlights', data), `
- `api/highlights.ts:32` — `client.patch(/highlights/${id}, data), `
- `api/highlights.ts:35` — `client.delete(/highlights/${id}), `
- `api/media.ts:27` — `const response = await client.get(url, { responseType: 'blob', timeout: 60_000 }) `
- `api/notifications.ts:5` — `client.get('/notifications', { params }), `
- `api/notifications.ts:7` — `client.patch(/notifications/${id}/read), `
- `api/notifications.ts:9` — `client.post('/notifications/read-all'), `
- `api/notifications.ts:11` — `client.delete(/notifications/${id}), `
- `api/posts.ts:6` — `client.get('/posts/feed', { params: { cursor: cursor || undefined, limit, type, mode: 'latest' } }), `
- `api/posts.ts:9` — `client.post('/posts', formData, { timeout: 120_000, ...config }), `
- `api/posts.ts:14` — `return client.post('/posts/video-preview', formData, { `
- `api/posts.ts:20` — `getPost: (id: string) => client.get(/posts/${id}), `
- `api/posts.ts:23` — `client.patch(/posts/${id}, data), `
- `api/posts.ts:24` — `deletePost: (id: string) => client.delete(/posts/${id}), `
- `api/posts.ts:26` — `likePost: (id: string) => client.post(/posts/${id}/like), `
- `api/posts.ts:27` — `unlikePost: (id: string) => client.delete(/posts/${id}/like), `
- `api/posts.ts:29` — `savePost: (id: string) => client.post(/posts/${id}/save), `
- `api/posts.ts:30` — `unsavePost: (id: string) => client.delete(/posts/${id}/save), `
- `api/posts.ts:32` — `getComments: (id: string) => client.get(/posts/${id}/comments), `
- `api/posts.ts:34` — `client.get(/posts/${id}/comments/${commentId}/replies), `
- `api/posts.ts:36` — `client.post(/posts/${id}/comments, { `
- `api/posts.ts:42` — `client.patch(/posts/comments/${commentId}, { `
- `api/posts.ts:46` — `deleteComment: (commentId: string) => client.delete(/posts/comments/${commentId}), `
- `api/posts.ts:47` — `likeComment: (commentId: string) => client.post(/posts/comments/${commentId}/like), `
- `api/posts.ts:48` — `unlikeComment: (commentId: string) => client.delete(/posts/comments/${commentId}/like), `
- `api/posts.ts:50` — `reportPost: (id: string, reason: string, description?: string) => client.post(/posts/${id}/report, { reason, description }), `
- `api/posts.ts:52` — `client.post(/posts/${id}/poll-vote, { option_index: optionIndex }), `
- `api/search.ts:5` — `client.get('/search', { params: { q, type, ...params } }), `
- `api/search.ts:7` — `client.get('/search', { params: { q: '', type: 'all' } }), `
- `api/stories.ts:4` — `getFeed: () => client.get('/stories/feed'), `
- `api/stories.ts:6` — `client.post('/stories', formData, { timeout: 120_000 }), `
- `api/stories.ts:7` — `updateStory: (id: string, caption: string) => client.patch(/stories/${id}, { caption }), `
- `api/stories.ts:8` — `deleteStory: (id: string) => client.delete(/stories/${id}), `
- `api/stories.ts:9` — `viewStory: (id: string) => client.post(/stories/${id}/view), `
- `api/stories.ts:10` — `getByUser: (userId: string) => client.get(/stories/user/${userId}), `
- `api/stories.ts:11` — `getViewers: (id: string) => client.get(/stories/${id}/viewers), `
- `api/stories.ts:12` — `replyStory: (id: string, content: string) => client.post(/stories/${id}/reply, { content }), `
- `api/users.ts:30` — `getMe: () => client.get('/users/me'), `
- `api/users.ts:31` — `updateMe: (data: Record<string, unknown>) => client.patch('/users/me', data), `
- `api/users.ts:33` — `client.post('/users/me/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } }), `
- `api/users.ts:35` — `client.post('/users/me/cover', formData, { headers: { 'Content-Type': 'multipart/form-data' } }), `
- `api/users.ts:36` — `removeAvatar: () => client.delete('/users/me/avatar'), `
- `api/users.ts:37` — `removeCover:  () => client.delete('/users/me/cover'), `
- `api/users.ts:38` — `getByUsername: (username: string) => client.get(/users/${username}), `
- `api/users.ts:40` — `getProfile: (username: string) => client.get(/users/${username}), `
- `api/users.ts:41` — `follow: (id: string) => client.post(/users/${id}/follow), `
- `api/users.ts:42` — `unfollow: (id: string) => client.delete(/users/${id}/follow), `
- `api/users.ts:43` — `getFollowRequests: () => client.get<{ success: boolean; data: FollowRequest[] }>('/users/me/follow-requests'), `
- `api/users.ts:44` — `acceptFollowRequest: (followerId: string) => client.post(/users/follow-requests/${followerId}/accept), `
- `api/users.ts:45` — `deleteFollowRequest: (followerId: string) => client.delete(/users/follow-requests/${followerId}), `
- `api/users.ts:47` — `followUser: (id: string) => client.post(/users/${id}/follow), `
- `api/users.ts:49` — `unfollowUser: (id: string) => client.delete(/users/${id}/follow), `
- `api/users.ts:50` — `getFollowers: (id: string) => client.get(/users/${id}/followers), `
- `api/users.ts:51` — `getFollowing: (id: string) => client.get(/users/${id}/following), `
- `api/users.ts:53` — `client.get(/users/${id}/posts, { params: { page, view } }), `
- `api/users.ts:54` — `getSavedPosts: (page = 1) => client.get('/users/me/saved', { params: { page } }), `
- `api/users.ts:55` — `getActivity: () => client.get('/users/me/activity'), `
- `api/users.ts:56` — `getSuggestions: () => client.get('/users/suggestions'), `
- `api/users.ts:57` — `getIdSuggestions: (limit = 10) => client.get('/users/id-suggestions', { params: { limit } }), `
- `api/users.ts:58` — `getMutualFollowers: (id: string) => client.get(/users/${id}/mutual-followers), `
- `api/users.ts:59` — `getCloseMates: () => client.get('/users/me/close-mates'), `
- `api/users.ts:60` — `addCloseMate: (id: string) => client.put(/users/me/close-mates/${id}), `
- `api/users.ts:61` — `removeCloseMate: (id: string) => client.delete(/users/me/close-mates/${id}), `
- `api/users.ts:62` — `searchUsers: (q: string) => client.get('/search', { params: { q, type: 'users' } }), `
- `api/users.ts:64` — `search: (q: string) => client.get('/search', { params: { q, type: 'users' } }), `
- `api/users.ts:66` — `requestAlumniStatus: (message = '') => client.post('/users/me/alumni-request', { message }), `
- `api/users.ts:67` — `getAlumniRequest: () => client.get('/users/me/alumni-request'), `
- `api/users.ts:68` — `getMyAppeals: () => client.get('/users/me/appeals'), `
- `api/users.ts:69` — `submitAppeal: (evidence: string) => client.post('/users/me/appeals', { evidence }), `
- `api/users.ts:71` — `client.get<{ success: boolean; data: CommentModerationRecord[] }>('/users/me/comment-moderation'), `
- `api/users.ts:73` — `client.post('/users/me/appeals', { moderation_action_id: moderationActionId, evidence }), `
- `api/users.ts:74` — `getMyModeratedContent: () => client.get('/users/me/moderated-content'), `
- `api/users.ts:76` — `client.post('/users/me/appeals', { post_id: postId, evidence }), `
- `api/users.ts:77` — `block: (id: string) => client.post(/users/block/${id}), `
- `api/users.ts:78` — `unblock: (id: string) => client.delete(/users/block/${id}), `
- `api/users.ts:79` — `report: (id: string, reason: string, description = '') => client.post(/users/${id}/report, { reason, description }), `
- `api/users.ts:80` — `restrict: (id: string) => client.post(/users/${id}/restrict), `
- `api/users.ts:81` — `unrestrict: (id: string) => client.delete(/users/${id}/restrict), `
- `hooks/useAuthMedia.ts:145` — `const res = await client.get(path, { responseType: 'blob', timeout, signal: controller.signal }) `
- `hooks/useMaintenanceStatus.ts:28` — `const res = await fetch(${API_BASE}/maintenance, { cache: 'no-store' }) `
- `hooks/useSocket.ts:118` — `const socket = io(API_ORIGIN || '/', { `
- `stores/authStore.ts:83` — `const res = await client.post('/auth/login', { identifier, email: identifier, password }) `
- `stores/authStore.ts:101` — `const res = await client.post('/auth/signup', data) `
- `stores/authStore.ts:109` — `const res = await client.post('/auth/verify-email', { email, otp }) `
- `stores/authStore.ts:122` — `const res = await client.post('/auth/verify-login', { email, otp }) `
- `stores/authStore.ts:134` — `client.post('/auth/logout', { refreshToken }).catch(() => {}) `
- `stores/authStore.ts:184` — `const res = await client.get('/users/me') `
- `stores/chatStore.ts:324` — `if (DEMO_MODE) void client.get(/chat/conversations/${convId}/messages, { params: { limit: 1 } }) `
- `stores/reelsStore.ts:41` — `const res = await client.get('/posts/feed', { params: { ...params, type: 'reel', mode: 'all' } }) `
- `stores/reelsStore.ts:59` — `try { await client.post(/posts/${id}/like) } catch { `
- `stores/reelsStore.ts:66` — `try { await client.delete(/posts/${id}/like) } catch { `
- `stores/reelsStore.ts:73` — `try { await client.post(/posts/${id}/save) } catch { `
- `stores/reelsStore.ts:80` — `try { await client.delete(/posts/${id}/save) } catch { `
- `screens/auth/ForgotPasswordScreen.tsx:41` — `await client.post('/auth/forgot-password', { email: email.toLowerCase().trim() }) `
- `screens/auth/ForgotPasswordScreen.tsx:65` — `await client.post('/auth/reset-password', { email: email.toLowerCase().trim(), otp, password }) `
- `screens/auth/ForgotPasswordScreen.tsx:75` — `await client.post('/auth/resend-otp', { email: email.toLowerCase().trim(), type: 'reset' }) `
- `screens/auth/RegisterScreen.tsx:362` — `const check = await client.get(/colleges/check-email?email=${encodeURIComponent(form.email.toLowerCase())}) `
- `screens/auth/RegisterScreen.tsx:369` — `await client.post('/auth/signup', { `
- `screens/auth/RegisterScreen.tsx:392` — `const res = await client.post('/auth/verify-email', { `
- `screens/auth/RegisterScreen.tsx:416` — `await client.post('/auth/resend-otp', { email: form.email.toLowerCase().trim() }) `
- `screens/auth/RegisterScreen.tsx:444` — `await client.patch('/users/me', { username: form.username.trim() }) `
- `screens/auth/RegisterScreen.tsx:461` — `await client.post('/users/me/change-password', { `
- `screens/auth/RegisterScreen.tsx:478` — `await client.patch('/users/me', { `
- `screens/auth/RegisterScreen.tsx:497` — `const me = await client.get('/users/me') `
- `screens/auth/SignupScreen.tsx:34` — `const res = await client.get(/colleges/check-email?email=${encodeURIComponent(val.toLowerCase())}) `
- `screens/auth/VerifyCollegeScreen.tsx:82` — `await client.post('/auth/college-verify', formData, { `
- `screens/auth/VerifyEmailScreen.tsx:61` — `await client.post('/auth/resend-otp', { email, type: 'verify' }) `
- `screens/auth/VerifyLoginScreen.tsx:68` — `await client.post('/auth/resend-otp', { email, type: 'login' }) `
- `screens/main/CollegeMembersScreen.tsx:29` — `client.get(/colleges/${id}), `
- `screens/main/CollegeMembersScreen.tsx:30` — `client.get(/colleges/${id}/courses), `
- `screens/main/CollegeMembersScreen.tsx:47` — `client.get(/colleges/${id}/students, { params: { course: selectedCourse, limit: 100 } }) `
- `screens/main/CommunityScreen.tsx:212` — `{DEMO_MODE && community.is_member && <button onClick={async () => { try { const response = await client.get(/communities/${community.id}/chat); navigate(/app/chat/${response.data.data.id}) } catch (e: any) { toast.error(e.message) } }} style={{ padding: 12, borderRadius: radii.pill, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}>Open community chat</button>} `
- `screens/main/CreateGlimpseScreen.tsx:127` — `const response = await fetch(Capacitor.convertFileSrc(capture.uri)) `
- `screens/main/FollowListScreen.tsx:17` — `return client.delete(/users/me/followers/${followerId}) `
- `screens/main/SettingsScreen.tsx:54` — `const response = await client.patch('/users/me', { is_private: value ? 1 : 0 }) `
- `screens/settings/AccountScreen.tsx:31` — `await client.post('/users/me/change-email/request', { email: newEmail.trim() }) `
- `screens/settings/AccountScreen.tsx:43` — `await client.post('/users/me/change-email/verify', { email: newEmail.trim(), otp: emailOtp }) `
- `screens/settings/AccountScreen.tsx:57` — `await client.delete('/users/me') `
- `screens/settings/NotificationPrefsScreen.tsx:68` — `client.get('/users/me').then((res) => { `
- `screens/settings/NotificationPrefsScreen.tsx:92` — `const response = await client.patch('/users/me/notification-prefs', next) `
- `screens/settings/PrivacyScreen.tsx:55` — `client.get('/users/me'), `
- `screens/settings/PrivacyScreen.tsx:56` — `client.get('/users/me/blocked').catch(() => ({ data: { data: [] } })), `
- `screens/settings/PrivacyScreen.tsx:73` — `const res = await client.patch('/users/me', patch) `
- `screens/settings/PrivacyScreen.tsx:81` — `try { await client.patch('/users/me/privacy', next) } catch {} `
- `screens/settings/PrivacyScreen.tsx:86` — `await client.delete(/users/block/${userId}) `
- `screens/settings/SecurityScreen.tsx:32` — `const res = await client.get('/auth/sessions').catch(() => ({ data: { data: [] } })) `
- `screens/settings/SecurityScreen.tsx:45` — `await client.post('/users/me/change-password', { currentPassword, newPassword }) `
- `screens/settings/SecurityScreen.tsx:60` — `await client.delete('/auth/sessions').catch(() => {}) `
- `features/giphy/provider.ts:81` — `const request = client.get<{ success: boolean; data?: GiphyResult[] }>('/chat/giphy', { `
- `features/giphy/provider.ts:123` — `void fetch(parsed.toString(), { mode: 'no-cors', keepalive: true }).catch(() => undefined) `
