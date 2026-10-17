import { useState } from 'react';
import { Link } from 'wouter';
import { CheckCircle2, Loader2, Scale, XCircle } from 'lucide-react';
import { useAppeals, useUpdateAppeal, type Appeal } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const statusVariant = (status: Appeal['status']) =>
  status === 'approved' ? 'success' : status === 'rejected' ? 'destructive' : status === 'pending' ? 'warning' : 'outline';

const isCommentAppeal = (appeal?: Appeal | null) =>
  appeal?.target_type === 'comment' || appeal?.target_type === 'comment_submission';

const targetLabel = (appeal?: Appeal | null) => {
  if (isCommentAppeal(appeal)) return 'comment';
  if (appeal?.target_type === 'post') return 'content';
  return 'account access';
};

export default function Appeals() {
  const { data, isLoading, error } = useAppeals();
  const updateAppeal = useUpdateAppeal();
  const [review, setReview] = useState<{ appeal: Appeal; status: 'approved' | 'rejected' } | null>(null);
  const [notes, setNotes] = useState('');
  const [requestError, setRequestError] = useState('');

  const openReview = (appeal: Appeal, status: 'approved' | 'rejected') => {
    setReview({ appeal, status });
    setNotes(status === 'rejected'
      ? 'We reviewed your appeal and our decision remains the same.'
      : isCommentAppeal(appeal)
        ? 'We reviewed your appeal. You may resubmit the exact comment draft in the same context; it has not been posted.'
        : appeal.target_type === 'post'
          ? 'We reviewed your appeal and restored your content.'
          : 'We reviewed your appeal and restored your account access.');
    setRequestError('');
  };

  const submitReview = async () => {
    if (!review || !notes.trim()) return;
    setRequestError('');
    try {
      await updateAppeal.mutateAsync({
        id: review.appeal.id,
        status: review.status,
        reason: notes.trim(),
        decision: notes.trim(),
        moderator_notes: notes.trim(),
      });
      setReview(null);
    } catch (err: any) {
      setRequestError(err?.message || 'Could not update this appeal.');
    }
  };

  const appeals = data?.data || [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Appeals Center</h1>
        <p className="text-muted-foreground mt-1">Review content and account moderation appeals submitted in Campnect.</p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Appeals ({data?.meta?.total ?? appeals.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <div className="p-8 text-destructive">Could not load appeals.</div>
          ) : appeals.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4"><Scale className="h-6 w-6 text-muted-foreground" /></div>
              <h3 className="text-lg font-medium">No appeals yet</h3>
              <p className="text-muted-foreground mt-2 max-w-sm">Submitted appeals will appear here with the member’s username and explanation.</p>
            </div>
          ) : (
            <div className="divide-y">
              {appeals.map((appeal) => {
                const canReview = ['pending', 'assigned', 'under_review', 'need_more_information'].includes(appeal.status);
                return (
                  <div key={appeal.id} className="p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <Link href={`/accounts/${appeal.user_id}`} className="font-semibold hover:underline">
                          {appeal.username ? `@${appeal.username}` : appeal.full_name || 'Unknown user'}
                        </Link>
                        {appeal.full_name && appeal.username && <span className="ml-2 text-sm text-muted-foreground">{appeal.full_name}</span>}
                        <div className="mt-1 text-xs text-muted-foreground">Submitted {new Date(appeal.submitted_at).toLocaleString()}</div>
                      </div>
                      <Badge variant={statusVariant(appeal.status) as any} className="w-fit capitalize">{appeal.status.replaceAll('_', ' ')}</Badge>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                      <span className="font-medium">Member’s explanation: </span>{appeal.evidence}
                    </div>
                     {appeal.target_type === 'post' && appeal.target_id && (
                       <div className="text-sm">
                         <span className="font-medium">{appeal.post_type || 'Post'} appeal: </span>
                         {appeal.post_content || 'Media-only content'}
                         <Button variant="link" size="sm" asChild><Link href={`/content?post=${encodeURIComponent(appeal.target_id)}`}>View content</Link></Button>
                       </div>
                     )}
                    {isCommentAppeal(appeal) && (
                      <div className="space-y-2 rounded-md border p-3 text-sm">
                        <div className="font-medium">Held comment appeal</div>
                        {(appeal.comment_content || appeal.comment_text || appeal.target_content) ? (
                          <p className="whitespace-pre-wrap break-words">{appeal.comment_content || appeal.comment_text || appeal.target_content}</p>
                        ) : (
                          <p className="text-muted-foreground">This review concerns a comment submission. Open Review Cases to see its held draft and full post/reply context.</p>
                        )}
                        <p className="text-muted-foreground">An approved appeal authorizes resubmission of the exact draft in the same context; it does not publish the comment.</p>
                      </div>
                    )}
                    {appeal.decision && <div className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Decision: </span>{appeal.decision}</div>}
                    {canReview && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openReview(appeal, 'approved')}>
                          <CheckCircle2 className="mr-2 h-4 w-4" /> {isCommentAppeal(appeal) ? 'Approve review request' : `Approve & restore ${targetLabel(appeal)}`}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => openReview(appeal, 'rejected')}>
                          <XCircle className="mr-2 h-4 w-4" /> Reject appeal
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(review)} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent>
          <DialogHeader>
             <DialogTitle>{review?.status === 'approved' ? isCommentAppeal(review.appeal) ? 'Approve comment appeal' : `Approve appeal and restore ${targetLabel(review.appeal)}` : 'Reject appeal'}</DialogTitle>
            <DialogDescription>
               {review?.status === 'approved'
                 ? isCommentAppeal(review.appeal)
                   ? 'This creates a time-limited approval for the exact unpublished comment draft in its original context. The member must resubmit it; this review never posts it or restores an account.'
                   : review.appeal.target_type === 'post' ? 'This will restore the moderated post, Clip, or Glimpse.' : 'This will lift the account suspension and ban so the member can use Campnect again.'
                 : `The member will see your decision in ${isCommentAppeal(review?.appeal) || review?.appeal.target_type === 'post' ? 'Content appeals' : 'their suspended-account screen'}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="appeal-decision">Message to member</Label>
            <Textarea id="appeal-decision" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={5000} />
            {requestError && <p className="text-sm text-destructive">{requestError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>Cancel</Button>
            <Button disabled={!notes.trim() || updateAppeal.isPending} variant={review?.status === 'rejected' ? 'destructive' : 'default'} onClick={submitReview}>
              {updateAppeal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {review?.status === 'approved' ? isCommentAppeal(review.appeal) ? 'Approve resubmission' : 'Approve & restore' : 'Reject appeal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}