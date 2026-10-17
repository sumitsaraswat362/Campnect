# Campnect Swipe / Back Navigation Structure

## Purpose

This document is the source-of-truth map for Android system Back gestures, the
Android Back button, browser Back, and visible in-app Back controls.

The Android edge gesture is **not** a separate Campnect swipe interaction. Both
left-edge and right-edge Android Back gestures must enter the same centralized
Back dispatcher as the Android Back button.

## Global Back Contract

For every route, one Back action must perform exactly one of these operations:

1. Close the highest-priority open overlay.
2. Pop exactly one valid browser/router history entry from the current auth
   session.
3. If the app was opened directly on a page without usable history, navigate to
   that page's historyless fallback.
4. At a true root with no overlay, valid history entry, or fallback, arm native
   exit and show the exit hint. Exit only after a separate Back action arrives
   inside the confirmation window; rapid queued events cannot confirm exit.

The app must never exit merely because the current pathname looks like a root
tab. Usable history takes precedence over root classification, and one Back
gesture must never close the Activity.

The Activity termination bridge independently enforces the same two-step
contract. React must arm native exit on the first root Back and clear that arm
after any dismissal or navigation. A direct or stale `exitApp()` call without a
recent native arm fails closed and cannot finish the Activity.

## Auth and History Scopes

Campnect has two isolated history scopes:

- **Guest scope:** public, login, registration, verification, password reset,
  and invite pages.
- **Authenticated scope:** everything under `/app`.

Login and logout start a new history boundary. Back must not cross that boundary
into a stale route from the previous scope.

## Application Structure

```text
Campnect
├── Guest / authentication scope
│   ├── Landing and authentication
│   │   ├── /
│   │   ├── /signup
│   │   ├── /login
│   │   ├── /verify-login
│   │   ├── /forgot-password
│   │   └── /reset-password
│   ├── Registration verification
│   │   ├── /verify-email
│   │   └── /verify-college
│   └── Public invitations
│       └── /join/:token
└── Authenticated app scope
    ├── Root destinations
    │   ├── /app/feed
    │   ├── /app/search
    │   ├── /app/events
    │   ├── /app/glimpse
    │   ├── /app/clips
    │   └── /app/profile
    ├── College
    │   └── /app/college/:id
    ├── Create
    │   ├── /app/create
    │   └── /app/create/post
    ├── Glimpse
    │   ├── /app/glimpse/create
    │   └── /app/glimpse/:id
    ├── Clips
    │   ├── /app/clips/create
    │   └── /app/clips/:id
    ├── Chat
    │   ├── /app/chat
    │   ├── /app/chat/new
    │   ├── /app/chat/requests
    │   ├── /app/chat/new-group
    │   ├── /app/chat/:id
    │   └── /app/chat/:id/info
    ├── Profiles and posts
    │   ├── /app/profile/:username
    │   ├── /app/profile/:username/followers
    │   ├── /app/profile/:username/following
    │   ├── /app/edit-profile
    │   └── /app/post/:id
    ├── Communities
    │   ├── /app/communities
    │   ├── /app/communities/create
    │   └── /app/community/:slug
    ├── Events
    │   ├── /app/events/create
    │   ├── /app/events/:id
    │   ├── /app/events/:id/confirmation
    │   ├── /app/events/:id/attendees
    │   └── /app/events/:id/edit
    ├── Notifications
    │   └── /app/notifications
    └── Settings
        ├── /app/settings
        ├── /app/settings/account
        ├── /app/settings/privacy
        ├── /app/settings/notifications
        ├── /app/settings/security
        ├── /app/settings/about
        ├── /app/settings/saved
        └── /app/settings/activity
```

## Complete Page Policy

“Previous history” means exactly one valid entry created inside the current auth
scope. It always wins over the historyless fallback listed below.

### Guest and Authentication Pages

