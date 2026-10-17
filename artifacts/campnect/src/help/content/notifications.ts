import { createHelpArticle } from '../helpModel'

export const notificationArticles = [
  createHelpArticle({
    id: 'notification-settings', slug: 'manage-notifications', title: 'Manage notification settings', category: 'Notifications',
    description: 'Choose which Campnect notification categories are enabled in Notification settings.',
    keywords: ['notifications', 'alerts', 'settings', 'preferences'],
    aliases: ['change notification settings', 'turn off notifications', 'notification preferences'],
    steps: [
      { title: 'Open Settings', body: 'Go to your Profile and open Settings.' },
      { title: 'Open Notifications', body: 'Choose the Notifications section under Preferences.' },
      { title: 'Adjust categories', body: 'Use the switches for options such as Likes, Comments, New Followers, Mentions, Group Activity, Community Activity, College Notices, or Marketing.' },
    ],
    notes: ['Campnect preferences and device notification permission are separate. Enabling a preference does not guarantee delivery of every event.'],
    relatedArticles: ['notification-issues', 'notification-permission', 'message-notifications'],
  }),
  createHelpArticle({
    id: 'notification-issues', slug: 'notifications-not-appearing', title: 'Notifications not appearing', category: 'Notifications',
    description: 'Check Campnect’s notification preferences, device permission, and network connection.',
    keywords: ['notifications', 'alerts', 'push', 'missing'],
    aliases: ['no notifications', 'push not working', 'alerts missing', 'I did not get a notification'],
    steps: [
      { title: 'Check Campnect preferences', body: 'Open Settings → Notifications and make sure the relevant category is enabled.' },
      { title: 'Check device permission', body: 'Allow notifications for Campnect in the device or browser settings.' },
      { title: 'Check your connection', body: 'In-app notifications need an internet connection to update.' },
    ],
    notes: ['The app may offer an “Open Android Settings” action when notification permission has been denied. Device controls differ by platform.'],
    relatedArticles: ['notification-settings', 'notification-permission', 'notification-center'],
    searchPriority: 5,
  }),
  createHelpArticle({
    id: 'notification-permission', slug: 'enable-device-notification-permission', title: 'Enable device notification permission', category: 'Notifications',
    description: 'Allow Campnect notifications in your operating system or browser separately from in-app preferences.',
    keywords: ['android permission', 'push permission', 'device settings', 'notifications'],
    aliases: ['turn on push notifications', 'allow app alerts', 'notification permission denied'],
    steps: [
      { title: 'Enable a Campnect notification preference', body: 'Open Settings → Notifications and turn on the relevant category.' },
      { title: 'Respond to the permission request', body: 'If your device asks for notification permission, allow it to receive device alerts.' },
      { title: 'Reopen device settings if denied', body: 'If Campnect displays “Open Android Settings”, use it to review app notification permission.' },
    ],
    notes: ['Device settings and Campnect’s in-app notification preferences are separate controls. Browser permission labels and behavior vary.'],
    relatedArticles: ['notification-settings', 'notification-issues'],
  }),
  createHelpArticle({
    id: 'notification-center', slug: 'read-notifications-and-mark-all-read', title: 'Read notifications and mark all read', category: 'Notifications',
    description: 'Open Notifications to browse activity and use “Mark all read” when unread items are shown.',
    keywords: ['notification center', 'read', 'mark all read', 'mentions', 'likes'],
    aliases: ['clear unread notifications', 'read activity alerts', 'mark notifications seen'],
    steps: [
      { title: 'Open Notifications', body: 'Choose Notifications in the app navigation.' },
      { title: 'Filter the list', body: 'Use the tabs such as All, Mentions, Follows, Likes, or Groups.' },
      { title: 'Mark items read', body: 'Open an item to follow its available destination. When unread items exist, choose “Mark all read” to mark them read.' },
    ],
    notes: ['The current notification screen does not expose a general delete-notification control.'],
    relatedArticles: ['notification-settings', 'message-notifications'],
  }),
  createHelpArticle({
    id: 'message-notifications', slug: 'chat-and-event-notification-settings', title: 'Chat and event notifications', category: 'Notifications',
    description: 'The current notification preferences include Group Activity; they do not provide separate guaranteed delivery controls for every chat or event.',
    keywords: ['chat notifications', 'event notifications', 'group activity', 'messages'],
    aliases: ['message alerts', 'event push notifications', 'chat banner settings'],
    body: ['Open Settings → Notifications and review “Group Activity”, described as messages and events in your groups. Device permission is a separate setting.'],
    notes: ['There is no dedicated Events preference in the current settings list, and a preference is not a delivery guarantee.'],
    relatedArticles: ['notification-settings', 'notification-permission', 'event-chat'],
  }),
]