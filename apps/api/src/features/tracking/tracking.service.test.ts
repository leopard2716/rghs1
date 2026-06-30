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

describe("TrackingService profile filtering", () => {
  it("includes active interview references on bid list records", async () => {
    const supabase = listBidsWithReferenceInterviewsSupabase();
    const service = new TrackingService(supabase as unknown as SupabaseRestClient);

    await expect(
      service.listBids(
        "rg-team",
        { id: authUserId },
        {
          page: 1,
          pageSize: 20,
          sortBy: "datetime",
          sortDirection: "desc"
        }
      )
    ).resolves.toMatchObject({
      bids: [
        {
          id: recordId,
          referenceInterviews: [
            {
              id: "9df4620e-5d19-4d48-90d2-2a08450b13c4",
              bidId: recordId,
              profileName: "Frank",
              step: "HR Interview",
              interviewer: {
                id: memberId,
                name: "Workspace Member"
              }
            }
          ]
        }
      ]
    });
  });

  it("chunks a heavily used profile instead of building one oversized bid-id filter", async () => {
    const profileId = "5c6757ac-ef52-40e3-a875-c5c0bf2a1e75";
    const assignments = Array.from({ length: 251 }, (_, index) => ({
      workspace_id: workspaceId,
      bid_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      profile_id: profileId,
      resume: null,
      created_at: "2026-06-18T00:00:00.000Z"
    }));
    const supabase = listBidsSupabase(profileId, assignments);
    const service = new TrackingService(supabase as unknown as SupabaseRestClient);

    await expect(
      service.listBids(
        "rg-team",
        { id: authUserId },
        {
          page: 1,
          pageSize: 20,
          profileId,
          sortBy: "datetime",
          sortDirection: "desc"
        }
      )
    ).resolves.toMatchObject({
      bids: [],
      pagination: { total: 0 }
    });

    const bidIdFilters = supabase.select.mock.calls
      .filter(([table]) => table === "bid_records")
      .map(([, , filters]) => filters?.id)
      .filter((value): value is string => Boolean(value));

    expect(bidIdFilters).toHaveLength(3);
    expect(
      bidIdFilters.every((filter) => filter.slice("in.(".length, -1).split(",").length <= 100)
    ).toBe(true);
  });
});

