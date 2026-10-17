# Campnect comment moderation

## Local-only production path

The current production setting is **`MODERATION_AI_ENABLED=false`**.
No API key, billing, external AI service, or provider connection is required.
Do not enable the optional adapter as part of completing or validating local
moderation.

The required path is: authenticated comment → local spam/rate checks → local
contextual safety/threat detection → server policy → ALLOW / WARN / BLOCK /
HUMAN_REVIEW → warning confirmation or Admin review → appeals where applicable.
Creation and editing share these checks. Held/blocked content is not published,
does not increment comment counts, and does not send comment notifications.
Approval authorizes an exact-draft resubmission, never automatic publication.

## Optional disabled adapter reference

The initial model is Google's stable `gemini-2.5-flash-lite`, called directly
from the API server. No external paid-model failover,
Cloud billing setup, grounding/search tools, or automatic upgrade is used.

Google currently lists this model as available with free-tier pricing:

- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/billing

Availability and free quotas vary by Google project and region. The API key
does not prove the project's billing tier. Before enabling calls, the operator
must check that Google AI Studio shows **Free Tier** and that the project has
**no linked billing account**. Never use a paid project's key.

Set `GEMINI_API_KEY` through Replit Secrets, not a frontend environment variable,
source file, URL, localStorage, or chat. These settings belong to the server:

| Setting | Initial value | Purpose |
| --- | --- | --- |
| `MODERATION_AI_ENABLED` | `false` | External classification disabled; local moderation is the production path |
| `GEMINI_FREE_TIER_CONFIRMED` | `false` | Calls are prohibited until the operator explicitly confirms a billing-disabled free-tier project |
| `MODERATION_AI_MODEL` | `gemini-2.5-flash-lite` | Allowed initial text-classification model |
| `MODERATION_AI_MINUTE_LIMIT` | `5` | Campnect's global maximum requests/minute |
| `MODERATION_AI_DAILY_LIMIT` | `20` | Campnect's global maximum requests/day |
| `MODERATION_AI_MONTHLY_LIMIT` | `500` | Campnect's global maximum requests/month |

These are conservative Campnect ceilings, **not promises about Google's
account quotas**. They can be lowered; the server clamps larger values to its
launch ceilings. Zero disables model requests. Usage reservations are durable
and atomic across API instances. Failed requests still consume a reservation;
there are no automatic retries. Limits use UTC periods.

AI calls require the enabled switch, a key, and explicit free-tier confirmation.
Without all three, local moderation remains active and there are zero model
calls. There is no mechanism here to enable Google billing or create charges.
An incorrectly supplied paid-project key or a later change to the project's
billing cannot be detected from the Gemini classification response.

## Data and call budget

Gemini receives only the submitted comment text, with obvious identifiers,
credentials, links, and addresses redacted. No account ID, profile, private
message, session token, device information, media bytes, or full discussion
history is sent. Redaction is best-effort, not an anonymization guarantee.

There is at most one model request per uncached assessment. Exact repeated
assessments can use a short-lived, account-scoped server cache; changed text is
assessed again. Warning confirmation does not grant permission to skip final
server checks. Local safety/rate checks, disabled AI, exhausted quota, and an
open provider circuit can result in zero model calls.

Google's free-tier terms may allow prompts/responses to improve Google products.
Review Google's terms and the app's privacy disclosure before enabling this
optional provider. Do not submit private or confidential context.

## Decisions and warning confirmation

The model classifies category, severity, confidence, target, and intent. It
cannot suspend, ban, or delete an account. Campnect's policy makes the final
ALLOW / WARN / BLOCK / HUMAN_REVIEW decision on both creation and editing.
Clients never receive classifier confidence, internal rules, or model details.

- **ALLOW:** publish normally; sensitive words alone are not violations.
- **WARN:** preserve the draft and show “Before you comment”, with “Edit
  Comment” and “Post Anyway” only when server policy permits confirmation.
- **BLOCK / HUMAN_REVIEW:** do not publish or send comment notifications.
  HIGH/CRITICAL content never offers “Post Anyway”.
- **SPAM:** enforce a server-side cooldown rather than permanently ban a user.

Warning confirmation is short-lived and bound to the authenticated user,
exact text, post, reply parent, edit target, and operation. The create/edit API
independently assesses the final submission. A changed draft, forged token,
different account, or severe decision cannot be overridden by a client flag.

## Existing systems and human review

Posts, Clips, and Glimpses retain their shared comment API/composer. Moderation
uses the existing action ledger, enforcement history, cases, restrictions,
Admin review, and appeals. No duplicate account/comment/report system is
introduced. A reminder does not increment account warning counters or count
toward a permanent ban. Permanent account decisions remain human-controlled.

Users can request review of serious comment actions from Content Appeals.
Approving an appeal for an unpublished submission does not automatically post
that draft: the user must submit it again. Human moderators must review queued
ambiguous cases and serious enforcement, rather than treating the model's
classification as proof.

## Outages and limitations

If Gemini is disabled, unavailable, quota-limited, times out, refuses a prompt,
or returns malformed output, deterministic local safety/spam checks remain.
Ordinary and legitimate sensitive-topic discussions can still be posted.
Recognized explicit threats and encouragement of harm remain blocked;
recognized ambiguity is held for human review.

Local fallback is intentionally limited. It cannot provide the language
understanding, multilingual coverage, or adversarial robustness of a semantic
model. It is not a comprehensive classifier for every harmful formulation.
No blanket word list or keyword-triggered permanent ban is used.

No physical Android-device validation or APK build is implied by automated
tests. Provider availability and the configured Google account's free tier
cannot be claimed verified until a free-only key and confirmation are supplied.

## Local validation

The local-only Express integration uses the real local moderator, enforcement
service, warning confirmation, Admin routes, and publication handlers with an
in-memory database. External fetch is replaced with a throwing/counting stub:
the local path must make zero provider calls.

Coverage includes sensitive-topic publication, direct threats, warning
confirmation, changed/replayed tokens, edits, spam, held drafts in staff
queues, case approval/rejection, appeal approval/rejection, one-use exact-draft
resubmission, and unchanged counts/notifications for unpublished content.

Commands:

```sh
pnpm exec tsx --test artifacts/api-server/test/*.mjs
node --test artifacts/api-server/test/comment*.mjs
pnpm --filter @workspace/campnect exec tsx --test src/features/comments/commentModeration.test.ts
pnpm run build:deploy
PORT=20880 BASE_PATH=/ pnpm --filter @workspace/campnect-admin run build
```

The TypeScript-aware runner is needed for existing broader API tests that
import TypeScript directly. The schema regression test additionally checks
compatibility with the legacy bootstrap's semicolon splitter. Live schema
verification uses Campnect's own database helper, not a separate managed DB.