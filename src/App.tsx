import { lazy, Suspense, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from "react-router-dom";
import { queryClient } from "@/lib/queryClient";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLayoutSkeleton } from "@/components/layout/AppLayoutSkeleton";
import { AppLayoutOutlet } from "@/components/layout/AppLayoutOutlet";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { useUserStore } from "@/stores/useUserStore";
import { ChatNotificationsProvider } from "@/features/chat/providers/ChatNotificationsProvider";
import { PushReconciliationProvider } from "@/features/notifications/providers/PushReconciliationProvider";
import { NotificationsToastProvider } from "@/features/notifications/providers/NotificationsToastProvider";
import { FeatureTogglesHydrationProvider } from "@/features/integrations/FeatureTogglesHydrationProvider";
import { AssistantWidget } from "@/features/assistant/components/AssistantWidget";
import { initializeGA, setUserId } from "@/services/analytics";
import { usePageTracking } from "@/hooks/usePageTracking";

// ── Auth module (new canonical location) ──────────────────────────────────────
import {
  AuthProvider,
  ProtectedRoute,
  GuestRoute,
  LoginPage,
  SignupPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
  JoinOrganizationPage,
} from "@/modules/auth";

// 404 — eagerly loaded (tiny, always needed)
import NotFound from "./pages/NotFound";
// import DebugDialogs from "./DebugDialogs";

// ── Feature routes — lazy loaded for code splitting ───────────────────────────
const Dashboard = lazy(() => import("./features/dashboard"));
const Assistant = lazy(() => import("./features/assistant"));
const MyDay = lazy(() => import("./features/myday"));
const Calendar = lazy(() => import("./features/calendar"));
const Projects = lazy(() => import("./features/projects"));
const ProjectDetail = lazy(() => import("./features/projects/ProjectDetail"));
const IssuePage = lazy(() => import("./features/projects/IssuePage"));
const NewProject = lazy(() => import("./features/projects/NewProject"));
const EditProject = lazy(() => import("./features/projects/EditProject"));
const ProjectDetailsPage = lazy(() => import("./features/projects/ProjectDetailsPage"));
const Team = lazy(() => import("./features/team"));
const Settings = lazy(() => import("./features/settings"));
const EditOrganizationSettings = lazy(() => import("./features/settings/EditOrganizationSettings"));
const Reports = lazy(() => import("./features/reports"));
const Notifications = lazy(() => import("./features/notifications"));
const Chat = lazy(() => import("./features/chat"));
const Integrations = lazy(() => import("./features/integrations"));
const Inventory = lazy(() => import("./features/inventory"));
const SharedConversation = lazy(() => import("./features/assistant/SharedConversation"));

// ── ReactQueryDevtools — dev only, lazy so it is never in the production bundle
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
    import("@tanstack/react-query-devtools").then((m) => ({
      default: m.ReactQueryDevtools,
    }))
  )
  : null;

// Normalizes legacy `/projects/:id?tab=X` links to the canonical `/projects/:id/X` path.
const PROJECT_SECTIONS = ['requirements', 'bom', 'eng-changes', 'tasks', 'modules', 'milestones', 'issues', 'gate-reviews', 'risk'];
function ProjectLegacyTabRedirect() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const target = tab && PROJECT_SECTIONS.includes(tab) ? tab : 'requirements';
  return <Navigate to={`/projects/${id}/${target}`} replace />;
}

