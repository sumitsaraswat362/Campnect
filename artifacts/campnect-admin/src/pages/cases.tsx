import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Loader2, XCircle } from 'lucide-react';
import { useCase, useCases, useResolveCommentReview, type CommentReviewSubmission, type ModerationCase } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const PAGE_SIZE = 50;

const statusLabel: Record<string, string> = {
  open: 'Open',
  pending: 'Pending',
  in_review: 'In review',
  under_review: 'Under review',
  assigned: 'Assigned',
  resolved: 'Resolved',
  closed: 'Closed',
};

const reviewIsResolved = (item: ModerationCase) =>
  Boolean(item.submission?.review_resolution || item.comment_submission?.review_resolution || item.commentSubmission?.review_resolution)
  || ['approved', 'rejected'].includes(String(item.submission?.review_resolution || item.comment_submission?.review_resolution || item.commentSubmission?.review_resolution || '').toLowerCase());

function getSubmission(item?: ModerationCase | null): CommentReviewSubmission | null {
  if (!item) return null;
  return item.submission || item.comment_submission || item.commentSubmission || null;
}

function badgeVariant(status: string) {
  if (['approved', 'resolved', 'closed'].includes(status)) return 'success';
  if (['rejected'].includes(status)) return 'destructive';
  if (['under_review', 'in_review', 'assigned'].includes(status)) return 'warning';
  return 'outline';
}

