import { apiError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import type { WorkspaceMemberRow } from "./workspace-access.types";

type WorkspaceStatusRow = {
  id: string;
  status: "active" | "suspended" | "archived";
  deleted_at: string | null;
};

export class WorkspaceTenantGuardService {
  constructor(private readonly supabase: SupabaseRestClient) {}

  async requireActiveMember(workspaceId: string, authUserId: string): Promise<WorkspaceMemberRow> {
    const [workspace, member] = await Promise.all([
      this.supabase.select<WorkspaceStatusRow>("workspaces", "id,status,deleted_at", {
        id: `eq.${workspaceId}`
      }),
      this.supabase.select<WorkspaceMemberRow>(
        "workspace_members",
        "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
        {
          workspace_id: `eq.${workspaceId}`,
          auth_user_id: `eq.${authUserId}`,
          status: "eq.active",
          deleted_at: "is.null"
        }
      )
    ]);

    if (!workspace[0] || workspace[0].status !== "active" || workspace[0].deleted_at) {
      throw apiError(404, "Workspace was not found.", "workspace_not_found");
    }

    if (!member[0]) {
      throw apiError(403, "Active workspace membership is required.", "workspace_access_required");
    }

    return member[0];
  }

  async requireProfile(workspaceId: string, profileId: string): Promise<void> {
    const profiles = await this.supabase.select<{ id: string }>("profiles", "id", {
      id: `eq.${profileId}`,
      workspace_id: `eq.${workspaceId}`,
      deleted_at: "is.null"
    });

    if (profiles.length === 0) {
      throw apiError(
        404,
        "Profile was not found in this workspace.",
        "workspace_profile_not_found"
      );
    }
  }
}
