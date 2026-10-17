# Campnect Threat Model (STRIDE)

## Project overview and scan anchors

Campnect is a React/Vite web client with a Capacitor mobile shell, backed by an
Express API and Socket.IO real-time service. The primary implementation anchors
are `artifacts/api-server/src/legacy-*.ts` (routes, middleware, services,
database, and sockets) and `artifacts/campnect/src` (client and persisted auth
store). PostgreSQL is accessed through raw, parameterized queries. User media is
stored as `BYTEA` in `media_assets` and served through authorization-aware API
routes. Integrations include OneSignal notifications and Gmail/email delivery.

Authentication uses short-lived JWT access tokens and persisted, rotating
refresh-token hashes. Admin authentication and authorization are a separate
boundary. Firebase Android client configuration is public client configuration,
not an application secret; its Firebase/Google server-side restrictions MUST be
maintained.

## Assets and trust boundaries

**Assets:** accounts and password hashes; access/refresh tokens; OTPs; admin
sessions and permissions; private conversations and WebRTC signaling metadata;
posts, stories, relationship/block state; `BYTEA` media and verification
documents; audit/login history; notification credentials and third-party
integration configuration.

**Boundaries:** untrusted browser/Capacitor input crosses into Express routes;
untrusted Socket.IO handshakes/events cross into the real-time service; API
crosses into PostgreSQL and outbound email/OneSignal services; public media URLs
cross into authenticated media authorization; regular user sessions cross into
the independently enforced admin boundary. Proxies are trusted only for a
bounded, configured number of hops.

## STRIDE threats and controls

### Spoofing
- JWT signatures, authenticated Socket.IO handshakes, database user existence
  checks, and role reconstruction reduce forged/deprovisioned sessions.
- OTP verification consumes the latest eligible code transactionally with a
  bounded attempt count. Refresh tokens are hash-stored and rotate on use.
- Admin sessions and permissions MUST NOT be inferred from client claims alone.

### Tampering
- SQL inputs MUST remain parameterized; identifiers and WebRTC signal shapes
  MUST be validated before use or relay.
- OTP consumption, password reset, and refresh rotation MUST remain atomic.
- Media entity/purpose authorization MUST be checked server-side, never from a
  client-provided URL alone.

### Repudiation
- Login history and structured request logging provide operational attribution.
- Server-generated request IDs and retained admin/session audit records MUST be
  used for security-relevant events; client-supplied IDs are not authoritative.

### Information disclosure
- Password, OTP, refresh-token, admin, message, story, and verification media
  data MUST NOT be exposed in errors, logs, or unauthenticated responses.
- `media_assets` access MUST enforce owning entity state, story expiry/audience,
  privacy/follow/block rules, and conversation membership where applicable.
- Verification documents MUST remain inaccessible through general media routes.

### Denial of service
- Auth/OTP/password-recovery/JPEG endpoints MUST be rate-limited.
- Socket signaling MUST have per-socket rate limits and bounded payload sizes.
- Request/body/media limits and bounded database query results SHOULD remain in
  place; expensive image conversion remains an operational DoS consideration.

### Elevation of privilege
- `requireAuth` MUST verify the current database user; admin routes MUST apply
  dedicated admin-session and permission checks.
- Socket callers MUST be members of a conversation before call/message actions;
  a signal target MUST be another member of that same conversation.
- Blocks, private profiles, close-mates stories, event visibility, and media
  ACLs MUST be enforced at every direct object access path.

## Declarative security guarantees

1. A refresh token is single-use: successful refresh atomically consumes it,
   persists a distinct replacement, and returns both replacement refresh token
   and access token.
2. An OTP allows at most five total submitted guesses; successful use is
   transactionally marked used before a session is issued or a password changes.
3. Anonymous, invalid, refresh-token, inactive, or deprovisioned Socket.IO
   clients MUST NOT connect.
4. Direct media URLs MUST NOT bypass the authorization of their parent object.
5. Secrets and private credentials MUST NOT be committed, documented, or
   returned to clients.

## Residual risk and verification

- Browser/Capacitor persisted auth state uses `localStorage`; XSS remains a
  material token-exposure risk. Maintain CSP, output encoding, dependency
  hygiene, and consider a platform-appropriate secure token store.
- There are not yet seeded end-to-end authorization tests for auth/media/socket
  attack paths. Add reproducible concurrent OTP, refresh replay, cross-user
  signaling, and private-story/media denial tests against a disposable database.
- Dependency scanner output may be stale and disagree with the installed,
  lockfile-resolved fixed package graph. Verify findings against the lockfile
  and actual installed versions before remediation decisions.
- Reassess CORS/origin allowlists, proxy hop configuration, Firebase server-side
  restrictions, OneSignal/Gmail permissions, and database backup/log access at
  each deployment.