describe("TrackingService dashboard pagination", () => {
  it("loads bids beyond the Supabase row cap before resolving interview relationships", async () => {
    const supabase = dashboardSupabase(1001);
    const service = new TrackingService(supabase as unknown as SupabaseRestClient);

    await expect(
      service.dashboard(
        "rg-team",
        { id: authUserId },
        {
          from: "2026-01-01T00:00:00.000Z",
          to: "2027-01-01T00:00:00.000Z",
          todayFrom: "2026-06-23T00:00:00.000Z",
          todayTo: "2026-06-24T00:00:00.000Z",
          timeZone: "UTC"
        }
      )
    ).resolves.toMatchObject({
      summary: {
        totalBids: 1001,
        totalInterviews: 1
      }
    });

    expect(supabase.selectAll).toHaveBeenCalledWith(
      "bid_records",
      expect.any(String),
      { workspace_id: `eq.${workspaceId}` },
      { order: "id.asc" }
    );
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

function listBidsWithReferenceInterviewsSupabase() {
  const profileId = "5c6757ac-ef52-40e3-a875-c5c0bf2a1e75";
  const marketId = "a79a47ef-bf8c-4821-8b31-ff5200fd5061";
  const bidRow = {
    id: recordId,
    workspace_id: workspaceId,
    created_by_member_id: memberId,
    job_title: "Platform Engineer",
    company: "Acme",
    job_link: "https://example.com/job",
    bid_at: "2026-06-23T12:00:00.000Z",
    job_description: null,
    job_market_id: marketId,
    created_at: "2026-06-23T12:00:00.000Z",
    updated_at: "2026-06-23T12:00:00.000Z",
    deleted_at: null
  };
  const profile = {
    id: profileId,
    workspace_id: workspaceId,
    name: "Frank",
    created_by_member_id: memberId,
    created_at: "2026-06-18T00:00:00.000Z",
    updated_at: "2026-06-18T00:00:00.000Z",
    deleted_at: null
  };
  const member = {
    id: memberId,
    workspace_id: workspaceId,
    auth_user_id: authUserId,
    display_name: "Workspace Member",
    email: "member@example.com",
    status: "active",
    created_at: "2026-06-18T00:00:00.000Z",
    updated_at: "2026-06-18T00:00:00.000Z",
    deleted_at: null
  };
  const interview = {
    id: "9df4620e-5d19-4d48-90d2-2a08450b13c4",
    workspace_id: workspaceId,
    bid_id: recordId,
    profile_id: profileId,
    created_by_member_id: memberId,
    step: "HR Interview",
    start_at: "2026-06-24T13:00:00.000Z",
    end_at: "2026-06-24T14:00:00.000Z",
    time_zone: "UTC",
    interview_link: "https://example.com/interview",
    notes: "Prep notes",
    created_at: "2026-06-23T13:00:00.000Z",
    updated_at: "2026-06-23T13:00:00.000Z",
    deleted_at: null
  };

  const select = vi.fn(async (table: string) => {
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
      return [member];
    }
    if (table === "workspace_roles") {
      return [
        {
          id: "role-1",
          workspace_id: workspaceId,
          name: "Bidder",
          key: "bidder",
          system: true,
          deleted_at: null
        }
      ];
    }
    if (table === "workspace_member_roles") {
      return [{ workspace_id: workspaceId, member_id: memberId, role_id: "role-1" }];
    }
    if (table === "tracking_job_markets") {
      return [
        {
          id: marketId,
          workspace_id: workspaceId,
          market_key: "us",
          name: "US Job Market",
          system: true,
          created_by_member_id: null,
          created_at: "2026-06-18T00:00:00.000Z",
          updated_at: "2026-06-18T00:00:00.000Z",
          deleted_at: null
        }
      ];
    }
    if (table === "bid_records") {
      return [bidRow];
    }
    return [];
  });

  return {
    select,
    selectAll: vi.fn(async (table: string) => {
      if (table === "tracking_profiles") {
        return [profile];
      }
      if (table === "workspace_members") {
        return [member];
      }
      return [];
    }),
    selectPage: vi.fn(async (table: string, fields: string, _filters: Record<string, string>) => {
      if (table === "bid_records" && fields === "job_market_id") {
        return { records: [{ job_market_id: marketId }], total: 1 };
      }
      if (table === "bid_records") {
        return { records: [bidRow], total: 1 };
      }
      if (table === "bid_record_profiles") {
        return {
          records: [
            {
              workspace_id: workspaceId,
              bid_id: recordId,
              profile_id: profileId,
              resume: null,
              created_at: "2026-06-23T12:00:00.000Z"
            }
          ],
          total: 1
        };
      }
      if (table === "interview_records") {
        return { records: [interview], total: 1 };
      }
      return { records: [], total: 0 };
    }),
    update: vi.fn(async () => []),
    insert: vi.fn(async () => []),
    delete: vi.fn(async () => [])
  };
}

function listBidsSupabase(
  profileId: string,
  assignments: Array<{
    workspace_id: string;
    bid_id: string;
    profile_id: string;
    resume: null;
    created_at: string;
  }>
) {
  const select = vi.fn(
    async (table: string, _fields?: string, _filters?: Record<string, string>) => {
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
            name: "Bidder",
            key: "bidder",
            system: true,
            deleted_at: null
          }
        ];
      }
      if (table === "workspace_member_roles") {
        return [{ workspace_id: workspaceId, member_id: memberId, role_id: "role-1" }];
      }
      if (table === "tracking_profiles") {
        return [
          {
            id: profileId,
            workspace_id: workspaceId,
            name: "Frank",
            created_by_member_id: memberId,
            created_at: "2026-06-18T00:00:00.000Z",
            updated_at: "2026-06-18T00:00:00.000Z",
            deleted_at: null
          }
        ];
      }
      if (table === "tracking_job_markets") {
        return [
          {
            id: "a79a47ef-bf8c-4821-8b31-ff5200fd5061",
            workspace_id: workspaceId,
            market_key: "us",
            name: "US Job Market",
            system: true,
            created_by_member_id: null,
            created_at: "2026-06-18T00:00:00.000Z",
            updated_at: "2026-06-18T00:00:00.000Z",
            deleted_at: null
          }
        ];
      }
      return [];
    }
  );

  return {
    select,
    selectAll: select,
    selectPage: vi.fn(
      async (
        table: string,
        _fields: string,
        filters: Record<string, string>,
        options: { offset: number; limit: number }
      ) => {
        if (table === "bid_record_profiles" && filters.profile_id === `eq.${profileId}`) {
          return {
            records: assignments.slice(options.offset, options.offset + options.limit),
            total: assignments.length
          };
        }
        return { records: [], total: 0 };
      }
    ),
    update: vi.fn(async () => []),
    insert: vi.fn(async () => []),
    delete: vi.fn(async () => [])
  };
}

