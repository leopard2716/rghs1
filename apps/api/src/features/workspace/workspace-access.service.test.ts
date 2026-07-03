import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import type { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { WorkspaceAccessService } from "./workspace-access.service";
import type {
  WorkspaceMemberRoleRow,
  WorkspaceMemberRow,
  WorkspaceRoleRow,
  WorkspaceRow
} from "./workspace-access.types";

describe("WorkspaceAccessService role management", () => {
  it("preserves admin when an admin assigns bidder and interviewer roles to themselves", async () => {
    const workspace: WorkspaceRow = {
      id: "workspace-1",
      name: "Workspace One",
      slug: "workspace-one",
      status: "active",
      created_at: "2026-06-22T00:00:00.000Z"
    };
    const adminMember: WorkspaceMemberRow = {
      id: "member-1",
      workspace_id: workspace.id,
      auth_user_id: "user-1",
      display_name: "Tenant Admin",
      email: "admin@example.com",
      status: "active",
      created_at: "2026-06-22T00:00:00.000Z",
      updated_at: "2026-06-22T00:00:00.000Z",
      deleted_at: null
    };
    const roles: WorkspaceRoleRow[] = [
      {
        id: "role-admin",
        workspace_id: workspace.id,
        name: "Admin",
        key: "admin",
        system: true
      },
      {
        id: "role-bidder",
        workspace_id: workspace.id,
        name: "Bidder",
        key: "bidder",
        system: true
      },
      {
        id: "role-interviewer",
        workspace_id: workspace.id,
        name: "Interviewer",
        key: "interviewer",
        system: true
      }
    ];
    const adminRoleAssignment: WorkspaceMemberRoleRow = {
      workspace_id: workspace.id,
      member_id: adminMember.id,
      role_id: "role-admin"
    };
    const select = vi.fn(
      async (
        table: string,
        _columns: string,
        filters: Record<string, string> = {}
      ): Promise<unknown[]> => {
        if (table === "workspaces") return [workspace];
        if (table === "workspace_members") return [adminMember];
        if (table === "workspace_roles") return roles;
        if (table === "workspace_member_roles" && filters.member_id === "eq.member-1") {
          return [adminRoleAssignment];
        }
        return [];
      }
    );
    const insert = vi.fn(async (_table: string, rows: Record<string, unknown>[]) => rows);
    const deleteRows = vi.fn(async () => []);
    const supabase = {
      select,
      insert,
      delete: deleteRows
    } as unknown as SupabaseRestClient;
    const service = new WorkspaceAccessService(supabase);
    const user: AuthUser = { id: adminMember.auth_user_id, email: adminMember.email };

    const result = await service.updateWorkspaceMemberRoles(workspace.slug, adminMember.id, user, {
      roleKeys: ["bidder", "interviewer"]
    });

    expect(deleteRows).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith("workspace_member_roles", [
      {
        workspace_id: workspace.id,
        member_id: adminMember.id,
        role_id: "role-bidder"
      },
      {
        workspace_id: workspace.id,
        member_id: adminMember.id,
        role_id: "role-interviewer"
      }
    ]);
    expect(result.member.roleKeys).toEqual(["admin", "bidder", "interviewer"]);
  });
});

describe("WorkspaceAccessService account profile", () => {
  it("updates the active member display name", async () => {
    const workspace = workspaceRow();
    const member = memberRow(workspace.id);
    const updatedMember: WorkspaceMemberRow = {
      ...member,
      display_name: "Updated Member",
      updated_at: "2026-07-03T10:00:00.000Z"
    };
    const select = vi.fn(async (table: string): Promise<unknown[]> => {
      if (table === "workspaces") return [workspace];
      if (table === "workspace_members") return [member];
      return [];
    });
    const update = vi.fn(async () => [updatedMember]);
    const insert = vi.fn(async (_table: string, rows: Record<string, unknown>[]) => rows);
    const service = new WorkspaceAccessService({
      select,
      update,
      insert
    } as unknown as SupabaseRestClient);

    const result = await service.updateWorkspaceAccount(
      workspace.slug,
      { id: member.auth_user_id, email: member.email },
      { displayName: "Updated Member" }
    );

    expect(update).toHaveBeenCalledWith(
      "workspace_members",
      expect.objectContaining({
        display_name: "Updated Member"
      }),
      {
        id: `eq.${member.id}`,
        workspace_id: `eq.${workspace.id}`,
        deleted_at: "is.null"
      }
    );
    expect(insert).toHaveBeenCalledWith("audit_logs", [
      expect.objectContaining({
        action: "workspace.account.updated",
        target_id: member.id
      })
    ]);
    expect(result.member.displayName).toBe("Updated Member");
  });

  it("stores a cropped avatar and removes the previous object", async () => {
    const workspace = workspaceRow();
    const member: WorkspaceMemberRow = {
      ...memberRow(workspace.id),
      avatar_storage_key: "workspace-1/members/member-1/avatar-old.png",
      avatar_mime_type: "image/png",
      avatar_updated_at: "2026-07-02T10:00:00.000Z"
    };
    const select = vi.fn(async (table: string): Promise<unknown[]> => {
      if (table === "workspaces") return [workspace];
      if (table === "workspace_members") return [member];
      return [];
    });
    const update = vi.fn(
      async (_table: string, values: Record<string, unknown>): Promise<WorkspaceMemberRow[]> => [
        {
          ...member,
          avatar_storage_key: String(values.avatar_storage_key),
          avatar_mime_type: String(values.avatar_mime_type),
          avatar_updated_at: String(values.avatar_updated_at)
        }
      ]
    );
    const insert = vi.fn(async (_table: string, rows: Record<string, unknown>[]) => rows);
    const bucket = {
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined)
    } as unknown as R2Bucket;
    const service = new WorkspaceAccessService({
      select,
      update,
      insert
    } as unknown as SupabaseRestClient);
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    const result = await service.uploadWorkspaceAvatar(
      workspace.slug,
      { id: member.auth_user_id, email: member.email },
      file,
      bucket
    );

    expect(bucket.put).toHaveBeenCalledWith(
      expect.stringMatching(/^workspace-1\/members\/member-1\/avatar-.+\.png$/),
      expect.anything(),
      expect.objectContaining({
        httpMetadata: {
          contentType: "image/png"
        }
      })
    );
    expect(bucket.delete).toHaveBeenCalledWith("workspace-1/members/member-1/avatar-old.png");
    expect(result.member.avatarMimeType).toBe("image/png");
    expect(result.member.avatarUpdatedAt).toBeTruthy();
  });
});

function workspaceRow(): WorkspaceRow {
  return {
    id: "workspace-1",
    name: "Workspace One",
    slug: "workspace-one",
    status: "active",
    created_at: "2026-06-22T00:00:00.000Z"
  };
}

function memberRow(workspaceId: string): WorkspaceMemberRow {
  return {
    id: "member-1",
    workspace_id: workspaceId,
    auth_user_id: "user-1",
    display_name: "Tenant Member",
    email: "member@example.com",
    status: "active",
    created_at: "2026-06-22T00:00:00.000Z",
    updated_at: "2026-06-22T00:00:00.000Z",
    deleted_at: null
  };
}
