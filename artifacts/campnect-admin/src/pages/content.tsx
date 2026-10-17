import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useAccount, useAccounts, useContentModeration, useUpdateContentModeration, ContentModItem } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { apiFetch, BASE_URL } from '@/lib/api';

interface PostReview {
  id: string;
  type: string;
  content: string;
  created_at: string;
  visibility: string;
  moderation_status: string;
  media: { id: string; mime_type: string }[];
  moderation?: { status: string; is_hidden: number; reason: string };
}

export default function Content() {
  const { data: content, isLoading, error } = useContentModeration();
  const updateContent = useUpdateContentModeration();

  const [selectedItem, setSelectedItem] = useState<ContentModItem | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('post');
    if (id) setSelectedItem({ id, type: 'post', created_at: '' });
  }, []);
  const [reason, setReason] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [submitError, setSubmitError] = useState('');
  const postId = selectedItem && (selectedItem.type || selectedItem.content_type) === 'post' ? selectedItem.id : '';
  const postQuery = useQuery<PostReview>({
    queryKey: ['admin-post', postId],
    queryFn: () => apiFetch(`/v1/admin/content/post/${encodeURIComponent(postId)}`),
    enabled: Boolean(postId),
  });
  const [userSearch, setUserSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(userSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [userSearch]);
  const usersQuery = useAccounts({ q: debouncedSearch, page: 1, limit: 10 });
  const userContentQuery = useAccount(selectedUserId);
  const users = usersQuery.data?.data ?? [];
  const userContent = userContentQuery.data;

  const handleReview = (item: ContentModItem) => {
    setSelectedItem(item);
    setReason('');
    setSelectedAction('');
    setSubmitError('');
  };

  const handleSubmit = async () => {
    if (!selectedItem || !selectedAction || !reason.trim()) return;
    
    setSubmitError('');
    try {
      await updateContent.mutateAsync({
        id: selectedItem.id,
        contentType: selectedItem.type || selectedItem.content_type || 'post',
        action: selectedAction,
        reason: reason.trim()
      });
      setSelectedItem(null);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not save the moderation action.');
    }
  };

  const getAvailableActions = (item: ContentModItem) => {
    const isDeleted = (postQuery.data?.moderation?.status || item.status) === 'deleted';
    const isHidden = Boolean(postQuery.data?.moderation?.is_hidden);
    
    const actions = [];
    
    if (isDeleted) {
      actions.push({ value: 'restore', label: 'Restore' });
    } else {
      actions.push({ value: 'delete', label: 'Delete' });
      if (isHidden) {
        actions.push({ value: 'unhide', label: 'Unhide' });
      } else {
        actions.push({ value: 'hide', label: 'Hide' });
      }
    }
    
    actions.push({ value: 'flag', label: 'Flag' });
    actions.push({ value: 'unflag', label: 'Unflag' });
    actions.push({ value: 'age_restrict', label: 'Age Restrict' });
    actions.push({ value: 'sensitive_flag', label: 'Mark Sensitive' });
    actions.push({ value: 'note', label: 'Add Note Only' });
    
    return actions;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Content Moderation</h1>
        <p className="text-muted-foreground mt-1">Review flagged posts, comments, and community content.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Content Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-8 text-center text-destructive">Failed to load content moderation queue.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : !content?.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No pending content moderation items.
                    </TableCell>
                  </TableRow>
                ) : (
                  content.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{item.type || item.content_type || 'content'}</Badge>
                      </TableCell>
                      <TableCell className="font-medium text-sm truncate max-w-xs">{item.content || 'Hidden/Media'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(item.created_at || Date.now()), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleReview({ ...item, id: item.content_id || item.id, type: item.content_type || item.type || 'post' })}>
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Browse User Content</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">Search the live user directory, then select an account to review its posts, comments, and events.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search users by username, name, or email" aria-label="Search users" />
          {usersQuery.isLoading ? (
            <div className="py-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : usersQuery.error ? (
            <p className="text-sm text-destructive">Failed to search users: {usersQuery.error.message}</p>
          ) : debouncedSearch && users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found for this search.</p>
          ) : users.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {users.map((user) => (
                <Button key={user.id} type="button" variant={selectedUserId === user.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedUserId(user.id)}>
                  {user.username || user.full_name || user.id}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Enter a search term to browse user content.</p>
          )}

          {selectedUserId && (
            <div className="border-t pt-4">
              {userContentQuery.isLoading ? (
                <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : userContentQuery.error || !userContent?.user ? (
                <p className="py-4 text-sm text-destructive">Failed to load this user's content.</p>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div><p className="font-medium">{userContent.user.username}</p><p className="text-sm text-muted-foreground">{userContent.user.full_name}</p></div>
                    <Button variant="outline" size="sm" asChild><Link href={`/accounts/${userContent.user.id}`}>Open account</Link></Button>
                  </div>
                   <UserContentTable title="Posts" items={userContent.posts ?? []} onReview={(item) => handleReview({ ...item, id: String(item.id), created_at: String(item.created_at || ''), type: 'post' })} />
                   <UserContentTable title="Comments" items={userContent.comments ?? []} onReview={(item) => handleReview({ ...item, id: String(item.id), created_at: String(item.created_at || ''), type: 'comment' })} />
                   <UserContentTable title="Events" items={userContent.events ?? []} onReview={(item) => handleReview({ ...item, id: String(item.id), created_at: String(item.created_at || ''), type: 'event' })} />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
         <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Content</DialogTitle>
            <DialogDescription>
              Select an action and provide a reason for the audit log.
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 py-4">
               {postId && (postQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading post…</p> : postQuery.error ? <p className="text-sm text-destructive">Could not load post: {postQuery.error.message}</p> : null)}
               {postQuery.data && postId && (
                 <div className="text-xs text-muted-foreground">
                   {postQuery.data.type} · {postQuery.data.visibility} · {postQuery.data.moderation_status}
                   {postQuery.data.moderation?.reason && <p className="mt-1">Previous action: {postQuery.data.moderation.reason}</p>}
                 </div>
               )}
              <div className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
                 {postId && postQuery.data ? postQuery.data.content || 'Media-only post (no caption).' : selectedItem.content || selectedItem.body || selectedItem.title || 'No text content.'}
              </div>
               {postId && postQuery.data?.media?.length ? (
                 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                   {postQuery.data.media.map((media) => <PostMedia key={media.id} postId={postId} media={media} />)}
                 </div>
               ) : null}
              
              <div className="space-y-2">
                <Label>Action</Label>
                <div className="flex flex-wrap gap-2">
                  {getAvailableActions(selectedItem).map((action) => (
                    <Button 
                      key={action.value}
                      type="button"
                      variant={selectedAction === action.value ? 'default' : 'outline'} 
                      onClick={() => setSelectedAction(action.value)}
                      size="sm"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
               {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason (Required)</Label>
                <Textarea 
                  id="reason" 
                  value={reason} 
                  onChange={(e) => setReason(e.target.value)} 
                  placeholder="Explain the decision..." 
                  required 
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedItem(null)} disabled={updateContent.isPending}>Cancel</Button>
             <Button onClick={handleSubmit} disabled={updateContent.isPending || (Boolean(postId) && !postQuery.data) || !reason.trim() || !selectedAction}>
              {updateContent.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserContentTable({ title, items, onReview }: { title: string; items: Record<string, any>[]; onReview: (item: Record<string, any>) => void }) {
  return (
    <div>
      <h3 className="mb-2 font-medium">{title}</h3>
      {items.length === 0 ? <p className="rounded-md border p-3 text-sm text-muted-foreground">No {title.toLowerCase()} for this user.</p> : (
        <Table>
           <TableHeader><TableRow><TableHead>Content</TableHead><TableHead>Created</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
          <TableBody>{items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-md truncate">{item.content || item.body || item.caption || item.title || item.name || 'Media or untitled content'}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{item.created_at ? format(new Date(item.created_at), 'MMM d, yyyy HH:mm') : '—'}</TableCell>
               <TableCell><Badge variant="outline" className="capitalize">{item.moderation_status && item.moderation_status !== 'approved' ? item.moderation_status : item.status || item.visibility || '—'}</Badge></TableCell>
               <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => onReview(item)}>View & review</Button></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
    </div>
  );
}

function PostMedia({ postId, media }: { postId: string; media: { id: string; mime_type: string } }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    const token = sessionStorage.getItem('admin_token');
    fetch(`${BASE_URL}/v1/admin/content/post/${encodeURIComponent(postId)}/media/${encodeURIComponent(media.id)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Media unavailable (${response.status})`);
      objectUrl = URL.createObjectURL(await response.blob());
      if (!controller.signal.aborted) setUrl(objectUrl);
    }).catch((err) => { if (!controller.signal.aborted) setError(err.message || 'Media unavailable'); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [postId, media.id]);
  if (error) return <div className="rounded border p-3 text-xs text-destructive">{error}</div>;
  if (!url) return <div className="h-36 animate-pulse rounded bg-muted" aria-label="Loading media" />;
  return media.mime_type.startsWith('video/')
    ? <video controls className="max-h-80 w-full rounded bg-black" src={url} />
    : <img className="max-h-80 w-full rounded object-contain bg-muted" src={url} alt="Post attachment" />;
}
