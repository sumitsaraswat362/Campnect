# Campnect Internal Documentation

> Internal engineering and operations guide for the Campnect workspace.
>
> This document describes the current repository as implemented. It intentionally
> never contains secret values, passwords, tokens, private keys, or database
> connection strings. Secret names are listed only where the application expects
> them.

## 1. Product overview

Campnect is a verified campus social platform. Its main product areas are:

- Campus account registration and email/OTP authentication
- College and campus membership verification
- A chronological campus feed
- Posts, comments, likes, saves, shares, and reporting
- Events and event attendance
- Communities and groups
- Glimpses, the campus photo/video story surface
- Clips, the protected short-video surface
- Profiles, follows, private accounts, follow requests, close mates, and blocking
- One-to-one and group chat
- Protected image, video, audio, and file media
- Voice/video call signaling through Socket.IO and WebRTC
- Notifications and Android push notifications through OneSignal
- A separate administrator console for moderation, account operations, reports,
  verification, appeals, audit history, and maintenance mode
- A bundled Android application built with Capacitor

The current public web application is the `artifacts/campnect` artifact and
owns the `/` path. The backend and production frontend are also packaged
together for the Autoscale deployment.

---

## 2. Repository layout

### Top-level areas

| Path | Purpose |
|---|---|
| `artifacts/campnect/` | Current React/Vite web application |
| `artifacts/api-server/` | Express API, PostgreSQL access, Socket.IO, media, auth, and admin routes |
| `artifacts/campnect-admin/` | Standalone administrator web console and same-origin BFF |
| `artifacts/campnect-app/` | Retained legacy frontend source; not part of production hosting |
| `artifacts/mockup-sandbox/` | Design/mockup preview artifact |
| `android/` | Native Capacitor Android project |
| `capacitor.config.ts` | Capacitor app identity, web bundle, status bar, and native plugin configuration |
| `attached_assets/` | Uploaded references, logs, screenshots, and user-provided material; not runtime source |
| `.agents/memory/` | Durable engineering notes for future agents |
| `project config` | npm scripts, ports, Nix packages, and Autoscale deployment settings |
| `package.json` | Workspace scripts and root Capacitor/tooling dependencies |
| `README.md` | Collaborator notes; some older stack wording may not match the current legacy API implementation |

### Current artifacts

#### Current web app: `artifacts/campnect`

- Artifact title: `Campnect`
- Preview path: `/`
- Development port: `22821`
- Production output: `artifacts/campnect/dist/public`
- Build: Vite
- Runtime: React, React Router, Zustand, Axios, Socket.IO client, Capacitor plugins
- Development command:

```bash
pnpm --filter @workspace/campnect run dev
```

#### API: `artifacts/api-server`

- Artifact title: `API Server`
- Internal port: `8080`
- Paths: `/api`, `/uploads`, `/socket.io`
- Development command:

```bash
pnpm --filter @workspace/api-server run dev
```

- Production command:

