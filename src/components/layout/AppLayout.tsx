import { ReactNode, useEffect } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { useUserStore } from '@/stores/useUserStore';
import { useUIChromeStore } from '@/stores/useUIChromeStore';
import { useGlobalChatRealtime } from '@/features/chat/hooks/useGlobalChatRealtime';
import { usePresence } from '@/features/chat/hooks/usePresence';
import { useProjectMembershipRealtime, useConversationMembershipRealtime } from '@/hooks/useWorkspaceMembershipRealtime';
import { useOrganization } from '@/contexts/OrganizationContext';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';

interface AppLayoutProps {
  children: ReactNode;
  noPadding?: boolean;
}

export function AppLayout({ children, noPadding }: AppLayoutProps) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const preferences = useUserStore((s) => s.preferences);
  const updatePreferences = useUserStore((s) => s.updatePreferences);
  const hideAppHeaderFlag = useUIChromeStore((s) => s.hideAppHeader);
  const { currentOrganization } = useOrganization();

  const { user } = useAuth();

  // Initialize global chat notifications and presence
  useGlobalChatRealtime();
  usePresence(user?.id);
  useProjectMembershipRealtime();
  useConversationMembershipRealtime();

  // Inside the app shell `main` is the only scroll container. Without this the
  // document scrolls too — the shell is 100vh, but anything that overflows it
  // grows the page — and the two scrollbars end up stacked at the right edge
  // (most visible on long pages like Projects in list view).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('app-shell-locked');
    return () => root.classList.remove('app-shell-locked');
  }, []);

  // Apply compact mode class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (preferences.compactMode) {
      root.classList.add('compact');
    } else {
      root.classList.remove('compact');
    }
  }, [preferences.compactMode]);

  const isConversationRoute = /^\/chat\/[^/]+/.test(location.pathname);
  // The assistant page builds its own ChatGPT-style header + drawer nav on
  // mobile (see Assistant.tsx) — the global chrome would just duplicate it.
  const isAssistantRoute = location.pathname.startsWith('/assistant');
  const showAppHeader = !(isMobile && (isConversationRoute || isAssistantRoute || hideAppHeaderFlag));
  const showMobileBottomNav = isMobile && !isConversationRoute && !isAssistantRoute;

  return (
    <SidebarProvider
      defaultOpen={!preferences.sidebarCollapsed}
      className="w-full max-w-full h-screen max-h-screen overflow-hidden"
    >
      <div className="h-screen flex w-full max-w-full bg-background overflow-hidden">
        {/* Sidebar hidden on mobile */}
        {!isMobile && <AppSidebar />}
        <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 w-full max-w-full overflow-hidden">
          {showAppHeader && <AppHeader />}

          {/* Persistent warning banner whenever the selected organization is closed.
              Reachable for a multi-org member who switches to a closed org — the
              API refuses every request for it, so without this the workspace just
              fails silently. */}
          {currentOrganization?.status === 'suspended' && (
            <div className="bg-destructive/15 border-b border-destructive/30 px-4 py-2 text-xs sm:text-sm text-destructive flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                <span>
                  <strong>{currentOrganization.name}</strong> is currently suspended
                  {currentOrganization.suspendedReason ? `: ${currentOrganization.suspendedReason}` : ''}.
                  Workspace access is restricted.
                </span>
              </div>
            </div>
          )}

          {currentOrganization?.status === 'pending_review' && (
            <div className="bg-yellow-500/15 border-b border-yellow-500/30 px-4 py-2 text-xs sm:text-sm text-yellow-700 dark:text-yellow-500 flex items-center gap-2 shrink-0">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="font-medium">
                <strong>{currentOrganization.name}</strong> is awaiting admin approval.
                Workspace access is restricted until it is approved.
              </span>
            </div>
          )}

          {currentOrganization?.status === 'rejected' && (
            <div className="bg-destructive/15 border-b border-destructive/30 px-4 py-2 text-xs sm:text-sm text-destructive flex items-center gap-2 shrink-0">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
              <span className="font-medium">
                <strong>{currentOrganization.name}</strong> was not approved
                {currentOrganization.rejectedReason ? `: ${currentOrganization.rejectedReason}` : ''}.
                Contact support to have it reviewed again.
              </span>
            </div>
          )}

          <main
            className={[
              noPadding
                ? `flex-1 min-h-0 overflow-hidden w-full max-w-full ${showMobileBottomNav ? 'pb-24' : ''}`
                : `flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full max-w-full ${isMobile ? `overflow-x-hidden px-4 pt-4 ${showMobileBottomNav ? 'pb-24' : 'pb-4'}` : 'p-4'}`,
            ].join(' ')}
          >
            {children}
          </main>
        </div>
      </div>
      {/* Mobile bottom navigation */}
      {showMobileBottomNav && <MobileBottomNav />}
    </SidebarProvider>
  );
}

