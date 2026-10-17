import { useDashboardSummary } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText, AlertTriangle, ShieldCheck, Activity, Search } from 'lucide-react';
import { Link } from 'wouter';

export default function Dashboard() {
  const { data, isLoading, error } = useDashboardSummary();

  if (isLoading) {
    return <div className="animate-pulse space-y-6">
      <div className="h-8 bg-muted rounded w-48"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl"></div>)}
      </div>
    </div>;
  }

  if (error || !data) {
    return <div className="p-4 bg-destructive/10 text-destructive rounded-md">Failed to load dashboard data.</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">Live operational data and queues.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.users.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.users.active_7d.toLocaleString()} active in last 7d
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified Accounts</CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.users.verified.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round((data.users.verified / Math.max(data.users.total, 1)) * 100)}% of user base
            </p>
          </CardContent>
        </Card>

        <Card className={data.queues.pending_reports > 0 ? "border-amber-200 bg-amber-50/50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reports</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${data.queues.pending_reports > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.queues.pending_reports.toLocaleString()}</div>
            <div className="mt-2">
              <Link href="/reports" className="text-xs font-medium text-primary hover:underline">
                Review queue →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Verifications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.queues.pending_verifications.toLocaleString()}</div>
            <div className="mt-2">
              <Link href="/verifications" className="text-xs font-medium text-primary hover:underline">
                Review requests →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Content Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Posts</span>
                </div>
                <span className="font-mono text-sm">{data.content.posts.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Communities</span>
                </div>
                <span className="font-mono text-sm">{data.content.communities.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Link href="/accounts" className="flex flex-col items-center justify-center gap-2 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <Search className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">Find Account</span>
              </Link>
              <Link href="/logs" className="flex flex-col items-center justify-center gap-2 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <Activity className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">Audit Logs</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
