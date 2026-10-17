import type { HelpArticle, HelpCategory } from './helpModel'
import { accountLoginArticles } from './content/accountLogin'
import { accountManagementArticles } from './content/accountManagement'
import { appTroubleshootingArticles } from './content/appTroubleshooting'
import { clipsGlimpseArticles } from './content/clipsGlimpse'
import { communityArticles } from './content/communities'
import { eventArticles } from './content/events'
import { legalArticles } from './content/legal'
import { messagingArticles } from './content/messaging'
import { notificationArticles } from './content/notifications'
import { postsContentArticles } from './content/postsContent'
import { privacySafetyArticles } from './content/privacySafety'
import { profileCollegeArticles } from './content/profileCollege'
import { reportingArticles } from './content/reporting'
import { verificationArticles } from './content/verification'
export type { HelpAction, HelpArticle, HelpAudience, HelpCategory, HelpStep, HelpTroubleshooting } from './helpModel'

export const helpCategories: HelpCategory[] = [
  'Account & Login',
  'Profile & College',
  'Posts & Content',
  'Clips & Glimpse',
  'Events',
  'Messaging & Chat',
  'Notifications',
  'Privacy & Safety',
  'Reporting & Moderation',
  'Communities',
  'App Issues & Troubleshooting',
  'Account Management',
  'Verification',
  'Legal & Policies',
]

export const helpCategoryDescriptions: Record<HelpCategory, string> = {
  'Account & Login': 'Sign in, recover access, verify email, and understand login messages.',
  'Profile & College': 'Update your profile and understand college-related profile limits.',
  'Posts & Content': 'Create, edit, save, and manage posts and comments.',
  'Clips & Glimpse': 'Share and view short videos and temporary campus moments.',
  Events: 'Find events, RSVP, and use available host controls.',
  'Messaging & Chat': 'Send messages, manage requests, and use group chats.',
  Notifications: 'Manage activity alerts and device notification permission.',
  'Privacy & Safety': 'Manage privacy controls and respond to safety concerns.',
  'Reporting & Moderation': 'Report supported content and review eligible moderation appeals.',
  Communities: 'Find, join, create, and manage campus communities.',
  'App Issues & Troubleshooting': 'Check common loading, upload, playback, and permission problems.',
  'Account Management': 'Change account settings and understand deletion or unavailable account controls.',
  Verification: 'Understand email and college-status verification.',
  'Legal & Policies': 'Open Campnect’s published policies and available support contact.',
}

export const helpArticles: HelpArticle[] = [
  ...accountLoginArticles,
  ...accountManagementArticles,
  ...profileCollegeArticles,
  ...postsContentArticles,
  ...clipsGlimpseArticles,
  ...eventArticles,
  ...messagingArticles,
  ...notificationArticles,
  ...privacySafetyArticles,
  ...reportingArticles,
  ...communityArticles,
  ...appTroubleshootingArticles,
  ...verificationArticles,
  ...legalArticles,
]

export const quickHelpIds = [
  'login',
  'password',
  'otp',
  'profile',
  'post-create',
  'message-send',
  'notification-settings',
  'privacy',
]

export const commonIssueIds = [
  'login',
  'password',
  'otp',
  'post-upload',
  'message-send-error',
  'notification-issues',
  'clip-upload-troubleshooting',
  'glimpse-upload-troubleshooting',
  'network-errors',
]

function isArticleVisible(article: HelpArticle, role?: string) {
  if (!article.published) return false
  if (article.audience === 'faculty') return role === 'faculty' || role === 'teacher'
  return true
}

export function getPublishedHelpArticles(role?: string): HelpArticle[] {
  return helpArticles.filter((article) => isArticleVisible(article, role))
}

export function getHelpArticle(slug: string, role?: string): HelpArticle | undefined {
  const article = helpArticles.find((candidate) => candidate.slug === slug)
  return article && isArticleVisible(article, role) ? article : undefined
}

export function getRelatedHelpArticles(article: HelpArticle, role?: string): HelpArticle[] {
  if (!article.relatedArticles.length) return []
  const visibleById = new Map(getPublishedHelpArticles(role).map((candidate) => [candidate.id, candidate]))
  return article.relatedArticles
    .map((id) => visibleById.get(id))
    .filter((related): related is HelpArticle => Boolean(related))
}

export function validateHelpArticles(articles: HelpArticle[] = helpArticles): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  const slugs = new Set<string>()

  for (const article of articles) {
    if (!article.id.trim()) errors.push('Article has an empty id')
    if (!article.slug.trim()) errors.push(`${article.id || '(missing id)'} has an empty slug`)
    if (ids.has(article.id)) errors.push(`Duplicate article id: ${article.id}`)
    if (slugs.has(article.slug)) errors.push(`Duplicate article slug: ${article.slug}`)
    ids.add(article.id)
    slugs.add(article.slug)

    if (!article.title.trim()) errors.push(`${article.id} has an empty title`)
    if (!article.description.trim()) errors.push(`${article.id} has an empty description`)
    if (!helpCategories.includes(article.category)) errors.push(`${article.id} uses an unknown category`)
    if (article.audience && article.audience !== 'faculty') errors.push(`${article.id} has an unsupported audience`)
    if (article.searchPriority < -20 || article.searchPriority > 20) errors.push(`${article.id} search priority is outside the allowed range`)
    if (!article.sourceReferences.length) errors.push(`${article.id} has no source references`)
    for (const [index, step] of article.steps.entries()) {
      if (!step.title.trim() || !step.body.trim()) errors.push(`${article.id} has an incomplete step at index ${index}`)
    }
    for (const target of article.relatedArticles) {
      if (target === article.id) errors.push(`${article.id} relates to itself`)
    }
  }

  const allIds = new Set(articles.map((article) => article.id))
  for (const article of articles) {
    for (const target of article.relatedArticles) {
      if (!allIds.has(target)) errors.push(`${article.id} references missing related article ${target}`)
    }
  }
  return errors
}