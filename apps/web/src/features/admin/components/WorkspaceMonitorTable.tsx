import {
  Activity,
  Building2,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserX,
  Users
} from "lucide-react";
import { FormEvent } from "react";
import { Link } from "react-router-dom";
import type { AdminWorkspaceSummary } from "../../../services/admin.service";
import { paths } from "../../../routing/paths";
import { displayDate } from "../../../utils/datetime";
import { fieldValue } from "../../../utils/form";

export type TenantPendingAction = "assign" | "delete" | "restore";

export function WorkspaceMonitorTable({
  workspaces,
  loading,
  pendingActions,
  deletionAvailable,
  onAssignAdmin,
  onRequestDeletion,
  onCancelDeletion
}: {
  workspaces: AdminWorkspaceSummary[];
  loading: boolean;
  pendingActions: Record<string, TenantPendingAction>;
  deletionAvailable: boolean;
  onAssignAdmin: (workspaceId: string, email: string) => void;
  onRequestDeletion: (workspaceId: string) => void;
  onCancelDeletion: (workspaceId: string) => void;
}) {
  if (loading) {
    return (
      <div className="admin-empty-state">
        <Activity className="spin-icon" aria-hidden="true" />
        <span>Loading tenant health</span>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="admin-empty-state">
        <Building2 aria-hidden="true" />
        <span>No workspaces yet</span>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Workspace</th>
            <th>Health</th>
            <th>Users</th>
            <th>Admins</th>
            <th>Dates</th>
            <th>Set Admin</th>
            <th>Deletion</th>
            <th>Latest</th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((workspace) => {
            const pendingAction = pendingActions[workspace.id];
            return (
              <tr
                key={workspace.id}
                className={pendingAction ? "tenant-row-pending" : undefined}
                aria-busy={Boolean(pendingAction)}
              >
                <td>
                  <strong>{workspace.name}</strong>
                  {workspace.deletedAt || pendingAction ? (
                    <span className="tenant-url-link muted">{workspace.urlPath}</span>
                  ) : (
                    <Link className="tenant-url-link" to={paths.workspaceRoot(workspace.slug)}>
                      {workspace.urlPath}
                    </Link>
                  )}
                  {pendingAction ? (
                    <span className="tenant-operation-status">
                      <LoaderCircle className="spin-icon" aria-hidden="true" />
                      {pendingActionLabel(pendingAction)}
                    </span>
                  ) : null}
                </td>
                <td>
                  <span className={`status-pill health-${workspace.health}`}>
                    {workspace.health}
                  </span>
                </td>
                <td>
                  <strong>{workspace.users.total}</strong>
                  <span>
                    <UsersIcon /> {workspace.users.active} active / {workspace.users.pending}{" "}
                    pending / <UserXIcon /> {workspace.users.disabled} disabled
                  </span>
                </td>
                <td>
                  <strong>{workspace.users.admins}</strong>
                  <span>
                    <ShieldCheck className="inline-icon" aria-hidden="true" /> workspace admins
                  </span>
                </td>
                <td>
                  <strong>{displayDate(workspace.dates.createdAt, "No created date")}</strong>
                  <span>created</span>
                </td>
                <td>
                  <WorkspaceAdminForm
                    workspaceId={workspace.id}
                    disabled={Boolean(workspace.deletedAt) || Boolean(pendingAction)}
                    submitting={pendingAction === "assign"}
                    onAssignAdmin={onAssignAdmin}
                  />
                </td>
                <td>
                  <WorkspaceDeletionAction
                    workspace={workspace}
                    pendingAction={pendingAction}
                    available={deletionAvailable}
                    onRequestDeletion={onRequestDeletion}
                    onCancelDeletion={onCancelDeletion}
                  />
                </td>
                <td>{displayDate(workspace.dates.latestAt, "No activity")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WorkspaceDeletionAction({
  workspace,
  pendingAction,
  available,
  onRequestDeletion,
  onCancelDeletion
}: {
  workspace: AdminWorkspaceSummary;
  pendingAction?: TenantPendingAction;
  available: boolean;
  onRequestDeletion: (workspaceId: string) => void;
  onCancelDeletion: (workspaceId: string) => void;
}) {
  if (!available) {
    return <span>Migration required</span>;
  }

  if (workspace.deletedAt) {
    return (
      <div className="tenant-deletion-cell">
        <strong>{displayDate(workspace.deletion.scheduledAt, "Pending purge")}</strong>
        <span>permanent deletion</span>
        <button
          className="secondary-action"
          type="button"
          disabled={Boolean(pendingAction)}
          onClick={() => onCancelDeletion(workspace.id)}
        >
          {pendingAction === "restore" ? (
            <LoaderCircle className="spin-icon" aria-hidden="true" />
          ) : (
            <RotateCcw aria-hidden="true" />
          )}
          {pendingAction === "restore" ? "Restoring" : "Cancel"}
        </button>
      </div>
    );
  }

  function handleDelete() {
    const confirmed = window.confirm(
      `Delete ${workspace.name}? The workspace will be hidden now and permanently purged after 24 hours.`
    );
    if (confirmed) {
      onRequestDeletion(workspace.id);
    }
  }

  return (
    <button
      className="secondary-action danger-action"
      type="button"
      disabled={Boolean(pendingAction)}
      onClick={handleDelete}
    >
      {pendingAction === "delete" ? (
        <LoaderCircle className="spin-icon" aria-hidden="true" />
      ) : (
        <Trash2 aria-hidden="true" />
      )}
      {pendingAction === "delete" ? "Scheduling" : "Delete"}
    </button>
  );
}

function UsersIcon() {
  return <Users className="inline-icon" aria-hidden="true" />;
}

function UserXIcon() {
  return <UserX className="inline-icon" aria-hidden="true" />;
}

function WorkspaceAdminForm({
  workspaceId,
  disabled,
  submitting,
  onAssignAdmin
}: {
  workspaceId: string;
  disabled: boolean;
  submitting: boolean;
  onAssignAdmin: (workspaceId: string, email: string) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = fieldValue(form, "email");
    if (!email || disabled) {
      return;
    }

    onAssignAdmin(workspaceId, email);
  }

  return (
    <form className="inline-admin-form" onSubmit={handleSubmit}>
      <input
        name="email"
        type="email"
        required
        disabled={disabled}
        placeholder="admin@example.com"
      />
      <button className="secondary-action" type="submit" disabled={disabled}>
        {submitting ? <LoaderCircle className="spin-icon" aria-hidden="true" /> : null}
        {submitting ? "Setting" : "Set"}
      </button>
    </form>
  );
}

function pendingActionLabel(action: TenantPendingAction): string {
  if (action === "assign") {
    return "Setting workspace admin";
  }

  if (action === "restore") {
    return "Restoring tenant";
  }

  return "Scheduling deletion";
}
