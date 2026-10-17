# Campnect Help & Support — Product Specification

**Status:** Proposed improvements, grounded in a read-only inspection of the current codebase on 2026-10-01. This document does not implement a redesign.

**Scope:** The primary Campnect app in `artifacts/campnect`, its active API in `artifacts/api-server`, and the policy documents in `artifacts/campnect-legal`. The legacy `artifacts/campnect-app` is not the source of truth for user instructions.

**Evidence conventions:** Paths beginning with `C/`, `A/`, and `L/` refer to `artifacts/campnect/src/`, `artifacts/api-server/src/`, and `artifacts/campnect-legal/src/`, respectively. References describe inspected source, not a physical-device test, a verified external inbox, or an independently verified live legal deployment.

**Status vocabulary:**

- **Existing:** Verified in the current primary app or its article data.
- **Proposed:** Help Center content or UX to add later; not already implemented.
- **Conditional:** A real capability limited by role, permissions, context, or configuration.
- **Gated / not verified:** Do not publish instructions or expose a CTA until the stated gap is resolved.
- **Backend-only:** An endpoint or data structure exists, but a corresponding user-facing workflow was not verified.

## 1. Current State

### 1.1 Routes and entry points

Settings contains a Help & Support row. The authenticated app registers:

| Purpose | Existing route |
| --- | --- |
| Help Center | `/app/settings/help` |
| Article detail | `/app/settings/help/article/:slug` |
| Legal links | `/app/settings/legal` |
| Content appeals | `/app/settings/content-appeals` |

These are normal routes inside the existing app shell. Help is not an external documentation site or a full-screen modal. Sources: `C/App.tsx:259–270`, `C/screens/main/SettingsScreen.tsx:61–85,170–180`.

### 1.2 Existing Help Center files

| Inspected source | Responsibility |
| --- | --- |
| `C/screens/settings/HelpSupportScreen.tsx` | Home, search input, topic chips, article list, no-results message, support links |
| `C/screens/settings/HelpArticleScreen.tsx` | Slug lookup, steps, related articles, local Yes/No feedback, missing article |
| `C/help/helpArticles.ts` | Category union, article interface, 19 static article records, slug lookup |
| `C/help/helpSearch.ts` | Local normalization, matching, scoring, sorting |
| `C/help/helpSearch.test.ts` | Four search checks: login language, OTP case, password recovery, unrelated query |
| `C/help/helpLinks.ts` | Configurable legal URLs and optional support URL |
| `C/screens/settings/LegalScreen.tsx` | Four legal document links |
| `C/App.tsx` and `C/screens/main/SettingsScreen.tsx` | Route registration and Settings entry |
| `C/screens/main/AppShell.tsx` | Shared header, keyed content subtree, scrolling, navigation clearance |
| `C/components/navigation/TopBar.tsx`, `BottomNav.tsx` | Shared Back button and floating root navigation |
| `C/navigation/BackNavigation.tsx`, `backCoordinator.ts`, `nativeBackEvent.ts`, `appSectionNavigation.ts` | Shared browser/native Back and root-section navigation |
| `C/utils/navigation.ts`, `C/navigation/backNavigationContract.test.ts` | Route fallbacks and existing Back contract tests |
| `C/styles/tokens.ts`, `globals.css`, `C/main.tsx` | Theme, typography, safe areas, viewport and keyboard handling |

Feature evidence is identified alongside the inventory in section 9. Safety, reporting and legal evidence is identified in sections 12–14.

### 1.3 Current content

There are **19 articles across seven categories**, not a complete support knowledge base:

| Existing category | Count | Existing article slugs |
| --- | --- | --- |
| Account & Login | 3 | `cant-log-in`, `forgot-password`, `otp-not-received` |
| Profile & College | 2 | `edit-profile`, `change-profile-photo` |
| Posts & Content | 2 | `create-a-post`, `delete-a-post` |
| Messaging | 3 | `send-a-message`, `message-not-sending`, `reply-to-message` |
| Notifications | 2 | `manage-notifications`, `notifications-not-appearing` |
| Privacy & Safety | 3 | `manage-privacy`, `block-a-user`, `report-content` |
| Account Management | 4 | `change-password`, `deactivate-account`, `delete-account`, `download-my-data` |

Existing articles contain an ID, slug, title, category, short description, keywords, search terms, steps and related references. Thus, structured local content already exists; the redesign must extend it rather than introduce a parallel FAQ system.

### 1.4 Existing home and search behavior

- Home contains a heading, subtitle and 50px-high search field.
- Topic chips appear only when the query is blank. “All” clears the category.
- With no category selected, “Common issues” is simply the first seven articles in array order.
- With a category selected and no query, the list filters by exact category.
- A nonempty query searches **all articles**, regardless of the selected category.
- Search is immediate and client-side. It searches title, short description, keywords, `searchTerms` and category, not article steps.
- Normalization lowercases and strips characters outside ASCII letters/numbers. Stopwords include `not`.
- Current scoring: exact title 120; title substring 90; each token adds 24 for title, 14 for keyword/search term, 7 for description and 4 for category. Scores are additive; this is not a guaranteed tiered ranking contract.
- Zero-score articles are removed. Ties use alphabetical title order.
- No clear-search button, suggestion interface, explicit popular searches, result count, spelling correction or curated quick-help collection was found.
- No-results copy suggests different terms but offers no actionable browse or escalation controls.

Sources: `C/screens/settings/HelpSupportScreen.tsx:9–85`, `C/help/helpSearch.ts:3–31`.

### 1.5 Existing article and feedback behavior

- Detail pages show category, title, summary, numbered steps, Yes/No feedback and related article rows.
- There are no dedicated notes, troubleshooting, update-date or screenshot sections.
- Unknown slugs show “Article not found” and a Back to Help button.
- Votes only update React component state. No vote/reason API, persistent feedback collection or Help analytics call was found.
- The shared shell keys its content by pathname, so article changes remount the subtree and reset local feedback. The query/category state also disappears on Help remount.
- Related references are interpreted as **slugs**, despite the field name not expressing that convention. Invalid references are silently filtered.

Sources: `C/screens/settings/HelpArticleScreen.tsx:7–43`, `C/screens/main/AppShell.tsx:106–108`.

### 1.6 Accuracy and product discrepancies to address

These are findings, not fixes already made:

