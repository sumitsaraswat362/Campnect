import assert from 'node:assert/strict'
import test from 'node:test'
import { searchHelpArticles } from './helpSearch.ts'

test('natural-language examples lead with the most relevant help guide', () => {
  const expected: [string, string][] = [
    ["I can't log in", 'cant-log-in'],
    ['I forgot my password', 'forgot-password'],
    ['How do I change my username?', 'change-my-username'],
    ["Why didn't I receive my OTP?", 'otp-not-received'],
    ['How do I report someone?', 'report-an-account-or-profile'],
    ["Why can't I upload a video?", 'clip-upload-failed-or-processing'],
  ]
  for (const [query, slug] of expected) {
    assert.equal(searchHelpArticles(query)[0]?.slug, slug, query)
  }
})

test('search normalizes casing, Unicode accents, punctuation, whitespace and contractions', () => {
  assert.equal(searchHelpArticles('  OTP   NOT—COMING ').at(0)?.slug, 'otp-not-received')
  assert.equal(searchHelpArticles('I cannot sign in').at(0)?.slug, 'cant-log-in')
  assert.equal(searchHelpArticles('How can I upḍate my profile photo?').at(0)?.slug, 'change-profile-photo')
  assert.ok(searchHelpArticles('my password doesn’t work').some((article) => article.slug === 'forgot-password'))
})

test('retains negation and avoids matches for meaningless/irrelevant queries', () => {
  const query = searchHelpArticles('I do not want notifications')
  assert.ok(query.some((article) => article.slug === 'manage-notifications'))
  assert.ok(!query.every((article) => article.slug === 'notifications-not-appearing'))
  for (const value of ['', '   ', '!!!', 'quantum bananas zebra']) {
    assert.deepEqual(searchHelpArticles(value), [], JSON.stringify(value))
  }
})

test('exact titles outrank aliases, descriptions and accumulated lower-tier terms', () => {
  type Entry = Parameters<typeof searchHelpArticles>[1] extends (infer A)[] ? A : never
  const entry = (id: string, title: string, priority: number, keywords: string[], description = '') => ({
    id, slug: id, title, searchPriority: priority, keywords, aliases: [], searchTerms: [],
    description, shortDescription: description, category: 'Account & Login',
    steps: [], body: [], notes: [], troubleshooting: [], relatedArticles: [],
    published: true, sourceReferences: [],
  }) as Entry
  const exact = entry('exact', 'Reset password', -20, ['account password password password'])
  const alias = entry('alias', 'Account security', 20, ['reset password'])
  const description = entry('description', 'Getting started', 20, [], 'Reset password')
  const results = searchHelpArticles('reset password', [alias, exact, description])
  assert.deepEqual(results.map((article) => article.id), ['exact', 'alias', 'description'])
})

test('unpublished articles never appear even when every search field matches', () => {
  const draft = {
    id: 'private-draft', slug: 'private-draft', title: 'Specialtrigger',
    category: 'Account & Login', description: 'Specialtrigger', shortDescription: 'Specialtrigger',
    keywords: ['specialtrigger'], aliases: ['specialtrigger'], searchTerms: [], steps: [], body: [],
    notes: [], troubleshooting: [], relatedArticles: [], searchPriority: 20,
    published: false, sourceReferences: [],
  }
  assert.deepEqual(searchHelpArticles('specialtrigger', [draft]), [])
})