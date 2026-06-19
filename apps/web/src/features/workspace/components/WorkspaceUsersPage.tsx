import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  ShieldX,
  Trash2,
  UserCheck,
  UserRoundCog,
  UserX
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../../errors";
import type { AuthSession } from "../../../services/auth.service";
import {
  deleteWorkspaceMember,
  fetchWorkspaceMembers,
  updateWorkspaceMemberRoles,
  updateWorkspaceMemberStatus,
  type WorkspaceMemberSummary,
  type WorkspaceMembersResponse,
  type WorkspaceSession
} from "../../../services/workspace.service";
import { displayDate } from "../../../utils/datetime";
import { WorkspaceShell } from "./WorkspaceShell";

type MemberPendingAction = "approve" | "reject" | "disable" | "delete" | "roles";

export function WorkspaceUsersPage({
  session,
  workspaceSession,
  onRecoverPassword,
  onSignOut
}: {
  session: AuthSession;
  workspaceSession: WorkspaceSession;
  onRecoverPassword: () => void;
  onSignOut: () => void;
}) {
  const slug = workspaceSession.workspace.slug;
  const memberId = workspaceSession.member.id;
  const queryClient = useQueryClient();
  const [pendingActions, setPendingActions] = useState<Record<string, MemberPendingAction>>({});
  const memberLocks = useRef(new Set<string>());
  const membersQuery = useQuery({
    queryKey: ["workspace-members", slug, memberId],
    queryFn: () => fetchWorkspaceMembers(session, slug)
  });
  const statusMutation = useMutation({
    mutationFn: ({
      memberId,
      status
    }: {
      memberId: string;
      status: "active" | "rejected" | "disabled";
    }) => updateWorkspaceMemberStatus(session, slug, memberId, status),
    onSuccess: async () => {
      await refreshWorkspaceData(queryClient, slug);
    },
    onSettled: (_data, _error, variables) => endMemberAction(variables.memberId)
  });
  const rolesMutation = useMutation({
    mutationFn: ({ memberId, roleKeys }: { memberId: string; roleKeys: string[] }) =>
      updateWorkspaceMemberRoles(session, slug, memberId, roleKeys),
    onSuccess: async () => {
      await refreshWorkspaceData(queryClient, slug);
    },
    onSettled: (_data, _error, variables) => endMemberAction(variables.memberId)
  });
  const deleteMutation = useMutation({
    mutationFn: (memberId: string) => deleteWorkspaceMember(session, slug, memberId),
    onSuccess: async () => {
      await refreshWorkspaceData(queryClient, slug);
    },
    onSettled: (_data, _error, memberId) => endMemberAction(memberId)
  });

  function beginMemberAction(memberId: string, action: MemberPendingAction): boolean {
    if (memberLocks.current.has(memberId)) {
      return false;
    }

    memberLocks.current.add(memberId);
    setPendingActions((current) => ({ ...current, [memberId]: action }));
    return true;
  }

  function endMemberAction(memberId: string): void {
    memberLocks.current.delete(memberId);
    setPendingActions((current) => {
      const next = { ...current };
      delete next[memberId];
      return next;
    });
  }

  const mutationError = statusMutation.error ?? rolesMutation.error ?? deleteMutation.error;

  return (
    <WorkspaceShell
      session={session}
      workspaceSession={workspaceSession}
      view="users"
      onRecoverPassword={onRecoverPassword}
      onSignOut={onSignOut}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <UserRoundCog aria-hidden="true" />
            <h3>User Management</h3>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh users"
            title="Refresh users"
            disabled={membersQuery.isFetching}
            onClick={() => void membersQuery.refetch()}
          >
            <RefreshCw
              className={membersQuery.isFetching ? "spin-icon" : undefined}
              aria-hidden="true"
            />
          </button>
        </div>

        {membersQuery.isError ? (
          <p className="form-error">{errorMessage(membersQuery.error)}</p>
        ) : null}
        {mutationError ? <p className="form-error">{errorMessage(mutationError)}</p> : null}

        {membersQuery.isLoading ? (
          <div className="admin-empty-state">
            <LoaderCircle className="spin-icon" aria-hidden="true" />
            <span>Loading workspace users</span>
          </div>
        ) : membersQuery.data ? (
          <div className="table-wrap">
            <table className="workspace-members-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Roles</th>
                  <th>Registered</th>
                  <th>Account</th>
                </tr>
              </thead>
              <tbody>
                {membersQuery.data.members.map((member) => (
                  <WorkspaceMemberRow
                    key={member.id}
                    member={member}
                    data={membersQuery.data}
                    pendingAction={pendingActions[member.id]}
                    onStatus={(status, action) => {
                      if (beginMemberAction(member.id, action)) {
                        statusMutation.mutate({ memberId: member.id, status });
                      }
                    }}
                    onRoles={(roleKeys) => {
                      if (beginMemberAction(member.id, "roles")) {
                        rolesMutation.mutate({ memberId: member.id, roleKeys });
                      }
                    }}
                    onDelete={() => {
                      const confirmed = window.confirm(
                        `Remove ${member.displayName} from this workspace? Their account and other workspace memberships will not be changed.`
                      );
                      if (confirmed && beginMemberAction(member.id, "delete")) {
                        deleteMutation.mutate(member.id);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </WorkspaceShell>
  );
}

function WorkspaceMemberRow({
  member,
  data,
  pendingAction,
  onStatus,
  onRoles,
  onDelete
}: {
  member: WorkspaceMemberSummary;
  data: WorkspaceMembersResponse;
  pendingAction?: MemberPendingAction;
  onStatus: (
    status: "active" | "rejected" | "disabled",
    action: Exclude<MemberPendingAction, "delete" | "roles">
  ) => void;
  onRoles: (roleKeys: string[]) => void;
  onDelete: () => void;
}) {
  const isSelf = member.id === data.currentMemberId;
  const assignableRoles = data.roles.filter((role) => role.assignable);
  const [selectedRoleKeys, setSelectedRoleKeys] = useState<string[]>(() =>
    member.roleKeys.filter((key) => key !== "admin")
  );

  useEffect(() => {
    setSelectedRoleKeys(member.roleKeys.filter((key) => key !== "admin"));
  }, [member.roleKeys]);

  const rolesChanged =
    [...selectedRoleKeys].sort().join("|") !==
    member.roleKeys
      .filter((key) => key !== "admin")
      .sort()
      .join("|");
  const locked = Boolean(pendingAction);

  return (
    <tr className={locked ? "tenant-row-pending" : undefined} aria-busy={locked}>
      <td>
        <strong>{member.displayName}</strong>
        <span>{member.email}</span>
        {isSelf ? <span className="current-user-label">You</span> : null}
        {pendingAction ? (
          <span className="tenant-operation-status">
            <LoaderCircle className="spin-icon" aria-hidden="true" />
            {memberActionLabel(pendingAction)}
          </span>
        ) : null}
      </td>
      <td>
        <span className={`status-pill member-status-${member.status}`}>{member.status}</span>
      </td>
      <td>
        <div className="member-role-controls">
          {member.roleKeys.includes("admin") ? (
            <label className="role-check locked">
              <input type="checkbox" checked disabled />
              Admin
            </label>
          ) : null}
          {assignableRoles.map((role) => (
            <label className="role-check" key={role.id}>
              <input
                type="checkbox"
                checked={selectedRoleKeys.includes(role.key)}
                disabled={locked}
                onChange={(event) => {
                  setSelectedRoleKeys((current) =>
                    event.target.checked
                      ? [...current, role.key]
                      : current.filter((key) => key !== role.key)
                  );
                }}
              />
              {role.name}
            </label>
          ))}
          <button
            className="secondary-action compact-action"
            type="button"
            disabled={locked || !rolesChanged}
            onClick={() => onRoles(selectedRoleKeys)}
          >
            {pendingAction === "roles" ? (
              <LoaderCircle className="spin-icon" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {pendingAction === "roles" ? "Saving" : "Save roles"}
          </button>
        </div>
      </td>
      <td>{displayDate(member.createdAt)}</td>
      <td>
        {isSelf ? (
          <span className="self-protected-note">
            <ShieldCheck aria-hidden="true" />
            Protected current admin
          </span>
        ) : (
          <div className="member-account-actions">
            {member.status !== "active" ? (
              <button
                className="secondary-action compact-action"
                type="button"
                disabled={locked}
                onClick={() => onStatus("active", "approve")}
              >
                {pendingAction === "approve" ? (
                  <LoaderCircle className="spin-icon" aria-hidden="true" />
                ) : (
                  <UserCheck aria-hidden="true" />
                )}
                {pendingAction === "approve" ? "Approving" : "Approve"}
              </button>
            ) : (
              <button
                className="secondary-action compact-action"
                type="button"
                disabled={locked}
                onClick={() => onStatus("disabled", "disable")}
              >
                {pendingAction === "disable" ? (
                  <LoaderCircle className="spin-icon" aria-hidden="true" />
                ) : (
                  <UserX aria-hidden="true" />
                )}
                {pendingAction === "disable" ? "Disabling" : "Disable"}
              </button>
            )}
            {member.status === "pending" ? (
              <button
                className="secondary-action compact-action"
                type="button"
                disabled={locked}
                onClick={() => onStatus("rejected", "reject")}
              >
                {pendingAction === "reject" ? (
                  <LoaderCircle className="spin-icon" aria-hidden="true" />
                ) : (
                  <ShieldX aria-hidden="true" />
                )}
                {pendingAction === "reject" ? "Denying" : "Deny"}
              </button>
            ) : null}
            <button
              className="secondary-action compact-action danger-action"
              type="button"
              disabled={locked}
              onClick={onDelete}
            >
              {pendingAction === "delete" ? (
                <LoaderCircle className="spin-icon" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {pendingAction === "delete" ? "Removing" : "Remove"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

async function refreshWorkspaceData(queryClient: QueryClient, slug: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["workspace-members", slug] }),
    queryClient.invalidateQueries({ queryKey: ["workspace-session", slug] })
  ]);
}

function memberActionLabel(action: MemberPendingAction): string {
  if (action === "approve") return "Approving account";
  if (action === "reject") return "Denying registration";
  if (action === "disable") return "Disabling account";
  if (action === "delete") return "Removing workspace member";
  return "Saving roles";
}
