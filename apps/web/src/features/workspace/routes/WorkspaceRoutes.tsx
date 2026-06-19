import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AccessErrorPanel } from "../../../components/shared/AccessErrorPanel";
import { LoadingSurface } from "../../../components/shared/LoadingSurface";
import { errorMessage, UserFacingError } from "../../../errors";
import { paths, recoveryPath } from "../../../routing/paths";
import {
  sessionMatchesAuthScope,
  signOut,
  workspaceAuthScope,
  type AuthSession
} from "../../../services/auth.service";
import {
  fetchPublicWorkspace,
  fetchWorkspaceMembership,
  fetchWorkspaceSession
} from "../../../services/workspace.service";
import { useAuthStore } from "../../../stores/auth.store";
import { MfaGate } from "../../setup/MfaGate";
import { FirstPasswordChange } from "../components/FirstPasswordChange";
import { WorkspaceLandingPage } from "../components/WorkspaceLandingPage";
import { WorkspaceMembershipStatus } from "../components/WorkspaceMembershipStatus";
import { WorkspaceRegisterPage } from "../components/WorkspaceRegisterPage";
import type { WorkspaceView } from "../workspace.types";

const BidsPage = lazy(() =>
  import("../components/BidsPage").then((module) => ({
    default: module.BidsPage
  }))
);
const InterviewsPage = lazy(() =>
  import("../components/InterviewsPage").then((module) => ({
    default: module.InterviewsPage
  }))
);
const TrackingProfilesPage = lazy(() =>
  import("../components/TrackingProfilesPage").then((module) => ({
    default: module.TrackingProfilesPage
  }))
);
const WorkspaceOverviewPage = lazy(() =>
  import("../components/WorkspaceOverviewPage").then((module) => ({
    default: module.WorkspaceOverviewPage
  }))
);
const WorkspaceUsersPage = lazy(() =>
  import("../components/WorkspaceUsersPage").then((module) => ({
    default: module.WorkspaceUsersPage
  }))
);

export function WorkspaceLoginAlias() {
  const { workspaceSlug = "" } = useParams();
  return <Navigate to={paths.workspaceRoot(workspaceSlug)} replace />;
}

export function WorkspaceEntryRoute() {
  const { workspaceSlug = "" } = useParams();
  const session = useAuthStore((state) => state.session);
  const setSession = useAuthStore((state) => state.setSession);
  const navigate = useNavigate();
  const publicWorkspaceQuery = usePublicWorkspace(workspaceSlug);
  const workspaceSession = sessionMatchesAuthScope(session, workspaceAuthScope(workspaceSlug))
    ? session
    : null;

  if (workspaceSession) {
    return <Navigate to={paths.workspaceDashboard(workspaceSlug)} replace />;
  }

  if (publicWorkspaceQuery.isLoading) {
    return <LoadingSurface label="Loading workspace" />;
  }

  if (publicWorkspaceQuery.isError || !publicWorkspaceQuery.data) {
    return <WorkspaceNotFound onBack={() => navigate(paths.landing)} />;
  }

  return (
    <WorkspaceLandingPage
      workspace={publicWorkspaceQuery.data.workspace}
      onAuthenticated={(nextSession) => {
        setSession(nextSession);
        navigate(paths.workspaceDashboard(workspaceSlug), { replace: true });
      }}
      onRecoverPassword={() => navigate(recoveryPath(paths.workspaceRoot(workspaceSlug)))}
      onRegister={() => navigate(paths.workspaceRegister(workspaceSlug))}
    />
  );
}

