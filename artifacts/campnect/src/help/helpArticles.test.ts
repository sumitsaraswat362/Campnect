import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  commonIssueIds,
  getPublishedHelpArticles,
  getRelatedHelpArticles,
  helpArticles,
  helpCategories,
  quickHelpIds,
  validateHelpArticles,
} from './helpArticles.ts'

const originalSlugs = [
  'cant-log-in', 'forgot-password', 'otp-not-received',
  'edit-profile', 'change-profile-photo',
  'create-a-post', 'delete-a-post',
  'send-a-message', 'message-not-sending', 'reply-to-message',
  'manage-notifications', 'notifications-not-appearing',
  'manage-privacy', 'block-a-user', 'report-content',
  'change-password', 'deactivate-account', 'delete-account', 'download-my-data',
]

test('the expanded library keeps the 19 existing public slugs and all 14 real topic categories', () => {
  const slugs = new Set(helpArticles.map((article) => article.slug))
  for (const slug of originalSlugs) assert.ok(slugs.has(slug), `preserved article URL: ${slug}`)
  assert.ok(helpArticles.length >= 75, `expected expanded verified content, found ${helpArticles.length}`)
  assert.equal(helpCategories.length, 14)
  assert.equal(new Set(helpCategories).size, 14)
  for (const id of quickHelpIds) assert.ok(helpArticles.some((article) => article.id === id), `missing curated quick help: ${id}`)
  for (const id of commonIssueIds) assert.ok(helpArticles.some((article) => article.id === id), `missing curated issue: ${id}`)
})

test('articles have unique identifiers/slugs, approved categories, coherent relationships and no unsafe destinations', () => {
  assert.deepEqual(validateHelpArticles(), [])
  const ids = new Set(helpArticles.map((article) => article.id))
  const publishedIds = new Set(helpArticles.filter((article) => article.published).map((article) => article.id))
  const hiddenRelatedArticles: string[] = []
  const missingSources: string[] = []
  for (const article of helpArticles) {
    assert.ok(ids.has(article.id))
    assert.ok(helpCategories.includes(article.category))
    assert.equal(new Set(article.relatedArticles).size, article.relatedArticles.length, `${article.slug}: duplicate related IDs`)
    for (const id of article.relatedArticles) {
      if (!publishedIds.has(id)) hiddenRelatedArticles.push(`${article.slug}: ${id}`)
    }
    for (const action of article.actions ?? []) assert.ok(action.route.startsWith('/app/'), `${article.slug}: unsafe action route ${action.route}`)
    for (const source of article.sourceReferences ?? []) {
      const path = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../', source)
      if (!existsSync(path)) missingSources.push(`${article.slug}: ${source}`)
    }
  }
  assert.deepEqual(hiddenRelatedArticles, [])
  assert.deepEqual(missingSources, [])
})

test('faculty-only guidance is absent from student lists and related links', () => {
  const studentArticles = getPublishedHelpArticles('student')
  assert.ok(!studentArticles.some((article) => article.slug === 'change-faculty-institution-email'))
  assert.ok(getPublishedHelpArticles('faculty').some((article) => article.slug === 'change-faculty-institution-email'))
  const parent = helpArticles.find((article) => article.id === 'institution-email-limitation')
  assert.ok(parent)
  assert.ok(getRelatedHelpArticles(parent, 'student').every((article) => article.audience !== 'faculty'))
})

test('legacy deactivation and export URLs remain safe honest limitation articles', () => {
  for (const slug of ['deactivate-account', 'download-my-data']) {
    const article = helpArticles.find((candidate) => candidate.slug === slug)
    assert.ok(article)
    assert.equal(article.published, true)
    assert.equal(article.actions?.length ?? 0, 0)
    assert.match(`${article.description} ${article.body.join(' ')}`.toLowerCase(), /no verified|no .* control|not expose|unavailable/)
  }
})

test('comments and copyright procedures are not presented as user actions without verified UI', () => {
  const report = helpArticles.find((article) => article.slug === 'report-content')
  assert.ok(report)
  assert.ok(!report.actions?.some((action) => /comment/i.test(action.label)))
  assert.ok(!helpArticles.some((article) => article.published && /dmca|counter.?notification/i.test(`${article.title} ${article.description}`)))
})