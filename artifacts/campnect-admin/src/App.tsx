import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

import { AdminLayout } from '@/components/layout';
import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import Accounts from '@/pages/accounts/index';
import AccountDetail from '@/pages/accounts/detail';
import Reports from '@/pages/reports';
import Content from '@/pages/content';
import Appeals from '@/pages/appeals';
import Cases from '@/pages/cases';
import Verifications from '@/pages/verifications';
import Logs from '@/pages/logs';
import System from '@/pages/system';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  const [location, setLocation] = useLocation();
  const token = sessionStorage.getItem('admin_token');

  useEffect(() => {
    if (!token && location !== '/login') {
      setLocation('/login');
    }
  }, [token, location, setLocation]);

  if (!token) return null;

  return (
    <AdminLayout>
      <Component {...rest} />
    </AdminLayout>
  );
}

function RootRedirect() {
  const [_, setLocation] = useLocation();
  useEffect(() => { setLocation('/dashboard') }, [setLocation]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      {/* Protected Routes */}
      <Route path="/" component={RootRedirect} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/accounts" component={() => <ProtectedRoute component={Accounts} />} />
      <Route path="/accounts/:id" component={() => <ProtectedRoute component={AccountDetail} />} />
      <Route path="/reports" component={() => <ProtectedRoute component={Reports} />} />
      <Route path="/content" component={() => <ProtectedRoute component={Content} />} />
      <Route path="/appeals" component={() => <ProtectedRoute component={Appeals} />} />
      <Route path="/cases" component={() => <ProtectedRoute component={Cases} />} />
      <Route path="/verifications" component={() => <ProtectedRoute component={Verifications} />} />
      <Route path="/logs" component={() => <ProtectedRoute component={Logs} />} />
      <Route path="/system" component={() => <ProtectedRoute component={System} />} />
      
      <Route>
        {() => (
          <div className="flex h-screen w-full items-center justify-center bg-background">
            <div className="text-center space-y-4">
              <h1 className="text-4xl font-display font-bold">404</h1>
              <p className="text-muted-foreground">Page not found</p>
            </div>
          </div>
        )}
      </Route>
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RoutedErrorBoundary>
            <Router />
          </RoutedErrorBoundary>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
