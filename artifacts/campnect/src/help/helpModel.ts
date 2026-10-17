export type HelpCategory =
  | 'Account & Login'
  | 'Profile & College'
  | 'Posts & Content'
  | 'Clips & Glimpse'
  | 'Events'
  | 'Messaging & Chat'
  | 'Notifications'
  | 'Privacy & Safety'
  | 'Reporting & Moderation'
  | 'Communities'
  | 'App Issues & Troubleshooting'
  | 'Account Management'
  | 'Verification'
  | 'Legal & Policies'

export type HelpAudience = 'faculty'

export interface HelpStep {
  title: string
  body: string
}

export interface HelpTroubleshooting {
  problem: string
  solution: string
}

export interface HelpAction {
  label: string
  route: string
}

export interface HelpArticle {
  id: string
  slug: string
  title: string
  category: HelpCategory
  description: string
  shortDescription: string
  keywords: string[]
  aliases: string[]
  searchTerms: string[]
  steps: HelpStep[]
  body: string[]
  notes: string[]
  troubleshooting: HelpTroubleshooting[]
  relatedArticles: string[]
  searchPriority: number
  published: boolean
  audience?: HelpAudience
  actions?: HelpAction[]
  sourceReferences: string[]
}

export type HelpArticleInput = Omit<
  HelpArticle,
  'description' | 'shortDescription' | 'aliases' | 'searchTerms' | 'steps' | 'body' | 'notes' | 'troubleshooting' | 'relatedArticles' | 'searchPriority' | 'published' | 'sourceReferences'
> & {
  description: string
  shortDescription?: string
  aliases?: string[]
  searchTerms?: string[]
  steps?: HelpStep[]
  body?: string[]
  notes?: string[]
  troubleshooting?: HelpTroubleshooting[]
  relatedArticles?: string[]
  searchPriority?: number
  published?: boolean
  sourceReferences?: string[]
}

