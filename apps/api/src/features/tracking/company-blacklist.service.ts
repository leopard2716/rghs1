import { normalizeCompanyName, isUnknownCompanyName, companyNamesMatch } from "@rghs1/domain";
import type { AuthUser } from "../../auth/auth.types";
import { apiError } from "../../errors";
import type { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { TrackingAccessService } from "./tracking-access.service";

export type BlacklistEntry = {
  id: string;
  company: string;
  company_key: string;
  profile_id: string | null;
  reason: string;
  created_at: string;
};
export function blacklistMatches(entries: BlacklistEntry[], company: string, profileIds: string[]) {
  const key = normalizeCompanyName(company);
  return key
    ? entries.filter(
        (entry) =>
          companyNamesMatch(entry.company, company) &&
          (entry.profile_id === null || profileIds.includes(entry.profile_id))
      )
    : [];
}
export class CompanyBlacklistService {
  constructor(private db: SupabaseRestClient) {}
  async entries(workspaceId: string) {
    return this.db.selectAll<BlacklistEntry>(
      "company_blacklist",
      "id,company,company_key,profile_id,reason,created_at",
      { workspace_id: `eq.${workspaceId}` },
      { order: "company.asc,created_at.asc" }
    );
  }
  async list(slug: string, user: AuthUser) {
    const access = new TrackingAccessService(this.db);
    const context = await access.requireContext(slug, user.id);
    access.requireRole(context, "admin");
    return { entries: await this.entries(context.workspace.id) };
  }
  async add(
    slug: string,
    user: AuthUser,
    input: { company: string; profileId: string | null; reason: string }
  ) {
    const access = new TrackingAccessService(this.db);
    const context = await access.requireContext(slug, user.id);
    access.requireRole(context, "admin");
    const key = normalizeCompanyName(input.company);
    if (!key || isUnknownCompanyName(input.company))
      throw apiError(400, "Enter a company name.", "invalid_blacklist_company");
    if (input.profileId) await access.requireProfiles(context.workspace.id, [input.profileId]);
    // Database uniqueness also protects concurrent additions.
    const existing = (await this.entries(context.workspace.id)).filter(
      (entry) =>
        entry.profile_id === input.profileId && companyNamesMatch(entry.company, input.company)
    );
    if (existing.length)
      throw apiError(
        409,
        "This company is already blacklisted for this scope.",
        "blacklist_duplicate"
      );
    const [entry] = await this.db.insert<BlacklistEntry>("company_blacklist", [
      {
        workspace_id: context.workspace.id,
        company: input.company.trim(),
        company_key: key,
        profile_id: input.profileId,
        reason: input.reason.trim(),
        created_by_member_id: context.member.id
      }
    ]);
    if (!entry)
      throw apiError(502, "Blacklist creation did not return an entry.", "blacklist_create_failed");
    await this.audit(context.workspace.id, context.member.id, user.id, "added", entry);
    return { entry };
  }
  async remove(slug: string, user: AuthUser, id: string) {
    const access = new TrackingAccessService(this.db);
    const context = await access.requireContext(slug, user.id);
    access.requireRole(context, "admin");
    const [entry] = await this.db.delete<BlacklistEntry>("company_blacklist", {
      workspace_id: `eq.${context.workspace.id}`,
      id: `eq.${id}`
    });
    if (!entry) throw apiError(404, "Blacklist entry was not found.", "blacklist_not_found");
    await this.audit(context.workspace.id, context.member.id, user.id, "removed", entry);
    return { removed: true };
  }
  async requireAllowed(workspaceId: string, company: string, profileIds: string[]) {
    const matches = blacklistMatches(await this.entries(workspaceId), company, profileIds);
    if (matches.length)
      throw apiError(
        409,
        "This company is blacklisted for all profiles or a selected profile. Ask an admin to review the blacklist.",
        "company_blacklisted"
      );
  }
  async requireBidAllowed(workspaceId: string, bidId: string) {
    const [bids, profiles] = await Promise.all([
      this.db.select<{ company: string }>("bid_records", "company", {
        workspace_id: `eq.${workspaceId}`,
        id: `eq.${bidId}`,
        deleted_at: "is.null"
      }),
      this.db.selectAll<{ profile_id: string }>("bid_record_profiles", "profile_id", {
        workspace_id: `eq.${workspaceId}`,
        bid_id: `eq.${bidId}`
      })
    ]);
    if (!bids[0]) throw apiError(404, "Bid was not found.", "bid_record_not_found");
    await this.requireAllowed(
      workspaceId,
      bids[0].company,
      profiles.map((p) => p.profile_id)
    );
  }
  private async audit(
    workspaceId: string,
    memberId: string,
    userId: string,
    action: string,
    entry: BlacklistEntry
  ) {
    await this.db.insert("audit_logs", [
      {
        workspace_id: workspaceId,
        actor_id: userId,
        actor_member_id: memberId,
        action: `tracking.company_blacklist.${action}`,
        target_type: "company_blacklist",
        target_id: entry.id,
        metadata: { company: entry.company, profileId: entry.profile_id, reason: entry.reason }
      }
    ]);
  }
}
