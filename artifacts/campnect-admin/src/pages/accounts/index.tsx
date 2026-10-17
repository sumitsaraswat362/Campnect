import { useState } from 'react';
import { useAccounts } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, MoreVertical, ShieldBan, AlertTriangle } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';

export default function Accounts() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Use a simple timeout for debouncing search input
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search);
  };

  const { data, isLoading } = useAccounts({ q: debouncedSearch, limit: 50 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground mt-1">Search and manage user accounts.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="py-4">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search username, email, or ID..."
                className="pl-9"
                value={search}
                onChange={handleSearchChange}
              />
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Warnings</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : !data?.data?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No accounts found.
                  </TableCell>
                </TableRow>
              ) : (
                data.data.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden border">
                          {account.avatar_url ? (
                            <img src={account.avatar_url} alt={account.username} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs font-medium">{account.username.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-sm flex items-center gap-2">
                            {account.username}
                            {account.verification_status === 'verified' && (
                              <Badge variant="success" className="h-4 text-[10px] px-1">Verified</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{account.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {account.is_banned ? (
                          <Badge variant="destructive">Banned</Badge>
                        ) : account.is_suspended ? (
                          <Badge variant="warning">Suspended</Badge>
                        ) : account.is_shadowbanned ? (
                          <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">Shadowbanned</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {account.warnings_count > 0 ? (
                        <div className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          {account.warnings_count}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(account.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/accounts/${account.id}`}>View Details</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
