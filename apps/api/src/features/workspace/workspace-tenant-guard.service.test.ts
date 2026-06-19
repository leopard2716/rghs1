import { describe, expect, it, vi } from "vitest";
import type { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { WorkspaceTenantGuardService } from "./workspace-tenant-guard.service";

describe("WorkspaceTenantGuardService", () => {
  it("resolves the tenant-local member for a global Auth identity", async () => {
    const select = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "workspace-a",
          status: "active",
          deleted_at: null
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "member-a",
          workspace_id: "workspace-a",
          auth_user_id: "auth-user-1",
          display_name: "Workspace A User",
          email: "person@example.com",
          status: "active",
          created_at: "2026-06-18T00:00:00.000Z"
        }
      ]);
    const guard = new WorkspaceTenantGuardService({
      select
    } as unknown as SupabaseRestClient);

    const member = await guard.requireActiveMember("workspace-a", "auth-user-1");

    expect(member.id).toBe("member-a");
    expect(select).toHaveBeenCalledWith(
      "workspace_members",
      expect.any(String),
      expect.objectContaining({
        workspace_id: "eq.workspace-a",
        auth_user_id: "eq.auth-user-1"
      })
    );
  });

  it("rejects a profile from another workspace", async () => {
    const guard = new WorkspaceTenantGuardService({
      select: vi.fn().mockResolvedValue([])
    } as unknown as SupabaseRestClient);

    await expect(
      guard.requireProfile("workspace-a", "profile-from-workspace-b")
    ).rejects.toMatchObject({
      status: 404,
      code: "workspace_profile_not_found"
    });
  });
});
