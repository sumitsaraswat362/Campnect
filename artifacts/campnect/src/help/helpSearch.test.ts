import assert from 'node:assert/strict'
import test from 'node:test'
import { searchHelpArticles } from './helpSearch.ts'

test('help search matches natural-language login questions', () => {
  const results = searchHelpArticles("I can't log in")
  assert.equal(results[0]?.slug, 'cant-log-in')
})

test('help search is case-insensitive and matches OTP keywords', () => {
  const results = searchHelpArticles('OTP NOT COMING')
  assert.ok(results.some((article) => article.slug === 'otp-not-received'))
})

test('help search matches password recovery language', () => {
  const results = searchHelpArticles("my password doesn't work")
  assert.ok(results.some((article) => article.slug === 'forgot-password'))
})

test('help search produces no results for unrelated text', () => {
  assert.deepEqual(searchHelpArticles('quantum bananas zebra'), [])
})