| Route | Page / behavior | True root | Historyless Back |
|---|---|---:|---|
| `/` | Resolves to feed when authenticated and verified, otherwise signup | Yes | Native exit only if it remains visible with no usable history |
| `/onboarding` | Legacy alias; replaces itself with `/signup` | Alias | Governed by `/signup` after redirect |
| `/join/:token` | Public group invitation | No | `/`, then normal auth resolution |
| `/login` | Login | Yes | Native exit when no usable guest history exists |
| `/signup` | Registration / public landing | Yes | Native exit when no usable guest history exists |
| `/verify-email` | Registration email verification | No | `/` |
| `/verify-login` | Login OTP verification | No | `/` |
| `/verify-college` | Optional college verification | No | `/` |
| `/forgot-password` | Password recovery request | No | `/` |
| `/reset-password` | Password reset flow alias | No | `/` |

### Authenticated Roots and College

| Route | Page / behavior | True root | Historyless Back |
|---|---|---:|---|
| `/app` | Protected shell index; replaces itself with `/app/feed` | Shell alias | Governed by `/app/feed` after redirect |
| `/app/feed` | Home feed tab | Yes | Native exit only when no usable app history exists |
| `/app/search` | Search tab | Yes | Native exit only when no usable app history exists |
| `/app/events` | Events tab | Yes | Native exit only when no usable app history exists |
| `/app/glimpse` | Glimpse tab | Yes | Native exit only when no usable app history exists |
| `/app/clips` | Clips tab | Yes | Native exit only when no usable app history exists |
| `/app/profile` | Current-user profile tab | Yes | Native exit only when no usable app history exists |
| `/app/college/:id` | College members | No | `/app/feed` |

Bottom-tab changes intentionally replace the current tab route. Tabs are root
destinations rather than an artificial Back sequence.

### Creation Flows

| Route | Page | Historyless Back |
|---|---|---|
| `/app/create` | Create chooser | `/app/feed` |
| `/app/create/post` | Create post | `/app/feed` |
| `/app/create-story` | Retired alias; replaces itself with `/app/feed` | Governed by `/app/feed` |
| `/app/glimpse/create` | Create Glimpse | `/app/feed` |
| `/app/clips/create` | Create Clip | `/app/feed` |

When entered normally, these pages pop to their actual origin instead of
guessing a parent.

### Glimpse and Clips Details

| Route | Page | Historyless Back |
|---|---|---|
| `/app/glimpse/:id` | Glimpse viewer | `/app/feed` |
| `/app/clips/:id` | Clip viewer using the Clips screen | `/app/feed` |

Viewer-internal overlays close before the route changes.

### Chat

| Route | Page | Historyless Back |
|---|---|---|
| `/app/chat` | Conversation list | `/app/feed` |
| `/app/chat/new` | New direct message | `/app/feed` |
| `/app/chat/requests` | Message requests | `/app/feed` |
| `/app/chat/new-group` | Create group chat | `/app/feed` |
| `/app/chat/:id` | Conversation | `/app/feed` |
| `/app/chat/:id/info` | Conversation/group information | `/app/feed` |

With normal history, group information returns to its conversation, a
conversation returns to its actual origin, and chat subflows return one entry at
a time.

### Profiles and Posts

| Route | Page | Historyless Back |
|---|---|---|
| `/app/profile/:username` | Another user or parameterized profile | `/app/feed` |
| `/app/profile/:username/followers` | Followers list | `/app/feed` |
| `/app/profile/:username/following` | Following list | `/app/feed` |
| `/app/edit-profile` | Edit current profile | `/app/feed` |
| `/app/post/:id` | Post detail | `/app/feed` |

A post may originate from feed, profile, community, search, notifications, or a
deep link. Real history therefore determines its normal Back destination.

### Communities

| Route | Page | Historyless Back |
|---|---|---|
| `/app/communities` | Community list | `/app/feed` |
| `/app/communities/create` | Create community | `/app/feed` |
| `/app/community/:slug` | Community detail | `/app/feed` |

With normal history, community detail returns to the exact origin rather than a
hard-coded collection page.

### Events

