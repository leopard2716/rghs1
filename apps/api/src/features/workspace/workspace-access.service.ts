import type { AuthUser } from "../../auth/auth.types";
import { apiError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { NotificationService } from "../notifications/notification.service";
import type {
  WorkspaceMemberRolesInput,
  WorkspaceMemberStatusInput,
  WorkspaceRegistrationInput
} from "./workspace.schemas";
import type {
  WorkspaceMemberOnboardingRow,
  WorkspaceMemberRoleRow,
  WorkspaceMemberRow,
  WorkspaceRoleRow,
  WorkspaceRow
} from "./workspace-access.types";

export class WorkspaceAccessService {
  private readonly notifications: NotificationService;

  constructor(private readonly supabase: SupabaseRestClient) {
    this.notifications = new NotificationService(supabase);
  }

  async getPublicWorkspace(slug: string) {
    const workspace = await this.getWorkspaceBySlug(slug);

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        status: workspace.status,
        createdAt: workspace.created_at
      }
    };
  }

  async getWorkspaceSession(slug: string, user: AuthUser) {
    const workspace = await this.getWorkspaceBySlug(slug);
    if (workspace.status !== "active") {
      throw apiError(403, "Workspace is not active.", "workspace_not_active");
    }

    const member = await this.requireMember(workspace.id, user.id);
    const roles =
      member.status === "active" ? await this.rolesForMember(workspace.id, member.id) : [];
    const onboarding =
      member.status === "active" ? await this.onboardingForMember(workspace.id, member.id) : null;
    if (
      onboarding?.requires_password_change &&
      onboarding.temp_password_expires_at &&
      new Date(onboarding.temp_password_expires_at).getTime() < Date.now()
    ) {
      throw apiError(
        403,
        "Temporary password has expired. Ask a workspace owner to reset access.",
        "temporary_password_expired"
      );
    }

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        status: workspace.status,
        createdAt: workspace.created_at
      },
      member: {
        id: member.id,
        email: member.email,
        displayName: member.display_name,
        status: member.status,
        roleKeys: roles.map((role) => role.key)
      },
      accessState: member.status,
      canAccess: member.status === "active",
      requiresPasswordChange: onboarding?.requires_password_change ?? false,
      temporaryPasswordExpiresAt: onboarding?.temp_password_expires_at ?? null
    };
  }

  async getWorkspaceMembership(slug: string, user: AuthUser) {
    const workspace = await this.getWorkspaceBySlug(slug);
    if (workspace.status !== "active") {
      throw apiError(403, "Workspace is not active.", "workspace_not_active");
    }

    const member = await this.requireMember(workspace.id, user.id);
    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        status: workspace.status,
        createdAt: workspace.created_at
      },
      member: {
        id: member.id,
        email: member.email,
        displayName: member.display_name,
        status: member.status
      },
      accessState: member.status,
      canAccess: member.status === "active"
    };
  }

  async registerWorkspaceMember(
    slug: string,
    input: WorkspaceRegistrationInput,
    authenticatedUser: AuthUser
  ) {
    const workspace = await this.getWorkspaceBySlug(slug);
    if (workspace.status !== "active") {
      throw apiError(403, "Workspace is not accepting registrations.", "workspace_not_active");
    }

    if (
      !authenticatedUser.email ||
      authenticatedUser.email.toLowerCase() !== input.email.toLowerCase()
    ) {
      throw apiError(
        400,
        "Registration email does not match the signed-in account.",
        "registration_auth_user_mismatch"
      );
    }

    const [existing] = await this.supabase.select<WorkspaceMemberRow>(
      "workspace_members",
      "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
      {
        workspace_id: `eq.${workspace.id}`,
        auth_user_id: `eq.${authenticatedUser.id}`
      }
    );
    const now = new Date().toISOString();

    let member: WorkspaceMemberRow | undefined;
    if (existing) {
      if (existing.status === "active" || existing.status === "disabled") {
        throw apiError(
          409,
          existing.status === "active"
            ? "This account is already a workspace member."
            : "This workspace account is disabled.",
          existing.status === "active" ? "workspace_member_exists" : "workspace_member_disabled"
        );
      }

      [member] = await this.supabase.update<WorkspaceMemberRow>(
        "workspace_members",
        {
          display_name: input.displayName,
          email: input.email.toLowerCase(),
          status: "pending",
          deleted_at: null,
          updated_at: now
        },
        {
          id: `eq.${existing.id}`
        }
      );
    } else {
      [member] = await this.supabase.insert<WorkspaceMemberRow>("workspace_members", [
        {
          workspace_id: workspace.id,
          auth_user_id: authenticatedUser.id,
          display_name: input.displayName,
          email: input.email.toLowerCase(),
          status: "pending"
        }
      ]);
    }

    if (!member) {
      throw apiError(
        502,
        "Workspace registration did not return a member.",
        "workspace_registration_failed"
      );
    }

    await this.writeAudit(
      workspace.id,
      authenticatedUser.id,
      member.id,
      "workspace.registration.requested",
      member.id,
      { email: member.email }
    );

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug
      },
      member: this.memberResponse(member, []),
      message: "Account created. Registration is waiting for workspace-admin approval."
    };
  }

  async getWorkspaceMembers(slug: string, user: AuthUser) {
    const workspace = await this.getWorkspaceBySlug(slug);
    const actor = await this.requireWorkspaceAdmin(workspace.id, user.id);
    const [members, roles] = await Promise.all([
      this.supabase.select<WorkspaceMemberRow>(
        "workspace_members",
        "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
        {
          workspace_id: `eq.${workspace.id}`,
          deleted_at: "is.null"
        }
      ),
      this.supabase.select<WorkspaceRoleRow>(
        "workspace_roles",
        "id,workspace_id,name,key,system,deleted_at",
        {
          workspace_id: `eq.${workspace.id}`,
          deleted_at: "is.null"
        }
      )
    ]);
    const memberRoles = await this.supabase.select<WorkspaceMemberRoleRow>(
      "workspace_member_roles",
      "workspace_id,member_id,role_id",
      {
        workspace_id: `eq.${workspace.id}`
      }
    );

    const activeRoles = roles.filter((role) => role.key !== "viewer");
    const rolesById = new Map(activeRoles.map((role) => [role.id, role]));
    const roleKeysByMember = new Map<string, string[]>();
    for (const memberRole of memberRoles) {
      const role = rolesById.get(memberRole.role_id);
      if (!role) {
        continue;
      }

      const current = roleKeysByMember.get(memberRole.member_id) ?? [];
      current.push(role.key);
      roleKeysByMember.set(memberRole.member_id, current);
    }

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug
      },
      currentMemberId: actor.id,
      roles: activeRoles
        .sort((left, right) => roleSortOrder(left.key) - roleSortOrder(right.key))
        .map((role) => ({
          id: role.id,
          key: role.key,
          name: role.name,
          assignable: role.key !== "admin"
        })),
      members: members
        .sort((left, right) => {
          if (left.id === actor.id) return -1;
          if (right.id === actor.id) return 1;

          const statusDifference =
            memberStatusSortOrder(left.status) - memberStatusSortOrder(right.status);
          return statusDifference || left.display_name.localeCompare(right.display_name);
        })
        .map((member) => this.memberResponse(member, roleKeysByMember.get(member.id) ?? []))
    };
  }

  async updateWorkspaceMemberStatus(
    slug: string,
    memberId: string,
    user: AuthUser,
    input: WorkspaceMemberStatusInput
  ) {
    const workspace = await this.getWorkspaceBySlug(slug);
    const actor = await this.requireWorkspaceAdmin(workspace.id, user.id);
    const target = await this.requireWorkspaceMemberById(workspace.id, memberId);
    if (target.id === actor.id) {
      throw apiError(
        409,
        "You cannot change your own membership status.",
        "workspace_self_status_forbidden"
      );
    }

    const now = new Date().toISOString();
    const [updated] = await this.supabase.update<WorkspaceMemberRow>(
      "workspace_members",
      {
        status: input.status,
        updated_at: now
      },
      {
        id: `eq.${target.id}`,
        workspace_id: `eq.${workspace.id}`,
        deleted_at: "is.null"
      }
    );
    if (!updated) {
      throw apiError(
        502,
        "Member status update did not return a row.",
        "workspace_member_status_failed"
      );
    }

    await this.writeAudit(
      workspace.id,
      user.id,
      actor.id,
      `workspace.member.${input.status}`,
      target.id,
      { previousStatus: target.status }
    );

    return {
      member: this.memberResponse(
        updated,
        (await this.rolesForMember(workspace.id, target.id)).map((role) => role.key)
      )
    };
  }

  async updateWorkspaceMemberRoles(
    slug: string,
    memberId: string,
    user: AuthUser,
    input: WorkspaceMemberRolesInput
  ) {
    const workspace = await this.getWorkspaceBySlug(slug);
    const actor = await this.requireWorkspaceAdmin(workspace.id, user.id);
    const target = await this.requireWorkspaceMemberById(workspace.id, memberId);
    const [roles, existingMemberRoles] = await Promise.all([
      this.supabase.select<WorkspaceRoleRow>(
        "workspace_roles",
        "id,workspace_id,name,key,system,deleted_at",
        {
          workspace_id: `eq.${workspace.id}`,
          deleted_at: "is.null"
        }
      ),
      this.supabase.select<WorkspaceMemberRoleRow>(
        "workspace_member_roles",
        "workspace_id,member_id,role_id",
        {
          workspace_id: `eq.${workspace.id}`,
          member_id: `eq.${target.id}`
        }
      )
    ]);
    const assignableRoles = roles.filter(
      (role) => role.key === "bidder" || role.key === "interviewer"
    );
    const rolesByKey = new Map(assignableRoles.map((role) => [role.key, role]));
    const unknownRole = input.roleKeys.find((key) => !rolesByKey.has(key));
    if (unknownRole) {
      throw apiError(400, `Role ${unknownRole} cannot be assigned here.`, "workspace_role_invalid");
    }

    const existingRoleIds = new Set(existingMemberRoles.map((role) => role.role_id));
    const assignableRoleIds = new Set(assignableRoles.map((role) => role.id));
    const desiredRoleIds = new Set(
      [...existingRoleIds].filter((roleId) => !assignableRoleIds.has(roleId))
    );
    for (const roleKey of input.roleKeys) {
      const role = rolesByKey.get(roleKey);
      if (role) {
        desiredRoleIds.add(role.id);
      }
    }

    const roleIdsToRemove = [...existingRoleIds].filter((roleId) => !desiredRoleIds.has(roleId));
    const roleIdsToAdd = [...desiredRoleIds].filter((roleId) => !existingRoleIds.has(roleId));
    if (roleIdsToRemove.length > 0) {
      await this.supabase.delete("workspace_member_roles", {
        workspace_id: `eq.${workspace.id}`,
        member_id: `eq.${target.id}`,
        role_id: `in.(${roleIdsToRemove.join(",")})`
      });
    }
    if (roleIdsToAdd.length > 0) {
      await this.supabase.insert(
        "workspace_member_roles",
        roleIdsToAdd.map((roleId) => ({
          workspace_id: workspace.id,
          member_id: target.id,
          role_id: roleId
        }))
      );
    }

    const roleKeys = roles.filter((role) => desiredRoleIds.has(role.id)).map((role) => role.key);
    await this.writeAudit(
      workspace.id,
      user.id,
      actor.id,
      "workspace.member.roles.updated",
      target.id,
      { roleKeys }
    );

    return {
      member: this.memberResponse(target, roleKeys)
    };
  }

  async deleteWorkspaceMember(slug: string, memberId: string, user: AuthUser) {
    const workspace = await this.getWorkspaceBySlug(slug);
    const actor = await this.requireWorkspaceAdmin(workspace.id, user.id);
    const target = await this.requireWorkspaceMemberById(workspace.id, memberId);
    if (target.id === actor.id) {
      throw apiError(
        409,
        "You cannot remove your own workspace membership.",
        "workspace_self_delete_forbidden"
      );
    }

    const now = new Date().toISOString();
    const [deleted] = await this.supabase.update<WorkspaceMemberRow>(
      "workspace_members",
      {
        deleted_at: now,
        updated_at: now,
        status: "disabled"
      },
      {
        id: `eq.${target.id}`,
        workspace_id: `eq.${workspace.id}`,
        deleted_at: "is.null"
      }
    );
    if (!deleted) {
      throw apiError(502, "Member removal did not return a row.", "workspace_member_delete_failed");
    }

    await this.writeAudit(workspace.id, user.id, actor.id, "workspace.member.removed", target.id, {
      email: target.email
    });

    return { ok: true, memberId: target.id };
  }

  async completePasswordChange(slug: string, user: AuthUser) {
    const workspace = await this.getWorkspaceBySlug(slug);
    const member = await this.requireActiveMember(workspace.id, user.id);
    const now = new Date().toISOString();

    await this.supabase.update(
      "workspace_member_onboarding",
      {
        temp_password_hash: null,
        temp_password_expires_at: null,
        requires_password_change: false,
        password_changed_at: now,
        updated_at: now
      },
      {
        workspace_id: `eq.${workspace.id}`,
        member_id: `eq.${member.id}`
      }
    );

    await this.supabase.insert("audit_logs", [
      {
        workspace_id: workspace.id,
        actor_id: user.id,
        actor_member_id: member.id,
        action: "workspace.password.changed",
        target_type: "workspace_member",
        target_id: member.id,
        metadata: {
          source: "workspace-login"
        }
      }
    ]);

    return {
      ok: true,
      passwordChangedAt: now
    };
  }

  private async getWorkspaceBySlug(slug: string): Promise<WorkspaceRow> {
    const [workspace] = await this.supabase.select<WorkspaceRow>(
      "workspaces",
      "id,name,slug,status,created_at",
      {
        slug: `eq.${slug}`,
        deleted_at: "is.null"
      }
    );

    if (!workspace) {
      throw apiError(404, "Workspace was not found.", "workspace_not_found");
    }

    return workspace;
  }

  private async requireActiveMember(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMemberRow> {
    const [member] = await this.supabase.select<WorkspaceMemberRow>(
      "workspace_members",
      "id,workspace_id,auth_user_id,display_name,email,status,created_at",
      {
        workspace_id: `eq.${workspaceId}`,
        auth_user_id: `eq.${userId}`,
        status: "eq.active",
        deleted_at: "is.null"
      }
    );

    if (!member) {
      throw apiError(403, "Workspace access is required.", "workspace_access_required");
    }

    return member;
  }

  private async requireMember(workspaceId: string, userId: string): Promise<WorkspaceMemberRow> {
    const [member] = await this.supabase.select<WorkspaceMemberRow>(
      "workspace_members",
      "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
      {
        workspace_id: `eq.${workspaceId}`,
        auth_user_id: `eq.${userId}`,
        deleted_at: "is.null"
      }
    );

    if (!member) {
      throw apiError(403, "Workspace registration is required.", "workspace_registration_required");
    }

    return member;
  }

  private async requireWorkspaceMemberById(
    workspaceId: string,
    memberId: string
  ): Promise<WorkspaceMemberRow> {
    const [member] = await this.supabase.select<WorkspaceMemberRow>(
      "workspace_members",
      "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
      {
        id: `eq.${memberId}`,
        workspace_id: `eq.${workspaceId}`,
        deleted_at: "is.null"
      }
    );
    if (!member) {
      throw apiError(404, "Workspace member was not found.", "workspace_member_not_found");
    }

    return member;
  }

  private async requireWorkspaceAdmin(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMemberRow> {
    const member = await this.requireActiveMember(workspaceId, userId);
    const roles = await this.rolesForMember(workspaceId, member.id);
    if (!roles.some((role) => role.key === "admin")) {
      throw apiError(403, "Workspace admin access is required.", "workspace_admin_required");
    }

    return member;
  }

  private async rolesForMember(workspaceId: string, memberId: string): Promise<WorkspaceRoleRow[]> {
    const [roles, memberRoles] = await Promise.all([
      this.supabase.select<WorkspaceRoleRow>("workspace_roles", "id,workspace_id,name,key,system", {
        workspace_id: `eq.${workspaceId}`,
        deleted_at: "is.null"
      }),
      this.supabase.select<WorkspaceMemberRoleRow>(
        "workspace_member_roles",
        "workspace_id,member_id,role_id",
        {
          workspace_id: `eq.${workspaceId}`,
          member_id: `eq.${memberId}`
        }
      )
    ]);

    const roleIds = new Set(memberRoles.map((role) => role.role_id));
    return roles.filter((role) => roleIds.has(role.id));
  }

  private async onboardingForMember(
    workspaceId: string,
    memberId: string
  ): Promise<WorkspaceMemberOnboardingRow | null> {
    const [onboarding] = await this.supabase.select<WorkspaceMemberOnboardingRow>(
      "workspace_member_onboarding",
      "workspace_id,member_id,requires_password_change,temp_password_expires_at,password_changed_at",
      {
        workspace_id: `eq.${workspaceId}`,
        member_id: `eq.${memberId}`
      }
    );

    return onboarding ?? null;
  }

  private memberResponse(member: WorkspaceMemberRow, roleKeys: string[]) {
    return {
      id: member.id,
      email: member.email,
      displayName: member.display_name,
      status: member.status,
      roleKeys: roleKeys.filter((roleKey) => roleKey !== "viewer").sort(),
      createdAt: member.created_at,
      updatedAt: member.updated_at ?? member.created_at
    };
  }

  private async writeAudit(
    workspaceId: string,
    actorAuthId: string,
    actorMemberId: string,
    action: string,
    targetId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.supabase.insert("audit_logs", [
      {
        workspace_id: workspaceId,
        actor_id: actorAuthId,
        actor_member_id: actorMemberId,
        action,
        target_type: "workspace_member",
        target_id: targetId,
        metadata
      }
    ]);
    const notification = workspaceNotification(action);
    if (notification) {
      await this.notifications.notifyWorkspace(
        workspaceId,
        actorAuthId,
        {
          ...notification,
          eventType: action,
          entityType: "workspace_member",
          entityId: targetId,
          metadata
        },
        { adminsOnly: notification.adminsOnly }
      );
    }
  }
}

function roleSortOrder(roleKey: string): number {
  const order = ["admin", "bidder", "interviewer"];
  const index = order.indexOf(roleKey);
  return index === -1 ? order.length : index;
}

function memberStatusSortOrder(status: WorkspaceMemberRow["status"]): number {
  const order: WorkspaceMemberRow["status"][] = [
    "pending",
    "active",
    "invited",
    "disabled",
    "rejected"
  ];
  return order.indexOf(status);
}

function workspaceNotification(action: string) {
  if (action === "workspace.registration.requested") {
    return {
      priority: "warning" as const,
      title: "New user awaiting approval",
      message: "A user registered and requires workspace-admin review.",
      adminsOnly: true
    };
  }
  if (
    action === "workspace.member.active" ||
    action === "workspace.member.rejected" ||
    action === "workspace.member.disabled"
  ) {
    return {
      priority: "info" as const,
      title: "Workspace user status changed",
      message: "A workspace administrator updated a user account.",
      adminsOnly: false
    };
  }
  if (action === "workspace.member.roles.updated") {
    return {
      priority: "success" as const,
      title: "Workspace roles updated",
      message: "A workspace administrator updated user permissions.",
      adminsOnly: false
    };
  }
  if (action === "workspace.member.removed") {
    return {
      priority: "warning" as const,
      title: "Workspace user removed",
      message: "A workspace administrator removed a user.",
      adminsOnly: false
    };
  }
  return null;
}
