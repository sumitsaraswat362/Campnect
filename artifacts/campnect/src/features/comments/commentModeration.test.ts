import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  commentWarningCanBeConfirmed,
  normalizeCommentModerationRecord,
  readCommentModerationPrompt,
} from './commentModeration'

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

test('a token-bound medium warning can be confirmed without trusting client moderation', () => {
  const prompt = readCommentModerationPrompt({
    code: 'COMMENT_MODERATION_WARNING',
    moderation: {
      decision: 'WARN',
      severity: 'MEDIUM',
      requiresConfirmation: true,
      confirmationToken: 'signed-short-lived-server-token',
      category: 'INTERNAL_SCORE_MUST_NOT_REACH_THE_USER',
      confidence: 0.99,
    },
  })

  assert.deepEqual(prompt, {
    decision: 'WARN',
    severity: 'MEDIUM',
    requiresConfirmation: true,
    confirmationToken: 'signed-short-lived-server-token',
  })
  assert.equal(commentWarningCanBeConfirmed(prompt), true)
})

test('severe decisions cannot expose or enable Post Anyway, even with a supplied token', () => {
  for (const [code, decision] of [
    ['COMMENT_MODERATION_BLOCKED', 'BLOCK'],
    ['COMMENT_MODERATION_REVIEW', 'HUMAN_REVIEW'],
    ['COMMENT_MODERATION_WARNING', 'WARN'],
  ] as const) {
    const prompt = readCommentModerationPrompt({
      code,
      moderation: {
        decision,
        severity: 'CRITICAL',
        requiresConfirmation: true,
        confirmationToken: 'must-never-bypass-severe-policy',
      },
    })
    assert.equal(commentWarningCanBeConfirmed(prompt), false)
  }
})

test('the client rejects mismatched server decision contracts rather than offering a bypass', () => {
  const prompt = readCommentModerationPrompt({
    code: 'COMMENT_MODERATION_BLOCKED',
    moderation: {
      decision: 'WARN',
      severity: 'LOW',
      requiresConfirmation: true,
      confirmationToken: 'mismatched-decision',
    },
  })
  assert.equal(prompt, null)
  assert.equal(commentWarningCanBeConfirmed(prompt), false)
})

test('a missing confirmation token, invalid severity, and oversized token fail closed', () => {
  for (const overrides of [
    { confirmationToken: '' },
    { severity: 'UNKNOWN' },
    { confirmationToken: 'a'.repeat(4097) },
  ]) {
    const prompt = readCommentModerationPrompt({
      code: 'COMMENT_MODERATION_WARNING',
      moderation: {
        decision: 'WARN',
        severity: 'MEDIUM',
        requiresConfirmation: true,
        confirmationToken: 'valid-token',
        ...overrides,
      },
    })
    assert.equal(commentWarningCanBeConfirmed(prompt), false)
  }
})

test('Axios JSON bodies and wrapped data/error envelopes keep the same safe moderation presentation', () => {
  const result = {
    decision: 'WARN',
    severity: 'LOW',
    requiresConfirmation: true,
    confirmationToken: 'valid-token',
  }
  for (const response of [
    { code: 'COMMENT_MODERATION_WARNING', moderation: result },
    { data: { code: 'COMMENT_MODERATION_WARNING', moderation: result } },
    { error: { code: 'COMMENT_MODERATION_WARNING', moderation: result } },
    { data: { error: { code: 'COMMENT_MODERATION_WARNING', moderation: result } } },
  ]) {
    assert.equal(commentWarningCanBeConfirmed(readCommentModerationPrompt(response)), true)
  }
  assert.equal(commentWarningCanBeConfirmed(readCommentModerationPrompt({
    code: 'COMMENT_MODERATION_BLOCKED',
    moderation: { ...result, decision: 'BLOCK', severity: 'HIGH' },
    data: { code: 'COMMENT_MODERATION_WARNING', moderation: result },
  })), false)
})