// Standalone-page Suspense fallback — AppLayoutSkeleton's variants are all
// built for content rendering inside AppLayoutOutlet's app chrome, which
// public pages like /share/:shareId deliberately don't use.
function MinimalPageFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function AppShell() {
  usePageTracking();

  return (
    <>
      <ChatNotificationsProvider />
      <PushReconciliationProvider />
      <NotificationsToastProvider />
      <FeatureTogglesHydrationProvider />
      <AssistantWidget />
      <Routes>
        {/* ── Public (auth) routes ─────────────────────────────── */}
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/join-org" element={<JoinOrganizationPage />} />
        {/* <Route path="/debug-dialogs"   element={<DebugDialogs />} /> */}
        <Route
          path="/share/:shareId"
          element={
            <Suspense fallback={<MinimalPageFallback />}>
              <SharedConversation />
            </Suspense>
          }
        />

        {/* ── Protected routes ─────────────────────────────────── */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayoutOutlet />}>
            <Route
              path="/"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="dashboard" />}>
                  <Dashboard />
                </Suspense>
              }
            />
            <Route
              path="/projects"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="projects" />}>
                  <Projects />
                </Suspense>
              }
            />
            <Route
              path="/projects/new"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="detail" />}>
                  <NewProject />
                </Suspense>
              }
            />
            <Route
              path="/projects/:id"
              element={<ProjectLegacyTabRedirect />}
            />
            <Route
              path="/projects/:id/:tab"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="project-detail" />}>
                  <ProjectDetail />
                </Suspense>
              }
            />
            <Route
              path="/projects/:id/bom/:partId"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="project-detail" />}>
                  <ProjectDetail />
                </Suspense>
              }
            />
            <Route
              path="/projects/:id/requirements/:reqKey"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="project-detail" />}>
                  <ProjectDetail />
                </Suspense>
              }
            />
            <Route
              path="/projects/:id/eng-changes/:ecoId"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="project-detail" />}>
                  <ProjectDetail />
                </Suspense>
              }
            />
            <Route
              path="/projects/:id/tasks/:taskId"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="project-detail" />}>
                  <ProjectDetail />
                </Suspense>
              }
            />
            <Route
              path="/projects/:id/modules/:moduleId"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="project-detail" />}>
                  <ProjectDetail />
                </Suspense>
              }
            />
            <Route
              path="/projects/:id/milestones/:milestoneId"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="project-detail" />}>
                  <ProjectDetail />
                </Suspense>
              }
            />
            <Route
              path="/projects/:id/details"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="detail" />}>
                  <ProjectDetailsPage />
                </Suspense>
              }
            />
            <Route
              path="/projects/:id/edit"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="detail" />}>
                  <EditProject />
                </Suspense>
              }
            />
            <Route
              path="/projects/:id/issues/:issueId"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="project-detail" />}>
                  <ProjectDetail />
                </Suspense>
              }
            />
            <Route
              path="/projects/:projectId/issues/:issueId/full"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="detail" />}>
                  <IssuePage />
                </Suspense>
              }
            />
            <Route
              path="/settings"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="settings" />}>
                  <Settings />
                </Suspense>
              }
            />
            <Route
              path="/settings/organization/edit"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="detail" />}>
                  <EditOrganizationSettings />
                </Suspense>
              }
            />
            <Route
              path="/reports"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="reports" />}>
                  <Reports />
                </Suspense>
              }
            />
            <Route
              path="/notifications"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="notifications" />}>
                  <Notifications />
                </Suspense>
              }
            />
            <Route
              path="/integrations"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="default" />}>
                  <Integrations />
                </Suspense>
              }
            />
          </Route>

          {/* ── Routes without content padding ───────────────── */}
          <Route element={<AppLayoutOutlet noPadding />}>
            <Route
              path="/my-day"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="list" />}>
                  <MyDay />
                </Suspense>
              }
            />
            <Route
              path="/inventory"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="default" />}>
                  <Inventory />
                </Suspense>
              }
            />
          </Route>

          {/* ── Routes without content padding ───────────────── */}
          <Route element={<AppLayoutOutlet noPadding />}>
            <Route
              path="/team"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="team" />}>
                  <Team />
                </Suspense>
              }
            />
            <Route
              path="/assistant"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="default" />}>
                  <Assistant />
                </Suspense>
              }
            />
            <Route
              path="/assistant/:conversationId"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="default" />}>
                  <Assistant />
                </Suspense>
              }
            />
            <Route
              path="/calendar"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="calendar" />}>
                  <Calendar />
                </Suspense>
              }
            />
            <Route
              path="/chat"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="chat" />}>
                  <Chat />
                </Suspense>
              }
            />
            <Route
              path="/chat/:conversationId"
              element={
                <Suspense fallback={<AppLayoutSkeleton variant="chat" />}>
                  <Chat />
                </Suspense>
              }
            />
          </Route>
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => {
  const storedTheme = useUserStore.getState().preferences.theme;

  useEffect(() => {
    initializeGA();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme={storedTheme} enableSystem disableTransitionOnChange>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <OrganizationProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <AppShell />
                </BrowserRouter>

                {/* Dev tools — zero production bundle impact via lazy + null guard */}
                {ReactQueryDevtools && (
                  <Suspense fallback={null}>
                    <ReactQueryDevtools initialIsOpen={false} />
                  </Suspense>
                )}
              </TooltipProvider>
            </OrganizationProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
};

export default App;
