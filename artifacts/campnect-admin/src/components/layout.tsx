import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { LayoutDashboard, Users, ShieldAlert, FileText, Scale, BadgeCheck, Activity, Settings, LogOut, Loader2, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const { user, isLoading, isAuthenticated } = useAuth();
  const logout = useLogout();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated && location !== '/login') {
    return null;
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard:read' },
    { href: '/accounts', label: 'Accounts', icon: Users, perm: 'users:read' },
    { href: '/reports', label: 'Reports', icon: ShieldAlert, perm: 'reports:read' },
    { href: '/content', label: 'Content', icon: FileText, perm: 'content:read' },
    { href: '/appeals', label: 'Appeals', icon: Scale, perm: 'appeals:read' },
    { href: '/cases', label: 'Review Cases', icon: ClipboardCheck, perm: 'cases:read' },
    { href: '/verifications', label: 'Verifications', icon: BadgeCheck, perm: 'verifications:read' },
    { href: '/logs', label: 'Audit Logs', icon: Activity, perm: 'audit:read' },
    { href: '/system', label: 'System', icon: Settings, perm: 'system:read' },
  ];

  const visibleItems = navItems.filter((item) => {
    if (!user?.permissions) return true;
    return user.permissions.includes('*') || user.permissions.includes('admin') || user.permissions.includes(item.perm);
  });

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col hidden md:flex fixed h-full z-10">
        <div className="h-14 flex items-center px-6 border-b border-sidebar-border">
          <div className="font-display font-bold text-white tracking-tight flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#BBFF00]" />
            Campnect Admin
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
          {visibleItems.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-sidebar-active text-white border-l-2 border-sidebar-active-border pl-2.5" 
                    : "text-sidebar-foreground hover:bg-sidebar-active/50 hover:text-white"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-sidebar-active flex items-center justify-center text-white font-medium text-xs">
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.name}</div>
              <div className="text-xs text-sidebar-foreground truncate">{user?.role}</div>
            </div>
          </div>
          <button 
            onClick={logout}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm font-medium text-sidebar-foreground hover:text-white hover:bg-sidebar-active/50 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 flex flex-col min-h-0">
        <header className="h-14 bg-card border-b flex items-center px-6 md:hidden">
          <div className="font-display font-bold tracking-tight">Campnect Admin</div>
        </header>
        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