export default function Cases() {
  const { user } = useAuth();
  const canRead = Boolean(user?.permissions?.some((permission) =>
    ['*', 'admin', 'cases.read', 'cases.manage'].includes(permission),
  ));
  const canReview = Boolean(user?.permissions?.some((permission) =>
    ['*', 'admin', 'cases.manage'].includes(permission),
  ));
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [review, setReview] = useState<{ item: ModerationCase; decision: 'approved' | 'rejected' } | null>(null);
  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState('');

  const casesQuery = useCases({ status, page, limit: PAGE_SIZE }, canRead);
  const detailQuery = useCase(selectedId, canRead);
  const resolveCommentReview = useResolveCommentReview();
  const allCases = casesQuery.data?.data ?? [];
  const commentCases = useMemo(() => allCases.filter((item) => item.target_type === 'comment_submission'), [allCases]);
  const total = casesQuery.data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selected = detailQuery.data;
  const submission = getSubmission(selected);

  const openReview = (item: ModerationCase, decision: 'approved' | 'rejected') => {
    setReview({ item, decision });
    setReason('');
    setSubmitError('');
  };

  const submitReview = async () => {
    if (!review || !reason.trim() || !canReview) return;
    setSubmitError('');
    try {
      await resolveCommentReview.mutateAsync({
        id: review.item.id,
        decision: review.decision,
        reason: reason.trim(),
      });
      setReview(null);
      setSelectedId('');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not resolve this comment review.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Comment review cases</h1>
        <p className="mt-1 text-muted-foreground">Review comments held before publication. An approval lets the member resubmit that exact draft; it never publishes it automatically.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Held comment submissions</CardTitle>
            <p className="mt-1 text-sm font-normal text-muted-foreground">
              {total > 0 ? `Showing comment reviews from page ${page} of ${totalPages} case pages.` : 'No matching comment review cases.'}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">Case status</span>
            <select
              aria-label="Filter comment review case status"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={status}
              onChange={(event) => { setStatus(event.target.value); setPage(1); }}
            >
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="under_review">Under review</option>
              <option value="in_review">In review</option>
              <option value="all">All statuses</option>
            </select>
          </label>
        </CardHeader>
        <CardContent className="p-0">
          {!canRead ? (
            <p className="p-6 text-sm text-muted-foreground">
              Your role does not include <span className="font-mono">cases.read</span>, so case details are unavailable.
            </p>
          ) : casesQuery.isLoading ? (
            <div className="flex justify-center p-12" role="status"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><span className="sr-only">Loading comment review cases…</span></div>
          ) : casesQuery.error ? (
            <div className="p-8 text-destructive">Could not load review cases: {casesQuery.error.message}</div>
          ) : commentCases.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">
              {total > 0
                ? `No comment submissions were found on page ${page}. Use the page controls to search the remaining ${status === 'all' ? 'case history' : status} cases.`
                : 'No comment submissions need review for this status.'}
            </div>
          ) : (
            <div className="divide-y">
              {commentCases.map((item) => {
                const resolved = reviewIsResolved(item);
                return (
                  <div key={item.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="capitalize">{item.category.replaceAll('_', ' ').toLowerCase()}</Badge>
                        <Badge variant="outline">{item.priority || 'normal'} priority</Badge>
                        <Badge variant={badgeVariant(item.status) as any} className="capitalize">{statusLabel[item.status] || item.status.replaceAll('_', ' ')}</Badge>
                    {resolved && <Badge variant="success" className="capitalize">{String(getSubmission(item)?.review_resolution).replaceAll('_', ' ')}</Badge>}
                      </div>
                      <div className="text-sm font-medium">{item.target_name || (item.target_username ? `@${item.target_username}` : 'Member comment submission')}</div>
                      <p className="text-xs text-muted-foreground">{item.summary || 'Comment held before publication'} · {new Date(item.created_at).toLocaleString()}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedId(item.id)} className="shrink-0">
                      Review submission
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        <div className="flex items-center justify-between border-t px-5 py-3">
          <span className="text-xs text-muted-foreground">Case pages are sorted newest first.</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || casesQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <span className="min-w-12 text-center text-xs text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages || casesQuery.isFetching} onClick={() => setPage((current) => current + 1)}>
              Next <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId('')}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Held comment submission</DialogTitle>
            <DialogDescription>
              Review the original draft and its context before deciding. An approved submission remains unpublished and may only be resubmitted with the same text and context.
            </DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading ? (
            <div className="flex justify-center p-8" role="status"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><span className="sr-only">Loading case details…</span></div>
          ) : detailQuery.error ? (
            <p className="text-sm text-destructive">Could not load this case: {detailQuery.error.message}</p>
          ) : !selected || selected.target_type !== 'comment_submission' ? (
            <p className="text-sm text-destructive">This case does not contain a held comment submission. No decision can be made here.</p>
          ) : !submission ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>The submission details are unavailable. Refresh the queue or ask an administrator to check the case record; no decision can be made without the actual draft.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Member</div>
                  <Link className="mt-1 inline-block text-sm font-semibold hover:underline" href={`/accounts/${encodeURIComponent(submission.user_id)}`} onClick={() => setSelectedId('')}>
                    {submission.target_username ? `@${submission.target_username}` : submission.target_name || 'View member account'}
                  </Link>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Submission type</div>
                  <div className="mt-1 text-sm capitalize">{submission.operation}{submission.parent_id ? ' · reply' : ''}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category / severity</div>
                  <div className="mt-1 text-sm capitalize">{submission.category.replaceAll('_', ' ').toLowerCase()} · {submission.severity.toLowerCase()}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Submitted</div>
                  <div className="mt-1 text-sm">{new Date(submission.created_at || selected.created_at).toLocaleString()}</div>
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Exact submitted draft</div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{submission.content_text}</p>
              </div>
              {submission.post_content && (
                <div className="rounded-md border p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Post context</div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">{submission.post_content}</p>
                </div>
              )}
              {submission.parent_content && (
                <div className="rounded-md border p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Parent comment context</div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">{submission.parent_content}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>Post: <span className="font-mono text-xs">{submission.post_id}</span></span>
                <Button variant="link" size="sm" asChild>
                  <Link href={`/content?post=${encodeURIComponent(submission.post_id)}`} onClick={() => setSelectedId('')}>View related post</Link>
                </Button>
                {submission.target_comment_id && <span>Edited comment: <span className="font-mono text-xs">{submission.target_comment_id}</span></span>}
                {submission.parent_id && <span>Reply to: <span className="font-mono text-xs">{submission.parent_id}</span></span>}
              </div>
              {submission.review_resolution && (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">
                  This submission was {submission.review_resolution}. {submission.review_resolution === 'approved'
                    ? 'The one-time approval only permits the exact draft to be resubmitted; it does not post the comment.'
                    : 'The held comment remains unpublished.'}
                </div>
              )}
            </div>
          )}
          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setSelectedId('')}>Close</Button>
            {canReview && selected?.target_type === 'comment_submission' && submission && !reviewIsResolved(selected) && (
              <>
                <Button variant="destructive" onClick={() => openReview(selected, 'rejected')} disabled={resolveCommentReview.isPending}>
                  <XCircle className="mr-2 h-4 w-4" /> Reject; keep unpublished
                </Button>
                <Button onClick={() => openReview(selected, 'approved')} disabled={resolveCommentReview.isPending}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve exact draft to resubmit
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(review)} onOpenChange={(open) => !open && !resolveCommentReview.isPending && setReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{review?.decision === 'approved' ? 'Approve exact draft for resubmission?' : 'Reject this comment submission?'}</DialogTitle>
            <DialogDescription>
              {review?.decision === 'approved'
                ? 'This creates a one-time authorization bound to this member, post, reply/edit target, and exact submitted text. The comment stays unpublished, and resubmitting it is still required.'
                : 'The held comment will remain unpublished. This does not suspend or permanently ban the member.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="comment-review-reason">Internal review reason (required)</Label>
            <Textarea
              id="comment-review-reason"
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Summarize the context and reason for this decision."
              rows={4}
              maxLength={2000}
            />
          </div>
          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={resolveCommentReview.isPending} onClick={() => setReview(null)}>Cancel</Button>
            <Button disabled={!reason.trim() || resolveCommentReview.isPending} variant={review?.decision === 'rejected' ? 'destructive' : 'default'} onClick={() => void submitReview()}>
              {resolveCommentReview.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {review?.decision === 'approved' ? 'Approve exact draft' : 'Reject and keep unpublished'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}