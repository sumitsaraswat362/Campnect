import { useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { useAccount, useAccountAction, usePermanentDeleteAccount, useShadowban } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2, ShieldBan, ShieldAlert, ShieldCheck, Mail, Calendar, Activity, AlertTriangle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data: accountData, isLoading, error } = useAccount(id!);
  const [actionModal, setActionModal] = useState<{ isOpen: boolean; type: string; title: string; desc: string } | null>(null);
  const [reason, setReason] = useState('');
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState('');
  
  const actionMutation = useAccountAction();
  const shadowbanMutation = useShadowban();
  const permanentDeleteMutation = usePermanentDeleteAccount();

  const handleAction = async () => {
    if (!actionModal) return;
    
    if (actionModal.type === 'shadowban' || actionModal.type === 'unshadowban') {
      await shadowbanMutation.mutateAsync({ 
        id: id!, 
        active: actionModal.type === 'shadowban',
        reason 
      });
    } else {
      await actionMutation.mutateAsync({ 
        id: id!, 
        action: actionModal.type, 
        reason 
      });
    }
    
    setActionModal(null);
    setReason('');
  };

  const openModal = (type: string, title: string, desc: string) => {
    setActionModal({ isOpen: true, type, title, desc });
    setReason('');
  };
  const handlePermanentDelete = async () => {
    if (!id || !accountData?.user) return;
    setDeleteError('');
    try {
      await permanentDeleteMutation.mutateAsync({
        id,
        confirmationUsername: deleteConfirmation,
        reason: deleteReason,
      });
      setLocation('/accounts');
    } catch (err: any) {
      setDeleteError(err?.message || 'This account could not be permanently deleted.');
    }
  };

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (error || !accountData || !accountData.user) return <div className="p-8 text-destructive">Error loading account details.</div>;

  const account = accountData.user;
  const skills = (() => {
    try {
      const parsed = JSON.parse(account.skills || '[]');
      return Array.isArray(parsed) ? parsed.filter((skill) => typeof skill === 'string' && skill.trim()) : [];
    } catch {
      return account.skills ? [account.skills] : [];
    }
  })();
  const relationshipStatus = account.relationship_status
    ? account.relationship_status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Not provided';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-full">
          <Link href="/accounts"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-3">
            {account.username}
            {account.verification_status === 'verified' && (
              <Badge variant="success" className="text-xs">Verified</Badge>
            )}
            {account.is_banned && <Badge variant="destructive">Banned</Badge>}
            {account.is_suspended && <Badge variant="warning">Suspended</Badge>}
            {account.is_shadowbanned && <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">Shadowbanned</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">{account.id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-muted overflow-hidden border shrink-0">
                    {account.avatar_url ? (
                      <img src={account.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xl font-medium">
                        {account.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Full Name</div>
                    <div className="font-medium">{account.full_name || 'Not provided'}</div>
                    <div className="mt-3 text-sm font-medium text-muted-foreground">Username</div>
                    <div className="font-medium">@{account.username || 'Not provided'}</div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{account.email}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Joined {format(new Date(account.created_at), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Last seen {format(new Date(account.last_seen), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              </div>
                <div className="border-t pt-5 space-y-5">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Bio</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{account.bio || 'Not provided'}</p>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Skills</div>
                    {skills.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {skills.map((skill: string) => <Badge key={skill} variant="secondary">{skill}</Badge>)}
                      </div>
                    ) : <p className="mt-1 text-sm">Not provided</p>}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Relationship Status</div>
                    <p className="mt-1 text-sm">{relationshipStatus}</p>
                  </div>
                </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-2xl font-bold font-mono">{account.posts_count}</div>
                  <div className="text-xs text-muted-foreground mt-1">Posts</div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-2xl font-bold font-mono">{account.followers_count}</div>
                  <div className="text-xs text-muted-foreground mt-1">Followers</div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-2xl font-bold font-mono">{account.following_count}</div>
                  <div className="text-xs text-muted-foreground mt-1">Following</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-destructive/20 shadow-sm">
            <CardHeader className="bg-destructive/5 pb-4 border-b border-destructive/10">
              <CardTitle className="text-destructive flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4" /> Moderation Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-start text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                onClick={() => openModal('warn', 'Issue Warning', 'Send a formal warning to this user.')}
              >
                <AlertTriangle className="h-4 w-4 mr-2" /> Issue Warning
              </Button>
              
              {!account.is_suspended ? (
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                  onClick={() => openModal('suspend', 'Suspend Account', 'Temporarily disable access for this account.')}
                >
                  <ShieldBan className="h-4 w-4 mr-2" /> Suspend Account
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                  onClick={() => openModal('unsuspend', 'Lift Suspension', 'Restore access to this account.')}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" /> Lift Suspension
                </Button>
              )}

              {!account.is_shadowbanned ? (
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => openModal('shadowban', 'Apply Shadowban', 'Hide user content without notifying them.')}
                >
                  <ShieldBan className="h-4 w-4 mr-2" /> Apply Shadowban
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-emerald-600"
                  onClick={() => openModal('unshadowban', 'Remove Shadowban', 'Restore normal visibility for this user.')}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" /> Remove Shadowban
                </Button>
              )}
            </CardContent>
          </Card>
          <Card className="border-destructive/40 shadow-sm">
            <CardHeader className="bg-destructive/5 pb-4 border-b border-destructive/10">
              <CardTitle className="text-destructive flex items-center gap-2 text-base">
                <Trash2 className="h-4 w-4" /> Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="mb-3 text-sm text-muted-foreground">Permanently remove this account and its associated Campnect data. This cannot be undone.</p>
              <Button variant="destructive" className="w-full justify-start" onClick={() => {
                setDeleteConfirmation('');
                setDeleteReason('');
                setDeleteError('');
                setPermanentDeleteOpen(true);
              }}>
                <Trash2 className="mr-2 h-4 w-4" /> Permanently delete account
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!actionModal} onOpenChange={(open) => !open && setActionModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionModal?.title}</DialogTitle>
            <DialogDescription>{actionModal?.desc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Internal Audit Log)</Label>
              <Textarea 
                id="reason" 
                placeholder="Provide a detailed reason for this action..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionModal(null)}>Cancel</Button>
            <Button 
              variant="default"
              disabled={!reason.trim() || actionMutation.isPending || shadowbanMutation.isPending}
              onClick={handleAction}
            >
              {(actionMutation.isPending || shadowbanMutation.isPending) ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Confirm Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={permanentDeleteOpen} onOpenChange={setPermanentDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Permanently delete @{account.username}?</DialogTitle>
            <DialogDescription>
              This irreversibly deletes the account and its associated Campnect data. It cannot be restored. An Admin audit record will be retained.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="delete-username">Type @{account.username} to confirm</Label>
              <Textarea id="delete-username" rows={1} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-reason">Reason for permanent deletion</Label>
              <Textarea id="delete-reason" rows={3} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Required for the Admin audit record..." />
            </div>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermanentDeleteOpen(false)} disabled={permanentDeleteMutation.isPending}>Cancel</Button>
            <Button variant="destructive" disabled={deleteConfirmation.trim().toLowerCase() !== account.username.toLowerCase() || !deleteReason.trim() || permanentDeleteMutation.isPending} onClick={handlePermanentDelete}>
              {permanentDeleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Permanently delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}