| Finding | Evidence and required treatment |
| --- | --- |
| Broken related references | `privacy-controls` and `data-export` do not resolve; the corresponding slugs are `manage-privacy` and `download-my-data`. `community-guidelines` is a legal document link, not an existing help article. Validate and correct references during implementation. |
| Unclear Messages navigation | The sending article says “Messages from the app navigation”; bottom tabs are Feed, Search, Events, Glimpse, Clips, Create and Profile. Give the actual available Messages entry or a verified route CTA, not an invented Messages tab. |
| Misleading technical escalation | “Report a problem” opens `report-content`, describing content/user reporting. It is not a technical bug-report form. Relabel the action appropriately unless a real technical channel is available. |
| Optional support | `VITE_SUPPORT_CONTACT_URL` is the sole general support configuration. If absent, the existing link is disabled. An operational support destination was not verified. |
| Password location | The current article describes Account Settings, but the password form is in Security at `/app/settings/security`. |
| Deactivation and export | Help describes buttons in Account Settings, but these are backend capabilities without verified controls in the current Account screen. Do not retain those steps as user-facing instructions. |
| Account deletion claims | UI and API copy say “30-day grace period.” Inspection found a pending-deletion marker and session revocation, but no persisted deletion deadline, scheduled purge or explicit restore/cancel UI. Do not claim guaranteed deletion timing or restoration until implementation and policy are verified. |
| Personal Restrict | A profile action stores restriction state, but corresponding behavioral enforcement was not verified. Do not promise that it hides messages, comments or activity. |
| Chat “Delete for me” | The UI offers it, but the inspected server branch deletes the shared message row rather than a viewer-specific record. Do not promise recipient-side preservation. |
| Report reasons | UI `nudity`/`hate` values differ from server `adult_content`/`hate_speech` categories and can normalize to `other`. Do not portray routing/category precision as verified. |
| Legal completeness | Legal documents have placeholders and lack a dedicated DMCA/counter-notification workflow. Help must not fill those gaps with invented procedures. |

Further evidence: `C/help/helpArticles.ts:70,104–111,143,185,188–226`; `C/screens/settings/AccountScreen.tsx`; `C/screens/settings/SecurityScreen.tsx`; `A/legacy-routes/users.ts:1052–1079,1185–1200`; `A/legacy-routes/chat.ts:729–745`; `C/components/shared/PromptDialog.tsx:101–118`; `A/legacy-services/reporting.ts:5–14`; `L/legal/legalConfig.ts`; `L/legal/legalContent.ts`.

## 2. Product Goal

Evolve the existing local article system into a complete, polished in-app support center.

The experience should:

1. Resolve common problems quickly without requiring users to know internal product terminology.
2. Find useful results from natural-language questions.
3. Organize only actual Campnect capabilities into understandable topics.
4. Provide concise summaries, accurate numbered steps, important notes and troubleshooting.
5. Distinguish technical questions, content reports, account safety and moderation appeals.
6. Work well on narrow phones, Android WebViews and desktop.
7. Use Campnect’s typography, semantic theme colors, shared navigation and interaction patterns.
8. Be honest when support configuration, a feature, a policy or a guarantee is unavailable.

**Non-goals for this specification:** Application implementation, new account capabilities, a ticketing system, CMS implementation, AI search, external AI integration, legal policy creation, database changes, migrations or APK builds.

## 3. Information Architecture

All categories below correspond to verified app capabilities or explicitly scoped explanations of those capabilities. A proposed category is not a claim that its articles already exist.

| Category | Current Help status | Underlying product status and proposed scope |
| --- | --- | --- |
| Account & Login | Existing | Password login, email OTP, recovery and signup verification |
| Profile & College | Existing | Profile editing and signup college identity; no self-serve college-change instruction |
| Posts & Content | Existing | Text/photo posts, visibility, engagement and comments |
| Clips & Glimpse | Proposed category | Both are live, separately routed features |
| Events | Proposed category | Discovery, creation, RSVP, reporting and conditional host tools |
| Messaging & Chat | Rename existing Messaging | Private chats, requests, groups, voice notes and supported media |
| Notifications | Existing | In-app preferences and separate device push permissions |
| Privacy & Safety | Existing | Privacy controls, blocking, audience and safety guidance |
| Reporting & Moderation | Proposed category | Real report flows, warnings, restrictions and eligible appeals |
| Communities | Proposed category | Discover/create/join/leave, content and conditional owner/admin editing; not community chat or unverified moderator tools |
| App Issues & Troubleshooting | Proposed category | Existing app/media/network/permission/update problems, not a new bug-report service |
| Account Management | Existing, content correction required | Sign out, sessions, deletion initiation and role-gated email change; deactivate/export instructions gated |
| Verification | Proposed category | Email verification and optional college-ID/selfie verification; explain entry-point uncertainty |
| Legal & Policies | Proposed category | Existing legal document destinations; copyright procedures remain gated |

Give each category a stable ID, display label, description and explicit order. Keep one primary category per article; cross-link instead of duplicating instructions. Separate email OTP verification from college-ID verification.

Do not add a category for calling, payments, marketplace, academic grading, ticket status, functioning filtered-message spam queues, retired Stories/Reels or community chat.

## 4. Help Center Home

| Section | Purpose and proposed behavior |
| --- | --- |
| Header | Keep the shell-owned Back control. Show one prominent “Help & Support” page heading without a second competing header or navigation stack. |
| Subtitle | Explain the scope in one sentence, for example “Find answers, troubleshoot problems, and understand your options.” Do not imply live-agent support. |
| Prominent search | Full-width labeled input with search icon, clear action and suggested question examples. Keep it available in all home states. |
| Popular / Quick Help | A curated set of stable article IDs: login, password recovery, OTP, upload troubleshooting, notification troubleshooting and reporting. “Popular” must mean a curated recommendation until actual aggregate usage exists. |
| Browse by Topic | Horizontally scrollable chips with an All option and selected state. Show topic counts only for eligible published articles. |
| Common Issues | Separate curated problem-oriented entries, not the first seven array items. Group login, uploads, messages, media loading and notifications where useful. Do not repeat an identical quick-help list without purpose. |
| Still Need Help? | Route users to the correct existing content-report guide, eligible appeal screen, legal information or configured support destination. Explain unavailable technical contact rather than presenting a dead action. |

Search mode may prioritize results and concise suggestions over discovery sections. Clearly communicate whether search is global; do not silently apply a remembered category filter.

Home state must survive a normal article-open-and-back journey during the current visit. Empty categories must explain that no published articles are available and offer All topics.

## 5. Search System

### 5.1 Local natural-language search

Keep search local and deterministic. This proposal does not need AI, a paid service or an API request.

Index:

- Article title.
- Description/summary.
- Explicit keywords.
- Authored synonyms and aliases.
- Category label and configured category aliases.

Normalize Unicode, case, whitespace, punctuation and common contractions. Match meaningful words/phrases rather than arbitrary substrings. Handle `can't`, `cannot`, `log in`, `login`, `sign in`, `OTP`, `verification code`, `DP` and `profile picture`. Avoid dropping negation when it differentiates an intent.

Minimum query-to-result expectations:

| Example query | Intended first relevant result |
| --- | --- |
| `I can't log in` | Can't log in |
| `I forgot my password` | Password recovery |
| `How do I change my username?` | Proposed username-change article |
| `Why didn't I receive my OTP?` | OTP not received |
| `How do I report someone?` | Account/profile reporting |
| `Why can't I upload a video?` | Proposed video/Clip upload troubleshooting |

Do not infer a feature from a query. A student searching for email change must receive an explanation of the faculty-only limitation, not nonexistent student steps.

### 5.2 Ranking contract

Use ordered match tiers so lower-priority matches cannot overwhelm a stronger match merely by accumulating tokens:

1. Exact normalized title.
2. Strong title keyword/phrase match.
3. Keyword, synonym or alias match.
4. Description match.
5. Category match.

