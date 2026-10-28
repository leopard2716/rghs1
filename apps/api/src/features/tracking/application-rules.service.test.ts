import { afterEach, expect, it, vi } from "vitest";
import { ApplicationRulesService } from "./application-rules.service";
import { TrackingAccessService, type TrackingContext } from "./tracking-access.service";
import type { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
afterEach(() => vi.restoreAllMocks());
function fixture(
  roles = ["bidder"],
  owner = "member",
  applied: string | null = "2026-10-01T12:00:00Z",
  rejected: string | null = null
) {
  vi.spyOn(TrackingAccessService.prototype, "requireContext").mockResolvedValue({
    workspace: { id: "workspace" },
    member: { id: "member" },
    roleKeys: roles
  } as TrackingContext);
  const db = {
    select: vi.fn(async (_table: string, _fields: string, filters: Record<string, string>) =>
      !filters.created_by_member_id || filters.created_by_member_id === `eq.${owner}`
        ? [{ applied_at: applied, rejected_at: rejected }]
        : []
    ),
    update: vi.fn(
      async (
        _table: string,
        _values: Record<string, unknown>,
        _filters: Record<string, string>
      ) => [{ id: "bid" }]
    ),
    insert: vi.fn(async () => [])
  };
  return { db, service: new ApplicationRulesService(db as unknown as SupabaseRestClient) };
}
it("lets bidders mark only their own applied records and audits the actor", async () => {
  const { db, service } = fixture();
  const result = await service.setRejected("team", { id: "user" }, "bid", true);
  expect(result.rejectedAt).toEqual(expect.any(String));
  expect(db.update).toHaveBeenCalledWith(
    "bid_records",
    expect.objectContaining({ rejected_at: result.rejectedAt }),
    expect.objectContaining({
      workspace_id: "eq.workspace",
      created_by_member_id: "eq.member",
      applied_at: "not.is.null",
      deleted_at: "is.null"
    })
  );
  expect(db.insert).toHaveBeenCalledWith("audit_logs", [
    expect.objectContaining({ actor_id: "user", action: "tracking.bid.rejected" })
  ]);
});
it("allows admins to reject another bidder's applied record in the workspace", async () => {
  const { db, service } = fixture(["admin"], "other");
  await service.setRejected("team", { id: "user" }, "bid", true);
  expect(db.select.mock.calls[0]?.[2]).not.toHaveProperty("created_by_member_id");
  expect(db.update.mock.calls[0]?.[2]).not.toHaveProperty("created_by_member_id");
});
it("denies other bidders' records and roles without bidder or admin", async () => {
  const { db, service } = fixture(["bidder"], "other");
  await expect(service.setRejected("team", { id: "user" }, "bid", true)).rejects.toMatchObject({
    status: 404
  });
  expect(db.update).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  const other = fixture(["interviewer"]);
  await expect(
    other.service.setRejected("team", { id: "user" }, "bid", true)
  ).rejects.toMatchObject({ status: 403 });
});
it("rejects pending records without changing them", async () => {
  const { db, service } = fixture(["bidder"], "member", null);
  await expect(service.setRejected("team", { id: "user" }, "bid", true)).rejects.toMatchObject({
    status: 409
  });
  expect(db.update).not.toHaveBeenCalled();
});
it("undoes rejection without changing the original submission date", async () => {
  const { db, service } = fixture(
    ["bidder"],
    "member",
    "2026-10-01T12:00:00Z",
    "2026-10-12T12:00:00Z"
  );
  await expect(service.setRejected("team", { id: "user" }, "bid", false)).resolves.toEqual({
    rejectedAt: null
  });
  expect(db.update.mock.calls[0]?.[1]).not.toHaveProperty("applied_at");
  expect(db.update.mock.calls[0]?.[1]).not.toHaveProperty("bid_at");
});
it("does not audit a failed concurrent update", async () => {
  const { db, service } = fixture();
  db.update.mockResolvedValueOnce([]);
  await expect(service.setRejected("team", { id: "user" }, "bid", true)).rejects.toMatchObject({
    status: 409
  });
  expect(db.insert).not.toHaveBeenCalled();
});

it("scopes eligibility reads to target IDs and shared profiles and preserves normalized company cooldowns", async () => {
  const target = { id: "target", company: "Acme LLC", job_title: "Engineer", deleted_at: null };
  const prior = {
    id: "prior",
    company: "Acme Inc",
    job_title: "Engineer",
    applied_at: new Date().toISOString(),
    deleted_at: null
  };
  const db = {
    select: vi.fn(async (table: string, _fields: string, filters: Record<string, string>) => {
      if (table === "workspace_application_rules") return [];
      expect(filters.workspace_id).toBe("eq.workspace");
      expect(filters.id).toBeDefined();
      return filters.id === "in.(target)" ? [target] : [target, prior];
    }),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("application_eligibility_data");
      expect(args).toEqual({ p_workspace_id: "workspace", p_bid_ids: ["target"] });
      return {
        targets: [target],
        history: [target, prior],
        assignments: [
          { bid_id: "target", profile_id: "profile" },
          { bid_id: "prior", profile_id: "profile" }
        ]
      };
    })
  };
  const service = new ApplicationRulesService(db as unknown as SupabaseRestClient);
  const result = await service.eligibilityForContext(
    { workspace: { id: "workspace" } } as TrackingContext,
    ["target"]
  );
  expect(result.results[0]?.duplicated).toBe(true);
  expect(result.results[0]?.matches[0]?.id).toBe("prior");
});

it("requires admin permission for recording another bidder's submission", async () => {
  const { service, db } = fixture(["bidder"]);
  await expect(
    service.adminMarkApplied("team", { id: "user" }, "bid", {
      appliedAt: "2026-01-01T12:00:00Z",
      reason: "Screenshot"
    })
  ).rejects.toMatchObject({ status: 403 });
  expect(db.update).not.toHaveBeenCalled();
});
it("passes the actual admin identity and workspace to the atomic correction RPC", async () => {
  fixture(["admin"]);
  const rpc = vi.fn(async () => ({
    appliedAt: "2026-01-01T12:00:00Z",
    recordedAt: new Date().toISOString()
  }));
  const service = new ApplicationRulesService({ rpc } as unknown as SupabaseRestClient);
  await service.adminMarkApplied("team", { id: "joe-user" }, "bid", {
    appliedAt: "2026-01-01T12:00:00Z",
    reason: "John screenshot"
  });
  expect(rpc).toHaveBeenCalledWith(
    "admin_record_bid_application",
    expect.objectContaining({
      p_workspace_id: "workspace",
      p_actor_id: "joe-user",
      p_actor_member_id: "member",
      p_bid_id: "bid",
      p_reason: "John screenshot"
    })
  );
});
