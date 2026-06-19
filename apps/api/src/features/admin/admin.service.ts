import { DEFAULT_ROLE_PERMISSIONS } from "@rghs1/domain";
import type { AuthUser } from "../../auth/auth.types";
import { ApiError, apiError } from "../../errors";
import { SupabaseAuthAdminClient } from "../../infrastructure/supabase-auth-admin.client";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { NotificationService } from "../notifications/notification.service";
import { newestDate } from "../../utils/date";
import { randomSha256Password, sha256Hex } from "../../utils/crypto";
import type { AssignWorkspaceAdminInput, CreateWorkspaceInput } from "./admin.schemas";
import { defaultMarketRows, tenantUrlPath, titleCaseRole, workspaceHealth } from "./admin.utils";
import type {
  AuditLogRow,
  WorkspaceMemberRow,
  WorkspaceMemberOnboardingRow,
  WorkspaceMemberRoleRow,
  WorkspaceRoleRow,
  WorkspaceRow
} from "./admin.types";

const workspaceAdminSelect =
  "id,name,slug,status,created_by,created_at,updated_at,deleted_at,deletion_requested_at,deletion_scheduled_at,deletion_requested_by";
const tenantDeletionGraceMs = 24 * 60 * 60 * 1000;

export class AdminService {
  private readonly notifications: NotificationService;

  constructor(
    private readonly supabase: SupabaseRestClient,
    private readonly authAdmin: SupabaseAuthAdminClient
  ) {
    this.notifications = new NotificationService(supabase);
  }

  async isPlatformAdmin(userId: string): Promise<boolean> {
    const rows = await this.supabase.select<{ user_id: string }>("platform_admins", "user_id", {
      user_id: `eq.${userId}`
    });

    return rows.length > 0;
  }

  async getCurrentAdmin(user: AuthUser) {
    return {
      user,
      platformAdmin: await this.isPlatformAdmin(user.id)
    };
  }

  async getOverview(user: AuthUser) {
    await this.requireGlobalAdmin(user.id);
    const purgedExpiredWorkspaces = await this.purgeExpiredDeletedWorkspaces();
    const workspaceResult = await this.selectWorkspacesForOverview();

    const [members, roles, memberRoles, auditLogs] = await Promise.all([
      this.supabase.select<WorkspaceMemberRow>(
        "workspace_members",
        "id,workspace_id,auth_user_id,display_name,email,status,created_at",
        {
          deleted_at: "is.null"
        }
      ),
      this.supabase.select<WorkspaceRoleRow>("workspace_roles", "id,workspace_id,name,key,system", {
        deleted_at: "is.null"
      }),
      this.supabase.select<WorkspaceMemberRoleRow>(
        "workspace_member_roles",
        "workspace_id,member_id,role_id"
      ),
      this.supabase.select<AuditLogRow>("audit_logs", "workspace_id,created_at")
    ]);
    const workspaces = workspaceResult.workspaces;

    const summaries = workspaces.map((workspace) => {
      const workspaceMembers = members.filter((member) => member.workspace_id === workspace.id);
      const workspaceRoles = roles.filter((role) => role.workspace_id === workspace.id);
      const workspaceAuditLogs = auditLogs.filter((event) => event.workspace_id === workspace.id);
      const activeMembers = workspaceMembers.filter((member) => member.status === "active").length;
      const invitedMembers = workspaceMembers.filter(
        (member) => member.status === "invited"
      ).length;
      const pendingMembers = workspaceMembers.filter(
        (member) => member.status === "pending"
      ).length;
      const rejectedMembers = workspaceMembers.filter(
        (member) => member.status === "rejected"
      ).length;
      const disabledMembers = workspaceMembers.filter(
        (member) => member.status === "disabled"
      ).length;
      const adminRoleIds = workspaceRoles
        .filter((role) => role.key === "admin")
        .map((role) => role.id);
      const adminMemberIds = new Set(
        memberRoles
          .filter((role) => adminRoleIds.includes(role.role_id))
          .map((role) => role.member_id)
      );
      const activeAdmins = workspaceMembers.filter(
        (member) => member.status === "active" && adminMemberIds.has(member.id)
      ).length;
      const latestAudit = workspaceAuditLogs
        .map((event) => event.created_at)
        .sort()
        .at(-1);

      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        status: workspace.status,
        health: workspaceHealth(workspace, activeAdmins),
        createdAt: workspace.created_at,
        urlPath: tenantUrlPath(workspace.slug),
        deletedAt: workspace.deleted_at,
        deletion: {
          requestedAt: workspace.deletion_requested_at,
          scheduledAt: workspace.deletion_scheduled_at,
          requestedBy: workspace.deletion_requested_by
        },
        users: {
          total: workspaceMembers.length,
          active: activeMembers,
          invited: invitedMembers,
          pending: pendingMembers,
          rejected: rejectedMembers,
          disabled: disabledMembers,
          admins: activeAdmins
        },
        dates: {
          createdAt: workspace.created_at,
          latestAt: newestDate(workspace.created_at, latestAudit)
        }
      };
    });