Within a tier, rank by coverage of meaningful query tokens, phrase relevance, then bounded `searchPriority`, then a deterministic title/ID tie-breaker. A priority boost must not move an unrelated article ahead of a directly relevant one.

Exclude unpublished articles and unavailable-role instructions. When a restricted capability is relevant, prefer a published explanatory article with clear eligibility.

### 5.3 Search states

- **Empty:** Show quick help, topics and common issues; do not display an empty results list.
- **Typing/results:** Show result count, readable title, summary and category. Provide a visible clear button with an accessible name.
- **Suggestions:** Offer authored intent suggestions, not user-history mining. Suggestions populate the query and run the same search.
- **Popular searches:** Use curated examples until genuine, privacy-reviewed aggregate data exists.
- **No results:** Say no matching article was found; preserve the query; offer Clear search, Browse all topics, useful suggestions and the existing escalation options. Never say “contact us” without an available channel.
- **Only punctuation/stopwords:** Treat as insufficient search input and offer suggestions rather than misleading matches.
- **Unavailable article data:** Show a retryable content-loading error if data is loaded asynchronously; never present an infrastructure failure as “no results.”

Search remains global by default, preserving the current semantics. If a future explicit “Search within this topic” filter is approved, show its scope and a clear All topics escape.

Do not store raw search text in analytics, URLs or persistent history by default. Preserve visit state transiently through existing router-compatible state.

## 6. Article System

### 6.1 Article presentation

Every published article supports:

1. Category.
2. Plain-language title.
3. One- or two-sentence summary.
4. Numbered, verifiable steps with exact visible control labels.
5. Important notes, eligibility and limitations.
6. Troubleshooting with symptom → action guidance.
7. Relevant existing action links where context and authorization permit.
8. Related articles.
9. Was this helpful? feedback.

Use the same detail route family. An article must not initiate a destructive action, send a report, change privacy or submit an appeal simply by being opened.

### 6.2 Proposed structured data model

This is a data contract, not application code to implement in this step.

| Field | Type / meaning |
| --- | --- |
| `id` | Required immutable unique string; stable across title/category changes |
| `slug` | Required unique URL-safe string |
| `title` | Required plain-language title |
| `description` | Required concise summary; migrate current `shortDescription` compatibly |
| `category` | Required stable category ID |
| `keywords` | Required string list of relevant concepts |
| `aliases` | Required string list of query variants; migrate current `searchTerms` |
| `body` | Required list of approved content blocks, possibly empty for a steps-first article |
| `steps` | Required ordered list of heading/instruction pairs |
| `notes` | Required list, possibly empty; supports eligibility/warning/information notes |
| `troubleshooting` | Required list, possibly empty; symptom, action and optional next destination |
| `relatedArticles` | Required list of stable article IDs, possibly empty |
| `searchPriority` | Required bounded numeric editorial boost |
| `published` | Required boolean; only published eligible articles appear in search/home |
| `screenshots` | Optional list of local optimized images with alt text and captions |
| `video` | Optional reviewed demonstration asset with captions/transcript |
| `lastUpdated` | Optional verified editorial-review date, not generated afresh on each visit |
| `audience` | Optional role/platform requirements, for example faculty or Android |
| `sourceReferences` | Optional editorial provenance: source paths, approved policy/config references |
| `actions` | Optional typed existing route/configured external/contextual action references |

Prefer a safe limited block format or sanitized Markdown; do not accept arbitrary executable JSX or untrusted HTML. Future editorial content must not execute scripts.

Structured content allows consistent rendering, validation, search indexing, related-link checking, localization readiness and eventual Admin editing. It also preserves the structured foundation already present instead of scattering instructions across screen JSX.

Validate unique IDs/slugs, valid categories, published-state filtering, related references, dates, permitted links and action eligibility. Keep old slugs working when existing titles change; do not silently break deep links.

## 7. Article Feedback

Keep **“Was this helpful?”** with **Yes** and **No** buttons.

- Selection is explicit, accessible and associated with the current article.
- Yes shows a brief acknowledgment.
- No reveals optional reasons: Instructions didn't work; Couldn't find what I needed; Information is unclear; App is different; Other.
- A reason should lead to a relevant next action, not automatically submit a content-abuse report.
- “Instructions didn't work” exposes related troubleshooting and configured support if available.
- “App is different” offers platform/version-specific notes and existing update guidance, without promising an unverified update channel.
- Safety concerns lead to the reporting/safety guide; eligible moderation concerns lead to Content appeals.
- Allow the user to change or clear the selection. Do not require feedback to continue reading.

**Current limitation:** Votes are not collected. Any persistent vote/reason submission is a future, separately approved capability; no feedback API is established by this specification. Until persistence exists, do not claim that staff received feedback or opened a case.

Default to enumerated reason codes. Free-text “Other” collection is not necessary for launch; if later approved, define consent, retention, redaction and handling first. Never ask for OTPs, passwords, ID images, private-chat exports or sensitive evidence in article feedback.

## 8. Related Articles

Use editorial relationships grounded in the same task or a plausible next problem. Show a small set, normally three to five eligible published articles. Exclude the current article, duplicates, unpublished entries and inappropriate role/platform steps.

For **Can't log in**, recommend:

- I forgot my password.
- OTP not received.
- Verification code expired.
- Account security and active sessions.
- A clear explanation of rate limits versus suspension.

Do not recommend general Change email to a student or Account locked/unlock steps that do not exist.

Current related strings are slugs. If migrating to stable IDs, convert them explicitly and validate every reference. Fix `privacy-controls` → the real privacy article and `data-export` → the real data-export record only if that article is publishable after accuracy review.

Policies belong in a separate existing-policy action or a real policy-explainer article, not a nonexistent article reference. Missing relationships must fail editorial validation rather than quietly disappear at runtime.

Related-article navigation should preserve a single return path to Help, as specified in section 11.

## 9. Help Content Coverage

### 9.1 Inventory conventions

All titles below are editorial recommendations, not promises that new articles exist today.

- **E:** Existing help article; retain and revise as needed.
- **P:** Proposed article for a verified user-facing capability.
- **C:** Proposed conditional article, explicitly limited by role/platform/context.
- **G:** Publication gated because behavior, entry point or policy is not sufficiently verified.

Do not publish a G entry as a working workflow. Some are accuracy notes for the editorial backlog, not planned new product features.

### 9.2 Account & Login

| Article | Status / scope |
| --- | --- |
| Can't log in | E — distinguish email/@username credentials, OTP, network, rate limits and suspension |
| I forgot my password | E — actual code-based recovery steps |
| OTP not received | E — correct address, folders, resend and latest-code guidance |
| Verification code expired or rejected | P — actual expiry, attempts and resend UI; avoid suggesting unlimited resends |
| Sign up with a college email | P — institution email, college selection and role-specific fields |
| Login OTP versus signup email verification | P — explain the distinct screens |
| Too many login attempts | P — rate limiting is not an account-unlock feature |
| My account is suspended | C — use the actual suspended-account screen and eligible appeal path |
| Account security and suspicious access | P — password change and active-session controls; no invented login history or 2FA |
| Change my email | C — only faculty/teacher accounts expose the verified institutional-email change flow |
| Recover a deleted or deactivated account | G — no verified self-serve restore/cancel-deletion workflow |

