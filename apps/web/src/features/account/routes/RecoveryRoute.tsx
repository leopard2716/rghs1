import { useNavigate } from "react-router-dom";
import { authScopeForLocation, sessionMatchesAuthScope } from "../../../services/auth.service";
import { useAuthStore } from "../../../stores/auth.store";
import { PasswordRecoveryPage } from "../PasswordRecoveryPage";

export function RecoveryRoute() {
  const session = useAuthStore((state) => state.session);
  const recoveryError = useAuthStore((state) => state.recoveryError);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const navigate = useNavigate();
  const recoveryScope = authScopeForLocation(window.location.pathname, window.location.search);
  const scopedSession =
    recoveryScope && sessionMatchesAuthScope(session, recoveryScope) ? session : null;

  return (
    <PasswordRecoveryPage
      session={scopedSession}
      recoveryError={recoveryError}
      onSessionChange={setSession}
      onSessionCleared={clearSession}
      onNavigate={(path) => navigate(path, { replace: true })}
    />
  );
}
