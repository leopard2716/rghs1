import { useEffect } from "react";
import { AppRoutes } from "./routing/AppRoutes";
import { useAuthStore } from "./stores/auth.store";
import { LoadingSurface } from "./components/shared/LoadingSurface";
import { SessionCheckError } from "./components/shared/SessionCheckError";

export function App() {
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const initialize = useAuthStore((state) => state.initialize);
  const retry = useAuthStore((state) => state.retry);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    void initialize();
  }, [initialize]);

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