test('moderation history maps the current API snake-case IDs and decision aliases without exposing model metadata', () => {
  assert.deepEqual(normalizeCommentModerationRecord({
    moderation_action_id: 'internal-action-id',
    target_comment_id: 'internal-comment-id',
    decision: 'BLOCK',
    created_at: '2026-06-03T10:00:00.000Z',
    appeal_status: null,
    appealable: true,
    category: 'INTERNAL_CATEGORY',
    severity: 'CRITICAL',
    confidence: 0.99,
    reason: 'INTERNAL_MODEL_REASON',
  }), {
    id: 'internal-action-id',
    comment_id: 'internal-comment-id',
    action: 'BLOCK',
    created_at: '2026-06-03T10:00:00.000Z',
    appeal_status: null,
    appealable: true,
  })
  assert.equal(normalizeCommentModerationRecord({
    id: 'bad-record',
    action: 'BLOCK',
    created_at: 1717410000000,
    appealable: true,
  }), null)
})

test('medium warning is returned before any comment create side effects; same captured payload and token are resubmitted once', () => {
  const sheet = source('../../components/feed/CommentSheet.tsx')
  const create = sheet.slice(sheet.indexOf('async function submitNewComment'), sheet.indexOf('async function handleSendGiphy'))

  assert.match(create, /catch \(error: any\)/)
  assert.match(create, /readCommentModerationPrompt\(error\?\.response\?\.data\)/)
  assert.match(create, /setPendingModeration\(\{/)
  assert.match(create, /onCommentAdded\(\)/)
  assert.ok(
    create.indexOf('onCommentAdded()') > create.indexOf('await postsApi.addComment'),
    'parent count callback may only run after the server accepted the comment',
  )
  assert.match(sheet, /postsApi\.addComment\(postId, content, parentId, moderationConfirmation\)/)
  assert.match(sheet, /pending\.content,\s*pending\.parentId,\s*pending\.prompt\.confirmationToken/)
})

test('editing comment text invalidates the confirmation and asks the server to moderate the edited version on save', () => {
  const sheet = source('../../components/feed/CommentSheet.tsx')
  assert.match(sheet, /pendingModeration\.content !== value\.trim\(\)/)
  assert.match(sheet, /postsApi\.updateComment\(comment\.id, content, moderationConfirmation\)/)
  assert.match(sheet, /setPendingModeration\(\{ prompt: moderation, content, commentId: comment\.id \}\)/)
  assert.match(sheet, /if \(editingComment\) window\.setTimeout\(\(\) => editingInputRef\.current\?\.focus\(\), 0\)/)
})

test('accessible warning offers Post Anyway only for eligible non-severe warnings', () => {
  const dialog = source('../../components/shared/CommentModerationDialog.tsx')
  assert.match(dialog, /role="dialog"/)
  assert.match(dialog, /aria-modal="true"/)
  assert.match(dialog, /handleKeyDown/)
  assert.match(dialog, /Escape/)
  assert.match(dialog, /canPostAnyway \? \(/)
  assert.match(dialog, /Post Anyway/)
  assert.match(dialog, /Edit Comment/)
  assert.match(dialog, /COMMENT_WARNING_MESSAGE/)
  assert.match(dialog, /COMMENT_STRONG_WARNING_MESSAGE/)
})

test('comment appeal API sends only the server moderation action reference and member explanation', () => {
  const client = source('../../api/users.ts')
  const appeals = source('../../screens/settings/ContentAppealsScreen.tsx')
  assert.ok(client.includes("client.get<{ success: boolean; data: CommentModerationRecord[] }>('/users/me/comment-moderation')"))
  assert.match(client, /submitCommentModerationAppeal[\s\S]*?moderation_action_id:\s*moderationActionId,\s*evidence/)
  assert.match(appeals, /aria-labelledby="comment-review-heading"/)
  assert.match(appeals, /Request review/)
  assert.match(appeals, /Your appeal is submitted/)
  assert.match(appeals, /Any blocked comment must be resubmitted/)
  assert.doesNotMatch(appeals, /record\.(?:category|severity|reason)/)
})