    return {
      platform: {
        totalWorkspaces: summaries.length,
        healthyWorkspaces: summaries.filter((workspace) => workspace.health === "healthy").length,
        attentionWorkspaces: summaries.filter((workspace) => workspace.health === "attention")
          .length,
        suspendedWorkspaces: summaries.filter((workspace) => workspace.health === "suspended")
          .length,
        totalUsers: members.length,
        activeUsers: members.filter((member) => member.status === "active").length,
        workspacesWithoutAdmin: summaries.filter(
          (workspace) => workspace.users.admins === 0 && workspace.health !== "deleting"
        ).length,
        deletingWorkspaces: summaries.filter((workspace) => workspace.health === "deleting").length,
        purgedExpiredWorkspaces,
        tenantDeletionAvailable: workspaceResult.deletionLifecycleAvailable
      },
      workspaces: summaries
    };
  }

  async createWorkspace(user: AuthUser, input: CreateWorkspaceInput) {
    await this.requireGlobalAdmin(user.id);

    const existing = await this.supabase.select<WorkspaceRow>("workspaces", "id", {
      slug: `eq.${input.slug}`
    });

    if (existing.length > 0) {
      throw apiError(409, "Workspace slug is already in use.", "workspace_slug_conflict");
    }

    const [workspace] = await this.supabase.insert<WorkspaceRow>("workspaces", [
      {
        name: input.name,
        slug: input.slug,
        status: "active",
        created_by: user.id
      }
    ]);

    if (!workspace) {
      throw apiError(
        502,
        "Workspace creation did not return a workspace row.",
        "workspace_create_failed"
      );
    }

    await this.createDefaultRoles(workspace.id);
    await this.supabase.insert(
      "job_markets",
      defaultMarketRows(workspace.id, user.id, input.defaultMarkets)
    );
    await this.writeWorkspaceCreatedAudit(workspace, user.id);

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        status: workspace.status,
        createdAt: workspace.created_at,
        urlPath: tenantUrlPath(workspace.slug)
      }
    };
  }

  async assignWorkspaceAdmin(
    user: AuthUser,
    workspaceId: string,
    input: AssignWorkspaceAdminInput
  ) {
    await this.requireGlobalAdmin(user.id);
    const workspace = await this.getWorkspaceForAdmin(workspaceId);

    if (workspace.deleted_at) {
      throw apiError(404, "Workspace was not found.", "workspace_not_found");
    }

    const [adminRole] = await this.supabase.select<WorkspaceRoleRow>(
      "workspace_roles",
      "id,workspace_id,name,key,system",
      {
        workspace_id: `eq.${workspace.id}`,
        key: "eq.admin",
        deleted_at: "is.null"
      }
    );

    if (!adminRole) {
      throw apiError(409, "Workspace admin role is missing.", "workspace_admin_role_missing");
    }

    const existingAuthUser = await this.authAdmin.findUserByEmail(input.email);
    let tempPassword: string | null = null;
    let authUser = existingAuthUser;
    if (!authUser) {
      tempPassword = await randomSha256Password();
      authUser = await this.authAdmin.createUserWithPassword(input.email, tempPassword);
    }
    const member = await this.ensureWorkspaceMember(workspace, authUser.id, input);
    await this.ensureMemberRole(workspace.id, member.id, adminRole.id);
    if (tempPassword) {
      await this.setTemporaryPasswordOnboarding(workspace.id, member.id, tempPassword);
    } else {
      await this.clearTemporaryPasswordOnboarding(workspace.id, member.id);
    }
    await this.writeWorkspaceAdminAssignedAudit(workspace, user.id, member.id);

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        urlPath: tenantUrlPath(workspace.slug)
      },
      member: {
        id: member.id,
        email: member.email,
        displayName: member.display_name,
        status: member.status
      },
      temporaryPassword: tempPassword,
      requiresPasswordChange: Boolean(tempPassword),
      expiresAt: tempPassword ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null
    };
  }

  async requestWorkspaceDeletion(user: AuthUser, workspaceId: string) {
    await this.requireGlobalAdmin(user.id);
    const workspace = await this.getWorkspaceForAdmin(workspaceId, true);

    if (workspace.deleted_at) {
      return {
        workspace: this.workspaceDeletionResponse(workspace),
        alreadyScheduled: true
      };
    }

    const now = new Date();
    const deletionScheduledAt = new Date(now.getTime() + tenantDeletionGraceMs).toISOString();
    const [updated] = await this.supabase.update<WorkspaceRow>(
      "workspaces",
      {
        deleted_at: now.toISOString(),
        deletion_requested_at: now.toISOString(),
        deletion_scheduled_at: deletionScheduledAt,
        deletion_requested_by: user.id,
        updated_at: now.toISOString()
      },
      {
        id: `eq.${workspace.id}`
      }
    );

    if (!updated) {
      throw apiError(
        502,
        "Workspace deletion request did not return a row.",
        "workspace_delete_failed"
      );
    }

    await this.writeWorkspaceLifecycleAudit(updated, user.id, "workspace.deletion.requested");

    return {
      workspace: this.workspaceDeletionResponse(updated),
      alreadyScheduled: false
    };
  }

  async cancelWorkspaceDeletion(user: AuthUser, workspaceId: string) {
    await this.requireGlobalAdmin(user.id);
    const workspace = await this.getWorkspaceForAdmin(workspaceId, true);

    if (!workspace.deleted_at) {
      return {
        workspace: this.workspaceDeletionResponse(workspace),
        cancelled: false
      };
    }

    if (
      workspace.deletion_scheduled_at &&
      new Date(workspace.deletion_scheduled_at).getTime() <= Date.now()
    ) {
      await this.purgeExpiredDeletedWorkspaces();
      throw apiError(
        409,
        "Workspace deletion grace period has expired.",
        "workspace_delete_grace_expired"
      );
    }

    const now = new Date().toISOString();
    const [updated] = await this.supabase.update<WorkspaceRow>(
      "workspaces",
      {
        deleted_at: null,
        deletion_requested_at: null,
        deletion_scheduled_at: null,
        deletion_requested_by: null,
        updated_at: now
      },
      {
        id: `eq.${workspace.id}`
      }
    );

    if (!updated) {
      throw apiError(
        502,
        "Workspace deletion cancellation did not return a row.",
        "workspace_delete_cancel_failed"
      );
    }

    await this.writeWorkspaceLifecycleAudit(updated, user.id, "workspace.deletion.cancelled");

    return {
      workspace: this.workspaceDeletionResponse(updated),
      cancelled: true
    };
  }

  async purgeExpiredDeletedWorkspaces(): Promise<number> {
    let expiredWorkspaces: WorkspaceRow[];
    try {
      expiredWorkspaces = await this.supabase.select<WorkspaceRow>(
        "workspaces",
        workspaceAdminSelect,
        {
          deleted_at: "not.is.null",
          deletion_scheduled_at: `lte.${new Date().toISOString()}`
        }
      );
    } catch (error) {
      if (this.isMissingDeletionLifecycle(error)) {
        return 0;
      }

      throw error;
    }

    if (expiredWorkspaces.length === 0) {
      return 0;
    }

    const workspaceIdFilter = `in.(${expiredWorkspaces.map((workspace) => workspace.id).join(",")})`;
    await this.supabase.delete("login_events", {
      workspace_id: workspaceIdFilter
    });

    const deleted = await this.supabase.delete<WorkspaceRow>("workspaces", {
      id: workspaceIdFilter
    });

    return deleted.length;
  }

  private async requireGlobalAdmin(userId: string): Promise<void> {
    if (!(await this.isPlatformAdmin(userId))) {
      throw apiError(403, "Global admin access is required.", "global_admin_required");
    }
  }

  private async createDefaultRoles(workspaceId: string): Promise<WorkspaceRoleRow[]> {
    const roles = await this.supabase.insert<WorkspaceRoleRow>(
      "workspace_roles",
      Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([key]) => ({
        workspace_id: workspaceId,
        name: titleCaseRole(key),
        key,
        system: true
      }))
    );

    const permissions = roles.flatMap((role) =>
      (DEFAULT_ROLE_PERMISSIONS[role.key] ?? []).map((permission) => ({
        workspace_id: workspaceId,
        role_id: role.id,
        permission
      }))
    );

    await this.supabase.insert("workspace_role_permissions", permissions);
    return roles;
  }

  private async getWorkspaceForAdmin(
    workspaceId: string,
    requireDeletionLifecycle = false
  ): Promise<WorkspaceRow> {
    let workspace: WorkspaceRow | undefined;
    try {
      const rows = await this.supabase.select<WorkspaceRow>("workspaces", workspaceAdminSelect, {
        id: `eq.${workspaceId}`
      });
      workspace = rows[0];
    } catch (error) {
      if (this.isMissingDeletionLifecycle(error)) {
        if (requireDeletionLifecycle) {
          throw apiError(
            503,
            "Tenant deletion requires Supabase migration 0003_workspace_deletion_lifecycle.sql.",
            "tenant_deletion_migration_required"
          );
        }

        const [legacyWorkspace] = await this.supabase.select<
          Omit<
            WorkspaceRow,
            "deletion_requested_at" | "deletion_scheduled_at" | "deletion_requested_by"
          >
        >("workspaces", "id,name,slug,status,created_by,created_at,updated_at,deleted_at", {
          id: `eq.${workspaceId}`
        });

        workspace = legacyWorkspace
          ? {
              ...legacyWorkspace,
              deletion_requested_at: null,
              deletion_scheduled_at: null,
              deletion_requested_by: null
            }
          : undefined;
      } else {
        throw error;
      }
    }

    if (!workspace) {
      throw apiError(404, "Workspace was not found.", "workspace_not_found");
    }

    return workspace;
  }

  private async selectWorkspacesForOverview(): Promise<{
    workspaces: WorkspaceRow[];
    deletionLifecycleAvailable: boolean;
  }> {
    try {
      return {
        workspaces: await this.supabase.select<WorkspaceRow>("workspaces", workspaceAdminSelect),
        deletionLifecycleAvailable: true
      };
    } catch (error) {
      if (!this.isMissingDeletionLifecycle(error)) {
        throw error;
      }

      const legacyRows = await this.supabase.select<
        Omit<
          WorkspaceRow,
          "deletion_requested_at" | "deletion_scheduled_at" | "deletion_requested_by"
        >
      >("workspaces", "id,name,slug,status,created_by,created_at,updated_at,deleted_at");

      return {
        workspaces: legacyRows.map((workspace) => ({
          ...workspace,
          deletion_requested_at: null,
          deletion_scheduled_at: null,
          deletion_requested_by: null
        })),
        deletionLifecycleAvailable: false
      };
    }
  }

  private isMissingDeletionLifecycle(error: unknown): boolean {
    if (!(error instanceof ApiError)) {
      return false;
    }

    return ["deletion_requested_at", "deletion_scheduled_at", "deletion_requested_by"].some(
      (column) => error.message.includes(column)
    );
  }

  private workspaceDeletionResponse(workspace: WorkspaceRow) {
    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      urlPath: tenantUrlPath(workspace.slug),
      deletedAt: workspace.deleted_at,
      deletionRequestedAt: workspace.deletion_requested_at,
      deletionScheduledAt: workspace.deletion_scheduled_at
    };
  }

  private async ensureWorkspaceMember(
    workspace: WorkspaceRow,
    userId: string,
    input: AssignWorkspaceAdminInput
  ): Promise<WorkspaceMemberRow> {
    const [existing] = await this.supabase.select<WorkspaceMemberRow>(
      "workspace_members",
      "id,workspace_id,auth_user_id,display_name,email,status,created_at",
      {
        workspace_id: `eq.${workspace.id}`,
        auth_user_id: `eq.${userId}`
      }
    );

    if (existing) {
      const [member] = await this.supabase.update<WorkspaceMemberRow>(
        "workspace_members",
        {
          display_name: input.displayName ?? existing.display_name ?? input.email,
          email: input.email,
          status: "active",
          deleted_at: null,
          updated_at: new Date().toISOString()
        },
        {
          id: `eq.${existing.id}`
        }
      );

      if (!member) {
        throw apiError(
          502,
          "Workspace member update did not return a row.",
          "workspace_member_update_failed"
        );
      }

      return member;
    }

    const [member] = await this.supabase.insert<WorkspaceMemberRow>("workspace_members", [
      {
        workspace_id: workspace.id,
        auth_user_id: userId,
        display_name: input.displayName ?? input.email,
        email: input.email,
        status: "active"
      }
    ]);

    if (!member) {
      throw apiError(502, "Workspace member creation failed.", "workspace_member_seed_failed");
    }

    return member;
  }

  private async ensureMemberRole(
    workspaceId: string,
    memberId: string,
    roleId: string
  ): Promise<void> {
    const existing = await this.supabase.select<WorkspaceMemberRoleRow>(
      "workspace_member_roles",
      "workspace_id,member_id,role_id",
      {
        workspace_id: `eq.${workspaceId}`,
        member_id: `eq.${memberId}`,
        role_id: `eq.${roleId}`
      }
    );

    if (existing.length > 0) {
      return;
    }

    await this.supabase.insert("workspace_member_roles", [
      {
        workspace_id: workspaceId,
        member_id: memberId,
        role_id: roleId
      }
    ]);
  }

  private async setTemporaryPasswordOnboarding(
    workspaceId: string,
    memberId: string,
    tempPassword: string
  ): Promise<void> {
    const tempPasswordHash = await sha256Hex(tempPassword);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const existing = await this.supabase.select<WorkspaceMemberOnboardingRow>(
      "workspace_member_onboarding",
      "workspace_id,member_id,temp_password_hash,temp_password_expires_at,requires_password_change,password_changed_at",
      {
        workspace_id: `eq.${workspaceId}`,
        member_id: `eq.${memberId}`
      }
    );

    const values = {
      temp_password_hash: tempPasswordHash,
      temp_password_expires_at: expiresAt,
      requires_password_change: true,
      password_changed_at: null,
      updated_at: new Date().toISOString()
    };

    if (existing.length > 0) {
      await this.supabase.update("workspace_member_onboarding", values, {
        workspace_id: `eq.${workspaceId}`,
        member_id: `eq.${memberId}`
      });
      return;
    }

    await this.supabase.insert("workspace_member_onboarding", [
      {
        workspace_id: workspaceId,
        member_id: memberId,
        ...values
      }
    ]);
  }

  private async clearTemporaryPasswordOnboarding(
    workspaceId: string,
    memberId: string
  ): Promise<void> {
    const existing = await this.supabase.select<WorkspaceMemberOnboardingRow>(
      "workspace_member_onboarding",
      "workspace_id,member_id,temp_password_hash,temp_password_expires_at,requires_password_change,password_changed_at",
      {
        workspace_id: `eq.${workspaceId}`,
        member_id: `eq.${memberId}`
      }
    );

    if (existing.length === 0) {
      return;
    }

    await this.supabase.update(
      "workspace_member_onboarding",
      {
        temp_password_hash: null,
        temp_password_expires_at: null,
        requires_password_change: false,
        password_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        workspace_id: `eq.${workspaceId}`,
        member_id: `eq.${memberId}`
      }
    );
  }

  private async writeWorkspaceCreatedAudit(
    workspace: WorkspaceRow,
    actorId: string
  ): Promise<void> {
    await this.supabase.insert("audit_logs", [
      {
        workspace_id: workspace.id,
        actor_id: actorId,
        action: "workspace.created",
        target_type: "workspace",
        target_id: workspace.id,
        metadata: {
          slug: workspace.slug,
          source: "global-admin"
        }
      }
    ]);
    await this.notifications.notifyPlatformAdmins(actorId, {
      priority: "success",
      eventType: "workspace.created",
      title: "Workspace created",
      message: `${workspace.name} was created.`,
      actionUrl: "/admin/tenants",
      entityType: "workspace",
      entityId: workspace.id
    });
  }

  private async writeWorkspaceAdminAssignedAudit(
    workspace: WorkspaceRow,
    actorId: string,
    memberId: string
  ): Promise<void> {
    await this.supabase.insert("audit_logs", [
      {
        workspace_id: workspace.id,
        actor_id: actorId,
        action: "workspace.admin.assigned",
        target_type: "workspace_member",
        target_id: memberId,
        metadata: {
          slug: workspace.slug,
          source: "global-admin"
        }
      }
    ]);
    await Promise.all([
      this.notifications.notifyPlatformAdmins(actorId, {
        priority: "info",
        eventType: "workspace.admin.assigned",
        title: "Workspace admin assigned",
        message: `An administrator was assigned to ${workspace.name}.`,
        actionUrl: "/admin/tenants",
        entityType: "workspace_member",
        entityId: memberId
      }),
      this.notifications.notifyWorkspace(workspace.id, null, {
        priority: "success",
        eventType: "workspace.admin.assigned",
        title: "Workspace administrator assigned",
        message: "A workspace administrator account is now active.",
        actionUrl: `/${workspace.slug}/users`,
        entityType: "workspace_member",
        entityId: memberId
      })
    ]);
  }

  private async writeWorkspaceLifecycleAudit(
    workspace: WorkspaceRow,
    actorId: string,
    action: "workspace.deletion.requested" | "workspace.deletion.cancelled"
  ): Promise<void> {
    await this.supabase.insert("audit_logs", [
      {
        workspace_id: workspace.id,
        actor_id: actorId,
        action,
        target_type: "workspace",
        target_id: workspace.id,
        metadata: {
          slug: workspace.slug,
          deletionScheduledAt: workspace.deletion_scheduled_at,
          source: "global-admin"
        }
      }
    ]);
    await Promise.all([
      this.notifications.notifyPlatformAdmins(actorId, {
        priority: action.endsWith("requested") ? "critical" : "success",
        eventType: action,
        title: action.endsWith("requested")
          ? "Workspace deletion requested"
          : "Workspace deletion cancelled",
        message: `${workspace.name} lifecycle status changed.`,
        actionUrl: "/admin/tenants",
        entityType: "workspace",
        entityId: workspace.id
      }),
      this.notifications.notifyWorkspace(workspace.id, null, {
        priority: action.endsWith("requested") ? "critical" : "success",
        eventType: action,
        title: action.endsWith("requested")
          ? "Workspace scheduled for deletion"
          : "Workspace deletion cancelled",
        message: action.endsWith("requested")
          ? "This workspace is scheduled for permanent deletion after the grace period."
          : "The workspace deletion request was cancelled.",
        entityType: "workspace",
        entityId: workspace.id
      })
    ]);
  }
}
