import { companyResetKey, type CompanyReset, companyNamesMatch } from "@rghs1/domain";
import { CompanyBlacklistService, blacklistMatches } from "./company-blacklist.service";
import type { AuthUser } from "../../auth/auth.types";
import { apiError } from "../../errors";
import type { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { TrackingAccessService, type TrackingContext } from "./tracking-access.service";
import {
  applicationEligibility,
  calendarDay,
  isExpiredImport,
  centralDayStart,
  defaultApplicationRules,
  type ApplicationRow,
  type ApplicationRules
} from "./application-eligibility";

function titleKey(title: string) {
  return title.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}

export class ApplicationRulesService {
  private access: TrackingAccessService;
  constructor(private db: SupabaseRestClient) {
    this.access = new TrackingAccessService(db);
  }
  async rules(slug: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    const [row] = await this.db.select<{
      cooldown_days: number;
      time_zone: string;
      company_resets?: CompanyReset[];
    }>("workspace_application_rules", "cooldown_days,time_zone,company_resets", {
      workspace_id: `eq.${context.workspace.id}`
    });
    return row
      ? {
          cooldownDays: row.cooldown_days,
          timeZone: row.time_zone,
          companyResets: row.company_resets ?? []
        }
      : defaultApplicationRules;
  }
  async saveRules(slug: string, user: AuthUser, rules: ApplicationRules) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "admin");
    const [existing] = await this.db.select<{ cooldown_days: number; time_zone: string }>(
      "workspace_application_rules",
      "cooldown_days,time_zone",
      { workspace_id: `eq.${context.workspace.id}` }
    );
    const values = {
      cooldown_days: rules.cooldownDays,
      time_zone: rules.timeZone,
      ...(rules.companyResets && { company_resets: rules.companyResets }),
      updated_at: new Date().toISOString()
    };
    if (existing)
      await this.db.update("workspace_application_rules", values, {
        workspace_id: `eq.${context.workspace.id}`
      });
    else
      await this.db.insert("workspace_application_rules", [
        { workspace_id: context.workspace.id, ...values }
      ]);
    if (
      (existing?.cooldown_days ?? defaultApplicationRules.cooldownDays) !== rules.cooldownDays ||
      (existing?.time_zone ?? defaultApplicationRules.timeZone) !== rules.timeZone
    )
      await this.invalidateAll(context.workspace.id);
    await this.db.insert("audit_logs", [
      {
        workspace_id: context.workspace.id,
        actor_id: user.id,
        actor_member_id: context.member.id,
        action: "workspace.application_rules.updated",
        target_type: "workspace",
        target_id: context.workspace.id,
        metadata: rules
      }
    ]);
    return rules;
  }
  async eligibility(slug: string, user: AuthUser, bidIds: string[]) {
    const context = await this.access.requireContext(slug, user.id);
    return this.eligibilityForContext(context, bidIds);
  }
  // Read cached results without loading application history. Only missing, invalidated,
  // or cooldown-expired entries invoke the original history matcher.
  async eligibilityForContext(context: TrackingContext, bidIds: string[]) {
    const now = new Date();
    const workspaceId = context.workspace.id;
    const [settings, targets, cached, blacklist, priorOpenings] = await Promise.all([
      this.db.select<{ cooldown_days: number; time_zone: string; company_resets?: CompanyReset[] }>(
        "workspace_application_rules",
        "cooldown_days,time_zone,company_resets",
        { workspace_id: `eq.${workspaceId}` }
      ),
      this.db.select<ApplicationRow & { bid_record_profiles: Array<{ profile_id: string }> }>(
        "bid_records",
        "id,company,job_title,applied_at,rejected_at,imported_at,expired_at,deleted_at,import_batch_id,import_order,bid_record_profiles(profile_id)",
        { workspace_id: `eq.${workspaceId}`, id: `in.(${bidIds.join(",")})`, deleted_at: "is.null" }
      ),
      this.db.select<{
        bid_id: string;
        profile_ids: string[] | null;
        duplicated: boolean;
        matches: ReturnType<typeof applicationEligibility>["matches"];
        company_reset_days?: number | null;
        refresh_after: string | null;
      }>(
        "bid_eligibility_cache",
        "bid_id,profile_ids,duplicated,matches,refresh_after,company_reset_days",
        { workspace_id: `eq.${workspaceId}`, bid_id: `in.(${bidIds.join(",")})` }
      ),
      new CompanyBlacklistService(this.db).entries(workspaceId),
      this.db.rpc<Array<{ bid_id: string; prior_id: string; applied_at: string }>>(
        "applied_opening_matches",
        { p_workspace_id: workspaceId, p_bid_ids: bidIds }
      )
    ]);
    const rules = settings.length
      ? {
          cooldownDays: settings[0]!.cooldown_days,
          timeZone: settings[0]!.time_zone,
          companyResets: settings[0]!.company_resets ?? []
        }
      : defaultApplicationRules;
    const resets = new Map(
      rules.companyResets?.map((rule) => [companyResetKey(rule.company), rule.days])
    );
    const openings = new Map(priorOpenings.map((row) => [row.bid_id, row]));
    const byCache = new Map(cached.map((row) => [row.bid_id, row]));
    const resolved = new Map<
      string,
      Pick<ReturnType<typeof applicationEligibility>, "duplicated" | "matches">
    >();
    const profilesByBid = new Map(
      targets.map((row) => [row.id, row.bid_record_profiles.map((link) => link.profile_id).sort()])
    );
    const misses = targets.filter((row) => {
      const profiles = profilesByBid.get(row.id)!;
      // Bulk imports write the bid before its profile links. Leave it unresolved until linked.
      if (!profiles.length) return false;
      const entry = byCache.get(row.id);
      if (
        !entry?.profile_ids ||
        entry.profile_ids.length !== profiles.length ||
        !entry.profile_ids.every((id, index) => id === profiles[index]) ||
        (entry.company_reset_days ?? null) !== (resets.get(companyResetKey(row.company)) ?? null) ||
        (!!entry.refresh_after && Date.parse(entry.refresh_after) <= now.getTime())
      )
        return true;
      resolved.set(row.id, entry);
      return false;
    });
    if (misses.length) {
      const data = await this.db.rpc<{
        targets: ApplicationRow[];
        history: ApplicationRow[];
        assignments: Array<{ bid_id: string; profile_id: string }>;
      }>("application_eligibility_data", {
        p_workspace_id: workspaceId,
        p_bid_ids: misses.map((row) => row.id)
      });
      const snapshots = data.targets.flatMap((row) => {
        const profileIds = data.assignments
          .filter((link) => link.bid_id === row.id)
          .map((link) => link.profile_id)
          .sort();
        // Use the profile set from the same database snapshot as the history.
        if (!profileIds.length) return [];
        profilesByBid.set(row.id, profileIds);
        const result = applicationEligibility(row, data.history, data.assignments, rules, now);
        resolved.set(row.id, result);
        // A future cooldown boundary can change the answer even without a write.
        const expirations = result.matches
          .filter((match) => match.blocks && match.appliedAt)
          .map(
            (match) =>
              Date.parse(match.appliedAt!) +
              (resets.get(companyResetKey(row.company)) ?? rules.cooldownDays) * 86400000
          )
          .filter((time) => time > now.getTime());
        return {
          workspace_id: workspaceId,
          bid_id: row.id,
          profile_ids: profileIds,
          duplicated: result.duplicated,
          matches: result.matches,
          company_reset_days: resets.get(companyResetKey(row.company)) ?? null,
          checked_at: now.toISOString(),
          refresh_after: expirations.length
            ? new Date(Math.min(...expirations)).toISOString()
            : null
        };
      });
      if (snapshots.length) {
        await this.db.upsert("bid_eligibility_cache", snapshots, ["workspace_id", "bid_id"]);
      }
    }
    return {
      rules,
      checkedAt: now.toISOString(),
      results: targets.flatMap((row) => {
        const result = resolved.get(row.id);
        if (!result) return [];
        const profileIds = profilesByBid.get(row.id)!;
        const opening = openings.get(row.id);
        const possibleRepeat =
          !row.applied_at &&
          !opening &&
          result.matches.some(
            (match) => match.appliedAt && titleKey(match.jobTitle) === titleKey(row.job_title)
          );
        const matches = blacklistMatches(blacklist, row.company, profileIds);
        return {
          bidId: row.id,
          pending: !row.applied_at && !isExpiredImport(row, now),
          showBadge:
            !!row.imported_at &&
            calendarDay(row.imported_at, "America/Chicago") ===
              calendarDay(now.toISOString(), "America/Chicago"),
          duplicated: !!opening || result.duplicated,
          ...(opening && {
            previousOpening: { bidId: opening.prior_id, appliedAt: opening.applied_at }
          }),
          ...(possibleRepeat && { possibleRepeat: true }),
          matches: result.matches,
          blacklisted: matches.length > 0,
          blacklistMatches: matches.map((item) => ({
            id: item.id,
            company: item.company,
            profileId: item.profile_id,
            reason: item.reason
          }))
        };
      })
    };
  }

  // Invalidate only cached bids with a matching company and overlapping profile.
  // This is invoked on writes, never on table reads or keyword searches.
  async invalidateAffected(workspaceId: string, company: string, profileIds: string[]) {
    if (!profileIds.length) return;
    const assignments = await this.db.selectAll<{ bid_id: string }>(
      "bid_record_profiles",
      "bid_id",
      {
        workspace_id: `eq.${workspaceId}`,
        profile_id: `in.(${profileIds.join(",")})`
      }
    );
    const ids = [...new Set(assignments.map((item) => item.bid_id))];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      const rows = await this.db.select<{ id: string; company: string }>(
        "bid_records",
        "id,company",
        { workspace_id: `eq.${workspaceId}`, id: `in.(${batch.join(",")})` }
      );
      const matching = rows
        .filter(
          (row) =>
            companyNamesMatch(company, row.company) ||
            companyResetKey(company) === companyResetKey(row.company)
        )
        .map((row) => row.id);
      if (matching.length)
        await this.db.delete("bid_eligibility_cache", {
          workspace_id: `eq.${workspaceId}`,
          bid_id: `in.(${matching.join(",")})`
        });
    }
  }

  async invalidateAll(workspaceId: string) {
    await this.db.delete("bid_eligibility_cache", { workspace_id: `eq.${workspaceId}` });
  }

  private async invalidateBid(workspaceId: string, bidId: string) {
    const [rows, profiles] = await Promise.all([
      this.db.select<{ company: string }>("bid_records", "company", {
        workspace_id: `eq.${workspaceId}`,
        id: `eq.${bidId}`
      }),
      this.db.select<{ profile_id: string }>("bid_record_profiles", "profile_id", {
        workspace_id: `eq.${workspaceId}`,
        bid_id: `eq.${bidId}`
      })
    ]);
    if (rows[0])
      await this.invalidateAffected(
        workspaceId,
        rows[0].company,
        profiles.map((profile) => profile.profile_id)
      );
  }

  async setRejected(slug: string, user: AuthUser, bidId: string, rejected: boolean) {
    const context = await this.access.requireContext(slug, user.id);
    const admin = context.roleKeys.includes("admin");
    if (!admin) this.access.requireRole(context, "bidder");
    const filters = {
      workspace_id: `eq.${context.workspace.id}`,
      id: `eq.${bidId}`,
      deleted_at: "is.null",
      ...(!admin ? { created_by_member_id: `eq.${context.member.id}` } : {})
    };
    const [bid] = await this.db.select<{ applied_at: string | null; rejected_at: string | null }>(
      "bid_records",
      "applied_at,rejected_at",
      filters
    );
    if (!bid)
      throw apiError(404, "Application was not found or is not yours.", "bid_record_not_found");
    if (!bid.applied_at)
      throw apiError(
        409,
        "Only submitted applications can be marked rejected.",
        "bid_rejection_requires_applied"
      );
    const rejectedAt = rejected ? (bid.rejected_at ?? new Date().toISOString()) : null;
    const rows = await this.db.update(
      "bid_records",
      { rejected_at: rejectedAt, updated_at: new Date().toISOString() },
      {
        ...filters,
        applied_at: "not.is.null",
        rejected_at: bid.rejected_at ? `eq.${bid.rejected_at}` : "is.null"
      }
    );
    if (!rows.length)
      throw apiError(
        409,
        "The application changed. Refresh and try again.",
        "bid_rejection_conflict"
      );
    await this.invalidateBid(context.workspace.id, bidId);
    await this.db.insert("audit_logs", [
      {
        workspace_id: context.workspace.id,
        actor_id: user.id,
        actor_member_id: context.member.id,
        action: rejected ? "tracking.bid.rejected" : "tracking.bid.rejection_undone",
        target_type: "tracking_record",
        target_id: bidId,
        metadata: { rejectedAt, previousRejectedAt: bid.rejected_at }
      }
    ]);
    return { rejectedAt };
  }

  async adminMarkApplied(
    slug: string,
    user: AuthUser,
    bidId: string,
    input: { appliedAt: string; reason: string }
  ) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "admin");
    if (Date.parse(input.appliedAt) > Date.now())
      throw apiError(400, "Application time cannot be in the future.", "invalid_applied_at");
    await new CompanyBlacklistService(this.db).requireBidAllowed(context.workspace.id, bidId);
    const result = await this.db.rpc<{ appliedAt: string; recordedAt: string }>(
      "admin_record_bid_application",
      {
        p_workspace_id: context.workspace.id,
        p_bid_id: bidId,
        p_actor_id: user.id,
        p_actor_member_id: context.member.id,
        p_applied_at: input.appliedAt,
        p_reason: input.reason
      }
    );
    await this.invalidateBid(context.workspace.id, bidId);
    return result;
  }
  async markApplied(slug: string, user: AuthUser, bidId: string) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "bidder");
    const bid = await this.access.requireOwnedBid(context, bidId, "edit");
    if (isExpiredImport(bid))
      throw apiError(409, "Expired applications require admin review.", "bid_expired");
    await new CompanyBlacklistService(this.db).requireBidAllowed(context.workspace.id, bidId);
    const appliedAt = new Date().toISOString();
    const rows = await this.db.update(
      "bid_records",
      {
        applied_at: appliedAt,
        applied_recorded_at: appliedAt,
        applied_recorded_by_member_id: context.member.id,
        updated_at: appliedAt
      },
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${bidId}`,
        created_by_member_id: `eq.${context.member.id}`,
        applied_at: "is.null",
        expired_at: "is.null",
        or: `(imported_at.is.null,imported_at.gte.${centralDayStart()})`,
        deleted_at: "is.null"
      }
    );
    if (!rows.length)
      throw apiError(
        409,
        "This bid was already applied or is no longer available.",
        "bid_apply_conflict"
      );
    await this.invalidateBid(context.workspace.id, bidId);
    await this.db.insert("audit_logs", [
      {
        workspace_id: context.workspace.id,
        actor_id: user.id,
        actor_member_id: context.member.id,
        action: "tracking.bid.applied",
        target_type: "tracking_record",
        target_id: bidId,
        metadata: { appliedAt }
      }
    ]);
    return { appliedAt };
  }
}
