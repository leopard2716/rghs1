import { Route, Routes, useNavigate } from "react-router-dom";
import { AccessErrorPanel } from "../components/shared/AccessErrorPanel";
import { RecoveryRoute } from "../features/account/routes/RecoveryRoute";
import {
  AdminIndexRoute,
  AdminLoginRoute,
  AdminProtectedRoute
} from "../features/admin/routes/AdminRoutes";
import { LandingPage } from "../features/landing/LandingPage";
import {
  WorkspaceBidsRoute,
  WorkspaceDashboardRoute,
  WorkspaceEntryRoute,
  WorkspaceInterviewsRoute,
  WorkspaceLoginAlias,
  WorkspaceProfilesRoute,
  WorkspaceRegisterRoute,
  WorkspaceUsersRoute
} from "../features/workspace/routes/WorkspaceRoutes";
import { paths } from "./paths";

export function AppRoutes() {
  return (
    <Routes>
      <Route path={paths.landing} element={<LandingRoute />} />
      <Route path={paths.recovery} element={<RecoveryRoute />} />

      <Route path={paths.adminRoot} element={<AdminIndexRoute />} />
      <Route path={paths.adminLogin} element={<AdminLoginRoute />} />
      <Route path={paths.adminTenants} element={<AdminProtectedRoute view="tenants" />} />
      <Route path={paths.adminTenantCreate} element={<AdminProtectedRoute view="create" />} />

      <Route path="/:workspaceSlug/login" element={<WorkspaceLoginAlias />} />
      <Route path="/:workspaceSlug/register" element={<WorkspaceRegisterRoute />} />
      <Route path="/:workspaceSlug/dashboard" element={<WorkspaceDashboardRoute />} />
      <Route path="/:workspaceSlug/profiles" element={<WorkspaceProfilesRoute />} />
      <Route path="/:workspaceSlug/bids" element={<WorkspaceBidsRoute />} />
      <Route path="/:workspaceSlug/interviews" element={<WorkspaceInterviewsRoute />} />
      <Route path="/:workspaceSlug/users" element={<WorkspaceUsersRoute />} />
      <Route path="/:workspaceSlug" element={<WorkspaceEntryRoute />} />

      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}

function LandingRoute() {
  const navigate = useNavigate();
  return (
    <main>
      <LandingPage onOpenAdmin={() => navigate(paths.adminRoot)} />
    </main>
  );
}

function NotFoundRoute() {
  const navigate = useNavigate();
  return <AccessErrorPanel title="Page not found" onAction={() => navigate(paths.landing)} />;
}
