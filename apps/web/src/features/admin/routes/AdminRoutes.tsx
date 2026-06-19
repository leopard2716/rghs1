import { lazy, Suspense } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LoadingSurface } from "../../../components/shared/LoadingSurface";
import { paths, recoveryPath } from "../../../routing/paths";
import { sessionMatchesAuthScope, signOut } from "../../../services/auth.service";
import { useAuthStore } from "../../../stores/auth.store";
import { MfaGate } from "../../setup/MfaGate";
import { GlobalAdminLogin } from "../components/GlobalAdminLogin";

const AdminDashboard = lazy(() =>
  import("../components/AdminDashboard").then((module) => ({
    default: module.AdminDashboard
  }))
);

export function AdminIndexRoute() {
  const session = useAuthStore((state) => state.session);
  return (
    <Navigate
      to={sessionMatchesAuthScope(session, "admin") ? paths.adminTenants : paths.adminLogin}
      replace
    />
  );
}

export function AdminLoginRoute() {
  const session = useAuthStore((state) => state.session);
  const setSession = useAuthStore((state) => state.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const requestedPath = adminRequestedPath(location.state);
  const adminSession = sessionMatchesAuthScope(session, "admin") ? session : null;

  if (adminSession) {
    return <Navigate to={requestedPath} replace />;
  }

  return (
    <GlobalAdminLogin
      onAuthenticated={(nextSession) => {
        setSession(nextSession);
        navigate(requestedPath, { replace: true });
      }}
      onBack={() => navigate(paths.landing)}
      onRecoverPassword={() => navigate(recoveryPath(paths.adminLogin))}
    />
  );
}

export function AdminProtectedRoute({ view }: { view: "tenants" | "create" }) {
  const session = useAuthStore((state) => state.session);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const location = useLocation();
  const navigate = useNavigate();
  const adminSession = sessionMatchesAuthScope(session, "admin") ? session : null;

  if (!adminSession) {
    return <Navigate to={paths.adminLogin} replace state={{ from: location.pathname }} />;
  }
  const authenticatedAdminSession = adminSession;

  async function handleSignOut() {
    await signOut(authenticatedAdminSession).catch(() => undefined);
    clearSession();
  }

  return (
    <MfaGate
      session={authenticatedAdminSession}
      issuerUrl={`${window.location.origin}${paths.adminLogin}`}
      onVerified={setSession}
      onSignOut={handleSignOut}
    >
      <Suspense fallback={<LoadingSurface label="Loading administration" />}>
        <AdminDashboard
          session={authenticatedAdminSession}
          view={view}
          onRecoverPassword={() => navigate(recoveryPath(location.pathname))}
          onSignOut={handleSignOut}
        />
      </Suspense>
    </MfaGate>
  );
}

function adminRequestedPath(state: unknown): string {
  const from =
    state && typeof state === "object" && "from" in state
      ? String((state as { from?: unknown }).from ?? "")
      : "";

  return from.startsWith("/admin/") ? from : paths.adminTenants;
}
