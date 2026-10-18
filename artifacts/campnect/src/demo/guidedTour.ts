export interface TourStep {
  target: string;
  title: string;
  content: string;
  badge?: string;
}

export const judgeTourSteps: TourStep[] = [
  {
    target: 'feed',
    title: 'Campus Social Feed',
    content: 'Real-time updates, verified student posts, club announcements, and multimedia stories.',
    badge: 'Core Feature',
  },
  {
    target: 'chat',
    title: 'Encrypted Student Messaging',
    content: 'Instant direct messaging, society discussion channels, and typing indicators.',
    badge: 'Real-time',
  },
  {
    target: 'events',
    title: 'Campus Events & Hackathons',
    content: 'One-tap RSVP, live countdowns, seat capacity tracking, and calendar export.',
    badge: 'Engagement',
  },
  {
    target: 'mobile',
    title: 'Android Native & PWA',
    content: 'Capacitor native shell with camera, push notifications, and offline caching.',
    badge: 'Mobile-first',
  },
];