export function WorkspaceRegisterRoute() {
  const { workspaceSlug = "" } = useParams();
  const session = useAuthStore((state) => state.session);
  const clearSession = useAuthStore((state) => state.clearSession);
  const navigate = useNavigate();
  const [registrationSubmitted, setRegistrationSubmitted] = useState(false);
  const publicWorkspaceQuery = usePublicWorkspace(workspaceSlug);
  const workspaceSession = sessionMatchesAuthScope(session, workspaceAuthScope(workspaceSlug))
    ? session
    : null;

  if (registrationSubmitted) {
    return (
      <AccessErrorPanel
        eyebrow="Registration submitted"
        title="Waiting for approval"
        detail="Your account is ready. A workspace admin must approve it before you can sign in and set up MFA."
        actionLabel="Back to sign in"
        onAction={() => navigate(paths.workspaceRoot(workspaceSlug))}
      />
    );
  }

  if (publicWorkspaceQuery.isLoading) {
    return <LoadingSurface label="Loading registration" />;
  }

  if (publicWorkspaceQuery.isError || !publicWorkspaceQuery.data) {
    return <WorkspaceNotFound onBack={() => navigate(paths.landing)} />;
  }

  return (
    <WorkspaceRegisterPage
      workspace={publicWorkspaceQuery.data.workspace}
      session={workspaceSession}
      onRegistered={() => {
        clearSession();
        setRegistrationSubmitted(true);
      }}
      onBack={() => navigate(paths.workspaceRoot(workspaceSlug))}
    />
  );
}

export function WorkspaceDashboardRoute() {
  return <WorkspaceProtectedRoute view="overview" />;
}

export function WorkspaceUsersRoute() {
  return <WorkspaceProtectedRoute view="users" />;
}

export function WorkspaceProfilesRoute() {
  return <WorkspaceProtectedRoute view="profiles" />;
}

export function WorkspaceBidsRoute() {
  return <WorkspaceProtectedRoute view="bids" />;
}

export function WorkspaceInterviewsRoute() {
  return <WorkspaceProtectedRoute view="interviews" />;
}

