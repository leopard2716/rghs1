import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  CheckCircle2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserCheck
} from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { AccountMenu } from "../../../components/shared/AccountMenu";
import { MetricCard } from "../../../components/shared/MetricCard";
import { NotificationCenter } from "../../../components/shared/NotificationCenter";
import { PanelHeader } from "../../../components/shared/PanelHeader";
import { usePersistentSidebarState } from "../../../components/shared/usePersistentSidebarState";
import {
  assignWorkspaceAdmin,
  cancelWorkspaceDeletion,
  createAdminWorkspace,
  fetchAdminOverview,
  requestWorkspaceDeletion,
  type AssignWorkspaceAdminResponse
} from "../../../services/admin.service";
import type { AuthSession } from "../../../services/auth.service";
import { errorMessage } from "../../../errors";
import { paths } from "../../../routing/paths";
import { slugify } from "../../../utils/slug";
import { WorkspaceMonitorTable, type TenantPendingAction } from "./WorkspaceMonitorTable";

export function AdminDashboard({
  session,
  view,
  onRecoverPassword,
  onSignOut
}: {
  session: AuthSession;
  view: "tenants" | "create";
  onRecoverPassword: () => void;
  onSignOut: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [assignedAdmin, setAssignedAdmin] = useState<AssignWorkspaceAdminResponse | null>(null);
  const [pendingTenantActions, setPendingTenantActions] = useState<
    Record<string, TenantPendingAction>
  >({});
  const [sidebarCollapsed, setSidebarCollapsed] =
    usePersistentSidebarState("admin-sidebar-collapsed");
  const tenantLocks = useRef(new Set<string>());
  const overviewQuery = useQuery({
    queryKey: ["admin-overview", session.user.id],
    queryFn: () => fetchAdminOverview(session)
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createAdminWorkspace(session, {
        name,
        slug
      }),
    onSuccess: async () => {
      setName("");
      setSlug("");
      setSlugTouched(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-overview", session.user.id] });
    }
  });
  const assignAdminMutation = useMutation({
    mutationFn: ({ workspaceId, email }: { workspaceId: string; email: string }) =>
      assignWorkspaceAdmin(session, workspaceId, { email }),
    onSuccess: async (response) => {
      setAssignedAdmin(response);
      await queryClient.invalidateQueries({ queryKey: ["admin-overview", session.user.id] });
    },
    onSettled: (_data, _error, variables) => {
      endTenantAction(variables.workspaceId);
    }
  });
  const requestDeletionMutation = useMutation({
    mutationFn: (workspaceId: string) => requestWorkspaceDeletion(session, workspaceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-overview", session.user.id] });
    },
    onSettled: (_data, _error, workspaceId) => {
      endTenantAction(workspaceId);
    }
  });
  const cancelDeletionMutation = useMutation({
    mutationFn: (workspaceId: string) => cancelWorkspaceDeletion(session, workspaceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-overview", session.user.id] });
    },
    onSettled: (_data, _error, workspaceId) => {
      endTenantAction(workspaceId);
    }
  });

  function beginTenantAction(workspaceId: string, action: TenantPendingAction): boolean {
    if (tenantLocks.current.has(workspaceId)) {
      return false;
    }

    tenantLocks.current.add(workspaceId);
    setPendingTenantActions((current) => ({
      ...current,
      [workspaceId]: action
    }));
    return true;
  }

  function endTenantAction(workspaceId: string): void {
    tenantLocks.current.delete(workspaceId);
    setPendingTenantActions((current) => {
      const next = { ...current };
      delete next[workspaceId];
      return next;
    });
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate();
  }

  const platform = overviewQuery.data?.platform;
  const workspaces = overviewQuery.data?.workspaces ?? [];

  return (
    <div className={`admin-shell${sidebarCollapsed ? " admin-shell-collapsed" : ""}`}>
      <aside className="admin-sidebar">
        <div className="sidebar-brand-row">
          <div className="brand-mark" title={sidebarCollapsed ? "RGHS1" : undefined}>
            <ShieldCheck aria-hidden="true" />
            <span>RGHS1</span>
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
        <nav className="sidebar-nav" aria-label="Global admin sections">
          <NavLink
            to={paths.adminTenants}
            title="Tenants"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <Building2 aria-hidden="true" />
            <span>Tenants</span>
          </NavLink>
          <NavLink
            to={paths.adminTenantCreate}
            title="Create"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <Plus aria-hidden="true" />
            <span>Create</span>
          </NavLink>
        </nav>
      </aside>

      <section className="admin-main">
        <header className="workspace-header admin-header">
          <div>
            <p className="eyebrow">Global admin dashboard</p>
            <h2>{view === "create" ? "Create Workspace" : "Tenant Operations"}</h2>
          </div>
          <div className="header-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={() => overviewQuery.refetch()}
              disabled={overviewQuery.isFetching}
            >
              {overviewQuery.isFetching ? (
                <Activity className="spin-icon" aria-hidden="true" />
              ) : (
                <RefreshCcw aria-hidden="true" />
              )}
              {overviewQuery.isFetching ? "Refreshing" : "Refresh"}
            </button>
            <NotificationCenter session={session} scope={{ scope: "admin" }} />
            <AccountMenu
              email={session.user.email}
              onRecoverPassword={onRecoverPassword}
              onSignOut={onSignOut}
            />
          </div>
        </header>

        {overviewQuery.isError ? (
          <section className="panel admin-error-panel">
            <TriangleAlert aria-hidden="true" />
            <div>
              <h3>Admin API rejected the request</h3>
              <p>{errorMessage(overviewQuery.error)}</p>
            </div>
          </section>
        ) : null}

        {view === "tenants" ? (
          <section id="overview" className="metrics-grid" aria-label="Global admin metrics">
            <MetricCard
              icon={<Building2 aria-hidden="true" />}
              label="Tenants"
              value={platform?.totalWorkspaces ?? 0}
            />
            <MetricCard
              icon={<CheckCircle2 aria-hidden="true" />}
              label="Healthy"
              value={platform?.healthyWorkspaces ?? 0}
            />
            <MetricCard
              icon={<Trash2 aria-hidden="true" />}
              label="Deleting"
              value={platform?.deletingWorkspaces ?? 0}
            />
            <MetricCard
              icon={<UserCheck aria-hidden="true" />}
              label="Active users"
              value={platform?.activeUsers ?? 0}
            />
          </section>
        ) : null}

        <section className={view === "create" ? "admin-duty-layout" : "admin-tenants-layout"}>
          {view === "create" ? (
            <section id="create" className="panel admin-create-panel">
              <PanelHeader icon={<Plus aria-hidden="true" />} title="Create Workspace" />
              <form className="modal-form admin-create-form" onSubmit={handleSubmit}>
                <label>
                  Workspace name
                  <input
                    name="name"
                    value={name}
                    required
                    minLength={2}
                    maxLength={120}
                    onChange={(event) => handleNameChange(event.target.value)}
                    placeholder="Acme Recruiting Team"
                  />
                </label>
                <label>
                  Tenant slug
                  <input
                    name="slug"
                    value={slug}
                    required
                    minLength={2}
                    maxLength={64}
                    pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                    onChange={(event) => {
                      setSlugTouched(true);
                      setSlug(slugify(event.target.value));
                    }}
                    placeholder="acme"
                  />
                </label>
                {createMutation.isError ? (
                  <p className="form-error">{errorMessage(createMutation.error)}</p>
                ) : null}
                {createMutation.isSuccess ? (
                  <p className="form-success">
                    Workspace created:{" "}
                    <Link to={createMutation.data.workspace.urlPath}>
                      {createMutation.data.workspace.urlPath}
                    </Link>
                  </p>
                ) : null}
                <button
                  className="primary-action small"
                  type="submit"
                  disabled={createMutation.isPending || !name || !slug}
                >
                  {createMutation.isPending ? (
                    <Activity className="spin-icon" aria-hidden="true" />
                  ) : (
                    <Plus aria-hidden="true" />
                  )}
                  {createMutation.isPending ? "Creating" : "Create"}
                </button>
              </form>
            </section>
          ) : null}

          {view === "tenants" ? (
            <section id="tenants" className="panel wide-admin-panel">
              <div className="panel-header">
                <div>
                  <Building2 aria-hidden="true" />
                  <h3>Tenant Health</h3>
                </div>
                {overviewQuery.isFetching ? (
                  <Activity className="spin-icon" aria-hidden="true" />
                ) : null}
              </div>
              {assignAdminMutation.isError ? (
                <p className="form-error">{errorMessage(assignAdminMutation.error)}</p>
              ) : null}
              {requestDeletionMutation.isError ? (
                <p className="form-error">{errorMessage(requestDeletionMutation.error)}</p>
              ) : null}
              {cancelDeletionMutation.isError ? (
                <p className="form-error">{errorMessage(cancelDeletionMutation.error)}</p>
              ) : null}
              {platform && !platform.tenantDeletionAvailable ? (
                <p className="form-error">
                  Tenant deletion is unavailable until migration
                  0003_workspace_deletion_lifecycle.sql is applied.
                </p>
              ) : null}
              {assignedAdmin ? (
                <section
                  className="temporary-password-panel"
                  aria-label="Temporary workspace admin password"
                >
                  <strong>{assignedAdmin.member.email}</strong>
                  <span>{assignedAdmin.workspace.urlPath}</span>
                  {assignedAdmin.temporaryPassword ? (
                    <>
                      <code>{assignedAdmin.temporaryPassword}</code>
                      <small>
                        Copy now. This temporary password is shown once and expires in 24 hours.
                      </small>
                    </>
                  ) : (
                    <small>
                      Existing account linked. This user signs in with their current password.
                    </small>
                  )}
                </section>
              ) : null}
              <WorkspaceMonitorTable
                workspaces={workspaces}
                loading={overviewQuery.isLoading}
                pendingActions={pendingTenantActions}
                deletionAvailable={platform?.tenantDeletionAvailable ?? false}
                onAssignAdmin={(workspaceId, email) => {
                  if (beginTenantAction(workspaceId, "assign")) {
                    assignAdminMutation.mutate({ workspaceId, email });
                  }
                }}
                onRequestDeletion={(workspaceId) => {
                  if (beginTenantAction(workspaceId, "delete")) {
                    requestDeletionMutation.mutate(workspaceId);
                  }
                }}
                onCancelDeletion={(workspaceId) => {
                  if (beginTenantAction(workspaceId, "restore")) {
                    cancelDeletionMutation.mutate(workspaceId);
                  }
                }}
              />
            </section>
          ) : null}
        </section>
      </section>
    </div>
  );
}
