import { describe, expect, it, vi } from "vitest";
import type { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { TrackingService } from "./tracking.service";

const workspaceId = "36d3bc70-8739-49c3-bf51-fe4ed570cc8b";
const memberId = "6f20f129-5f73-4f1c-99a7-e381cb4b6ac9";
const authUserId = "12f253ea-6d0e-4a34-bdca-488a393dd7de";
const recordId = "9df4620e-5d19-4d48-90d2-2a08450b13c3";

describe("TrackingService deletion ownership", () => {
  it("soft-deletes a bid only through its workspace and creator member id", async () => {
    const supabase = trackingSupabase("bidder", "bid_records");
    const service = trackingService(supabase);

    await expect(service.deleteBid("rg-team", recordId, { id: authUserId })).resolves.toEqual({
      ok: true,
      bidId: recordId
    });

    expect(supabase.update).toHaveBeenCalledWith(
      "bid_records",
      expect.objectContaining({
        deleted_at: expect.any(String),
        updated_at: expect.any(String)
      }),
      {
        workspace_id: `eq.${workspaceId}`,
        id: `eq.${recordId}`,
        created_by_member_id: `eq.${memberId}`,
        deleted_at: "is.null"
      }
    );
    expect(supabase.delete).not.toHaveBeenCalled();
  });

  it("soft-deletes an interview only through its workspace and creator member id", async () => {
    const supabase = trackingSupabase("interviewer", "interview_records");
    const service = trackingService(supabase);

    await expect(service.deleteInterview("rg-team", recordId, { id: authUserId })).resolves.toEqual(
      { ok: true, interviewId: recordId }
    );

    expect(supabase.update).toHaveBeenCalledWith(
      "interview_records",
      expect.any(Object),
      expect.objectContaining({
        workspace_id: `eq.${workspaceId}`,
        created_by_member_id: `eq.${memberId}`
      })
    );
  });

  it("soft-deletes only the profile row and preserves related history tables", async () => {
    const supabase = trackingSupabase("admin", "tracking_profiles");
    const service = trackingService(supabase);

    await service.deleteProfile("rg-team", recordId, { id: authUserId });

    expect(supabase.update).toHaveBeenCalledTimes(1);
    expect(supabase.update).toHaveBeenCalledWith(
      "tracking_profiles",
      expect.any(Object),
      expect.objectContaining({
        workspace_id: `eq.${workspaceId}`,
        id: `eq.${recordId}`
      })
    );
    expect(supabase.delete).not.toHaveBeenCalled();
  });

  it("rejects bid deletion when the member no longer has the bidder role", async () => {
    const supabase = trackingSupabase("admin", "bid_records");
    const service = trackingService(supabase);

    await expect(service.deleteBid("rg-team", recordId, { id: authUserId })).rejects.toMatchObject({
      code: "workspace_bidder_required"
    });
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("rejects bid deletion when another workspace member created it", async () => {
    const supabase = trackingSupabase(
      "bidder",
      "bid_records",
      "9df4620e-5d19-4d48-90d2-2a08450b13c4"
    );
    const service = trackingService(supabase);

    await expect(service.deleteBid("rg-team", recordId, { id: authUserId })).rejects.toMatchObject({
      code: "bid_record_owner_required"
    });
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("rejects interview deletion when another workspace member created it", async () => {
    const supabase = trackingSupabase(
      "interviewer",
      "interview_records",
      "9df4620e-5d19-4d48-90d2-2a08450b13c4"
    );
    const service = trackingService(supabase);

    await expect(
      service.deleteInterview("rg-team", recordId, { id: authUserId })
    ).rejects.toMatchObject({
      code: "interview_record_owner_required"
    });
    expect(supabase.update).not.toHaveBeenCalled();
  });
});

function trackingService(supabase: ReturnType<typeof trackingSupabase>) {
  return new TrackingService(supabase as unknown as SupabaseRestClient);
}

function trackingSupabase(roleKey: string, updatedTable: string, recordOwnerMemberId = memberId) {
  return {
    select: vi.fn(async (table: string) => {
      if (table === "workspaces") {
        return [
          {
            id: workspaceId,
            name: "RG Team",
            slug: "rg-team",
            status: "active",
            created_at: "2026-06-18T00:00:00.000Z"
          }
        ];
      }
      if (table === "workspace_members") {
        return [
          {
            id: memberId,
            workspace_id: workspaceId,
            auth_user_id: authUserId,
            display_name: "Workspace Member",
            email: "member@example.com",
            status: "active",
            created_at: "2026-06-18T00:00:00.000Z",
            updated_at: "2026-06-18T00:00:00.000Z",
            deleted_at: null
          }
        ];
      }
      if (table === "workspace_roles") {
        return [
          {
            id: "role-1",
            workspace_id: workspaceId,
            name: roleKey,
            key: roleKey,
            system: true,
            deleted_at: null
          }
        ];
      }
      if (table === "workspace_member_roles") {
        return [
          {
            workspace_id: workspaceId,
            member_id: memberId,
            role_id: "role-1"
          }
        ];
      }
      if (table === updatedTable) {
        return [
          {
            id: recordId,
            workspace_id: workspaceId,
            created_by_member_id: recordOwnerMemberId,
            created_at: "2026-06-18T00:00:00.000Z",
            updated_at: "2026-06-18T00:00:00.000Z",
            deleted_at: null
          }
        ];
      }
      return [];
    }),
    update: vi.fn(async (table: string) => {
      if (table !== updatedTable) {
        return [];
      }
      return [
        {
          id: recordId,
          workspace_id: workspaceId,
          created_by_member_id: memberId,
          created_at: "2026-06-18T00:00:00.000Z",
          updated_at: "2026-06-18T00:00:00.000Z",
          deleted_at: "2026-06-18T01:00:00.000Z"
        }
      ];
    }),
    insert: vi.fn(async () => []),
    delete: vi.fn(async () => [])
  };
}