function WorkspaceProtectedRoute({ view }: { view: WorkspaceView }) {
  const { workspaceSlug = "" } = useParams();
  const session = useAuthStore((state) => state.session);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const navigate = useNavigate();
  const scopedSession = sessionMatchesAuthScope(session, workspaceAuthScope(workspaceSlug))
    ? session
    : null;
  const membershipQuery = useQuery({
    queryKey: [
      "workspace-membership",
      workspaceSlug,
      scopedSession?.user.id,
      scopedSession?.accessToken.slice(-12)
    ],
    queryFn: () => fetchWorkspaceMembership(scopedSession as AuthSession, workspaceSlug),
    enabled: Boolean(workspaceSlug) && Boolean(scopedSession)
  });

  if (!scopedSession) {
    return <Navigate to={paths.workspaceRoot(workspaceSlug)} replace />;
  }
  const authenticatedWorkspaceSession = scopedSession;

  async function handleSignOut() {
    await signOut(authenticatedWorkspaceSession).catch(() => undefined);
    clearSession();
  }
  const registrationRequired =
    membershipQuery.error instanceof UserFacingError &&
    membershipQuery.error.code === "workspace_registration_required";

  if (membershipQuery.isLoading) {
    return <LoadingSurface label="Checking workspace access" />;
  }

  if (membershipQuery.isError || !membershipQuery.data) {
    return (
      <AccessErrorPanel
        eyebrow="RGHS1 workspace"
        title={
          registrationRequired ? "Workspace registration required" : "Workspace access required"
        }
        detail={membershipQuery.error ? errorMessage(membershipQuery.error) : undefined}
        actionLabel={
          registrationRequired ? "Register this account" : "Sign in with another account"
        }
        onAction={() => {
          if (registrationRequired) {
            navigate(paths.workspaceRegister(workspaceSlug));
            return;
          }

          void handleSignOut().then(() => {
            navigate(paths.workspaceRoot(workspaceSlug), { replace: true });
          });
        }}
      />
    );
  }

  if (!membershipQuery.data.canAccess) {
    return (
      <WorkspaceMembershipStatus
        workspaceSession={membershipQuery.data}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <MfaGate
      session={authenticatedWorkspaceSession}
      issuerUrl={`${window.location.origin}${paths.workspaceRoot(workspaceSlug)}`}
      onVerified={setSession}
      onSignOut={handleSignOut}
    >
      <WorkspaceMfaContent
        session={authenticatedWorkspaceSession}
        workspaceSlug={workspaceSlug}
        view={view}
        onSignOut={handleSignOut}
      />
    </MfaGate>
  );
}

function WorkspaceMfaContent({
  session,
  workspaceSlug,
  view,
  onSignOut
}: {
  session: AuthSession;
  workspaceSlug: string;
  view: WorkspaceView;
  onSignOut: () => void;
}) {
  const navigate = useNavigate();
  const workspaceSessionQuery = useQuery({
    queryKey: ["workspace-session", workspaceSlug, session.user.id, session.accessToken.slice(-12)],
    queryFn: () => fetchWorkspaceSession(session, workspaceSlug)
  });

  if (workspaceSessionQuery.isLoading) {
    return <LoadingSurface label="Opening workspace" />;
  }

  if (workspaceSessionQuery.isError || !workspaceSessionQuery.data) {
    return (
      <AccessErrorPanel
        eyebrow="RGHS1 workspace"
        title="Workspace access failed"
        detail={workspaceSessionQuery.error ? errorMessage(workspaceSessionQuery.error) : undefined}
        actionLabel="Sign in again"
        onAction={onSignOut}
      />
    );
  }

  if (!workspaceSessionQuery.data.canAccess) {
    return (
      <WorkspaceMembershipStatus
        workspaceSession={workspaceSessionQuery.data}
        onSignOut={onSignOut}
      />
    );
  }

  if (workspaceSessionQuery.data.requiresPasswordChange) {
    return <FirstPasswordChange session={session} workspaceSlug={workspaceSlug} />;
  }

  if (view === "users" && !workspaceSessionQuery.data.member.roleKeys.includes("admin")) {
    return (
      <AccessErrorPanel
        eyebrow={workspaceSessionQuery.data.workspace.name}
        title="Workspace admin access required"
        onAction={() => navigate(paths.workspaceDashboard(workspaceSlug))}
      />
    );
  }

  const sharedProps = {
    session,
    workspaceSession: workspaceSessionQuery.data,
    onSignOut
  };

  if (view === "users") {
    return (
      <Suspense fallback={<LoadingSurface label="Loading user management" />}>
        <WorkspaceUsersPage
          {...sharedProps}
          onRecoverPassword={() => navigate(recoveryPath(paths.workspaceUsers(workspaceSlug)))}
        />
      </Suspense>
    );
  }

  if (view === "profiles") {
    return (
      <Suspense fallback={<LoadingSurface label="Loading profiles" />}>
        <TrackingProfilesPage
          {...sharedProps}
          onRecoverPassword={() => navigate(recoveryPath(paths.workspaceProfiles(workspaceSlug)))}
        />
      </Suspense>
    );
  }

  if (view === "bids") {
    return (
      <Suspense fallback={<LoadingSurface label="Loading bids" />}>
        <BidsPage
          {...sharedProps}
          onRecoverPassword={() => navigate(recoveryPath(paths.workspaceBids(workspaceSlug)))}
        />
      </Suspense>
    );
  }

  if (view === "interviews") {
    return (
      <Suspense fallback={<LoadingSurface label="Loading interviews" />}>
        <InterviewsPage
          {...sharedProps}
          onRecoverPassword={() => navigate(recoveryPath(paths.workspaceInterviews(workspaceSlug)))}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingSurface label="Loading dashboard" />}>
      <WorkspaceOverviewPage
        {...sharedProps}
        onRecoverPassword={() => navigate(recoveryPath(paths.workspaceDashboard(workspaceSlug)))}
      />
    </Suspense>
  );
}

function usePublicWorkspace(workspaceSlug: string) {
  return useQuery({
    queryKey: ["public-workspace", workspaceSlug],
    queryFn: () => fetchPublicWorkspace(workspaceSlug),
    enabled: Boolean(workspaceSlug)
  });
}

function WorkspaceNotFound({ onBack }: { onBack: () => void }) {
  return (
    <AccessErrorPanel eyebrow="RGHS1 workspace" title="Workspace not found" onAction={onBack} />
  );
}