Evidence: `C/screens/auth/{LoginScreen,VerifyLoginScreen,VerifyEmailScreen,ForgotPasswordScreen,RegisterScreen}.tsx`; `A/legacy-routes/auth.ts:135–159,419–593,643–684`; `C/screens/settings/{AccountScreen,SecurityScreen}.tsx`; `C/screens/main/SuspendedAccountScreen.tsx`; `A/legacy-routes/users.ts:198–253`.

Current OTP expiry is 10 minutes. Login rate limiting is distinct from a locked-account state. Signup UI requires at least eight characters, uppercase and a number; reset/change-password checks differ. Explain requirements shown for the specific flow, not a falsely universal password rule.

### 9.3 Profile & College

| Article | Status / scope |
| --- | --- |
| Edit my profile | E — visible fields and actual save control |
| Change or remove my profile picture | E — avatar selection/removal |
| Change or remove my cover photo | P |
| Change my username | P — actual field and validation/error copy |
| Username rules | P — derive allowed/reserved/abuse rules from current validation; no invented change cooldown |
| Update course/department and year | C — role-specific fields |
| Add skills and links | P — UI currently exposes up to four skills and two links |
| Public versus private profile | P — visibility and follow-request implications |
| My college is missing during signup | C — actual signup guidance and specialized college-request contact only |
| Change my college after signup | G — no verified Edit Profile college-change control |

Evidence: `C/screens/main/EditProfileScreen.tsx:99–119,159–345,425–595`; `C/screens/auth/RegisterScreen.tsx:349–485,819–823`; `A/legacy-routes/users.ts:255–282`.

### 9.4 Posts & Content

| Article | Status / scope |
| --- | --- |
| Create a post | E — text/photo workflow; correct generic video wording |
| Delete my post | E — ownership and confirmation |
| Add photos and choose supported media | P |
| Post visibility: public, college and friends | P |
| Upload failed or stuck | P — retry without guaranteeing draft persistence |
| Image/video size and duration limits | P — distinguish product surfaces |
| Save a post and find saved content | P |
| Like, comment and reply | P |
| Edit or delete my comment | P — ownership and current available actions |
| Why did my comment show a warning? | P — local moderation and draft confirmation |
| Why is a comment blocked or held for review? | P — no publication until permitted; eligible review/appeal path |
| My post or comment was moderated | C — current history/status and eligible appeals |
| Report a post | P — actual item menu |
| Report a comment directly | G — backend route exists, but no verified primary comment report button |
| Edit an existing post | G — do not invent a general post-editing menu |
| Create a poll or an audio post | G — backend support does not establish a primary composer workflow |

Evidence: `C/screens/main/CreatePostScreen.tsx:210–255,310–348,1039–1052,1105–1111`; `C/components/feed/{PostCard,CommentSheet}.tsx`; `C/api/posts.ts`; `A/legacy-routes/posts.ts`; `C/screens/settings/ContentAppealsScreen.tsx`; `C/features/comments/commentModeration.ts`; `A/legacy-services/{commentModeration,commentEnforcement}.ts`.

The current composer caps captions at 2,200 characters, even though server schema permits more. It allows up to ten selected media items and prevents a video mixed with other items; the primary video publishing journey is Clips. Do not describe the server maximum as the composer allowance.

### 9.5 Clips & Glimpse

| Article | Status / scope |
| --- | --- |
| What are Clips? | P — actual video-post surface, not retired Reels |
| Upload a Clip | P |
| Clip file and duration requirements | P |
| Clip processing, upload progress and retry | P — no processing-time promise |
| Clip unavailable or media not loading | P — possible access/moderation/network states |
| Choose a Clip audience | P |
| Report or delete a Clip | P — separate own/other actions |
| What is Glimpse? | P — photo/video discovery and current expiry |
| Create a photo or video Glimpse | P — one media item and actual capture/upload controls |
| Glimpse caption and daily limits | P |
| Glimpse expired or unavailable | P |
| Glimpse camera/upload problems | C — browser versus native capture differences |
| Report or delete a Glimpse | P |
| Video sound and playback controls | P — explain muted autoplay and the real sound toggle |

Evidence: `C/screens/main/{ClipCreateScreen,ClipsScreen,CreateGlimpseScreen,GlimpseScreen,GlimpseViewerScreen}.tsx`; `C/api/{clips,glimpses}.ts`; `A/legacy-routes/{clips,glimpses}.ts`; `A/legacy-services/mediaLimits.ts`; `C/utils/mediaUploadPolicy.ts`.

Verified current limits:

| Surface / policy | Verified value |
| --- | --- |
| Image upload | 25 MiB per image |
| Video upload | 100 MiB per video |
| Video duration | Maximum 60 seconds |
| Clip picker guidance | MP4, MOV, WebM |
| Glimpse media | One photo or one video |
| Glimpse caption | Maximum 140 characters |
| Glimpse published daily limit | 10 |
| Glimpse feed availability | 24 hours, subject to access/removal |

These are source values, not permanent policy promises. Recheck client and server on each content review. MiB means binary units; do not silently relabel these as decimal MB. Backend MIME acceptance is wider than some pickers; document the actual surface’s allowed types. No resolution limit was verified.

Clip transport uses chunks, but that does not increase the 100 MiB allowance. Do not expose internal transport details as a user requirement.

### 9.6 Events

| Article | Status / scope |
| --- | --- |
| Discover and open events | P |
| RSVP, change attendance and leave an event | P |
| Save and share an event | P |
| View attendees | C — follow current access rules |
| Create an event | C — account/campus permissions |
| Edit my event | C — organizer permissions |
| Event audience and campus eligibility | C — current form and access rules, not assumed post visibility |
| Host controls, co-hosts and invitations | C |
| Event announcements | C |
| Cancel or end an event | C — explain actual controls and impact |
| Join event chat and understand availability | C — current membership and event state |
| Report an event | P — verified Event Detail action |
| Delete an event | G — do not equate Cancel/End with deletion or invent a deletion control |

Evidence: `C/screens/main/{EventsScreen,CreateEventScreen,EditEventScreen,EventDetailScreen,EventAttendeesScreen}.tsx`; `C/api/events.ts`; `A/legacy-routes/events.ts:589–664,920–1047,1108–1123`; `A/legacy-routes/chat.ts:212–238,277–285`.

### 9.7 Messaging & Chat

| Article | Status / scope |
| --- | --- |
| Send a message / start a conversation | E — revise entry instructions; no Messages bottom tab |
| Message not sending | E — acknowledged delivery, retry and permission limits |
| Reply to a message | E — verify current gestures and quoted-preview behavior |
| Accept, remove or block a message request | P |
| Send photos/videos, emoji, GIFs and stickers | P — actual picker/composer |
| Record and send a voice note | C — microphone permission and actual controls |
| Edit my text message | P — sender-owned text-only action |
| Delete a message | G for recipient-preservation claims — UI actions exist, but “Delete for me” semantics need correction/verification |
| Report a threatening or abusive message | P — available on another person’s message |
| Block/unblock from chat | P — new messages stop; existing private history is retained |
| Who can message me? | P — actual privacy controls |
| Messaging restriction or read-only state | C — distinguish platform enforcement from personal profile Restrict |
| Create a group and invite people | P |
| Leave a group / delete my group | C — ownership distinction and exact destructive confirmation |
| Group roles, approvals and shared media | C — actual group permissions |
| Event chat unavailable | C — active event and eligible attendance/host membership |
| Chat banners, push and notification-center differences | P — do not describe every message as a notification-center row |
| Voice/video calls or filtered spam requests | G — calling is not a reachable primary workflow; Filtered is currently an empty placeholder |

