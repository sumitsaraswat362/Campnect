import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { useAccounts, useCollegeVerification, useReviewVerification, useUpdateUsername, useVerificationRequests, VerificationRequest } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function Verifications() {
  const { user } = useAuth();
  const canReview = user?.permissions.includes('verifications.review') ?? false;
  const canManageUsers = user?.permissions.includes('users.manage') ?? false;
  const verificationQuery = useVerificationRequests();
  const verificationRequests = verificationQuery.data ?? [];
  const reviewMutation = useReviewVerification();
  const usernameMutation = useUpdateUsername();
  const collegeVerificationMutation = useCollegeVerification();
  const [verification, setVerification] = useState<VerificationRequest | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewNotes, setReviewNotes] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [usernameTarget, setUsernameTarget] = useState<{ id: string; username: string } | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [usernameReason, setUsernameReason] = useState('');
  const [badgeTarget, setBadgeTarget] = useState<{ id: string; username: string; verified: boolean } | null>(null);
  const [badgeReason, setBadgeReason] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(userSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [userSearch]);
  const accountsQuery = useAccounts({ q: debouncedSearch, page: 1, limit: 20 });
  const accounts = accountsQuery.data?.data ?? [];

  const openReview = (request: VerificationRequest, status: 'approved' | 'rejected') => {
    setVerification(request);
    setDecision(status);
    setReviewNotes('');
  };
  const submitReview = async () => {
    if (!verification || (decision === 'rejected' && !reviewNotes.trim())) return;
    await reviewMutation.mutateAsync({ id: verification.id, status: decision, review_notes: reviewNotes.trim() || undefined });
    setVerification(null);
  };
  const submitUsername = async () => {
    if (!usernameTarget || !newUsername.trim() || !usernameReason.trim()) return;
    await usernameMutation.mutateAsync({ id: usernameTarget.id, username: newUsername.trim(), reason: usernameReason.trim() });
    setUsernameTarget(null);
  };
  const openUsernameEditor = (id: string, username: string) => {
    setUsernameTarget({ id, username });
    setNewUsername(username);
    setUsernameReason('');
  };
  const submitBadgeChange = async () => {
    if (!badgeTarget || !badgeReason.trim()) return;
    await collegeVerificationMutation.mutateAsync({ id: badgeTarget.id, verified: !badgeTarget.verified, reason: badgeReason.trim() });
    setBadgeTarget(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Verifications</h1>
        <p className="mt-1 text-muted-foreground">Review verification requests and manage usernames from live administrative data.</p>
      </div>
      <Tabs defaultValue="requests">
        <TabsList><TabsTrigger value="requests">Verification Requests</TabsTrigger><TabsTrigger value="users">User Directory</TabsTrigger></TabsList>
        <TabsContent value="requests" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Pending Requests</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!canReview ? <PermissionNotice permission="verifications.review" /> : verificationQuery.isLoading ? <LoadingRow /> : verificationQuery.error ? (
                <p className="p-6 text-sm text-destructive">Failed to load verification requests: {verificationQuery.error.message}</p>
              ) : verificationRequests.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No pending verification requests.</p>
              ) : (
                <Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Type</TableHead><TableHead>Submitted</TableHead><TableHead className="text-right">Review</TableHead></TableRow></TableHeader>
                  <TableBody>{verificationRequests.map((request) => <TableRow key={request.id}>
                    <TableCell><div className="font-medium">{request.username || request.full_name || request.user_id}</div>{request.username && <div className="text-xs text-muted-foreground">{request.full_name}</div>}</TableCell>
                    <TableCell className="capitalize">{request.verification_type || 'Verification'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{request.submitted_at || request.created_at ? format(new Date(request.submitted_at || request.created_at!), 'MMM d, yyyy HH:mm') : '—'}</TableCell>
                    <TableCell className="space-x-2 text-right"><Button size="sm" onClick={() => openReview(request, 'approved')}>Approve</Button><Button size="sm" variant="destructive" onClick={() => openReview(request, 'rejected')}>Reject</Button></TableCell>
                  </TableRow>)}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader><CardTitle>User Directory</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search users by username, name, or email" aria-label="Search user directory" />
              {!canManageUsers ? <PermissionNotice permission="users.manage" /> : accountsQuery.isLoading ? <LoadingRow /> : accountsQuery.error ? (
                <p className="text-sm text-destructive">Failed to search users: {accountsQuery.error.message}</p>
              ) : accounts.length === 0 ? <p className="text-sm text-muted-foreground">No users found.</p> : (
                <Table><TableHeader><TableRow><TableHead>Username</TableHead><TableHead>Name</TableHead><TableHead>Verified badge</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>{accounts.map((account) => <TableRow key={account.id}><TableCell className="font-medium">{account.username}</TableCell><TableCell>{account.full_name || '—'}</TableCell><TableCell>{account.is_college_verified ? 'Verified' : 'Not verified'}</TableCell><TableCell><Button variant="link" size="sm" asChild><Link href={`/accounts/${account.id}`}>Open</Link></Button></TableCell><TableCell className="space-x-2 text-right"><Button size="sm" variant="outline" onClick={() => openUsernameEditor(account.id, account.username)}>Edit username</Button><Button size="sm" variant={account.is_college_verified ? 'destructive' : 'default'} onClick={() => { setBadgeTarget({ id: account.id, username: account.username, verified: Boolean(account.is_college_verified) }); setBadgeReason(''); }}>{account.is_college_verified ? 'Remove verified badge' : 'Verify'}</Button></TableCell></TableRow>)}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <ReviewDialog open={Boolean(verification)} decision={decision} notes={reviewNotes} pending={reviewMutation.isPending} error={reviewMutation.error?.message} onNotes={setReviewNotes} onCancel={() => setVerification(null)} onSubmit={submitReview} />
      <UsernameDialog open={Boolean(usernameTarget)} username={newUsername} reason={usernameReason} pending={usernameMutation.isPending} error={usernameMutation.error?.message} onUsername={setNewUsername} onReason={setUsernameReason} onCancel={() => setUsernameTarget(null)} onSubmit={submitUsername} />
      <BadgeDialog open={Boolean(badgeTarget)} target={badgeTarget} reason={badgeReason} pending={collegeVerificationMutation.isPending} error={collegeVerificationMutation.error?.message} onReason={setBadgeReason} onCancel={() => setBadgeTarget(null)} onSubmit={submitBadgeChange} />
    </div>
  );
}

function PermissionNotice({ permission }: { permission: string }) {
  return <p className="p-6 text-sm text-muted-foreground">Your role does not include <span className="font-mono">{permission}</span>, so this action is unavailable.</p>;
}

function LoadingRow() {
  return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
}

function ReviewDialog({ open, decision, notes, pending, error, onNotes, onCancel, onSubmit }: { open: boolean; decision: 'approved' | 'rejected'; notes: string; pending: boolean; error?: string; onNotes: (value: string) => void; onCancel: () => void; onSubmit: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{decision === 'approved' ? 'Approve' : 'Reject'} verification</DialogTitle>
          <DialogDescription>Verification documents are not displayed here.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="verification-notes">Review notes {decision === 'rejected' ? '(required)' : '(optional)'}</Label>
          <Textarea id="verification-notes" value={notes} onChange={(event) => onNotes(event.target.value)} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button onClick={onSubmit} disabled={pending || (decision === 'rejected' && !notes.trim())}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsernameDialog({ open, username, reason, pending, error, onUsername, onReason, onCancel, onSubmit }: { open: boolean; username: string; reason: string; pending: boolean; error?: string; onUsername: (value: string) => void; onReason: (value: string) => void; onCancel: () => void; onSubmit: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit username</DialogTitle>
          <DialogDescription>Changing a username is recorded in the audit log and notifies the user.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={username} onChange={(event) => onUsername(event.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username-reason">Reason (required)</Label>
            <Textarea id="username-reason" value={reason} onChange={(event) => onReason(event.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button onClick={onSubmit} disabled={pending || !username.trim() || !reason.trim()}>Save username</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BadgeDialog({ open, target, reason, pending, error, onReason, onCancel, onSubmit }: { open: boolean; target: { username: string; verified: boolean } | null; reason: string; pending: boolean; error?: string; onReason: (value: string) => void; onCancel: () => void; onSubmit: () => void }) {
  const action = target?.verified ? 'Remove verified badge' : 'Verify user';
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action}</DialogTitle>
          <DialogDescription>{action} for {target?.username}. A reason is required for the audit log.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="badge-reason">Reason (required)</Label>
          <Textarea id="badge-reason" value={reason} onChange={(event) => onReason(event.target.value)} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button variant={target?.verified ? 'destructive' : 'default'} onClick={onSubmit} disabled={pending || !reason.trim()}>{action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}