```bash
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

#### Admin app: `artifacts/campnect-admin`

- Artifact title: `Campnect Admin`
- Browser path: `/campnect-admin/`
- Development port: `20880`
- The browser never receives the Admin Panel service secret.
- The Node server in `server.mjs` serves static files and proxies `/api/*` to
  the backend while injecting the server-only service header.

#### Legacy app: `artifacts/campnect-app`

- Artifact title: `Campnect (legacy)`
- Browser path: `/campnect-legacy/`
- Development port: `23272`
- It is not the production root application.
- It remains available for reference, comparison, and recovery of older UI
  behavior. Do not route new work to it unless explicitly asked.

#### Mockup sandbox: `artifacts/mockup-sandbox`

- Used for isolated component previews and canvas/design work.
- It is not part of the production Campnect request path.

---

## 3. Technology stack

### Web

- React
- TypeScript
- Vite
- React Router
- Zustand
- Axios
- Socket.IO client
- `react-hot-toast`
- Lucide icons
- Capacitor web plugins
- CSS variables and project style tokens

### Backend

- Node.js
- Express
- PostgreSQL accessed through the `pg` package
- Socket.IO
- JWT access and refresh tokens
- `bcryptjs` for password hashing and administrative credential handling
- `helmet`
- `cors`
- `express-rate-limit`
- `pino`/`pino-http` logging
- `sharp`/ImageMagick/FFmpeg-related media processing where used by media services

### Native Android

- Capacitor 8
- Android Gradle project
- Java native plugins under `android/app/src/main/java/com/campnect/app/`
- OneSignal Capacitor plugin
- Capacitor Camera, Filesystem, Keyboard, Push Notifications, Splash Screen,
  Status Bar, and custom Campnect plugins

### Database

The running Campnect API uses a PostgreSQL database reached through the
`DATABASE_URL` environment variable. In the current environment this is the Supabase
transaction-pooler connection.

The runtime database layer is raw `pg` SQL. It is not the managed
database and it is not currently driven by Drizzle at runtime. The source of
truth for schema initialization is:

- `artifacts/api-server/src/legacy-db/schema.sql`
- `artifacts/api-server/src/legacy-db/recommendation-schema.sql`
- Inline compatibility/security DDL in `legacy-db/seed.ts`

Do not change or remove `DATABASE_URL` while operating this application.

---

## 4. How requests flow

### 4.1 Browser development

1. Vite serves `artifacts/campnect`.
2. Browser API calls use a relative `/api` base.
3. Vite proxying or the configured local API path sends those requests
   to the API service.
4. Socket.IO uses the corresponding same-origin `/socket.io` path.
5. Protected media URLs are normalized by the Axios client and fetched through
   the authenticated media path when required.

### 4.2 Published web application

Autoscale runs the API as the single HTTP process:

1. The frontend is built with Vite.
2. The API build copies the current frontend bundle into the API distribution
   at `dist/public`.
3. `pnpm start` launches the API process.
4. Express serves:
   - `/api/*` through API routers
   - `/uploads/*` through protected media handlers where applicable
   - `/socket.io/*` through Socket.IO
   - static frontend assets from `dist/public`
   - non-API browser routes through the React `index.html` fallback

This packaging is important. Autoscale has one runnable HTTP service, so the
production API bundle must contain the frontend bundle beside the API server.

### 4.3 Native Android

1. Vite builds the current web application.
2. Capacitor uses `artifacts/campnect/dist/public` as `webDir`.
3. `cap sync android` copies the web bundle and native plugin metadata.
4. Android launches the local bundled WebView app.
5. The native app uses an absolute API base URL because relative URLs would
   resolve to `capacitor://localhost`.
6. The current default native API base is:

```text
https://campnect.perinol.com/api
```

The API base can be overridden at build time with `VITE_API_BASE_URL`.

The Android app bundles the UI locally. It does not load the published root
website remotely, which prevents a external placeholder from
appearing inside the APK.

---

## 5. Development and operation

### 5.1 Required environment

The backend requires:

- `DATABASE_URL` — Supabase/PostgreSQL transaction-pooler connection
- `SESSION_SECRET` — JWT and refresh-token signing secret

The Admin Panel requires:

- `CAMPNECT_API_ORIGIN` — backend origin used by the admin BFF
- `ADMIN_PANEL_SERVICE_SECRET` — server-to-server secret injected only by the
  Admin Panel server

The backend may also use:

- `ADMIN_PANEL_ORIGIN` — allowed browser origin for privileged admin CORS
- `CAMPNECT_ORIGIN` — allowed Campnect origin for Socket.IO/CORS
- `CORS_ORIGINS` — additional configured origins
- `TRUST_PROXY_HOPS` — bounded trusted proxy hop count; defaults to `1`
- `PORT` — required API port
- `NODE_ENV` — development/production behavior

The frontend may use:

- `VITE_API_BASE_URL` — absolute API base for native or special deployments
- `PORT`
- `BASE_PATH`

Secrets must be managed through environment variables. Never paste their values into
source, documentation, shell output, or chat.

### 5.2 Common commands

From the repository root:

```bash
# Install using pnpm
pnpm install

# Typecheck the workspace libraries and artifacts
pnpm run typecheck

# Build all deployable Campnect production pieces
pnpm run build:deploy

# Run the current web app
pnpm --filter @workspace/campnect run dev

# Run the API
pnpm --filter @workspace/api-server run dev

# Run the standalone admin app
pnpm --filter @workspace/campnect-admin run dev

# Run current frontend navigation/unit tests
pnpm --filter @workspace/campnect exec tsx --test src/navigation/*.test.ts

# Run the API profile-post count regression test
pnpm --filter @workspace/api-server run test:profile-posts-count

# Inspect Capacitor installation and native project
pnpm run cap:doctor

# Build/sync the Android web bundle without assembling an APK
pnpm run cap:build

# Build a debug APK only when explicitly requested
pnpm run cap:apk:debug
```

### 5.3 npm scripts

Configured workflows include:

| Workflow | Purpose |
|---|---|
| `Start application` | Current Campnect Vite app exposed through the primary preview |
| `artifacts/campnect: web` | Current Campnect artifact |
| `artifacts/api-server: API Server` | API service |
| `artifacts/campnect-admin: web` | Admin BFF/static server |
| `artifacts/campnect-app: web` | Legacy frontend source (not hosted) |
| `artifacts/mockup-sandbox: Component Preview Server` | Design previews |

After server-side code, package, workflow, or run-command changes, restart the
relevant workflow and inspect logs before declaring the app healthy.

The current `project config` deployment target is Autoscale:

- Build: `pnpm run build:deploy`
- Run: `pnpm start`

### 5.4 Local ports

The artifact configuration is the source of truth for artifact-local ports:

| Service | Port |
|---|---:|
| Current Campnect Vite | `22821` |
| API | `8080` |
| Admin BFF | `20880` |
| Legacy frontend | `23272` |
| Mockup sandbox | managed separately; currently commonly `8081` |
| Main Local preview | `5000` |

Do not hardcode `localhost` or development domains in frontend application
code. Use relative URLs for same-origin browser calls. Development shell
commands may use local ports for diagnostics.

---

## 6. Backend architecture

### 6.1 Startup sequence

`artifacts/api-server/src/index.ts`:

1. Requires a valid numeric `PORT`.
2. Creates the HTTP server from the Express app.
3. Initializes Socket.IO immediately.
4. Starts listening before database initialization completes so health probes
   can distinguish a live process from a failed process.
5. Initializes the database asynchronously with retry and exponential backoff.
6. Runs schema initialization, seed logic, and best-effort legacy upload
   migration.
7. Starts trending-score computation after startup and every 30 minutes.

Database-backed routes are gated by database readiness. During schema startup,
they should return a retryable readiness response instead of pretending to be
an authentication failure.

### 6.2 Express middleware order

The current order is significant:

1. Structured request logging
2. Helmet security headers
3. CORS
4. Request ID generation
5. JSON and URL-encoded body parsers
6. Database readiness middleware under `/api`
7. General and route-specific rate limiters
8. Health and maintenance routes
9. Maintenance guard
10. Authentication and feature routers
11. Static frontend serving and React Router fallback

The API uses a bounded trust-proxy configuration. Do not replace it with a
blanket trust of arbitrary forwarded headers.

### 6.3 API route groups

The main Express app mounts these route groups:

| Prefix | Responsibility |
|---|---|
| `/api/healthz` | Process/database readiness |
| `/api/maintenance` | Public maintenance state |
| `/api/auth` | Registration, login, OTP, verification, refresh, logout, password recovery |
| `/api/admin-auth` | Legacy admin authentication path |
| `/api/v1/admin/auth` | Versioned admin authentication path |
| `/api/users` | Profiles, follows, blocks, privacy, user settings, session-aware user data |
| `/api/posts` | Feed posts, comments, reactions, saves, sharing, post media references |
| `/api/stories` | Retained story-related compatibility routes |
| `/api/chat` | Conversations, messages, requests, media references, delivery operations |
| `/api/search` | User, campus, community, and content search |
| `/api/notifications` | Notification center and content deep links |
| `/api/colleges` | College/campus discovery and verification support |
| `/api/communities` | Community discovery, membership, posts, and moderation |
| `/api/events` | Event creation, editing, attendance, permissions, and discovery |
| `/api/glimpses` | Glimpse publishing, discovery, privacy, and viewer access |
| `/api/highlights` | Profile highlight operations |
| `/api/rec` | Recommendation/trending endpoints |
| `/api/media` | Protected media assets, upload processing, downloads, and range support |
| `/api/clips` | Short-video creation, discovery, engagement, and protected media |
| `/api/reports` | User/content reporting and moderation intake |
| `/api/admin` | Legacy admin operations |
| `/api/v1/admin` | Versioned admin/platform operations |
| `/socket.io` | Authenticated realtime events and call signaling |

### 6.4 Rate limits

Configured limits include:

- General API: 500 requests per 15 minutes
- General auth: 30 requests per 15 minutes
- Login: 10 requests per 15 minutes
- Signup: 5 requests per hour
- OTP/verification/resend: 10 requests per 10 minutes
- Password recovery: 5 requests per 15 minutes
- Protected JPEG media download: 30 requests per 15 minutes

Health checks are excluded from the general limiter.

---

## 7. Database and schema

### 7.1 Connection model

The database helper in `legacy-db/index.ts`:

- Reads `DATABASE_URL`.
- Creates a `pg.Pool`.
- Requires SSL for Supabase.
- Uses a bounded pool size and connection timeouts.
- Avoids named prepared statements because Supabase transaction pooling does
  not guarantee session affinity.
- Exposes `query`, `queryOne`, `queryAll`, `execute`, and `withTransaction`.

`withTransaction()` is required when multiple related writes must commit
atomically, especially media asset rows plus their post, message, story, or
clip references.

### 7.2 Schema initialization

Schema initialization:

1. Computes a fingerprint from `schema.sql`, optional
   `recommendation-schema.sql`, and `SCHEMA_LOGIC_VERSION`.
2. Uses a single-row `schema_init_state` table to claim initialization.
3. Uses one atomic `UPDATE ... RETURNING` claim.
4. Avoids session-scoped advisory locks because Supabase PgBouncer
   transaction pooling can move statements between backend connections.
5. Applies the SQL schema and inline compatibility/security DDL only when the
   fingerprint is new or a prior attempt is stale.
6. Leaves a pending claim reclaimable after five minutes if a process crashes.

The bootstrap also:

- Adds compatibility columns/indexes introduced after the original schema
- Creates moderation, audit, admin-session, verification, appeal, warning,
  restriction, shadowban, trust-score, and related support tables
- Applies database hardening
- Seeds configured college records when needed
- Seeds or repairs required platform defaults
- Migrates old filesystem uploads on a best-effort basis

### 7.3 Schema change rules

Before changing schema:

1. Inspect the current SQL source and live database expectations.
2. Do not assume the visible Production Database is the Campnect
   database.
3. Do not remove, rename, or replace `DATABASE_URL`.
4. Update the SQL source of truth and any inline compatibility logic.
5. Consider the schema fingerprint/version behavior.
6. Test against the Supabase transaction pooler.
7. Do not run destructive automatic Drizzle pushes against this project.

The built SQL files in `artifacts/api-server/dist/` are generated artifacts.
The source SQL under `src/legacy-db/` is authoritative.

---

## 8. Authentication and authorization

### 8.1 User authentication

The user API uses:

- JWT access tokens with a 24-hour expiry
- Refresh tokens with a 30-day expiry
- A random refresh-token `jti` to prevent same-second token collisions
- `SESSION_SECRET` for signing
- Database checks to ensure the user still exists
- Account status checks for banned, suspended, and deactivated users

The browser stores authentication state through the Zustand auth store under
the `campnect-auth` local-storage key. The Axios client:

1. Reads the persisted access token.
2. Adds `Authorization: Bearer ...`.
3. On a 401 for a non-auth endpoint, attempts one refresh.
4. Queues concurrent requests behind the same refresh.
5. Stores the rotated access and refresh tokens.
6. Retries queued requests.
7. Logs out and clears persisted state if refresh fails.

Authentication endpoints do not recursively trigger refresh.

### 8.2 Protected route behavior

`ProtectedRoute` is the route boundary for `/app/*`.

- Missing auth redirects to `/login`.
- Return destinations are normalized to internal `/app` destinations only.
- Persisted sessions are revalidated against the server.
- Revalidation runs on entry and periodically, not on every visibility/focus
  event.
- Unverified email users are sent to `/verify-email`.
- Suspended users receive the suspended-account screen.
- College verification is an optional badge/accessory state, not a general
  access gate.

Stale sessions must not leave protected screens mounted.

### 8.3 Admin authentication

The admin architecture has two boundaries:

1. The operator authenticates through the admin web UI and receives an admin
   session token stored in the browser session.
2. The Admin BFF adds `X-Admin-Panel-Service-Secret` when forwarding to the API.

The API requires both:

- A valid server-injected Admin Panel service secret
- A valid admin session with a non-revoked, non-expired database session record

The service secret is never bundled into the admin JavaScript and never sent
directly to a browser.

Admin roles map to permission sets through `adminSecurity.ts`. Sensitive admin
operations should use the permission middleware and produce audit/security
records.

---

## 9. Current frontend architecture

### 9.1 Application entry

`artifacts/campnect/src/App.tsx` wraps the application in:

1. Error boundary
2. Maintenance gate
3. React Router `BrowserRouter`
4. Overlay dismissal registry
5. `BackNavigationProvider`
6. Theme and authentication synchronization
7. Notification navigation synchronization
8. Socket/realtime synchronization
9. Media preloading helpers
10. Toast provider
11. Route tree

The public root redirects based on auth state:

- Authenticated and email verified: `/app/feed`
- Otherwise: `/signup`

### 9.2 Primary routes

Public/auth routes include:

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

Protected application routes include:

- `/app/feed`
- `/app/search`
- `/app/events`
- `/app/glimpse`
- `/app/clips`
- `/app/profile`
- `/app/college/:id`
- `/app/create`
- `/app/create/post`
- `/app/glimpse/create`
- `/app/glimpse/:id`
- `/app/clips/create`
- `/app/clips/:id`
- `/app/chat`
- `/app/chat/new`
- `/app/chat/requests`
- `/app/chat/new-group`
- `/app/chat/:id`
- `/app/chat/:id/info`
- `/app/profile/:username`
- `/app/profile/:username/followers`
- `/app/profile/:username/following`
- `/app/edit-profile`
- `/app/post/:id`
- `/app/communities`
- `/app/communities/create`
- `/app/community/:slug`
- `/app/community/:slug/edit`
- `/app/events/create`
- `/app/events/:id`
- `/app/events/:id/edit`
- `/app/events/:id/attendees`
- `/app/events/:id/confirmation`
- `/app/notifications`
- `/app/settings`
- `/app/settings/account`
- `/app/settings/privacy`
- `/app/settings/notifications`
- `/app/settings/security`
- `/app/settings/about`
- `/app/settings/help`
- `/app/settings/help/article/:slug`
- `/app/settings/legal`
- `/app/settings/saved`
- `/app/settings/activity`

### 9.3 Navigation rules

React Router is the only route/history authority.

The six canonical root tabs are exactly:

```text
/app/feed
/app/search
/app/events
/app/glimpse
/app/clips
/app/profile
```

Back behavior:

1. Temporary overlay/sheet/dialog dismissal wins.
2. Canonical root routes use the two-step exit confirmation.
3. Child routes entered by Router `PUSH` use `navigate(-1)`.
4. Cold/default or Router `REPLACE` child routes fall back to their canonical
   root.
5. Queried roots, such as Glimpse with `?open=...`, are children rather than
   canonical roots.
6. Native and visual Back controls use the same registered coordinator.
7. There is exactly one application-level native-back listener.

Android Back has a native event ID, committed timestamp, lifecycle generation,
reset generation, duplicate acknowledgement, and native confirmation gate.
These checks must not be weakened.

### 9.4 Feed

The home feed is eligibility-first and chronological. It uses keyset
pagination and should not silently introduce recommendation ordering.
Recommendations remain an explicit/opt-in surface.

Feed/post behavior includes:

- Posts and comments
- Engagement counts
- Likes/reactions
- Saved posts
- Sharing
- Post visibility/privacy checks
- Moderation/discovery restrictions
- Protected media
- Link previews with server-side bounded unfurling

### 9.5 Events

Events include:

- Create/edit/delete flows
- Event details
- Attendee lists
- Confirmation states
- Campus-aware organizer permissions
- Event-linked posts

Regular organizers are constrained to their verified campus. The `ceo` account
may choose among listed colleges where the permission path allows it.

### 9.6 Glimpses

Glimpses are the campus photo/video story loop:

- Discovery is non-scrolling and story-like.
- Username search and tap navigation are supported.
- Capture uses one shutter interaction:
  - Tap for photo
  - Hold for video
- Capture preview precedes caption/upload.
- Capture limits are kept synchronized with server validation.
- Visibility and access checks apply to private content.

### 9.7 Clips

Clips reuse post engagement/privacy concepts while keeping video and cover
assets protected and range-capable.

- Clips have their own feed and viewer paths.
- Uploads retain audio.
- Autoplay is muted.
- Every video surface exposes a sound toggle.
- Protected media is loaded through the authenticated media loader.
- Fullscreen/viewer routes remain separate from the shared root navigation.

### 9.8 Profiles and social graph

Profiles support:

- Profile details and editing
- Avatar and cover media
- Visible post/media statistics
- Follows/followers/following
- Private account follow requests
- Blocking without destructive chat-history deletion
- Close mates
- Online/last-seen privacy settings
- Saved/activity surfaces

Profile statistics should match the visible non-Glimpse post set. The shared
media-safe Avatar component should be used in navigation and profile surfaces.

### 9.9 Chat

Chat supports:

- One-to-one conversations
- Groups
- Message requests
- Text, image, video, audio, and file messages
- Replies
- Shared post payloads
- Typing/presence
- Read/delivery state
- Voice/video calls through WebRTC signaling

Important chat rules:

- REST acknowledgement is the source of truth for outbound message delivery.
  Socket.IO is used for realtime fan-out, not send confirmation.
- A message preview is a transient realtime banner, not a notification-center
  row. It can appear even while the active conversation is open.
- Android chat Recents uses a native MediaStore bridge. Browsers cannot
  enumerate a device gallery and use a picker fallback.
- Composer pointer handling must preserve textarea focus so Android does not
  dismiss the IME.
- Chat scrolling uses one stable message scroller while a sibling composer
  overlay follows centralized keyboard height.
- Blocking preserves private history and visibility while disabling new
  messages.
- Presence updates persist `last_seen` and notify authorized peers on final
  disconnect.

### 9.10 Media

Media is treated as protected application data rather than public static files.

The backend:

- Records media assets in PostgreSQL
- Associates assets with owners and durable content references
- Processes images/video where required
- Validates ownership before message/media use
- Serves protected media through authorization-aware routes
- Supports video range requests
- Uses ETags and revalidation where applicable

The frontend:

- Uses authenticated blob loading for protected images/videos
- Does not put a raw protected `/api/media` URL directly into an `<img>` or
  `<video>` source when authentication is required
- Shows branded profile-style loading art
- Shows retry UI only after a confirmed failure
- Normalizes absolute media URLs for native builds

Do not switch protected media to unguarded static URLs.

---

## 10. Realtime and push

### 10.1 Socket.IO

Socket.IO is created in `legacy-socket/index.ts`.

Connection requirements:

- Origin allowlist for browser clients
- `capacitor://localhost` and `http://localhost` support for native clients
- Access token in handshake auth/query
- JWT verification
- User existence and account-state checks

Socket responsibilities include:

- Conversation join/leave
- New message fan-out
- Typing events
- Online/offline presence
- Call invite/accept/decline/end
- WebRTC offer/answer/ICE signaling

Call signaling is validated for conversation membership, user IDs, target IDs,
event shape, and bounded signal size/rate. Media itself should stay peer-to-peer
when the call path succeeds.

### 10.2 OneSignal push

The native OneSignal plugin maps a device subscription to a Campnect user ID.
The server owns notification sending and recipient authorization. Notification
payloads preserve Post, Glimpse, or Clip identity so the client can deep-link
to the correct content.

Native notification deep links must remain inside `/app` and pass destination
normalization before navigation.

---

## 11. Maintenance mode

Maintenance mode is stored as a single-row database-controlled state.

- The public `/api/maintenance` endpoint is always available.
- The frontend polls it.
- When enabled, regular application content is replaced by the maintenance
  screen.
- Admin routes bypass the regular maintenance block so operators can disable
  maintenance.
- The Android app uses the same live backend and therefore responds to a
  maintenance toggle without an APK rebuild.

Do not put maintenance state only in frontend local storage.

---

## 12. Android architecture

### 12.1 Capacitor configuration

`capacitor.config.ts` defines:

- App ID: `com.campnect.app`
- App name: `Campnect`
- Web directory: `artifacts/campnect/dist/public`
- Android HTTPS scheme
- Splash screen behavior
- Non-overlaying native status bar
- Disabled automatic system-bar inset handling

The web application owns its safe-area CSS variables. Native status-bar overlay
must remain disabled because some Android devices report no CSS inset while
still drawing system icons over a full-screen header.

### 12.2 Native plugins

| Class | Responsibility |
|---|---|
| `MainActivity.java` | Activity setup, Android Back callback, lifecycle invalidation, startup permissions |
| `CampnectBackDispatcher.java` | Issued Back event identity, readiness, generation, replay and delivery checks |
| `NativeExitConfirmation.java` | Timing-window and two-event exit confirmation |
| `NativeNavigationPlugin.java` | Capacitor bridge for Back readiness, arm, exit, and clear operations |
| `PhotoGalleryPlugin.java` | Native MediaStore recent-gallery access |
| `RuntimePermissionsPlugin.java` | Runtime permission bridge |
| `SystemInsetsPlugin.java` | Native system inset measurement |
| `CallAudioPlugin.java` | Call audio routing/control |

### 12.3 Android Back contract

The intended physical flow is:

```text
AndroidX Back
  -> CampnectBackDispatcher
  -> campnect:native-back DOM event
  -> BackNavigationProvider
  -> overlay check
  -> React Router route classification
  -> armExit on first canonical-root Back
  -> exitApp on second distinct canonical-root Back
  -> NativeExitConfirmation validation
  -> Activity exit
```

The native bridge validates:

- Exact issued event identity
- Event ordering
- Lifecycle generation
- Reset generation
- Commit timestamp
- Minimum confirmation delay
- Maximum confirmation window
- Replay protection
- Duplicate acknowledgement

Capacitor numeric bridge values may arrive as Java `Integer` even when
JavaScript sends a millisecond number. `PluginCall.getLong()` only accepts a
boxed Java `Long`, so timestamp extraction uses strict raw-number conversion.
Do not replace it with an unchecked cast or loosen malformed-input handling.

### 12.4 Native interaction safeguards

- Browser context menus and long-press selection are suppressed for native
  content, except editable fields.
- Text inputs retain clipboard behavior.
- Pinch zoom is temporary for post, Glimpse, and chat media, then resets.
- Native status bar does not overlay web content.
- Keyboard height is centralized through the visual viewport/native keyboard
  bridge.
- Native app content is local; API traffic is remote.

### 12.5 Android commands

```bash
# Inspect environment and Android toolchain
pnpm run cap:doctor

# Build web assets and sync Capacitor
pnpm run cap:build

# Assemble a debug APK
pnpm run cap:apk:debug

# Run Android unit tests
bash android/gradlew -p android testDebugUnitTest --no-daemon
```

The Android SDK must be realized in the build environment with the required
API/build-tools versions before assembling. Native test dependencies include
Robolectric for the Capacitor bridge parsing path.

---

## 13. Admin Panel

The admin panel is deliberately separate from the student-facing web app.

### Browser routes

- `/campnect-admin/login`
- `/campnect-admin/dashboard`
- `/campnect-admin/accounts`
- `/campnect-admin/accounts/:id`
- `/campnect-admin/reports`
- `/campnect-admin/content`
- `/campnect-admin/appeals`
- `/campnect-admin/verifications`
- `/campnect-admin/logs`
- `/campnect-admin/system`

### Admin responsibilities

- Account lookup and status management
- Reports and moderation
- Content moderation
- Verification review
- Appeals
- Security/audit logs
- Platform/system controls
- Maintenance mode

### BFF behavior

`artifacts/campnect-admin/server.mjs`:

1. Serves the admin static bundle below its configured base path.
2. Forwards `/api/*` requests to `CAMPNECT_API_ORIGIN`.
3. Forwards the operator's Authorization header.
4. Forwards request ID and content type.
5. Injects the server-only `X-Admin-Panel-Service-Secret`.
6. Returns upstream body/status/content type without exposing the service
   secret.
7. Uses cache control that prevents stale admin data and stale HTML.

The backend still enforces the operator's admin session and permissions after
the service boundary.

---

## 14. Security model and invariants

The following are intentional security boundaries:

### Authentication

- Required secrets fail closed at startup.
- JWTs and refresh tokens are signed with `SESSION_SECRET`.
- Refresh tokens rotate and include a unique identifier.
- Stale/deleted/deprovisioned accounts fail authentication.
- Protected routes validate persisted sessions at the route boundary.
- OTP state survives reload where required, but secrets are not logged.

### Authorization

- Private media checks ownership/access.
- Chat membership and block relationships are checked server-side.
- Private follow requests remain pending until accepted.
- Admin requests require both BFF service authentication and admin session
  authorization.
- Admin permissions are checked per operation.
- Maintenance mode does not bypass admin controls.

### Input and network safety

- Request bodies are bounded.
- Rate limits protect auth, OTP, password recovery, and media routes.
- CORS is allowlisted for privileged admin endpoints.
- Socket.IO origins and handshake tokens are validated.
- WebRTC signals are size/rate bounded.
- Link preview fetching validates request/redirect destinations and applies
  bounds.
- Media URLs are canonicalized and protected.

### Data integrity

- Related media/content writes use transactions.
- Schema initialization is idempotent and transaction-pooler-safe.
- No destructive schema push should run automatically.
- Audit/security records are maintained for privileged operations.

### Android exit safety

- The native bridge is not a shortcut around navigation security.
- Exit requires two distinct, issued, current Back events.
- Lifecycle/reset/replay/timing checks remain mandatory.

---

## 15. Build and deployment details

### 15.1 Deployment build

The configured deployment commands are:

```bash
pnpm run build:deploy
pnpm start
```

`build:deploy`:

1. Runs workspace typechecking.
2. Builds the current Campnect frontend.
3. Builds the API bundle.
4. The API build copies SQL files into `dist/`.
5. The API build copies the frontend bundle into `dist/public/`.

esbuild does not automatically copy `.sql` files, so the copy step in
`artifacts/api-server/build.mjs` is required. Do not remove it.

### 15.2 Production request shape

Production should have one externally visible application origin:

```text
https://campnect.perinol.com/
https://campnect.perinol.com/api/...
https://campnect.perinol.com/socket.io/...
```

The exact published URL should be obtained from the deployment configuration,
not reconstructed from workspace names or development domains.

### 15.3 Caching

- Frontend hashed assets may be cached.
- `index.html` must not be cached indefinitely.
- Personalized JSON list endpoints must not return bodyless 304 responses that
  confuse Axios consumers.
- Protected media should use ETag revalidation and `private, max-age=0,
  must-revalidate` where appropriate instead of unconditional `no-store` when
  safe.
- Admin HTML is served with no-store behavior; hashed assets are immutable.

---

## 16. Testing and validation

### 16.1 Typechecks

```bash
pnpm run typecheck
pnpm --filter @workspace/campnect run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/campnect-admin run typecheck
```

The root typecheck includes workspace libraries and artifact packages.

### 16.2 Frontend tests

Navigation tests cover:

- Canonical root classification
- Nested route behavior
- Router `PUSH` versus `REPLACE`
- Overlay priority and stale cleanup
- Native event metadata validation
- Duplicate/replayed Back events
- Root exit timing
- Native/UI coordinator parity
- Back coordinator arm/exit/route/overlay side effects
- Keyboard/chat layout contracts
- Root swipe boundaries

Run them with:

```bash
pnpm --filter @workspace/campnect exec tsx --test src/navigation/*.test.ts
```

### 16.3 Backend tests

The API includes targeted regression tests such as profile post-count behavior:

```bash
pnpm --filter @workspace/api-server run test:profile-posts-count
```

### 16.4 Android tests

```bash
bash android/gradlew -p android testDebugUnitTest --no-daemon
```

Native tests cover:

- Capacitor bridge numeric timestamp parsing
- Missing/malformed timestamp rejection
- Exact two-event exit confirmation
- Lifecycle/reset invalidation
- Replay/out-of-order/evicted event rejection
- Timing floor/window behavior

### 16.5 Production web build

```bash
pnpm --filter @workspace/campnect run build
pnpm run build:deploy
```

Build warnings about large chunks or dynamic imports are not automatically
runtime failures. A build must still complete successfully and the preview
must load.

---

## 17. Troubleshooting runbook

### API will not start

Check:

```bash
echo "$PORT"
```

Do not print secret values. Confirm the environment variables names exist:

- `DATABASE_URL`
- `SESSION_SECRET`

Then inspect API logs for:

- Invalid/missing `PORT`
- Missing `DATABASE_URL`
- Missing `SESSION_SECRET`
- Supabase SSL/pooler errors
- Schema initialization retries
- SQL syntax or fingerprint failures

### API health is 500 during startup

This can be expected briefly while the asynchronous schema bootstrap is
running. Check `/api/healthz` and wait for database readiness. If it does not
recover, inspect the first schema error rather than repeatedly restarting.

### Frontend preview is blank

1. Confirm the relevant workflow is running.
2. Confirm it is listening on the expected port.
3. Restart the workflow after Vite/config changes.
4. Inspect browser console logs.
5. Confirm Vite allows the proxied host.
6. Use relative `/api` calls for same-origin browser traffic.
7. Do not point frontend code to hardcoded `localhost`.

### API calls return 401 after a refresh

Inspect:

- Whether the persisted access token exists
- Whether the refresh token exists
- Whether `/api/auth/refresh` returns 401
- Whether the account was deleted, deactivated, banned, or suspended
- Whether a stale request raced a new login

Do not “fix” this by accepting expired tokens or disabling route-boundary
session validation.

### Media appears broken

Check:

- The URL is an authenticated media URL
- The frontend uses the protected blob loader
- Binary responses are not being normalized as JSON
- The asset owner/access check passes
- API origin normalization is correct for native builds
- Video range requests are supported
- The media row and content reference were committed together

Do not make protected media public merely to fix loading.

### Admin panel cannot log in or load data

Check only through environment configuration and logs:

- `CAMPNECT_API_ORIGIN`
- `ADMIN_PANEL_SERVICE_SECRET`
- `ADMIN_PANEL_ORIGIN`
- Admin server base path `/campnect-admin/`
- Backend admin service-header middleware
- Admin session expiration/revocation
- Admin permission role

The browser should never need the service secret.

### Android login fails

Check:

- The build included the correct `VITE_API_BASE_URL`
- Native requests target the live API, not `capacitor://localhost/api`
- The published API is healthy
- Access/refresh token persistence is intact
- The backend has the same database and `SESSION_SECRET`
- The APK is not using an old bundled web asset set

### Android Back does not exit

Collect debug Logcat and verify this exact sequence:

```text
AndroidX callback received system Back
Dispatching Back event N to DOM
NativeNavigation.armExit ... decision=armed

AndroidX callback received system Back
Dispatching Back event N+1 to DOM
NativeNavigation.exitApp ... decision=confirmed
```

There must not be an unarmed `clearExitArm` between the two events.

Check:

- The route is one of the six exact canonical roots
- No overlay is registered
- The first Back reaches `armExit`
- The second event has a new event ID
- Lifecycle/reset generations match
- The timestamps are finite integral values
- The app is using the latest bundled web assets

Do not bypass the native issued-event or timing checks.

### Published site shows an external-building placeholder

Check:

- `artifacts/campnect` owns `/`
- `artifacts/campnect-app` is retained only as unhosted source for reference
- Autoscale runs `pnpm start`
- `build:deploy` copied frontend assets into the API bundle
- Deployment logs show the API process is serving `dist/public`
- The production route does not point at a stale artifact

### Schema changes do not appear

Check:

- The change was made in source SQL or required inline DDL
- `SCHEMA_LOGIC_VERSION` was updated if only inline logic changed
- The schema fingerprint changed
- The database initializer claimed the row
- The process has access to the intended Supabase `DATABASE_URL`
- The deployment was rebuilt/restarted

Never assume the managed database shown in the workspace is the
Campnect Supabase database.

---

## 18. Safe change guidelines

### Before editing

1. Locate the actual source-of-truth file.
2. Check the relevant memory topic under `.agents/memory/`.
3. Inspect callers and tests before changing shared behavior.
4. Decide whether the change affects web, API, admin, Android, or deployment.
5. Keep secrets out of code and documentation.

### Frontend changes

- Preserve React Router authority.
- Keep API calls same-origin in browsers.
- Keep protected media authenticated.
- Use the shared overlay/back coordinator.
- Use shared dialogs rather than browser-native `alert`/`confirm`.
- Keep root navigation fluid and let the shell own height.
- Test narrow Android WebView dimensions where applicable.

### API changes

- Preserve readiness gating.
- Use parameterized SQL.
- Use transactions for related writes.
- Add authorization checks before returning private data.
- Maintain route-specific rate limits.
- Avoid bodyless caching behavior for personalized lists.
- Update schema source and fingerprint logic together.

### Admin changes

- Keep BFF proxying server-side.
- Never expose `ADMIN_PANEL_SERVICE_SECRET`.
- Keep admin service auth and operator session auth separate.
- Preserve audit/security history for privileged mutations.
- Ensure maintenance mode still leaves admin routes available.

### Android changes

- Build from `artifacts/campnect`, not the legacy frontend.
- Keep the app bundle local.
- Preserve native Back event identity/generation/timing checks.
- Test actual Capacitor bridge payload types, not only ideal Java types.
- Keep native status-bar overlay disabled.
- Avoid native `select` controls for narrow WebView layouts where custom
  in-app pickers are required.

### Deployment changes

- Keep the API as the Autoscale runnable process.
- Ensure frontend assets are copied into the API bundle.
- Keep SQL assets in the API distribution.
- Avoid adding stale external port mappings.
- Verify `/api/healthz`, `/`, `/campnect-admin/`, and protected route fallback
  behavior after deployment configuration changes.

---

## 19. Source-of-truth map

| Concern | Source |
|---|---|
| Current web artifact | `artifacts/campnect/` |
| Frontend route tree | `artifacts/campnect/src/App.tsx` |
| Protected route boundary | `artifacts/campnect/src/routes/ProtectedRoute.tsx` |
| API client/auth refresh | `artifacts/campnect/src/api/client.ts` |
| Navigation policy | `artifacts/campnect/src/navigation/BackNavigation.tsx` and `backCoordinator.ts` |
| Root route classification | `artifacts/campnect/src/utils/navigation.ts` |
| Native DOM event validation | `artifacts/campnect/src/navigation/nativeBackEvent.ts` |
| Root exit timing | `artifacts/campnect/src/navigation/rootExitConfirmation.ts` |
| API middleware/routes | `artifacts/api-server/src/app.ts` |
| API startup | `artifacts/api-server/src/index.ts` |
| Database pool/helpers | `artifacts/api-server/src/legacy-db/index.ts` |
| Database schema | `artifacts/api-server/src/legacy-db/schema.sql` |
| Recommendation schema | `artifacts/api-server/src/legacy-db/recommendation-schema.sql` |
| Schema bootstrap/seed | `artifacts/api-server/src/legacy-db/seed.ts` |
| User auth middleware | `artifacts/api-server/src/legacy-middleware/auth.ts` |
| Socket.IO | `artifacts/api-server/src/legacy-socket/` |
| Admin BFF | `artifacts/campnect-admin/server.mjs` |
| Admin UI routes | `artifacts/campnect-admin/src/App.tsx` |
| Capacitor config | `capacitor.config.ts` |
| Android Activity/native bridge | `android/app/src/main/java/com/campnect/app/` |
| Artifact paths/ports | Each artifact's `project config-artifact/artifact.toml` |
| Autoscale build/run | `project config` and root `package.json` |

---

## 20. Important non-obvious decisions

1. **Supabase is the Campnect database.** The visible managed database is
   not the runtime data store for this application.
2. **The API is the production runnable service.** The frontend is copied into
   its bundle because Autoscale runs one HTTP process.
3. **The current frontend owns `/`.** The old `campnect-app` artifact is
   intentionally retained as unhosted legacy source.
4. **Raw `pg` SQL is the current backend source of truth.** Older Drizzle
   references in generic workspace notes do not describe the running API.
5. **Supabase transaction pooling changes concurrency design.** Do not use
   session-scoped advisory-lock assumptions for schema initialization.
6. **Protected media is application data.** It must pass authorization and
   authenticated loading, not be made public for convenience.
7. **React Router owns navigation.** Do not reintroduce route ledgers, history
   floors, synthetic navigation epochs, or page-specific previous-route logic.
8. **Native Android Back is a security-sensitive protocol.** Event identity,
   lifecycle/reset generations, replay protection, and timing checks are all
   part of the contract.
9. **Native builds bundle the current web artifact.** Updating the website does
   not update an already-installed APK; an APK rebuild is required for bundled
   frontend changes.
10. **Maintenance mode is backend-controlled.** It can affect web and already
    installed Android clients without republishing the APK.

---

## 21. Documentation maintenance

Update this document when any of the following changes:

- Artifact ownership or production path
- Workflow command or port
- Deployment build/run behavior
- Database connection or schema source
- Authentication/token behavior
- Admin BFF/service-secret boundary
- Native Back protocol
- Media protection model
- Major product surface or route

Do not add:

- Secret values
- Personal account data
- Refresh/access tokens
- Private keys
- Full production database contents
- Temporary debugging transcripts
- One-off implementation changelogs

For durable engineering lessons that do not belong in this broad guide, use the
appropriate topic file under `.agents/memory/`.