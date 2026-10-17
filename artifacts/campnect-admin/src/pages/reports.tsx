import { useEffect, useState } from 'react';
import { useReport, useReports, useUpdateReport, Report } from '@/hooks/use-admin';
import { BASE_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function Reports() {
  const [page, setPage] = useState(1);
  const { data: response, isLoading, error } = useReports({ page, limit: 25 });
  const reports = response?.data ?? [];
  const meta = response?.meta;
  const updateReport = useUpdateReport();
  
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [reason, setReason] = useState('');
  const [actionStatus, setActionStatus] = useState<'resolved' | 'dismissed'>('resolved');
  const { data: detail, isLoading: detailLoading, error: detailError } = useReport(selectedReport?.id || '');

  const handleReview = (report: Report) => {
    setSelectedReport(report);
    setReason('');
    setActionStatus('resolved');
  };

  const handleSubmit = async () => {
    if (!selectedReport) return;
    await updateReport.mutateAsync({
      id: selectedReport.id,
      status: actionStatus,
      reason
    });
    setSelectedReport(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">New Reports</h1>
        <p className="text-muted-foreground mt-1">Review and action user-submitted reports.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Reports</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Reported At</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-destructive">
                    Failed to load reports: {error.message}
                  </TableCell>
                </TableRow>
              ) : !reports.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No pending reports. The queue is clear.
                  </TableCell>
                </TableRow>
              ) : (
                reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{report.entity_type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{report.reason}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(report.created_at), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleReview(report)}>
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {(meta?.total_pages > 1 || meta?.total > 25) && (
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => current - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {meta?.page ?? page}{meta?.total_pages ? ` of ${meta.total_pages}` : ''}</span>
          <Button variant="outline" size="sm" disabled={isLoading || (meta?.total_pages ? page >= meta.total_pages : reports.length < 25)} onClick={() => setPage((current) => current + 1)}>Next</Button>
        </div>
      )}

      <Dialog open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Report</DialogTitle>
            <DialogDescription>
              Take action on this {selectedReport?.entity_type} report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <ReportEvidence report={selectedReport} detail={detail} loading={detailLoading} error={detailError?.message} />
            <div className="space-y-2">
              <Label>Action</Label>
              <div className="flex gap-2">
                <Button 
                  type="button"
                  variant={actionStatus === 'resolved' ? 'default' : 'outline'} 
                  onClick={() => setActionStatus('resolved')}
                >
                  Resolve (Action Taken)
                </Button>
                <Button 
                  type="button"
                  variant={actionStatus === 'dismissed' ? 'default' : 'outline'} 
                  onClick={() => setActionStatus('dismissed')}
                >
                  Dismiss (No Action)
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason / Notes</Label>
              <Textarea 
                id="reason" 
                value={reason} 
                onChange={(e) => setReason(e.target.value)} 
                placeholder="Explain the decision..." 
                required 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedReport(null)} disabled={updateReport.isPending}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={updateReport.isPending || !reason.trim()}>
              {updateReport.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportEvidence({ report, detail, loading, error }: { report: Report | null; detail?: any; loading: boolean; error?: string }) {
  if (!report) return null;
  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (error) return <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Unable to load the reported item: {error}</p>;
  const target = detail?.target;
  const heading = target?.title || target?.full_name || target?.username || target?.sender_name || 'Reported item';
  const body = target?.content || target?.description || target?.bio || '';
  const actor = target?.author_username || target?.sender_username || target?.organizer_username || target?.username;
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="capitalize">{report.entity_type}</Badge>
        <span className="font-semibold">{heading}</span>
        {actor && <span className="text-sm text-muted-foreground">by @{actor}</span>}
      </div>
      {(report.reporter_name || report.reporter_username) && <p className="text-sm text-muted-foreground">Reported by {report.reporter_name || `@${report.reporter_username}`} {report.reporter_username && report.reporter_name ? `(@${report.reporter_username})` : ''}</p>}
      {report.description && <p className="text-sm"><span className="font-medium">Reporter details:</span> {report.description}</p>}
      {!target ? (
        <p className="text-sm text-muted-foreground">The original item is no longer available. The report record remains for audit purposes.</p>
      ) : (
        <>
          {body && <p className="whitespace-pre-wrap text-sm leading-6">{body}</p>}
          {report.entity_type === 'event' && <p className="text-sm text-muted-foreground">{target.location}{target.starts_at ? ` · ${format(new Date(target.starts_at), 'MMM d, yyyy HH:mm')}` : ''}</p>}
          {report.entity_type === 'message' && <p className="text-xs text-muted-foreground">Message sent {target.created_at ? format(new Date(target.created_at), 'MMM d, yyyy HH:mm') : '—'}</p>}
          {detail?.media?.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {detail.media.map((media: any) => <ReportMedia key={media.id} reportId={report.id} media={media} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReportMedia({ reportId, media }: { reportId: string; media: any }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const token = sessionStorage.getItem('admin_token');
    fetch(`${BASE_URL}/v1/admin/reports/${reportId}/media/${media.id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('Media unavailable');
      return URL.createObjectURL(await response.blob());
    }).then(setUrl).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [media.id, reportId]);
  if (failed) return <div className="rounded border p-3 text-xs text-muted-foreground">Protected media unavailable.</div>;
  if (!url) return <div className="h-36 animate-pulse rounded bg-muted" />;
  return media.mime_type?.startsWith('video/')
    ? <video className="max-h-80 w-full rounded-md bg-black" controls src={url} />
    : <img className="max-h-80 w-full rounded-md object-contain bg-muted" src={url} alt="Reported media" />;
}