| Route | Page | Historyless Back |
|---|---|---|
| `/app/events/create` | Create event | `/app/feed` |
| `/app/events/:id` | Event detail | `/app/feed` |
| `/app/events/:id/confirmation` | Event creation confirmation | `/app/feed` |
| `/app/events/:id/attendees` | Event attendees | `/app/feed` |
| `/app/events/:id/edit` | Edit event | `/app/feed` |

Normal history preserves the exact events flow, one entry per Back action.

### Notifications

| Route | Page | Historyless Back |
|---|---|---|
| `/app/notifications` | Notification center / push entry | `/app/feed` |

Notification deep links may open another detail route. Back must unwind that
history if it exists; direct cold-start links fall back to feed.

### Settings

| Route | Page | Historyless Back |
|---|---|---|
| `/app/settings` | Settings home | `/app/feed` |
| `/app/settings/account` | Account settings | `/app/feed` |
| `/app/settings/privacy` | Privacy settings | `/app/feed` |
| `/app/settings/notifications` | Notification preferences | `/app/feed` |
| `/app/settings/security` | Security settings | `/app/feed` |
| `/app/settings/about` | About Campnect | `/app/feed` |
| `/app/settings/saved` | Saved content | `/app/feed` |
| `/app/settings/activity` | Account activity | `/app/feed` |
| `/app/settings/close-mates` | Retired alias; replaces itself with settings | Governed by `/app/settings` |

With normal history, each settings subpage returns to the actual previous page,
usually `/app/settings`.

### Unknown Routes

| Route | Behavior |
|---|---|
| `*` | Replaces itself with `/`, which then resolves for the current auth state |

## Overlay Dismissal Order

Only an overlay that is currently open participates. Higher priority closes
first. At equal priority, the most recently registered open overlay closes
first.

| Priority | Surfaces |
|---:|---|
| 400 | Event cover editor; chat media lightbox |
| 360 | Chat media picker |
| 350 | Image cropper |
| 320 | Fullscreen post media |
| 310 | Tagged-people view |
| 300 | Story caption editor; story delete confirmation; prompt dialog; confirmation dialog; Reel delete confirmation; chat seen-by sheet |
| 260 | Glimpse report |
| 250 | Reel editor; post editor |
| 240 | Profile actions; post menu; edit-profile avatar/cover sheets |
| 230 | Edit-profile course picker |
| 220 | Share sheet |
| 210 | Clips menu |
| 200 | Account alumni/delete surfaces; event report; event filters; chat options/editor; comments; Stories viewer/menu |
| 150 | Glimpse viewer menu; Reel menu; Glimpse card menu |
| 120 | Glimpse search |
| 100 | Stories base viewer; message actions |
| 80 | Glimpse story/detail viewer |

## Native Android Dispatch Path

```text
Android Back button or system edge gesture
  → MainActivity OnBackPressedDispatcher callback
  → cancelable campnect:native-back DOM event with unique event ID
  → BackNavigationProvider
      → dismiss overlay, or
      → navigate one valid history entry, or
      → apply historyless fallback, or
      → request native exit at a true root
```

If React has not registered readiness, Android holds the Back request until the
central route policy is available. The native layer cannot safely infer whether
a restored WebView is showing a root or an internal deep link, so it must never
finish the Activity on its own. Once React is ready, JavaScript synchronously
claims each serialized native event.

## Required Acceptance Matrix

The next implementation must be verified in a newly built APK against:

1. Three-button Android Back.
2. Left-edge system Back gesture.
3. Right-edge system Back gesture.
4. Five-level nested route history, unwound one page per gesture.
5. Every canonical root both with and without usable history.
6. Every overlay class before route navigation.
7. Rapid repeated Back gestures without duplicate exits or swallowed actions.
8. Cold-start authenticated and guest deep links.
9. Back immediately before React readiness.
10. Background/resume and process recreation.
11. Login, logout, and account-switch history isolation.
12. Clips/Glimpse vertical gestures without horizontal gesture interference.

No page-specific fake horizontal swipe recognizer should be introduced to pass
this matrix.