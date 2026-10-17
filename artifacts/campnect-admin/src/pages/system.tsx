import { useState, useEffect } from 'react';
import { useSystemHealth, useMaintenanceStatus, useSetMaintenance, useAppUpdateStatus, useSetAppUpdate } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Activity, Database, Server, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

function MaintenanceControl() {
  const { data: maintenance, isLoading } = useMaintenanceStatus();
  const setMaintenance = useSetMaintenance();
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (maintenance) setMessage(maintenance.message || '');
  }, [maintenance?.updatedAt]);

  const enabled = Boolean(maintenance?.enabled);

  return (
    <Card className={enabled ? 'border-amber-400' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Maintenance Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          When enabled, every client (web and the Android app) is instantly blocked from using
          Campnect and shown the message below instead — no app update or republish needed to
          turn it on or off.
        </p>

        {isLoading ? (
          <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <Badge variant={enabled ? 'destructive' : 'success'}>
                {enabled ? 'App is DOWN for maintenance' : 'App is live'}
              </Badge>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Message shown to users</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="We're performing scheduled maintenance. We'll be back shortly."
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              {!enabled ? (
                <Button
                  variant="destructive"
                  disabled={setMaintenance.isPending}
                  onClick={() => setMaintenance.mutate({ enabled: true, message, reason: 'Enabled maintenance mode from System Status page' })}
                >
                  {setMaintenance.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Enable maintenance mode
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={setMaintenance.isPending}
                  onClick={() => setMaintenance.mutate({ enabled: false, message, reason: 'Disabled maintenance mode from System Status page' })}
                >
                  {setMaintenance.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Disable maintenance mode
                </Button>
              )}
              {enabled && (
                <Button
                  variant="secondary"
                  disabled={setMaintenance.isPending || message === maintenance?.message}
                  onClick={() => setMaintenance.mutate({ enabled: true, message, reason: 'Updated maintenance message' })}
                >
                  Update message
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AppUpdateControl() {
  const { data: update, isLoading } = useAppUpdateStatus();
  const setUpdate = useSetAppUpdate();
  const [mode, setMode] = useState<'soft' | 'force'>('soft');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [storeUrl, setStoreUrl] = useState('https://play.google.com/store/apps/details?id=com.campnect.app');
  const [minimumVersionCode, setMinimumVersionCode] = useState(14);

  useEffect(() => {
    if (!update) return;
    setMode(update.mode);
    setTitle(update.title);
    setMessage(update.message);
    setStoreUrl(update.storeUrl);
    setMinimumVersionCode(update.minimumVersionCode || 14);
  }, [update?.updatedAt]);

  const enabled = Boolean(update?.enabled);
  const save = (nextEnabled: boolean) => setUpdate.mutate({
    enabled: nextEnabled, mode, title, message, storeUrl, minimumVersionCode,
    reason: nextEnabled ? `Enabled ${mode} app update notice from System Status page` : 'Disabled app update notice from System Status page',
  });

  return (
    <Card className={enabled && mode === 'force' ? 'border-red-400' : enabled ? 'border-blue-400' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-blue-600" />
          App Update Notice
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Only Android devices below the required version code see this notice. Soft updates can be dismissed; force updates block the app until the user chooses Update now.
        </p>
        {isLoading ? (
          <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <Badge variant={enabled ? mode === 'force' ? 'destructive' : 'default' : 'success'}>
                {enabled ? `${mode === 'force' ? 'Force' : 'Soft'} update is live` : 'No update notice'}
              </Badge>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Update type</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                {(['soft', 'force'] as const).map((value) => (
                  <label key={value} className="flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-3">
                    <input type="radio" name="update-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1" />
                    <span><strong className="block text-sm capitalize">{value} update</strong><span className="text-xs text-muted-foreground">{value === 'soft' ? 'Users can select Update later and continue.' : 'Users must select Update now before continuing.'}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="A new version of Campnect is ready" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Message</label>
              <Textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} rows={3} placeholder="Update now for the latest features and improvements." />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Required Android version code</label>
              <Input value={minimumVersionCode} onChange={(event) => setMinimumVersionCode(Number(event.target.value))} type="number" min={1} step={1} />
              <p className="text-xs text-muted-foreground">Users on a lower code will be prompted. This AAB is version code 14, so enable this only once code 14 is live on Google Play.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Google Play Store URL</label>
              <Input value={storeUrl} onChange={(event) => setStoreUrl(event.target.value)} type="url" placeholder="https://play.google.com/store/apps/details?id=com.campnect.app" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={setUpdate.isPending} onClick={() => save(!enabled)} variant={enabled ? 'outline' : mode === 'force' ? 'destructive' : 'default'}>
                {setUpdate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {enabled ? 'Disable update notice' : `Enable ${mode} update`}
              </Button>
              <Button variant="secondary" disabled={setUpdate.isPending || (!enabled && !update) } onClick={() => save(enabled)}>
                Save notice
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function System() {
  const { data: health, isLoading, refetch } = useSystemHealth();
  const qc = useQueryClient();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">System Status</h1>
          <p className="text-muted-foreground mt-1">Platform health and configuration.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <MaintenanceControl />
      <AppUpdateControl />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex flex-col items-center text-center">
            <div className={`p-3 rounded-full mb-4 ${health?.status === 'ok' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
              <Activity className="h-6 w-6" />
            </div>
            <h3 className="font-semibold mb-1">API Services</h3>
            <Badge variant={health?.status === 'ok' ? 'success' : 'warning'}>
              {isLoading ? 'Checking...' : health?.status === 'ok' ? 'Operational' : 'Degraded'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 flex flex-col items-center text-center">
            <div className="p-3 rounded-full mb-4 bg-emerald-100 text-emerald-600">
              <Database className="h-6 w-6" />
            </div>
            <h3 className="font-semibold mb-1">Database</h3>
            <Badge variant="success">Operational</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 flex flex-col items-center text-center">
            <div className="p-3 rounded-full mb-4 bg-emerald-100 text-emerald-600">
              <Server className="h-6 w-6" />
            </div>
            <h3 className="font-semibold mb-1">Worker Nodes</h3>
            <Badge variant="success">Operational</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : health ? (
            <pre className="p-4 bg-muted rounded-lg text-xs font-mono overflow-auto">
              {JSON.stringify(health, null, 2)}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground">Information unavailable.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