function dashboardSupabase(bidCount: number) {
  const profileId = "5c6757ac-ef52-40e3-a875-c5c0bf2a1e75";
  const marketId = "a79a47ef-bf8c-4821-8b31-ff5200fd5061";
  const bidRows = Array.from({ length: bidCount }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    workspace_id: workspaceId,
    created_by_member_id: memberId,
    job_title: `Engineer ${index}`,
    company: `Company ${index}`,
    job_link: null,
    bid_at: "2026-06-23T12:00:00.000Z",
    job_description: null,
    job_market_id: marketId,
    created_at: "2026-06-23T12:00:00.000Z",
    updated_at: "2026-06-23T12:00:00.000Z",
    deleted_at: null
  }));
  const lastBid = bidRows.at(-1);
  if (!lastBid) {
    throw new Error("Dashboard pagination test requires at least one bid.");
  }
  const profile = {
    id: profileId,
    workspace_id: workspaceId,
    name: "Frank",
    created_by_member_id: memberId,
    created_at: "2026-06-18T00:00:00.000Z",
    updated_at: "2026-06-18T00:00:00.000Z",
    deleted_at: null
  };
  const member = {
    id: memberId,
    workspace_id: workspaceId,
    auth_user_id: authUserId,
    display_name: "Workspace Member",
    email: "member@example.com",
    status: "active",
    created_at: "2026-06-18T00:00:00.000Z",
    updated_at: "2026-06-18T00:00:00.000Z",
    deleted_at: null
  };
  const select = vi.fn(async (table: string) => {
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
      return [member];
    }
    if (table === "workspace_roles") {
      return [];
    }
    if (table === "workspace_member_roles") {
      return [];
    }
    if (table === "tracking_job_markets") {
      return [
        {
          id: marketId,
          workspace_id: workspaceId,
          market_key: "us",
          name: "US Job Market",
          system: true,
          created_by_member_id: null,
          created_at: "2026-06-18T00:00:00.000Z",
          updated_at: "2026-06-18T00:00:00.000Z",
          deleted_at: null
        }
      ];
    }
    if (table === "bid_records") {
      return bidRows.slice(0, 1000);
    }
    return [];
  });
  const selectAll = vi.fn(async (table: string) => {
    if (table === "tracking_profiles") {
      return [profile];
    }
    if (table === "workspace_members") {
      return [member];
    }
    if (table === "bid_records") {
      return bidRows;
    }
    if (table === "interview_records") {
      return [
        {
          id: "9df4620e-5d19-4d48-90d2-2a08450b13c3",
          workspace_id: workspaceId,
          bid_id: lastBid.id,
          profile_id: profileId,
          created_by_member_id: memberId,
          step: "screening",
          start_at: "2026-06-23T13:00:00.000Z",
          end_at: "2026-06-23T14:00:00.000Z",
          time_zone: "UTC",
          interview_link: null,
          notes: null,
          created_at: "2026-06-23T13:00:00.000Z",
          updated_at: "2026-06-23T13:00:00.000Z",
          deleted_at: null
        }
      ];
    }
    return [];
  });

  return {
    select,
    selectAll,
    selectPage: vi.fn(async (table: string) => {
      if (table === "bid_record_profiles") {
        return {
          records: bidRows.map((bid) => ({
            workspace_id: workspaceId,
            bid_id: bid.id,
            profile_id: profileId,
            resume: null,
            created_at: "2026-06-23T12:00:00.000Z"
          })),
          total: bidRows.length
        };
      }
      return { records: [], total: 0 };
    }),
    update: vi.fn(async () => []),
    insert: vi.fn(async () => []),
    delete: vi.fn(async () => [])
  };
}
