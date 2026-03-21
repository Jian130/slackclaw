import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "./layout/AppShell.js";
import { AITeamProvider } from "./providers/AITeamProvider.js";
import { useOverview } from "./providers/OverviewProvider.js";
import DashboardPage from "../features/dashboard/DashboardPage.js";
import OnboardingPage from "../features/onboarding/OnboardingPage.js";
import DeployPage from "../features/deploy/DeployPage.js";
import ConfigPage from "../features/config/ConfigPage.js";
import SkillsPage from "../features/skills/SkillsPage.js";
import MembersPage from "../features/members/MembersPage.js";
import ChatPage from "../features/chat/ChatPage.js";
import TeamPage from "../features/team/TeamPage.js";
import SettingsPage from "../features/settings/SettingsPage.js";
import { EmptyState } from "../shared/ui/EmptyState.js";

export function shouldRedirectToOnboarding(setupCompleted: boolean, pathname: string): boolean {
  return !setupCompleted && pathname !== "/onboarding";
}

function AppBoundary() {
  const location = useLocation();
  const { error, loading, overview } = useOverview();

  if (loading && !overview) {
    return <AppShell loading />;
  }

  if (error && !overview) {
    return (
      <AppShell>
        <EmptyState
          title="SlackClaw could not load"
          description={error}
          actionLabel="Retry"
          onAction={() => window.location.reload()}
        />
      </AppShell>
    );
  }

  if (!overview) {
    return null;
  }

  const needsOnboarding = shouldRedirectToOnboarding(overview.firstRun.setupCompleted, location.pathname);

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  if (overview.firstRun.setupCompleted && location.pathname === "/onboarding") {
    return <Navigate to="/deploy" replace />;
  }

  if (location.pathname === "/onboarding") {
    return <Outlet />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function AITeamBoundary() {
  return (
    <AITeamProvider>
      <Outlet />
    </AITeamProvider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppBoundary />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/deploy" element={<DeployPage />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route element={<AITeamBoundary />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/team" element={<TeamPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
