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
