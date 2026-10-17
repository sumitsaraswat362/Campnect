export type CommentModerationDecision = 'WARN' | 'BLOCK' | 'HUMAN_REVIEW'
export type CommentModerationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface CommentModerationHistoryEntry {
  id: string
  action: string
  created_at: string
  appeal_status: string | null
  appealable: boolean
  comment_id: string | null
}

/** Only the server issues confirmation tokens; the browser never judges a comment safe. */
export interface CommentModerationPrompt {
  decision: CommentModerationDecision
  severity: CommentModerationSeverity
  requiresConfirmation: boolean
  confirmationToken?: string
}

export function readCommentModerationPrompt(
  response: unknown,
): CommentModerationPrompt | null {
  if (!response || typeof response !== 'object') return null
  const pending: unknown[] = [response]
  const seen = new Set<object>()

  // The canonical Axios shape is response.data = { code, moderation }; also
  // accept the common { data: { ... } } and { error: { ... } } API envelopes.
  while (pending.length > 0) {
    const candidate = pending.shift()
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) continue
    seen.add(candidate)
    const body = candidate as Record<string, unknown>
    const expectedDecision = body.code === 'COMMENT_MODERATION_WARNING'
      ? 'WARN'
      : body.code === 'COMMENT_MODERATION_BLOCKED'
        ? 'BLOCK'
        : body.code === 'COMMENT_MODERATION_REVIEW'
          ? 'HUMAN_REVIEW'
          : null

    if (expectedDecision && body.moderation && typeof body.moderation === 'object') {
      const result = body.moderation as Record<string, unknown>
      if (
        result.decision === expectedDecision
        && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(result.severity))
      ) {
        return {
          decision: result.decision as CommentModerationDecision,
          severity: result.severity as CommentModerationSeverity,
          requiresConfirmation: result.requiresConfirmation === true,
          ...(typeof result.confirmationToken === 'string' && result.confirmationToken.length <= 4096 && result.confirmationToken
            ? { confirmationToken: result.confirmationToken }
            : {}),
        }
      }
      return null
    }
    if (expectedDecision) return null

    if (body.data && typeof body.data === 'object') pending.push(body.data)
    if (body.error && typeof body.error === 'object') pending.push(body.error)
  }

  return null
}

/** An explicit Post Anyway is permitted only for a token-bound, nonsevere WARN. */
export function commentWarningCanBeConfirmed(prompt: CommentModerationPrompt | null): boolean {
  return prompt?.decision === 'WARN'
    && prompt.requiresConfirmation
    && !!prompt.confirmationToken
    && prompt.severity !== 'HIGH'
    && prompt.severity !== 'CRITICAL'
}

/** Map either stable UI aliases or the API's snake-case action/decision fields. */
export function normalizeCommentModerationRecord(value: unknown): CommentModerationHistoryEntry | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id : raw.moderation_action_id
  const action = typeof raw.action === 'string'
    ? raw.action
    : typeof raw.decision === 'string'
      ? raw.decision
      : raw.operation
  if (typeof id !== 'string' || !id || typeof action !== 'string' || !action || typeof raw.created_at !== 'string') return null

  return {
    id,
    action,
    created_at: raw.created_at,
    appealable: raw.appealable === true || raw.is_appealable === true,
    appeal_status: typeof raw.appeal_status === 'string' ? raw.appeal_status : null,
    comment_id: typeof raw.comment_id === 'string'
      ? raw.comment_id
      : typeof raw.target_comment_id === 'string'
        ? raw.target_comment_id
        : null,
  }
}

export const COMMENT_WARNING_MESSAGE =
  'Please make sure your comment follows Campnect’s Community Guidelines. Comments containing harassment, threats, sexual abuse, hateful content, personal information, or other harmful content may be removed and can lead to restrictions or other action against your account.'

export const COMMENT_STRONG_WARNING_MESSAGE =
  'This comment may violate Campnect’s Community Guidelines. Posting threats, harassment, sexual abuse, hateful content, personal information, or other harmful content can result in comment removal and account restrictions, suspension, or other enforcement. Please review your comment before posting.'