Evidence: `C/screens/main/{ChatListScreen,NewMessageScreen,MessageRequestsScreen,ChatRoomScreen,CreateGroupScreen,GroupInfoScreen}.tsx`; `C/components/chat/{ComposerBar,ChatMediaPickerSheet,MessageActionsSheet}.tsx`; `A/legacy-routes/chat.ts:23–46,212–285,457–479,581–589,715–745`.

The media picker exposes image/video selection, not a general audio-file upload. Voice notes are recording, not a verified calling feature. Do not promise audio/video calls because an unused `CallScreen.tsx` exists.

### 9.8 Notifications

| Article | Status / scope |
| --- | --- |
| Manage notification settings | E |
| Notifications not appearing | E |
| Enable Android notification permission | C — device settings are separate from Campnect preferences |
| Understand likes, comments, follows and mentions | P |
| Group/community/college-notice preference controls | P |
| Read, mark all read and delete in-app notifications | P |
| Chat message alerts and banners | P |
| Event alerts | C — describe actual delivery; do not invent a dedicated Events toggle |

Evidence: `C/screens/settings/NotificationPrefsScreen.tsx:8–57,76–145`; `C/screens/main/NotificationsScreen.tsx`; `A/legacy-routes/notifications.ts:8–70`; `A/legacy-routes/users.ts:817–852`.

Current preference labels include Likes, Comments, New Followers, Mentions, Group Activity, Community Activity, College Notices and Marketing. Their presence is not proof of guaranteed delivery for every event.

### 9.9 Privacy & Safety

| Article | Status / scope |
| --- | --- |
| Manage privacy settings | E |
| Public/private profile and follow requests | P |
| Who can see my content? | P — account and per-content audiences |
| Block a user / unblock someone | E, expanded |
| Online status, last seen and read receipts | P — actual controls and limits |
| Who can message me? | P |
| Threats or threatening messages | P — reporting/blocking and realistic safety guidance |
| Harassment | P |
| Someone shared my private information | P |
| Non-consensual intimate content | P — avoid reproducing sensitive material in feedback |
| Profile Restrict: what is currently available? | G for behavioral claims — state-only enforcement was found |
| Community Guidelines and safe participation | P — link real policy |

Evidence: `C/screens/settings/PrivacyScreen.tsx`; `C/screens/main/{ProfileScreen,ChatRoomScreen}.tsx`; `A/legacy-routes/users.ts:1102–1232`; section 13.

### 9.10 Reporting & Moderation

| Article | Status / scope |
| --- | --- |
| Report inappropriate content or a user | E — revise targets and move/cross-link to this category |
| Report an account/profile | P |
| Report a post, Clip or Glimpse | P — separate target-specific instructions |
| Report a message | P |
| Report an event | P |
| What happens after reporting? | P — review, no guaranteed outcome or timing |
| Removed or restricted content | C — actual visible status and eligible appeals |
| Comment warnings, blocks and held submissions | P — local policy; no AI dependency or disclosed evasion thresholds |
| Platform restrictions versus profile Restrict | P |
| Account suspension and its appeal screen | C |
| Appeal a content/comment moderation action | C — current eligible records and outcomes |
| Approved comment appeal: resubmit the exact draft | C — approval is not automatic publication |
| Appeal rejected or still pending | C — displayed status; no promised reversal |
| Report a comment or community directly | G — backend handlers are not verified user-facing actions |
| Copyright/DMCA notices and counter-notifications | G — a specific legal procedure is not configured |

Evidence: `C/screens/settings/ContentAppealsScreen.tsx`; `C/screens/main/SuspendedAccountScreen.tsx`; `C/components/shared/PromptDialog.tsx`; `A/legacy-services/{reporting,commentEnforcement,userRestrictions}.ts`; `A/legacy-routes/{reporting,users,posts,chat,events,clips,glimpses}.ts`.

### 9.11 Communities

| Article | Status / scope |
| --- | --- |
| Discover communities | P |
| Join or leave a community | P |
| Create a community | P — current name, description, category and private setting |
| Find community posts, members and events | P |
| Edit a community | C — owner/admin permissions |
| Community participation and platform rules | P — distinguish platform guidelines from unverified custom-rule tools |
| Community chat | G — explicitly “coming soon” |
| Community reports and member-moderation tools | G — no verified primary controls; owner editing is not moderation |

Evidence: `C/screens/main/{CommunitiesScreen,CreateCommunityScreen,CommunityScreen,EditCommunityScreen}.tsx`; `A/legacy-routes/communities.ts:68–204`.

### 9.12 App Issues & Troubleshooting

Proposed articles for actual app behavior:

- App will not open or stops responding.
- App crashes or is slow.
- Network and temporary service errors.
- Images/media do not load.
- Videos do not play or have no sound.
- Upload is stuck or failed.
- Notifications are not working.
- Camera permission for capture.
- Microphone permission for voice notes/video capture.
- Browser media picker versus Android gallery.
- Android Back and navigation problems.
- Keyboard obscures controls.
- Maintenance and update notices.
- Where to get the update offered by the app.

**All P/C:** Use only the observed retry, permission, status and update controls. Do not guarantee recovery, recommend clearing app data without explaining loss of local state, or invent an app-specific crash-report button. Do not promise a draft/upload survives a reinstall.

Evidence: `C/main.tsx`; `C/navigation/BackNavigation.tsx`; `C/screens/main/{CreateGlimpseScreen,ClipCreateScreen,ChatRoomScreen}.tsx`; `C/components/chat/{ComposerBar,ChatMediaPickerSheet}.tsx`; `A/app.ts:221–234`; `A/legacy-services/{maintenance,appUpdate,mediaLimits}.ts`.

### 9.13 Account Management

| Article | Status / scope |
| --- | --- |
| Change my password | E — correct destination to Security |
| Sign out | P — existing Settings action |
| Review active sessions and log out other sessions | P — no invented login-history dashboard |
| Update account information | C — separate profile fields from role-gated email |
| Start account deletion | E, accuracy-gated — describe actual confirmation and avoid unverified timing/restore guarantees |
| Deactivate my account | Existing article, G — backend-only capability, no verified current button |
| Download my data | Existing article, G — backend-only capability, no verified current button |
| Restore/cancel deletion | G — no explicit primary workflow or verified scheduled-purge implementation |
| Enable 2FA | G — Settings subtitle mentions it, but no control was verified in Security |

Evidence: `C/screens/main/SettingsScreen.tsx`; `C/screens/settings/{AccountScreen,SecurityScreen}.tsx`; `A/legacy-routes/users.ts:856–868,1052–1079`; `A/legacy-routes/auth.ts:757–789`.

