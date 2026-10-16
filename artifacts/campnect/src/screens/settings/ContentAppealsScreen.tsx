import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2, MessageSquareWarning, Send } from 'lucide-react'
import { usersApi } from '../../api/users'
import { EmptyState } from '../../components/shared/EmptyState'
import { colors, radii } from '../../styles/tokens'
import {
  normalizeCommentModerationRecord,
  type CommentModerationHistoryEntry,
} from '../../features/comments/commentModeration'

type ModeratedContent = {
  id: string
  type: string
  content?: string | null
  reason?: string | null
  status?: string | null
  moderation_status?: string | null
  appeal_status?: string | null
  appeal_decision?: string | null
}

const activeAppealStatuses = new Set(['pending', 'assigned', 'under_review', 'need_more_information'])
const appealableCommentStatuses = new Set(['rejected'])

function responseRows<T>(response: any): T[] {
  const data = response?.data?.data
  if (!Array.isArray(data)) throw new Error('The moderation service returned an unexpected response. Please try again later.')
  return data
}

function statusLabel(status?: string | null) {
  if (!status) return 'Needs review'
  return status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function ContentAppealsScreen() {
  const [items, setItems] = useState<ModeratedContent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [evidence, setEvidence] = useState('')
  const [submittingPostId, setSubmittingPostId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [commentRecords, setCommentRecords] = useState<CommentModerationHistoryEntry[]>([])
  const [commentHistoryLoading, setCommentHistoryLoading] = useState(true)
  const [commentHistoryError, setCommentHistoryError] = useState('')
  const [selectedCommentActionId, setSelectedCommentActionId] = useState<string | null>(null)
  const [commentEvidence, setCommentEvidence] = useState('')
  const [submittingCommentActionId, setSubmittingCommentActionId] = useState<string | null>(null)
  const [commentSubmitError, setCommentSubmitError] = useState('')

  const loadContent = useCallback(async () => {
    setLoading(true)
    setCommentHistoryLoading(true)
    setLoadError('')
    setCommentHistoryError('')
    try {
      const [contentResult, historyResult] = await Promise.allSettled([
        usersApi.getMyModeratedContent(),
        usersApi.getCommentModerationHistory(),
      ])
      if (contentResult.status === 'fulfilled') {
        const contentRows = responseRows<ModeratedContent>(contentResult.value)
        setItems(contentRows.filter((item) => item && typeof item.id === 'string' && typeof item.type === 'string'))
      } else {
        setItems([])
        setLoadError(
          contentResult.reason?.response?.data?.error
            || contentResult.reason?.message
            || 'Unable to load moderated content and appeal status. Please try again.',
        )
      }

      if (historyResult.status === 'fulfilled') {
        const records = responseRows<unknown>(historyResult.value)
          .map(normalizeCommentModerationRecord)
          .filter((record): record is CommentModerationHistoryEntry => record !== null)
        setCommentRecords(records)
        setCommentHistoryError('')
      } else {
        setCommentRecords([])
        setCommentHistoryError(
          historyResult.reason?.response?.data?.error
            || 'Unable to load comment decisions. Please try again.',
        )
      }
    } catch (requestError: any) {
      setItems([])
      setLoadError(requestError?.response?.data?.error || 'Unable to load moderated content and appeal status. Please try again.')
      setCommentRecords([])
      setCommentHistoryError(requestError?.response?.data?.error || 'Unable to load comment decisions. Please try again.')
    } finally {
      setLoading(false)
      setCommentHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadContent()
  }, [loadContent])

  const submitAppeal = async (postId: string) => {
    const explanation = evidence.trim()
    if (!explanation) {
      setSubmitError('Please explain why this content should be reviewed.')
      return
    }
    setSubmittingPostId(postId)
    setSubmitError('')
    try {
      await usersApi.submitContentAppeal(postId, explanation)
      setSelectedPostId(null)
      setEvidence('')
      await loadContent()
    } catch (requestError: any) {
      setSubmitError(requestError?.response?.data?.error || 'We could not submit your appeal. Please try again.')
    } finally {
      setSubmittingPostId(null)
    }
  }

  const submitCommentAppeal = async (actionId: string) => {
    const explanation = commentEvidence.trim()
    if (!explanation) {
      setCommentSubmitError('Please explain why this comment decision should be reviewed.')
      return
    }
    setSubmittingCommentActionId(actionId)
    setCommentSubmitError('')
    try {
      await usersApi.submitCommentModerationAppeal(actionId, explanation)
      setSelectedCommentActionId(null)
      setCommentEvidence('')
      await loadContent()
    } catch (requestError: any) {
      setCommentSubmitError(requestError?.response?.data?.error || 'We could not submit your appeal. Please try again.')
    } finally {
      setSubmittingCommentActionId(null)
    }
  }

  return (
    <main style={{ minHeight: '100%', background: colors.bg, padding: '18px 14px 32px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 7px', color: colors.textPrimary, fontSize: 22 }}>Content appeals</h1>
        <p style={{ margin: '0 0 18px', color: colors.textMuted, fontSize: 14, lineHeight: 1.5 }}>
          Review posts, Clips, or Glimpses that were moderated. You can share an explanation for our team to review.
        </p>

        <section aria-labelledby="comment-review-heading" style={{ marginBottom: 24 }}>
          <h2 id="comment-review-heading" style={{ margin: '0 0 7px', color: colors.textPrimary, fontSize: 17 }}>
            Comment reviews
          </h2>
          <p style={{ margin: '0 0 13px', color: colors.textMuted, fontSize: 13, lineHeight: 1.5 }}>
            See comment decisions and request a review when an appeal is available.
          </p>

          {commentHistoryLoading ? (
            <div role="status" aria-live="polite" style={{ display: 'flex', justifyContent: 'center', padding: 20, color: colors.textMuted }}>
              <Loader2 size={20} className="animate-spin" aria-label="Loading comment decisions" />
            </div>
          ) : commentHistoryError ? (
            <section role="alert" style={{ padding: 14, border: `1px solid ${colors.border}`, borderRadius: radii.xl, color: colors.textPrimary, background: 'var(--color-surface)' }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.5 }}>{commentHistoryError}</p>
              <button type="button" onClick={() => void loadContent()} style={secondaryButtonStyle}>Try again</button>
            </section>
          ) : commentRecords.length === 0 ? (
            <p style={{ margin: 0, padding: 14, border: `1px solid ${colors.border}`, borderRadius: radii.xl, background: 'var(--color-surface)', color: colors.textMuted, fontSize: 13 }}>
              There are no comment decisions to review.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {commentRecords.map((record, index) => {
                const activeAppeal = Boolean(record.appeal_status && activeAppealStatuses.has(record.appeal_status))
                const approvedAppeal = record.appeal_status === 'approved'
                const canAppeal = record.appealable
                  && !activeAppeal
                  && !approvedAppeal
                  && (!record.appeal_status || appealableCommentStatuses.has(record.appeal_status))
                const formId = `comment-appeal-evidence-${index}`

                return (
                  <article key={record.id} style={{ padding: 14, border: `1px solid ${colors.border}`, borderRadius: radii.xl, background: 'var(--color-surface)', color: colors.textPrimary }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Comment decision</h3>
                      <span style={{ flexShrink: 0, borderRadius: radii.pill, padding: '4px 9px', background: 'var(--color-surface-hover)', color: colors.textSecondary, fontSize: 12, fontWeight: 700 }}>
                        {statusLabel(record.appeal_status || 'Action applied')}
                      </span>
                    </div>
                    <p style={{ margin: '9px 0 0', color: colors.textMuted, fontSize: 12 }}>
                      {Number.isFinite(Date.parse(record.created_at))
                        ? new Date(record.created_at).toLocaleDateString()
                        : 'Date unavailable'}
                    </p>
                    <p style={{ margin: '9px 0 0', color: colors.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
                      An appeal asks Campnect’s team to review the decision. Appeal review is separate from publishing.
                    </p>
                    {activeAppeal ? (
                      <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, color: colors.blueLight, fontSize: 13, lineHeight: 1.45 }}>
                        <CheckCircle2 size={17} aria-hidden="true" />
                        <span>Your appeal is submitted. Its review status will appear here.</span>
                      </div>
                    ) : approvedAppeal ? (
                      <p role="status" style={{ margin: '12px 0 0', color: colors.lime, fontSize: 13, lineHeight: 1.45 }}>
                        Your appeal was approved. Any blocked comment must be resubmitted; approval does not publish it automatically.
                      </p>
                    ) : record.appeal_status === 'rejected' ? (
                      <p role="status" style={{ margin: '12px 0 0', color: colors.textSecondary, fontSize: 13, lineHeight: 1.45 }}>
                        Your previous appeal was reviewed.
                      </p>
                    ) : null}

                    {canAppeal && selectedCommentActionId !== record.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCommentActionId(record.id)
                          setCommentEvidence('')
                          setCommentSubmitError('')
                        }}
                        style={{ ...primaryButtonStyle, marginTop: 12 }}
                      >
                        {record.appeal_status === 'rejected' ? 'Submit another appeal' : 'Request review'}
                      </button>
                    )}
                    {canAppeal && selectedCommentActionId === record.id && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault()
                          void submitCommentAppeal(record.id)
                        }}
                        style={{ marginTop: 13 }}
                      >
                        <label htmlFor={formId} style={{ display: 'block', marginBottom: 7, fontSize: 13, fontWeight: 700 }}>
                          Why should this comment decision be reviewed?
                        </label>
                        <textarea
                          id={formId}
                          value={commentEvidence}
                          onChange={(event) => setCommentEvidence(event.target.value)}
                          maxLength={10000}
                          rows={4}
                          required
                          aria-describedby={commentSubmitError ? `${formId}-error` : undefined}
                          placeholder="Explain why you believe this decision should be reviewed."
                          style={{ ...textareaStyle, width: '100%', boxSizing: 'border-box' }}
                        />
                        {commentSubmitError && <p id={`${formId}-error`} role="alert" style={{ margin: '7px 0 0', color: '#FCA5A5', fontSize: 13 }}>{commentSubmitError}</p>}
                        <div style={{ display: 'flex', gap: 9, marginTop: 10 }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCommentActionId(null)
                              setCommentEvidence('')
                              setCommentSubmitError('')
                            }}
                            disabled={submittingCommentActionId === record.id}
                            style={secondaryButtonStyle}
                          >
                            Cancel
                          </button>
                          <button type="submit" disabled={submittingCommentActionId === record.id} style={primaryButtonStyle}>
                            <Send size={15} aria-hidden="true" />
                            {submittingCommentActionId === record.id ? 'Submitting…' : 'Submit appeal'}
                          </button>
                        </div>
                      </form>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {loading ? (
          <div role="status" aria-live="polite" style={{ display: 'flex', justifyContent: 'center', padding: 28, color: colors.textMuted }}>
            <Loader2 size={22} className="animate-spin" aria-label="Loading moderated content" />
          </div>
        ) : loadError ? (
          <section role="alert" style={{ padding: 16, border: `1px solid ${colors.border}`, borderRadius: radii.xl, color: colors.textPrimary, background: 'var(--color-surface)' }}>
            <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>{loadError}</p>
            <button type="button" onClick={() => void loadContent()} style={secondaryButtonStyle}>Try again</button>
          </section>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<MessageSquareWarning size={28} color={colors.lime} />}
            title="No moderated content"
            description="If one of your posts, Clips, or Glimpses is moderated, its review status will appear here."
          />
        ) : (
          <section aria-label="Your moderated content" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((item, index) => {
              const appealPending = Boolean(item.appeal_status && activeAppealStatuses.has(item.appeal_status))
              const canAppeal = !item.appeal_status || item.appeal_status === 'rejected'
              const formId = `content-appeal-evidence-${index}`
              const typeLabel = item.type.toLowerCase() === 'reel' ? 'Clip' : item.type.toLowerCase()

              return (
                <article key={`${item.id}-${index}`} style={{ padding: 15, border: `1px solid ${colors.border}`, borderRadius: radii.xl, background: 'var(--color-surface)', color: colors.textPrimary }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 15, textTransform: 'capitalize' }}>{typeLabel}</h2>
                    <span style={{ flexShrink: 0, borderRadius: radii.pill, padding: '4px 9px', background: 'var(--color-surface-hover)', color: colors.textSecondary, fontSize: 12, fontWeight: 700 }}>
                      {statusLabel(item.appeal_status || item.moderation_status || item.status)}
                    </span>
                  </div>
                  {item.content && <p style={{ margin: '12px 0 0', color: colors.textSecondary, fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{item.content}</p>}
                  {item.reason && <p style={{ margin: '10px 0 0', color: colors.textSecondary, fontSize: 13, lineHeight: 1.5 }}><strong style={{ color: colors.textPrimary }}>Reason: </strong>{item.reason}</p>}

                  {appealPending ? (
                    <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, color: colors.blueLight, fontSize: 13, lineHeight: 1.45 }}>
                      <CheckCircle2 size={17} aria-hidden="true" />
                      <span>Your appeal is submitted. The review status will be updated here.</span>
                    </div>
                  ) : item.appeal_status === 'rejected' ? (
                    <div style={{ marginTop: 13, padding: 12, borderRadius: radii.lg, background: 'rgba(239,68,68,.08)', color: colors.textPrimary }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Your appeal was reviewed</p>
                      {item.appeal_decision && <p style={{ margin: '6px 0 0', color: colors.textSecondary, fontSize: 13, lineHeight: 1.5 }}>{item.appeal_decision}</p>}
                    </div>
                  ) : item.appeal_status === 'approved' ? (
                    <p role="status" style={{ margin: '13px 0 0', color: colors.lime, fontSize: 13, lineHeight: 1.45 }}>Your appeal was approved.</p>
                  ) : null}

                  {canAppeal && selectedPostId !== item.id && (
                    <button
                      type="button"
                      onClick={() => { setSelectedPostId(item.id); setEvidence(''); setSubmitError('') }}
                      style={{ ...primaryButtonStyle, marginTop: 14 }}
                    >
                      {item.appeal_status === 'rejected' ? 'Submit another appeal' : 'Appeal this content'}
                    </button>
                  )}
                  {canAppeal && selectedPostId === item.id && (
                    <form
                      onSubmit={(event) => { event.preventDefault(); void submitAppeal(item.id) }}
                      style={{ marginTop: 14 }}
                    >
                      <label htmlFor={formId} style={{ display: 'block', marginBottom: 7, fontSize: 13, fontWeight: 700 }}>
                        Why should this content be reviewed?
                      </label>
                      <textarea
                        id={formId}
                        value={evidence}
                        onChange={(event) => setEvidence(event.target.value)}
                        maxLength={10000}
                        rows={4}
                        required
                        aria-describedby={submitError ? `${formId}-error` : undefined}
                        placeholder="Explain why you believe this moderation decision should be reviewed."
                        style={{ ...textareaStyle, width: '100%', boxSizing: 'border-box' }}
                      />
                      {submitError && <p id={`${formId}-error`} role="alert" style={{ margin: '7px 0 0', color: '#FCA5A5', fontSize: 13 }}>{submitError}</p>}
                      <div style={{ display: 'flex', gap: 9, marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={() => { setSelectedPostId(null); setEvidence(''); setSubmitError('') }}
                          disabled={submittingPostId === item.id}
                          style={secondaryButtonStyle}
                        >
                          Cancel
                        </button>
                        <button type="submit" disabled={submittingPostId === item.id} style={primaryButtonStyle}>
                          <Send size={15} aria-hidden="true" />
                          {submittingPostId === item.id ? 'Submitting…' : 'Submit appeal'}
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              )
            })}
          </section>
        )}
      </div>
    </main>
  )
}

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  border: 'none', borderRadius: radii.lg, background: colors.blueCore, color: '#fff',
  padding: '10px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`, borderRadius: radii.lg, background: 'transparent',
  color: colors.textPrimary, padding: '10px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}

const textareaStyle: React.CSSProperties = {
  background: colors.bg, color: colors.textPrimary, border: `1px solid ${colors.border}`,
  borderRadius: radii.lg, padding: 11, resize: 'vertical', font: 'inherit',
}