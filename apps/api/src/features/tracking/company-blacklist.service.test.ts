import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeCompanyName } from "@rghs1/domain";
import {
  CompanyBlacklistService,
  blacklistMatches,
  type BlacklistEntry
} from "./company-blacklist.service";
import { ApplicationRulesService } from "./application-rules.service";
import { TrackingAccessService, type TrackingContext } from "./tracking-access.service";
import type { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";

afterEach(() => vi.restoreAllMocks());
const entry = (company: string, profileId: string | null = null): BlacklistEntry => ({
  id: "entry",
  company,
  company_key: normalizeCompanyName(company),
  profile_id: profileId,
  reason: "Previous employer",
  created_at: "2026-11-02T12:00:00Z"
});
function fixture(roles = ["admin"], entries: BlacklistEntry[] = []) {
  vi.spyOn(TrackingAccessService.prototype, "requireContext").mockResolvedValue({
    workspace: { id: "workspace" },
    member: { id: "member" },
    roleKeys: roles
  } as TrackingContext);
  const db = {
    selectAll: vi.fn(async (table: string) =>
      table === "company_blacklist" ? entries : [{ profile_id: "profile-1" }]
    ),
    select: vi.fn(async (table: string) => (table === "bid_records" ? [{ company: "F&G" }] : [])),
    insert: vi.fn(async (_table: string, rows: unknown[]) =>
      rows.map((row) => ({ id: "new-entry", ...(row as object) }))
    ),
    delete: vi.fn(async () => entries),
    update: vi.fn(),
    rpc: vi.fn()
  };
  const service = new CompanyBlacklistService(db as unknown as SupabaseRestClient);
  return { db, service };
}
describe("company blacklists", () => {
  it("matches global entries for every profile and normalized ampersand names without substring matches", () => {
    const global = entry("F&G, Inc.");
    expect(blacklistMatches([global], "F and G LLC", ["any"])).toEqual([global]);
    expect(blacklistMatches([global], "F&G Services", ["any"])).toEqual([]);
    expect(blacklistMatches([global], "", [])).toEqual([]);
  });
  it("blocks only assigned profiles and catches any matching profile in a multi-profile bid", () => {
    const specific = entry("Acme", "profile-1");
    expect(blacklistMatches([specific], "ACME LLC", ["profile-2"])).toEqual([]);
    expect(blacklistMatches([specific], "ACME LLC", ["profile-2", "profile-1"])).toEqual([
      specific
    ]);
  });
  it.each(["bidder", "interviewer"])("denies blacklist administration to %s", async (role) => {
    const { service, db } = fixture([role]);
    await expect(service.list("team", { id: "user" })).rejects.toMatchObject({ status: 403 });
    await expect(
      service.add("team", { id: "user" }, { company: "Acme", profileId: null, reason: "" })
    ).rejects.toMatchObject({ status: 403 });
    await expect(service.remove("team", { id: "user" }, "entry")).rejects.toMatchObject({
      status: 403
    });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });
  it("validates profile membership and audits scoped additions", async () => {
    const profiles = vi
      .spyOn(TrackingAccessService.prototype, "requireProfiles")
      .mockResolvedValue(undefined);
    const { service, db } = fixture();
    await service.add(
      "team",
      { id: "user" },
      { company: "Acme LLC", profileId: "profile-1", reason: "Employer" }
    );
    expect(profiles).toHaveBeenCalledWith("workspace", ["profile-1"]);
    expect(db.insert).toHaveBeenCalledWith("company_blacklist", [
      expect.objectContaining({
        workspace_id: "workspace",
        company_key: "acme",
        profile_id: "profile-1"
      })
    ]);
    expect(db.insert).toHaveBeenCalledWith("audit_logs", [
      expect.objectContaining({
        actor_member_id: "member",
        action: "tracking.company_blacklist.added"
      })
    ]);
  });
  it("never creates an entry for a cross-workspace profile", async () => {
    vi.spyOn(TrackingAccessService.prototype, "requireProfiles").mockRejectedValue({ status: 400 });
    const { service, db } = fixture();
    await expect(
      service.add("team", { id: "user" }, { company: "Acme", profileId: "foreign", reason: "" })
    ).rejects.toMatchObject({ status: 400 });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("scopes listing and deletion to the current workspace and audits removal", async () => {
    const { service, db } = fixture(["admin"], [entry("Acme")]);
    await service.list("team", { id: "user" });
    expect(db.selectAll).toHaveBeenCalledWith(
      "company_blacklist",
      expect.any(String),
      { workspace_id: "eq.workspace" },
      expect.any(Object)
    );
    await service.remove("team", { id: "user" }, "entry");
    expect(db.delete).toHaveBeenCalledWith("company_blacklist", {
      workspace_id: "eq.workspace",
      id: "eq.entry"
    });
    expect(db.insert).toHaveBeenCalledWith("audit_logs", [
      expect.objectContaining({ action: "tracking.company_blacklist.removed" })
    ]);
  });
  it("rejects unknown companies and duplicate normalized entries", async () => {
    const { service, db } = fixture();
    await expect(
      service.add("team", { id: "user" }, { company: "Unknown", profileId: null, reason: "" })
    ).rejects.toMatchObject({ status: 400 });
    db.select.mockResolvedValueOnce([{ id: "existing" }] as never);
    await expect(
      service.add("team", { id: "user" }, { company: "Acme", profileId: null, reason: "" })
    ).rejects.toMatchObject({ status: 409 });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("prevents admin and bidder mark-applied writes for a blacklisted company", async () => {
    const { db } = fixture(["admin", "bidder"], [entry("F&G", "profile-1")]);
    vi.spyOn(TrackingAccessService.prototype, "requireOwnedBid").mockResolvedValue({
      company: "F&G"
    } as never);
    const rules = new ApplicationRulesService(db as unknown as SupabaseRestClient);
    await expect(rules.markApplied("team", { id: "user" }, "bid")).rejects.toMatchObject({
      code: "company_blacklisted"
    });
    await expect(
      rules.adminMarkApplied("team", { id: "user" }, "bid", {
        appliedAt: "2026-01-01T12:00:00Z",
        reason: "Screenshot"
      })
    ).rejects.toMatchObject({ code: "company_blacklisted" });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("releases the block when the blacklist entry is removed", async () => {
    const { service, db } = fixture(["admin"], [entry("F&G")]);
    await expect(service.requireAllowed("workspace", "F&G", [])).rejects.toMatchObject({
      status: 409
    });
    db.selectAll.mockResolvedValueOnce([]);
    await expect(service.requireAllowed("workspace", "F&G", [])).resolves.toBeUndefined();
  });
});
