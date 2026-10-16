// @ts-nocheck
import { v4 as uuidv4 } from 'uuid'
import { db, withTransaction } from '../legacy-db/index.js'
import { evaluateComment } from './commentModeration.js'
import { createCommentConfirmation, hashCommentContent } from './commentConfirmation.js'

const ACTIONS_REQUIRED = new Set(['WARN', 'BLOCK', 'HUMAN_REVIEW'])
const APPEALABLE_SEVERITIES = new Set(['HIGH', 'CRITICAL'])
const SAFE_GUIDELINES_WARNING =
  "Please make sure your comment follows Campnect's Community Guidelines. Comments containing harassment, threats, sexual abuse, hateful content, personal information, or other harmful content may be removed and can lead to restrictions or other action against your account. Sensitive topics can be discussed on Campnect, but comments must remain respectful and appropriate."
const STRONG_GUIDELINES_WARNING =
  "This comment may violate Campnect's Community Guidelines. Posting threats, harassment, sexual abuse, hateful content, personal information, or other harmful content can result in comment removal and account restrictions, suspension, or other enforcement. Please review your comment before posting."

export type CommentOperation = 'create' | 'edit'
export type CommentRequestStage = 'preflight' | 'commit'

/** Pure limiter policy shared with the API and without storing draft text. */
export function commentRateLimitResult(input: {
  recentCount: number
  limit: number
  oldestCreatedAt?: string | Date | null
  nowMs?: number
}) {
  const retryAfter = Math.max(1, Math.min(60, Math.ceil(
    60 - ((input.nowMs ?? Date.now()) - new Date(input.oldestCreatedAt ?? (input.nowMs ?? Date.now())).getTime()) / 1000,
  )))
  return input.recentCount >= input.limit ? { limited: true, retryAfter } : { limited: false, retryAfter: 0 }
}

export class CommentRateLimitError extends Error {
  status = 429
  code = 'COMMENT_SPAM'
  retryAfter: number
  constructor(retryAfter: number) {
    super('Please slow down before submitting another comment.')
    this.retryAfter = retryAfter
  }
}