### 9.14 Verification

Proposed articles:

- Verify signup email and resend its OTP (**P**).
- Login OTP versus verification badge (**P**).
- Optional college-ID and selfie verification (**C**).
- Verification submission problems (**C**).
- Verification badge/status questions (**C**, use only actual displayed states).

The `/verify-college` route and upload flow exist, but a current Profile/Settings entry was not verified. College-ID verification is not a general access gate. Do not tell users to tap an absent entry, imply everyone must upload identity documents, or invent verification turnaround times.

Evidence: `C/App.tsx:199–205`; `C/screens/auth/{VerifyEmailScreen,VerifyCollegeScreen}.tsx`; `C/routes/ProtectedRoute.tsx:63–75`; `A/legacy-routes/auth.ts:691–738`.

### 9.15 Legal & Policies

Proposed explainers for Community Guidelines, Privacy Policy, Terms of Service, Cookie Policy and applicable child-safety information. Link authoritative documents instead of duplicating legal text that can drift.

Copyright ownership/reporting overview is **conditional** on approved wording; dedicated DMCA notices, agent details, deadlines and counter-notification instructions remain **G**.

Evidence: `C/help/helpLinks.ts`; `C/screens/settings/LegalScreen.tsx`; `L/App.tsx`; `L/legal/{legalConfig,legalContent}.ts`.

## 10. Content Accuracy Rules

These rules are publication requirements:

1. Do not document nonexistent features.
2. Do not instruct users to press buttons that do not exist.
3. Do not invent support emails or repurpose unrelated contacts.
4. Do not invent policies, upload limits, legal procedures or response deadlines.
5. Do not promise actions Campnect does not actually perform.
6. A backend route, unused screen or database column alone is not a user workflow.
7. Verify the exact route, control label, role, ownership requirement and final outcome.
8. Distinguish Android, browser and account-role differences.
9. Preserve discrepancies in the editorial backlog; do not hide them behind confident wording.
10. Verify limits against client and authoritative server code. Prefer current visible constraints where the UI is stricter.
11. Never publish internal classifier rules, evasion advice, sanction thresholds or confidential review logic.
12. Review destructive-action articles against actual persistence and policy, not only confirmation copy.
13. Verify legal documents and contact configuration before promising a channel is usable.
14. Record the evidence and reviewer for accuracy-sensitive content. Re-review after relevant feature changes.

The deletion, message-deletion, Restrict, deactivation/export, support-contact and copyright gaps in section 1 must be resolved or honestly excluded from applicable instructions.

## 11. Navigation

Use React Router, the current app shell and the shared Back coordinator. Do not create a custom navigation system.

- Keep Help at `/app/settings/help`.
- Keep article URLs beneath `/app/settings/help/article/:slug`.
- Enter Help from existing Settings with a normal router push.
- Open an article from Help with a normal push.
- Back from an article should return to Help with visit query/category/scroll restored.
- Back from Help should return to the prior Campnect screen, not always force Feed.
- Topic selection is local state, or a non-sensitive category parameter updated with replace; it must not add a history entry per chip.
- Related-article changes should replace the current article entry where appropriate, so Back still reaches Help rather than a long article chain.
- Do not use raw browser `history.back()` or separate Capacitor listeners that bypass the coordinator.
- An open dialog/sheet dismisses before route navigation.
- Help is a settings child, not a root-exit screen.

**Existing discrepancy:** Ordinary Settings → Help → Article history already unwinds normally. A cold article deep link currently falls back to Profile through `C/utils/navigation.ts`, not Help. The future implementation must use the existing fallback/coordinator architecture to give cold article entry a Help fallback, while preserving unrelated routes’ Back behavior. Cold Help entry may retain the established Profile fallback.

Existing routes support slug-addressed article URLs, but authenticated deep links must pass normal session validation. Preserve the return destination if the existing auth architecture supports it; do not assert anonymous Help access or introduce a new auth bypass.

Sources: `C/App.tsx`; `C/navigation/BackNavigation.tsx`; `C/navigation/{backCoordinator,appSectionNavigation}.ts`; `C/utils/navigation.ts`; `C/navigation/backNavigationContract.test.ts`.

## 12. Support Escalation

### 12.1 Still need help?

Present actions according to intent and actual availability:

| Intent | Existing destination / restriction |
| --- | --- |
| Understand how to report abuse | Existing `report-content` article, revised with target-specific steps |
| Report content/account | The actual target’s Report control; a generic help page cannot submit an object-specific report without a valid target |
| Report a threatening message | Existing other-person message action sheet and report dialog |
| Appeal eligible content/comment action | `/app/settings/content-appeals` |
| Appeal account suspension | Existing suspended-account screen, outside normal protected content |
| General account/app support | `supportContactUrl` only when `VITE_SUPPORT_CONTACT_URL` is configured and validated |
| Read policy | `/app/settings/legal` and its authoritative links |
| Technical bug report | No dedicated form/route was verified; do not label content reporting as a technical bug-report service |

When support contact is missing, display honest availability text and useful article/report/appeal alternatives. Do not render an apparently active external link that does nothing.

Never promise an agent, a ticket number, tracking, reply timing, a moderation outcome or a recovery service that has not been implemented.

### 12.2 Contact boundaries

- General support is configuration-dependent; no fallback general support email is established.
- `colleges@campnect.app` appears in signup guidance for missing-college requests only.
- `campnect@gmail.com` is designated in legal configuration for child-safety matters only.
- The automated `noreply.campnect@gmail.com` sender is not a support inbox.
- Legal contact/address placeholders are not valid destinations.

These source-listed addresses were not operationally tested. Prefer existing configuration references over duplicating contacts across articles.

Sources: `C/help/helpLinks.ts:6–29`; `C/screens/settings/HelpSupportScreen.tsx:66–79`; `C/screens/auth/RegisterScreen.tsx:819–823`; `L/legal/legalConfig.ts:1–10`; `A/legacy-services/email.ts:6`.

## 13. Safety Help

Provide calm, direct articles for threats, harassment, doxxing/private information, non-consensual intimate content and threatening messages.

Each article should explain:

1. How to use the relevant existing Report action.
2. How to block the person where the current UI offers it.
3. What blocking does and does not do, including retained private history.
4. How to leave a group where permitted.
5. Where to find relevant Guidelines or the designated child-safety channel for that specific subject.
6. That reporting does not guarantee immediate action, a response deadline or evidence preservation.

Do not instruct users to copy intimate media, private messages or identity details into general feedback. Reported message/attachment review is part of the explicit message-report flow, not a claim that staff routinely read every private chat.

Personal profile Restrict is not interchangeable with enforced platform restrictions. Do not recommend it as reliable protection until its behavior is verified.

Contextual actions must check target availability and existing access. If a help page has no target context, teach the steps instead of creating a fake Report button or silently reporting the wrong parent object.

Do not invent emergency-response promises. For immediate danger, wording may advise seeking local emergency assistance without claiming Campnect provides emergency services or assuming a particular country’s phone number.

