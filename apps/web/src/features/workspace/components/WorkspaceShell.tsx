import {
  BriefcaseBusiness,
  CalendarClock,
  LayoutDashboard,
  ShieldCheck,
  UserRound,
  Users
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { AccountMenu } from "../../../components/shared/AccountMenu";
import { NotificationCenter } from "../../../components/shared/NotificationCenter";
import { paths } from "../../../routing/paths";
import type { AuthSession } from "../../../services/auth.service";
import type { WorkspaceSession } from "../../../services/workspace.service";
import type { WorkspaceView } from "../workspace.types";
import { WorkspaceModeSwitcher } from "./WorkspaceModeSwitcher";

export function WorkspaceShell({
  session,
  workspaceSession,
  view,
  onRecoverPassword,
  onSignOut,
  children
}: {
  session: AuthSession;
  workspaceSession: WorkspaceSession;
  view: WorkspaceView;
  onRecoverPassword: () => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const isAdmin = workspaceSession.member.roleKeys.includes("admin");
  const slug = workspaceSession.workspace.slug;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand-mark">
          <ShieldCheck aria-hidden="true" />
          <span>{workspaceSession.workspace.name}</span>
        </div>
        <nav className="sidebar-nav" aria-label="Workspace sections">
          <NavLink
            to={paths.workspaceDashboard(slug)}
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <LayoutDashboard aria-hidden="true" />
            Overview
          </NavLink>
          <NavLink
            to={paths.workspaceProfiles(slug)}
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <UserRound aria-hidden="true" />
            Profiles
          </NavLink>
          <NavLink
            to={paths.workspaceBids(slug)}
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <BriefcaseBusiness aria-hidden="true" />
            Bids
          </NavLink>
          <NavLink
            to={paths.workspaceInterviews(slug)}
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <CalendarClock aria-hidden="true" />
            Interviews
          </NavLink>
          {isAdmin ? (
            <NavLink
              to={paths.workspaceUsers(slug)}
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              <Users aria-hidden="true" />
              User management
            </NavLink>
          ) : null}
        </nav>
      </aside>

      <section className="admin-main">
        <header className="workspace-header admin-header">
          <div>
            <p className="eyebrow">{workspaceViewCopy(view).eyebrow}</p>
            <h2>{workspaceViewCopy(view).title(workspaceSession.workspace.name)}</h2>
          </div>
          <div className="header-actions">
            {isAdmin ? <WorkspaceModeSwitcher slug={slug} /> : null}
            <NotificationCenter
              session={session}
              scope={{
                workspaceSlug: slug,
                workspaceId: workspaceSession.workspace.id
              }}
            />
            <AccountMenu
              email={session.user.email}
              onRecoverPassword={onRecoverPassword}
              onSignOut={onSignOut}
            />
          </div>
        </header>

        {children}
      </section>
    </div>
  );
}

function workspaceViewCopy(view: WorkspaceView) {
  if (view === "users") {
    return {
      eyebrow: "Workspace administration",
      title: (workspaceName: string) => `${workspaceName} Users`
    };
  }

  if (view === "profiles") {
    return {
      eyebrow: "Workspace profiles",
      title: (workspaceName: string) => `${workspaceName} Profiles`
    };
  }

  if (view === "bids") {
    return {
      eyebrow: "Bid tracking",
      title: (workspaceName: string) => `${workspaceName} Bids`
    };
  }

  if (view === "interviews") {
    return {
      eyebrow: "Interview tracking",
      title: (workspaceName: string) => `${workspaceName} Interviews`
    };
  }

  return {
    eyebrow: "Workspace dashboard",
    title: (workspaceName: string) => workspaceName
  };
}
