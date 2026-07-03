import {
  BriefcaseBusiness,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  ShieldCheck,
  UserRound,
  Users
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { AccountMenu } from "../../../components/shared/AccountMenu";
import { NotificationCenter } from "../../../components/shared/NotificationCenter";
import { usePersistentSidebarState } from "../../../components/shared/usePersistentSidebarState";
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
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentSidebarState(
    "workspace-sidebar-collapsed"
  );
  const [paymentsExpanded, setPaymentsExpanded] = useState(
    () => view === "payments" || view === "payment-ledger"
  );

  useEffect(() => {
    if (view === "payments" || view === "payment-ledger") {
      setPaymentsExpanded(true);
    }
  }, [view]);

  return (
    <div className={`admin-shell${sidebarCollapsed ? " admin-shell-collapsed" : ""}`}>
      <aside className="admin-sidebar">
        <div className="sidebar-brand-row">
          <div
            className="brand-mark"
            title={sidebarCollapsed ? workspaceSession.workspace.name : undefined}
          >
            <ShieldCheck aria-hidden="true" />
            <span>{workspaceSession.workspace.name}</span>
          </div>
          <button
            className="sidebar-collapse-button icon-button"
            type="button"
            title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-pressed={sidebarCollapsed}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen aria-hidden="true" />
            ) : (
              <PanelLeftClose aria-hidden="true" />
            )}
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Workspace sections">
          <NavLink
            to={paths.workspaceDashboard(slug)}
            title="Overview"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <LayoutDashboard aria-hidden="true" />
            <span>Overview</span>
          </NavLink>
          <NavLink
            to={paths.workspaceProfiles(slug)}
            title="Profiles"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <UserRound aria-hidden="true" />
            <span>Profiles</span>
          </NavLink>
          <NavLink
            to={paths.workspaceBids(slug)}
            title="Bids"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <BriefcaseBusiness aria-hidden="true" />
            <span>Bids</span>
          </NavLink>
          <NavLink
            to={paths.workspaceInterviews(slug)}
            title="Interviews"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <CalendarClock aria-hidden="true" />
            <span>Interviews</span>
          </NavLink>
          <NavLink
            to={paths.workspaceJobs(slug)}
            title="Jobs"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <ClipboardList aria-hidden="true" />
            <span>Jobs</span>
          </NavLink>
          {isAdmin ? (
            <div className="sidebar-nav-group">
              <div className="sidebar-parent-row">
                <NavLink
                  to={paths.workspacePayments(slug)}
                  title="Payment management"
                  className={({ isActive }) => (isActive ? "active" : undefined)}
                >
                  <CreditCard aria-hidden="true" />
                  <span>Payments</span>
                </NavLink>
                <button
                  className="sidebar-submenu-toggle"
                  type="button"
                  title={paymentsExpanded ? "Collapse payment menu" : "Expand payment menu"}
                  aria-label={paymentsExpanded ? "Collapse payment menu" : "Expand payment menu"}
                  aria-expanded={paymentsExpanded}
                  onClick={() => setPaymentsExpanded((expanded) => !expanded)}
                >
                  {paymentsExpanded ? (
                    <ChevronDown aria-hidden="true" />
                  ) : (
                    <ChevronRight aria-hidden="true" />
                  )}
                </button>
              </div>
              {paymentsExpanded ? (
                <div className="sidebar-subnav">
                  <NavLink
                    to={paths.workspacePaymentLedger(slug)}
                    title="User ledger"
                    className={({ isActive }) => (isActive ? "active" : undefined)}
                  >
                    <ReceiptText aria-hidden="true" />
                    <span>User ledger</span>
                  </NavLink>
                </div>
              ) : null}
            </div>
          ) : (
            <NavLink
              to={paths.workspacePayments(slug)}
              title="Payment management"
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              <CreditCard aria-hidden="true" />
              <span>Payments</span>
            </NavLink>
          )}
          {isAdmin ? (
            <NavLink
              to={paths.workspaceUsers(slug)}
              title="User management"
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              <Users aria-hidden="true" />
              <span>User management</span>
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

  if (view === "jobs") {
    return {
      eyebrow: "Job tracking",
      title: (workspaceName: string) => `${workspaceName} Jobs`
    };
  }

  if (view === "payments") {
    return {
      eyebrow: "Payment management",
      title: (workspaceName: string) => `${workspaceName} Payments`
    };
  }

  if (view === "payment-ledger") {
    return {
      eyebrow: "Payment records",
      title: (workspaceName: string) => `${workspaceName} User Ledger`
    };
  }

  return {
    eyebrow: "Workspace dashboard",
    title: (workspaceName: string) => workspaceName
  };
}