Sources: `C/screens/main/{ProfileScreen,ChatRoomScreen,GroupInfoScreen}.tsx`; `C/components/chat/MessageActionsSheet.tsx`; `A/legacy-routes/{users,chat}.ts`; `L/legal/legalContent.ts:40–64,79–96,113`.

## 14. Legal & Copyright Help

### 14.1 Existing destinations

The app’s `legalLinks` resolves configuration overrides or source-defined legal-portal fallbacks:

| Document | Override | Portal path |
| --- | --- | --- |
| Privacy Policy | `VITE_PRIVACY_POLICY_URL` | `/privacy` |
| Terms of Service | `VITE_TERMS_OF_SERVICE_URL` | `/terms` |
| Community Guidelines | `VITE_COMMUNITY_GUIDELINES_URL` | `/community-guidelines` |
| Cookie Policy | `VITE_COOKIE_POLICY_URL` | `/cookies` |

`VITE_LEGAL_PORTAL_ORIGIN` can override the source fallback `https://legal-campnect.perinol.com`. These are inspected configuration destinations, not a separate live availability check.

The legal artifact also registers `/child-safety`; it is not currently one of the four entries in `legalLinks`. Add a Help reference only through an approved, validated destination consistent with the legal configuration.

### 14.2 Copyright limitations

Terms/Guidelines prohibit infringement and describe generic reports and eligible moderation appeals. However, no verified dedicated DMCA/takedown notice form, designated copyright agent/channel or counter-notification procedure was found.

The backend `copyright` report category is not a legal notice process, and the standard visible report dialog lacks a copyright reason option. General content appeals are not automatically statutory counter-notifications.

Until approved documents and channels exist:

- Link the existing Terms/Guidelines.
- Explain only the reporting controls that actually exist.
- Do not provide invented notice requirements, agent addresses, legal deadlines or counter-notification forms.
- Do not promise legal sufficiency or a mandatory takedown outcome.
- Keep specialized procedural articles unpublished.

Sources: `C/help/helpLinks.ts`; `C/screens/settings/LegalScreen.tsx`; `L/App.tsx:37–39`; `L/legal/legalContent.ts:110–139`; `A/legacy-services/reporting.ts:5–14`.

## 15. UX / Visual Design

This analysis is grounded in existing screen styles and shared components. No Help-specific screenshot was supplied and no signed-in Help visual walkthrough was performed for this documentation task.

Preserve:

- `colors.bg`, semantic surface/border/text values and `colors.blueLight`.
- `--font-display` and `--font-body`.
- Shared `radii` rather than introducing a separate design scale.
- The selected-control `--color-lime` token, including its existing light-theme mapping.
- Lucide icon style, existing dialogs/sheets, shared TopBar and floating BottomNav.

Proposed improvements:

| Area | Specification |
| --- | --- |
| Spacing | Use a consistent 16px mobile content rhythm and clear section gaps; constrain wider reading layouts without making mobile cards narrow. |
| Typography | One page h1; clear h2 group headings; comfortable article body size/line height. Avoid relying on tiny uppercase text for essential instructions. |
| Search | Retain a generous input height; add visible focus, clear action and explanatory suggestions. |
| Chips | Increase current 34px chips to at least 44px effective touch targets. Keep selection distinguishable without color alone. |
| Article groups | Consistent rows/cards with title, summary and optional category; avoid duplicated discovery lists. |
| Pressed states | Provide a theme-aware pressed background and keyboard focus, not hover-only feedback. |
| Empty/search states | Helpful text plus real actions. Announce result counts without repeatedly reading the full result list. |
| Loading | Static content should not show a needless spinner; lazy loading may show a restrained article skeleton. |
| Error | Missing slug, failed content load and zero results are different states with different next actions. |
| Transitions | Short, subtle transitions; respect reduced motion and avoid animation before text can be read. |
| Theme | Test dark and light semantic colors, including lime remapping, borders and muted text. No hard-coded dark-only surfaces. |
| Navigation | Keep shared header/nav conventions; ensure article identity is clear even though current TopBar lacks an exact article title mapping. |

The result should feel like a native Campnect screen, not a desktop documentation sidebar, embedded external site or unrelated branded widget.

Sources: `C/screens/settings/{HelpSupportScreen,HelpArticleScreen}.tsx`; `C/styles/tokens.ts`; `C/styles/globals.css:197–244`; `C/components/navigation/{TopBar,BottomNav}.tsx`.

## 16. Mobile UX

- No horizontal page overflow at narrow widths, larger text sizes or landscape.
- Only the chip row may scroll horizontally; give users a visible hint that more topics exist.
- Long titles, URLs and troubleshooting text wrap safely.
- Use the shell’s ordinary vertical scroller, not a competing full-page `100vh` scroller.
- Keep content within the root’s existing native/browser safe-frame handling.
- Reuse `--bottom-nav-clearance`; the shell already supplies navigation clearance. Do not double-count insets or add device-specific hard-coded footer heights.
- Feedback, related articles and escalation controls must be fully reachable above the floating bar.
- The current global keyboard behavior hides BottomNav and removes clearance when the keyboard opens. Help search must work with that behavior rather than add a second keyboard-height system.
- Preserve existing viewport sizing and scroll containment; no Help-specific global overflow overrides.
- Android Back dismisses transient UI first, then follows the route contract in section 11.
- Restore the reader’s home query/category/position when returning from an article; reset an opened article’s scroll appropriately.

Evidence: `C/screens/main/AppShell.tsx:68–83,99–137`; `C/styles/globals.css:126–149,380–449,1060–1071`; `C/main.tsx:48–125`; `C/components/navigation/BottomNav.tsx:48–70`.

## 17. Accessibility

Acceptance targets:

- Programmatically labeled search input; placeholder is not the sole label.
- Clear-search button named “Clear help search.”
- Topic chips expose selected state with `aria-pressed` or an equivalent correctly implemented pattern.
- Article links/buttons have meaningful names without depending on a chevron.
- Minimum 44×44px effective targets, including chips, feedback and Back controls.
- Visible keyboard focus; the current input’s `outline: none` must not remove all focus indication.
- WCAG AA text contrast in both themes and non-color-only status cues.
- One h1 per screen and logical h2/h3 hierarchy.
- Ordered instructions remain semantically numbered; decorative number bubbles/icons do not obscure screen-reader order.
- Results/empty/error status is announced politely. Debounce announcements, not necessarily local search.
- No keyboard trap; predictable tab order and Escape/Back dismissal for any future reason dialog.
- Alt text/captions for screenshots and transcript/captions for instructional video.
- Reduced-motion support and usable 200% text zoom.
- A disabled/unconfigured contact destination is communicated as unavailable, not an unlabeled dead link.
- After article navigation, focus moves predictably to the article heading without breaking shared Back behavior.

## 18. Analytics

No first-party Help event collector or feedback persistence was found in inspected Campnect source. GIPHY’s provider analytics callbacks are unrelated and are not a Help analytics system. Hosting-level analytics, if any, were not established by this source review.

The following are **conditional future events**, not tracking already present or a requirement to install a service now:

