# Campnect — Campus Connect Network
### Hackathon Submission & Pitch Documentation

## Problem Statement
University students face fragmented communication across unverified WhatsApp groups, scattered Discord servers, and clunky legacy university portals. Important placement updates, society auditions, and campus hackathons are routinely missed.

## Our Solution
**Campnect** unites students, campus societies, and administration in a unified, mobile-first campus super-app:
- **Verified Student Profiles**: Strict academic verification keeps communities safe and spam-free.
- **Real-Time Campus Feed & Stories**: Ephemeral campus stories, trending club announcements, and multimedia clips.
- **Event Discovery & RSVPs**: Integrated countdowns, seat capacity tracking, and calendar (.ics) sync.
- **Secure Messaging**: Low-latency 1-on-1 and society group chats.
- **Admin & Moderation Panel**: Content appeal workflows and safety moderation tools.

## Technology Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite, TanStack Query
- **Mobile**: Capacitor 8 (Android) with R8 DEX optimization
- **Offline / PWA**: Service Workers with Stale-While-Revalidate caching
- **Testing**: Playwright e2e test suite & Node test runner

## Hackathon Team Contributions
- **Sumit Saraswat**: Architecture Lead, Monorepo Workspace, React Shell, Capacitor Setup, Demo Engine.
- **Tanmay Kaushal**: Backend API Schema, REST Controllers, Social Feed & Event Stores, Documentation.
- **Aaren (deploybots666)**: PWA Offline Architecture, Security Guards, Network Retry Resilience, Calendar Exporter.
- **Abhinav (abhinavsingh760)**: UI/UX & A11y Design Tokens, Interactive Reaction Pills, Event Countdowns, Judge Tour.