const sourceRefsByCategory: Record<HelpCategory, string[]> = {
  'Account & Login': [
    'artifacts/campnect/src/screens/auth/LoginScreen.tsx',
    'artifacts/campnect/src/screens/auth/VerifyLoginScreen.tsx',
    'artifacts/campnect/src/screens/auth/VerifyEmailScreen.tsx',
    'artifacts/campnect/src/screens/auth/ForgotPasswordScreen.tsx',
    'artifacts/campnect/src/screens/auth/RegisterScreen.tsx',
    'artifacts/campnect/src/screens/main/SuspendedAccountScreen.tsx',
    'artifacts/campnect/src/screens/settings/AccountScreen.tsx',
    'artifacts/campnect/src/screens/settings/SecurityScreen.tsx',
    'artifacts/api-server/src/legacy-routes/auth.ts',
    'artifacts/api-server/src/legacy-routes/users.ts',
  ],
  'Profile & College': [
    'artifacts/campnect/src/screens/main/EditProfileScreen.tsx',
    'artifacts/campnect/src/screens/main/ProfileScreen.tsx',
    'artifacts/campnect/src/screens/auth/RegisterScreen.tsx',
    'artifacts/campnect/src/screens/settings/PrivacyScreen.tsx',
    'artifacts/api-server/src/legacy-routes/users.ts',
  ],
  'Posts & Content': [
    'artifacts/campnect/src/screens/main/CreatePostScreen.tsx',
    'artifacts/campnect/src/components/feed/PostCard.tsx',
    'artifacts/campnect/src/components/feed/CommentSheet.tsx',
    'artifacts/campnect/src/features/comments/commentModeration.ts',
    'artifacts/campnect/src/screens/settings/ContentAppealsScreen.tsx',
  ],
  'Clips & Glimpse': [
    'artifacts/campnect/src/screens/main/ClipCreateScreen.tsx',
    'artifacts/campnect/src/screens/main/ClipsScreen.tsx',
    'artifacts/campnect/src/screens/main/CreateGlimpseScreen.tsx',
    'artifacts/campnect/src/screens/main/GlimpseScreen.tsx',
    'artifacts/campnect/src/screens/main/GlimpseViewerScreen.tsx',
    'artifacts/campnect/src/utils/mediaUploadPolicy.ts',
    'artifacts/api-server/src/legacy-services/mediaLimits.ts',
  ],
  Events: [
    'artifacts/campnect/src/screens/main/EventsScreen.tsx',
    'artifacts/campnect/src/screens/main/CreateEventScreen.tsx',
    'artifacts/campnect/src/screens/main/EditEventScreen.tsx',
    'artifacts/campnect/src/screens/main/EventDetailScreen.tsx',
    'artifacts/campnect/src/screens/main/EventAttendeesScreen.tsx',
    'artifacts/api-server/src/legacy-routes/events.ts',
  ],
  'Messaging & Chat': [
    'artifacts/campnect/src/screens/main/ChatListScreen.tsx',
    'artifacts/campnect/src/screens/main/NewMessageScreen.tsx',
    'artifacts/campnect/src/screens/main/MessageRequestsScreen.tsx',
    'artifacts/campnect/src/screens/main/ChatRoomScreen.tsx',
    'artifacts/campnect/src/screens/main/CreateGroupScreen.tsx',
    'artifacts/campnect/src/screens/main/GroupInfoScreen.tsx',
    'artifacts/campnect/src/components/chat/ComposerBar.tsx',
    'artifacts/campnect/src/components/chat/ChatMediaPickerSheet.tsx',
    'artifacts/campnect/src/components/chat/MessageActionsSheet.tsx',
    'artifacts/api-server/src/legacy-routes/chat.ts',
  ],
  Notifications: [
    'artifacts/campnect/src/screens/settings/NotificationPrefsScreen.tsx',
    'artifacts/campnect/src/screens/main/NotificationsScreen.tsx',
    'artifacts/api-server/src/legacy-routes/notifications.ts',
  ],
  'Privacy & Safety': [
    'artifacts/campnect/src/screens/settings/PrivacyScreen.tsx',
    'artifacts/campnect/src/screens/main/ProfileScreen.tsx',
    'artifacts/campnect/src/screens/main/ChatRoomScreen.tsx',
    'artifacts/api-server/src/legacy-routes/users.ts',
  ],
  'Reporting & Moderation': [
    'artifacts/campnect/src/screens/main/ProfileScreen.tsx',
    'artifacts/campnect/src/components/feed/PostCard.tsx',
    'artifacts/campnect/src/screens/main/ChatRoomScreen.tsx',
    'artifacts/campnect/src/screens/main/EventDetailScreen.tsx',
    'artifacts/campnect/src/screens/main/ClipsScreen.tsx',
    'artifacts/campnect/src/screens/main/GlimpseScreen.tsx',
    'artifacts/campnect/src/screens/settings/ContentAppealsScreen.tsx',
    'artifacts/campnect/src/screens/main/SuspendedAccountScreen.tsx',
    'artifacts/api-server/src/legacy-services/reporting.ts',
  ],
  Communities: [
    'artifacts/campnect/src/screens/main/CommunitiesScreen.tsx',
    'artifacts/campnect/src/screens/main/CreateCommunityScreen.tsx',
    'artifacts/campnect/src/screens/main/CommunityScreen.tsx',
    'artifacts/campnect/src/screens/main/EditCommunityScreen.tsx',
    'artifacts/api-server/src/legacy-routes/communities.ts',
  ],
  'App Issues & Troubleshooting': [
    'artifacts/campnect/src/main.tsx',
    'artifacts/campnect/src/utils/mediaUploadPolicy.ts',
    'artifacts/campnect/src/utils/permissions.ts',
    'artifacts/campnect/src/screens/main/CreateGlimpseScreen.tsx',
    'artifacts/campnect/src/screens/main/ClipCreateScreen.tsx',
    'artifacts/campnect/src/components/chat/ComposerBar.tsx',
    'artifacts/api-server/src/legacy-services/maintenance.ts',
    'artifacts/api-server/src/legacy-services/appUpdate.ts',
  ],
  'Account Management': [
    'artifacts/campnect/src/screens/main/SettingsScreen.tsx',
    'artifacts/campnect/src/screens/settings/AccountScreen.tsx',
    'artifacts/campnect/src/screens/settings/SecurityScreen.tsx',
    'artifacts/api-server/src/legacy-routes/users.ts',
    'artifacts/api-server/src/legacy-routes/auth.ts',
  ],
  Verification: [
    'artifacts/campnect/src/screens/auth/VerifyEmailScreen.tsx',
    'artifacts/campnect/src/screens/auth/VerifyCollegeScreen.tsx',
    'artifacts/campnect/src/screens/auth/RegisterScreen.tsx',
    'artifacts/campnect/src/App.tsx',
    'artifacts/campnect/src/routes/ProtectedRoute.tsx',
    'artifacts/api-server/src/legacy-routes/auth.ts',
  ],
  'Legal & Policies': [
    'artifacts/campnect/src/help/helpLinks.ts',
    'artifacts/campnect/src/screens/settings/LegalScreen.tsx',
  ],
}

export function createHelpArticle(input: HelpArticleInput): HelpArticle {
  const aliases = input.aliases ?? input.searchTerms ?? []
  const description = input.description || input.shortDescription || ''
  return {
    ...input,
    description,
    shortDescription: input.shortDescription ?? description,
    keywords: input.keywords,
    aliases,
    searchTerms: input.searchTerms ?? aliases,
    steps: input.steps ?? [],
    body: input.body ?? [],
    notes: input.notes ?? [],
    troubleshooting: input.troubleshooting ?? [],
    relatedArticles: input.relatedArticles ?? [],
    searchPriority: Math.max(-20, Math.min(20, input.searchPriority ?? 0)),
    published: input.published ?? true,
    sourceReferences: input.sourceReferences ?? sourceRefsByCategory[input.category],
  }
}