| Event | Minimal permitted properties |
| --- | --- |
| `help_opened` | Known entry-point enum |
| `help_search` | Query-length/result-count buckets, authored matched intent/article IDs if needed |
| `help_search_no_results` | Query-length bucket; no raw query |
| `help_category_selected` | Stable category ID |
| `help_article_opened` | Stable article ID, known source enum |
| `help_article_helpful` | Stable article ID |
| `help_article_not_helpful` | Stable article ID and enumerated reason |
| `help_report_problem_clicked` | Verified destination kind; only when the label maps to an actual problem-report channel |

If the action is content reporting, use truthful reporting semantics rather than treating it as a technical report event.

Do not collect raw searches, feedback narratives, email addresses, usernames, OTPs, account IDs, college documents, private-chat text or evidence by default. Searches may contain sensitive concerns. No third-party/AI transmission is required.

Before implementing analytics, confirm the approved existing collector, privacy disclosure, retention, access and deduplication rules. If none exists, defer collection rather than silently add tracking.

## 19. Performance

- Prefer the existing static/local article source and deterministic client-side index.
- Build normalized search metadata once per article dataset, not on every keystroke.
- Filter unpublished/invalid entries before exposing them.
- No network request is needed for category changes, article search, suggestions or curated quick help.
- Avoid adding a search library for this small inventory unless measured needs justify it.
- Lazy-load screens or larger article bodies only where useful; keep a light local search index.
- Load screenshots only when visible, specify dimensions and use optimized local assets.
- No autoplaying help videos; transcripts remain usable without media loading.
- Static data is immediately available; do not fake loading. Real lazy-load failures require retry/error states.
- Feedback must not block reading or navigation.
- Avoid an article-fetch request on every render and unnecessary background polling.
- Use existing navigation and page bundles; no embedded external documentation application.

## 20. Future Admin/CMS Compatibility

**Do not build a CMS in this step.**

The proposed data contract should allow an eventual, separately approved Admin capability to:

- Create/edit articles.
- Publish/unpublish.
- Change categories.
- Manage keywords, aliases and search priority.
- Manage related references.
- Feature quick-help/common-issue articles.
- View privacy-safe aggregate usage.
- Review collected negative feedback, if a collection system is approved.

Preparation means stable IDs, explicit publication state, validated relationships, safe content blocks, review dates and provenance—not creating endpoints, tables or an editor.

Future editorial workflows should include authorization, preview, review, audit history and reference validation. A CMS must not turn an unverified feature or policy into a published instruction. Existing slugs and article links must remain compatible.

## 21. Definition of Done

These are acceptance criteria for a **future implementation**, not claims of work performed in this documentation step.

### Content and functionality

- [ ] Existing valid article URLs continue to resolve.
- [ ] Seven existing topic groups are preserved or intentionally mapped to the approved category model.
- [ ] Every visible category corresponds to actual Campnect capabilities.
- [ ] Quick Help and Common Issues use explicit editorial selections, not array-order accidents.
- [ ] All six example search questions in section 5 return relevant results.
- [ ] Ranking tests enforce title → keyword/alias → description → category priority.
- [ ] Contractions, case, Unicode, whitespace, empty input and irrelevant queries behave predictably.
- [ ] Published/role eligibility filtering prevents unavailable instructions.
- [ ] Clear search, suggestions, counts and actionable no-results states work.
- [ ] Article steps, notes, troubleshooting, related links and feedback are supported.
- [ ] Related references are unique, resolvable and relevant; current broken references are corrected.
- [ ] Negative feedback shows reason choices and appropriate available next actions.
- [ ] Feedback copy accurately reflects whether data is actually collected.
- [ ] Support is configuration-aware; no fabricated email or technical-report form appears.
- [ ] Reporting instructions distinguish supported item actions from backend-only targets.
- [ ] Appeals describe actual eligible records and approval/rejection outcomes.
- [ ] Comment appeal approval never implies automatic publication.
- [ ] Safety advice contains no emergency-response or moderation-outcome guarantee.
- [ ] Legal links use verified configuration; no invented DMCA process is published.
- [ ] Deletion, Restrict, message deletion, export/deactivation and verification-entry discrepancies are resolved or explicitly gated.
- [ ] Current UI/server media limits and role differences are reflected accurately.

### Navigation and UX

- [ ] Settings → Help → Article → Back restores Help visit state.
- [ ] Help Back returns to the prior screen.
- [ ] Cold article Back reaches Help through the existing coordinator architecture.
- [ ] Related articles do not create an unwanted Back chain.
- [ ] Category changes do not create extra history entries.
- [ ] Unknown/unpublished slugs show useful missing-article behavior.
- [ ] Authenticated deep-link behavior preserves existing session boundaries.
- [ ] Browser Back, header Back and Android Back follow the same contract.
- [ ] Dialog dismissal precedes route Back.
- [ ] No root-exit confirmation appears merely because Help is open.
- [ ] No horizontal page overflow on narrow phones, landscape or enlarged text.
- [ ] BottomNav never obscures final content; safe-area/keyboard clearance is not duplicated.
- [ ] Dark/light themes, focus, pressed, loading, empty and error states are usable.
- [ ] Keyboard and screen-reader users can complete search, article navigation and feedback.

### Verification and preservation

- [ ] Data validation tests cover unique IDs/slugs, categories, publication state, related references and destination validity.
- [ ] Search tests cover example queries, ranking tiers, aliases, normalization and no results.
- [ ] Component/browser tests cover search/clear/category state, article return state, reason feedback, unconfigured support and missing slugs.
- [ ] Existing Back tests remain passing; add cold Help/article and related-article cases.
- [ ] Narrow/wide viewports, large text and both themes are visually checked.
- [ ] Existing Settings, shared navigation, chat/reporting, appeals and legal behavior are preserved.
- [ ] Workspace typecheck passes: `pnpm run typecheck`.
- [ ] Relevant Help tests and existing navigation tests pass using their appropriate runner.
- [ ] Production web/API packaging passes when required: `pnpm run build:deploy`.
- [ ] If only the frontend is affected, its production build is also checked through the existing workspace command.
- [ ] No APK, native release or device-validation claim is made without separate authorization and actual testing.
- [ ] No CMS, AI service or unrelated product functionality is implemented as part of the redesign.

For this specification-only step, acceptance is limited to inspecting the code, producing this Markdown file with the required sections, validating its references/structure, and making no application/configuration/database changes. Typecheck, application tests and production builds are future implementation criteria, not work to run unnecessarily for a documentation-only change.

## 22. Implementation Notes

- Start from the existing Help screens, local article data and search helper.
- Preserve the current router, shell, Back coordinator, theme tokens and valid slugs.
- Resolve publication blockers before expanding the article inventory.
- Implement Help changes in the primary Campnect artifact, not the legacy UI.
- Treat backend-only capabilities and unused screens as verification gaps, not a reason to add those product features.
- Any persistent feedback, analytics collector, contact channel, CMS or legal procedure requires its own explicit scope and approval.
- This document changes no UI, routes, application code, schema, dependencies or runtime settings.

Before implementing the redesign, inspect the existing Help & Support implementation and use this specification as the source of truth for the planned improvements. Do not modify unrelated Campnect functionality.