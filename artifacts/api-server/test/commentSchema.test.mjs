import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('comment moderation DDL is compatible with the legacy semicolon-splitting bootstrap', () => {
  const schema = readFileSync(new URL('../src/legacy-db/schema.sql', import.meta.url), 'utf8')
  const statements = schema.split(';').map((statement) =>
    statement.replace(/--[^\n]*(?:\n|$)/g, '\n').trim(),
  ).filter(Boolean)
  assert.doesNotMatch(schema, /^--[^\n]*;/m, 'semicolons in comments must not produce invalid bootstrap statements')
  for (const statement of statements) {
    assert.match(statement, /^(?:CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|GRANT|REVOKE|DO|SELECT)\b/i)
  }
  for (const table of [
    'comment_moderation_rate_attempts',
    'comment_moderation_decisions',
    'comment_moderation_overrides',
    'moderation_ai_usage',
  ]) {
    assert.ok(statements.some((statement) =>
      new RegExp(`^CREATE TABLE IF NOT EXISTS ${table}\\s*\\(`, 'i').test(statement),
    ), `${table} must have a complete bootstrap statement`)
  }
})