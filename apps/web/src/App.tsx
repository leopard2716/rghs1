import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AppRoutes } from "./routing/AppRoutes";
import { paths } from "./routing/paths";
import { useAuthStore } from "./stores/auth.store";
import { LoadingSurface } from "./components/shared/LoadingSurface";
import { SessionCheckError } from "./components/shared/SessionCheckError";

export function App() {
  const location = useLocation();
  const normalizedPath = location.pathname.replace(/\/+$/, "") || paths.landing;
  const isPublicPrivacyRoute = normalizedPath === paths.privacy;
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const initialize = useAuthStore((state) => state.initialize);
  const retry = useAuthStore((state) => state.retry);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    if (!isPublicPrivacyRoute) {
      void initialize();
    }
  }, [initialize, isPublicPrivacyRoute]);

  if (isPublicPrivacyRoute) {
    return <AppRoutes />;
  }

  if (status === "idle" || status === "checking") {
    return <LoadingSurface label="Checking session" />;
  }

  if (status === "error") {
    return (
      <SessionCheckError
        detail={error}
        onRetry={() => void retry()}
        onClearSession={clearSession}
      />
    );
  }

  return <AppRoutes />;
}