function normalizedAssessment(assessment: any) {
  const decision = String(assessment?.decision || '')
  const severity = String(assessment?.severity || '')
  const validDecisions = new Set(['ALLOW', 'WARN', 'BLOCK', 'HUMAN_REVIEW'])
  const validSeverities = new Set(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  if (!validDecisions.has(decision) || !validSeverities.has(severity)) {
    // A malformed model response is never permission to publish.
    return {
      decision: 'HUMAN_REVIEW', category: 'OTHER_SEVERE_VIOLATION', severity: 'HIGH',
      confidence: 0, targeted: false, intent: '', reason: 'The moderation result could not be verified.',
      requiresHumanReview: true, requiresConfirmation: false, source: 'local',
    }
  }
  return {
    ...assessment,
    decision,
    severity,
    category: String(assessment.category || 'OTHER_SEVERE_VIOLATION').slice(0, 80),
    confidence: Number.isFinite(Number(assessment.confidence)) ? Math.max(0, Math.min(1, Number(assessment.confidence))) : 0,
    targeted: assessment.targeted === true,
    intent: String(assessment.intent || '').slice(0, 120),
    reason: String(assessment.reason || '').slice(0, 240),
    requiresHumanReview: assessment.requiresHumanReview === true,
    requiresConfirmation: assessment.requiresConfirmation === true,
    source: assessment.source === 'gemini' ? 'gemini' : 'local',
  }
}

function isCriticalWarning(assessment: any) {
  return ['HIGH', 'CRITICAL'].includes(assessment.severity) || assessment.requiresHumanReview
}

async function recordAttempt(input: any) {
  const assessment = input.assessment
  return withTransaction(async (tx) => {
    // Keep the automated-violation count and its resulting temporary
    // comments-only restriction atomic per user across API instances.
    await tx.one('SELECT pg_advisory_xact_lock(hashtext($1)) AS locked', [`comment-enforcement:${input.userId}`])
    const prior = !input.confirmationToken
      ? await tx.one<any>(
          `SELECT id, decision, confirmation_used_at
           FROM comment_moderation_decisions
           WHERE user_id = $1 AND post_id = $2
             AND COALESCE(parent_id, '') = COALESCE($3, '')
             AND COALESCE(target_comment_id, '') = COALESCE($4, '')
             AND operation = $5 AND request_stage = $6
             AND content_hash = $7 AND decision = $8
             AND created_at >= NOW() - INTERVAL '2 minutes'
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [
            input.userId, input.postId, input.parentId || null, input.commentId || null,
            input.operation, input.stage, input.contentHash, assessment.decision,
          ],
        )
      : null
    if (prior) {
      const id = prior.id
      let confirmation = null
      if (assessment.decision === 'WARN' && !isCriticalWarning(assessment) && !prior.confirmation_used_at) {
        confirmation = createCommentConfirmation({
          userId: input.userId,
          postId: input.postId,
          parentId: input.parentId || null,
          commentId: input.commentId || null,
          operation: input.operation,
          contentHash: input.contentHash,
          attemptId: id,
        })
        await tx.run(
          `UPDATE comment_moderation_decisions
           SET confirmation_nonce_hash = $1, confirmation_expires_at = $2
           WHERE id = $3 AND confirmation_used_at IS NULL`,
          [confirmation.nonceHash, confirmation.expiresAt, id],
        )
      }
      return { id, confirmation }
    }

    const id = uuidv4()
    const confirmation = assessment.decision === 'WARN' && !isCriticalWarning(assessment)
      ? createCommentConfirmation({
          userId: input.userId,
          postId: input.postId,
          parentId: input.parentId || null,
          commentId: input.commentId || null,
          operation: input.operation,
          contentHash: input.contentHash,
          attemptId: id,
        })
      : null
    await tx.run(
      `INSERT INTO comment_moderation_decisions (
         id, user_id, post_id, parent_id, target_comment_id, operation, request_stage,
          content_hash, decision, category, severity, source, confidence, targeted, intent, reason,
          requires_confirmation, requires_human_review, approved_override_id,
          confirmation_nonce_hash, confirmation_expires_at, appeal_status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        id, input.userId, input.postId, input.parentId || null, input.commentId || null,
        input.operation, input.stage, input.contentHash, assessment.decision, assessment.category,
        assessment.severity, assessment.source, assessment.confidence, assessment.targeted ? 1 : 0,
        assessment.intent, assessment.reason, assessment.requiresConfirmation ? 1 : 0,
        assessment.requiresHumanReview ? 1 : 0, input.approvedOverrideId || null,
        confirmation?.nonceHash || null,
        confirmation?.expiresAt || null,
        APPEALABLE_SEVERITIES.has(assessment.severity) || assessment.decision === 'HUMAN_REVIEW'
          ? 'eligible' : 'not_appealable',
      ],
    )

    if (ACTIONS_REQUIRED.has(assessment.decision)) {
      const safeReason = assessment.decision === 'WARN'
        ? 'A pre-post comment safety reminder was shown.'
        : assessment.decision === 'BLOCK'
          ? 'The submitted comment was blocked by Campnect comment-safety policy.'
          : 'The submitted comment requires human moderation before publication.'
      const targetType = input.commentId ? 'comment' : 'comment_submission'
      const targetId = input.commentId || id
      await tx.run(
        `INSERT INTO moderation_actions (id, admin_id, action, target_type, target_id, reason, before_summary, after_summary, metadata, request_id)
         VALUES ($1,'system:comment-moderation',$2,$3,$4,$5,'{}','{}',$6,$7)`,
        [
          id, `comment.${assessment.decision.toLowerCase()}`, targetType, targetId,
          safeReason,
          JSON.stringify({
            category: assessment.category,
            severity: assessment.severity,
            confidence: assessment.confidence,
            targeted: assessment.targeted,
            intent: assessment.intent,
            automated: true,
            source: assessment.source,
            stage: input.stage,
            post_id: input.postId,
          }),
          input.requestId || null,
        ],
      )
      await tx.run(
        `INSERT INTO enforcement_history
          (id, user_id, action_type, reason, internal_notes, evidence, moderator_id, new_status)
         VALUES ($1,$2,$3,$4,$5,$6,'system',$7)`,
        [
          uuidv4(), input.userId, `comment.${assessment.decision.toLowerCase()}`,
          safeReason,
          JSON.stringify({
            automated: true, category: assessment.category, severity: assessment.severity,
            confidence: assessment.confidence, source: assessment.source,
            target_comment_id: input.commentId || null,
          }),
          JSON.stringify({ post_id: input.postId, content_hash: input.contentHash }),
          JSON.stringify({ decision: assessment.decision, severity: assessment.severity }),
        ],
      )
      const confirmedHighConfidenceBlock =
        assessment.decision === 'BLOCK' &&
        ['HIGH', 'CRITICAL'].includes(assessment.severity) &&
        assessment.targeted &&
        assessment.confidence >= 0.9 &&
        assessment.category !== 'SPAM'
      if (assessment.decision === 'HUMAN_REVIEW' ||
          (assessment.decision === 'BLOCK' && ['HIGH', 'CRITICAL'].includes(assessment.severity))) {
        const humanReviewSummary = String(input.text || '').slice(0, 2000)
        await tx.run(
          `INSERT INTO moderation_cases
            (id, report_id, case_type, category, target_type, target_id, status, priority, summary, created_by)
           VALUES ($1,NULL,$2,$3,'comment_submission',$4,'open',$5,$6,'system:comment-moderation')`,
          [
            uuidv4(),
            assessment.decision === 'HUMAN_REVIEW' ? 'automated_comment_review' : 'high_risk_comment_review',
            assessment.category,
            id,
            ['HIGH', 'CRITICAL'].includes(assessment.severity) ? 'high' : 'normal',
            `Comment submitted for human review: ${humanReviewSummary}`,
          ],
        )
      }
      if (confirmedHighConfidenceBlock) {
        const previousSevere = await tx.one<any>(
          `SELECT COUNT(DISTINCT content_hash)::int AS count
           FROM comment_moderation_decisions
            WHERE user_id = $1 AND id <> $2 AND content_hash <> $3
             AND decision = 'BLOCK' AND severity IN ('HIGH','CRITICAL')
             AND targeted = 1 AND confidence >= 0.9 AND category <> 'SPAM'
             AND appeal_status <> 'approved'
             AND created_at >= NOW() - INTERVAL '30 days'`,
          [input.userId, id, input.contentHash],
        )
        if (Number(previousSevere?.count || 0) >= 2) {
          await tx.run(
            `UPDATE user_restrictions SET removed_at = NOW(),
               removed_by = 'system:comment-moderation'
             WHERE user_id = $1 AND restriction_type = 'comments'
               AND expires_at IS NOT NULL AND expires_at <= NOW()
               AND removed_at IS NULL`,
            [input.userId],
          )
          const activeRestriction = await tx.one<any>(
            `SELECT id, expires_at FROM user_restrictions
             WHERE user_id = $1 AND restriction_type = 'comments'
               AND removed_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`,
            [input.userId],
          )
          const restriction = activeRestriction
            ? null
            : await tx.one<any>(
                `INSERT INTO user_restrictions (id,user_id,restriction_type,reason,issued_by,expires_at)
                 VALUES ($1,$2,'comments',
                   'Temporary comments-only restriction after repeated confirmed severe comment-safety violations.',
                   'system:comment-moderation', NOW() + INTERVAL '24 hours')
                 RETURNING id`,
                [id, input.userId],
              )
          if (restriction?.id) {
            await tx.run('UPDATE comment_moderation_decisions SET restriction_id = $1 WHERE id = $2', [restriction.id, id])
            await tx.run(
              `INSERT INTO enforcement_history
                (id, user_id, action_type, reason, internal_notes, evidence, moderator_id, new_status, expires_at)
               VALUES ($1,$2,'comment.temporary_restriction',$3,$4,$5,'system',$6,NOW() + INTERVAL '24 hours')`,
              [
                uuidv4(), input.userId,
                'A 24-hour comments-only restriction followed multiple independent high-confidence severe moderation decisions.',
                JSON.stringify({ automated: true, category: assessment.category, severity: assessment.severity, moderation_action_id: id }),
                JSON.stringify({ content_hash: input.contentHash, repeat_count: '3_or_more_distinct_severe_comments' }),
                JSON.stringify({ restriction_type: 'comments', duration_hours: 24 }),
              ],
            )
            const notificationId = uuidv4()
            const notificationContent = 'A temporary comments-only restriction was applied after repeated severe comments. You can appeal the moderation action from Settings.'
            await tx.run(
              `INSERT INTO notifications (id, user_id, type, entity_id, entity_type, content)
               VALUES ($1,$2,'moderation',$3,'appeal',$4)`,
              [notificationId, input.userId, id, notificationContent],
            )
          }
        }
      }
    }
    return { id, confirmation }
  })
}

/** The final policy gate: no classifier, client, or signed warning can bypass server enforcement. */
export async function assessCommentSubmission(input: {
  userId: string
  postId: string
  parentId?: string | null
  commentId?: string | null
  operation: CommentOperation
  stage: CommentRequestStage
  text: string
  requestId?: string
  confirmationToken?: string | null
  classify?: typeof evaluateComment
  nowMs?: number
}) {
  const contentHash = hashCommentContent(input.text)
  let assessment = normalizedAssessment(await (input.classify || evaluateComment)({
    text: input.text,
    userId: input.userId,
    // Pass no private profile, session, message, device, or author information
    // to the model. Classification falls back locally on provider/quota errors.
  }, { excludeCommentId: input.commentId || undefined }))

  if (assessment.decision === 'WARN' && isCriticalWarning(assessment)) {
    assessment = {
      ...assessment,
      decision: 'HUMAN_REVIEW',
      requiresConfirmation: false,
      requiresHumanReview: true,
    }
  }
  const isRateSpam = assessment.category === 'SPAM' && (
    assessment.reason === 'Please wait a moment before posting another comment.' ||
    assessment.reason === 'This comment was already posted recently.'
  )
  if (isRateSpam) {
    return {
      attemptId: null,
      contentHash,
      assessment,
      confirmationToken: null,
      confirmationExpiresAt: null,
      decision: assessment.decision,
      requiresConfirmation: false,
      message: "This comment can't be posted again just yet. Please wait before trying again.",
    }
  }
  const approvedOverride = !isRateSpam && assessment.decision !== 'ALLOW'
    ? await db.one<any>(
        `SELECT id FROM comment_moderation_overrides
         WHERE user_id = $1 AND post_id = $2 AND operation = $3
           AND content_hash = $4 AND COALESCE(parent_id, '') = COALESCE($5, '')
           AND COALESCE(target_comment_id, '') = COALESCE($6, '')
           AND consumed_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [
          input.userId, input.postId, input.operation, contentHash,
          input.parentId || null, input.commentId || null,
        ],
      )
    : null
  if (approvedOverride) {
    assessment = {
      ...assessment,
      decision: 'ALLOW',
      category: 'SAFE',
      severity: 'NONE',
      confidence: 1,
      targeted: false,
      intent: 'An authorized moderator approved this exact comment draft for resubmission.',
      reason: 'An authorized moderator approved this exact comment draft for resubmission.',
      requiresConfirmation: false,
      requiresHumanReview: false,
      source: 'local',
    }
  }
  const result = await recordAttempt({
    ...input,
    contentHash,
    assessment,
    confirmationToken: input.confirmationToken || null,
    approvedOverrideId: approvedOverride?.id || null,
  })
  return {
    attemptId: result.id,
    contentHash,
    assessment,
    confirmationToken: result.confirmation?.token || null,
    confirmationExpiresAt: result.confirmation?.expiresAt || null,
    decision: assessment.decision,
    requiresConfirmation: Boolean(result.confirmation),
    approvedOverrideId: approvedOverride?.id || null,
    message: assessment.decision === 'WARN'
      ? isCriticalWarning(assessment) ? STRONG_GUIDELINES_WARNING : SAFE_GUIDELINES_WARNING
      : assessment.decision === 'HUMAN_REVIEW'
        ? 'This comment cannot be posted until it has been reviewed.'
        : assessment.decision === 'BLOCK'
          ? "This comment can't be posted because it appears to violate Campnect's Community Guidelines."
          : null,
  }
}

export function publicCommentModerationResult(result: any) {
  const { decision, assessment } = result
  return {
    decision,
    severity: assessment.severity,
    requiresConfirmation: result.requiresConfirmation,
    ...(result.confirmationToken ? { confirmationToken: result.confirmationToken } : {}),
    ...(result.message ? { message: result.message } : {}),
  }
}