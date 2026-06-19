import type { AuthUser } from "../../auth/auth.types";
import { apiError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import type {
  WorkspaceMemberRoleRow,
  WorkspaceMemberRow,
  WorkspaceRoleRow,
  WorkspaceRow
} from "../workspace/workspace-access.types";
import type { NotificationPriority, NotificationRow } from "./notification.types";

type NotificationInput = {
  priority: NotificationPriority;
  eventType: string;
  title: string;
  message: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export class NotificationService {
  constructor(private readonly supabase: SupabaseRestClient) {}

  async list(user: AuthUser, options: { workspaceSlug?: string; scope?: "admin" }) {
    let workspaceId: string | undefined;
    if (options.workspaceSlug) {
      const workspace = await this.requireWorkspaceMember(options.workspaceSlug, user.id);
      workspaceId = workspace.id;
    } else if (options.scope === "admin") {
      await this.requirePlatformAdmin(user.id);
    } else {
      throw apiError(400, "Notification scope is required.", "notification_scope_required");
    }

    const filters: Record<string, string> = {
      recipient_auth_user_id: `eq.${user.id}`,
      scope: `eq.${options.scope === "admin" ? "admin" : "workspace"}`
    };
    if (workspaceId) {
      filters.workspace_id = `eq.${workspaceId}`;
    }
    const rows = await this.supabase.select<NotificationRow>(
      "notifications",
      "id,recipient_auth_user_id,workspace_id,scope,priority,event_type,title,message,action_url,entity_type,entity_id,metadata,created_at,read_at",
      filters
    );
    const sortedRows = rows.sort((left, right) => right.created_at.localeCompare(left.created_at));
    const notifications = sortedRows.slice(0, 100).map(notificationResponse);

    return {
      unreadCount: sortedRows.filter((notification) => !notification.read_at).length,
      notifications
    };
  }

  async markRead(user: AuthUser, notificationId: string) {
    const [notification] = await this.supabase.update<NotificationRow>(
      "notifications",
      { read_at: new Date().toISOString() },
      {
        id: `eq.${notificationId}`,
        recipient_auth_user_id: `eq.${user.id}`,
        read_at: "is.null"
      }
    );
    return { ok: true, notificationId: notification?.id ?? notificationId };
  }

  async markAllRead(user: AuthUser, options: { workspaceSlug?: string; scope?: "admin" }) {
    let workspaceId: string | undefined;
    if (options.workspaceSlug) {
      workspaceId = (await this.requireWorkspaceMember(options.workspaceSlug, user.id)).id;
    } else if (options.scope === "admin") {
      await this.requirePlatformAdmin(user.id);
    }
    const filters: Record<string, string> = {
      recipient_auth_user_id: `eq.${user.id}`,
      scope: `eq.${options.scope === "admin" ? "admin" : "workspace"}`,
      read_at: "is.null"
    };
    if (workspaceId) {
      filters.workspace_id = `eq.${workspaceId}`;
    }
    await this.supabase.update("notifications", { read_at: new Date().toISOString() }, filters);
    return { ok: true };
  }

  async notifyWorkspace(
    workspaceId: string,
    actorAuthUserId: string | null,
    input: NotificationInput,
    options: {
      adminsOnly?: boolean;
      recipientAuthUserIds?: string[];
    } = {}
  ) {
    const members = await this.supabase.select<WorkspaceMemberRow>(
      "workspace_members",
      "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
      {
        workspace_id: `eq.${workspaceId}`,
        status: "eq.active",
        deleted_at: "is.null"
      }
    );
    let recipientIds = members.map((member) => member.auth_user_id);
    if (options.adminsOnly) {
      const [roles, memberRoles] = await Promise.all([
        this.supabase.select<WorkspaceRoleRow>(
          "workspace_roles",
          "id,workspace_id,name,key,system,deleted_at",
          {
            workspace_id: `eq.${workspaceId}`,
            key: "eq.admin",
            deleted_at: "is.null"
          }
        ),
        this.supabase.select<WorkspaceMemberRoleRow>(
          "workspace_member_roles",
          "workspace_id,member_id,role_id",
          { workspace_id: `eq.${workspaceId}` }
        )
      ]);
      const adminRoleIds = new Set(roles.map((role) => role.id));
      const adminMemberIds = new Set(
        memberRoles.filter((role) => adminRoleIds.has(role.role_id)).map((role) => role.member_id)
      );
      recipientIds = members
        .filter((member) => adminMemberIds.has(member.id))
        .map((member) => member.auth_user_id);
    }
    if (options.recipientAuthUserIds) {
      const requested = new Set(options.recipientAuthUserIds);
      recipientIds = recipientIds.filter((id) => requested.has(id));
    }
    recipientIds = [...new Set(recipientIds)].filter((id) => id !== actorAuthUserId);
    await this.insertRecipients(recipientIds, workspaceId, "workspace", input);
  }

  async notifyPlatformAdmins(actorAuthUserId: string | null, input: NotificationInput) {
    const rows = await this.supabase.select<{ user_id: string }>("platform_admins", "user_id");
    const recipientIds = [...new Set(rows.map((row) => row.user_id))].filter(
      (id) => id !== actorAuthUserId
    );
    await this.insertRecipients(recipientIds, null, "admin", input);
  }

  private async insertRecipients(
    recipientIds: string[],
    workspaceId: string | null,
    scope: "admin" | "workspace",
    input: NotificationInput
  ) {
    if (!recipientIds.length) {
      return;
    }
    await this.supabase.insert(
      "notifications",
      recipientIds.map((recipientId) => ({
        recipient_auth_user_id: recipientId,
        workspace_id: workspaceId,
        scope,
        priority: input.priority,
        event_type: input.eventType,
        title: input.title,
        message: input.message,
        action_url: input.actionUrl ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        metadata: input.metadata ?? {}
      }))
    );
  }

  private async requireWorkspaceMember(slug: string, authUserId: string) {
    const [workspace] = await this.supabase.select<WorkspaceRow>(
      "workspaces",
      "id,name,slug,status,created_at",
      {
        slug: `eq.${slug}`,
        status: "eq.active",
        deleted_at: "is.null"
      }
    );
    if (!workspace) {
      throw apiError(404, "Workspace was not found.", "workspace_not_found");
    }
    const members = await this.supabase.select<WorkspaceMemberRow>(
      "workspace_members",
      "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
      {
        workspace_id: `eq.${workspace.id}`,
        auth_user_id: `eq.${authUserId}`,
        status: "eq.active",
        deleted_at: "is.null"
      }
    );
    if (!members.length) {
      throw apiError(403, "Active workspace membership is required.", "workspace_access_required");
    }
    return workspace;
  }

  private async requirePlatformAdmin(authUserId: string) {
    const admins = await this.supabase.select<{ user_id: string }>("platform_admins", "user_id", {
      user_id: `eq.${authUserId}`
    });
    if (!admins.length) {
      throw apiError(403, "Global admin access is required.", "global_admin_required");
    }
  }
}

function notificationResponse(row: NotificationRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    scope: row.scope,
    priority: row.priority,
    eventType: row.event_type,
    title: row.title,
    message: row.message,
    actionUrl: row.action_url,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata,
    createdAt: row.created_at,
    readAt: row.read_at
  };
}
