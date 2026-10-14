import { normalizeCompanyName } from "@rghs1/domain";
import type { AuthUser } from "../../auth/auth.types";
import { apiError } from "../../errors";
import type { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { TrackingAccessService, type TrackingContext } from "./tracking-access.service";
import {
  applicationEligibility,
  defaultApplicationRules,
  type ApplicationRow,
  type ApplicationRules
} from "./application-eligibility";

export class ApplicationRulesService {
  private access: TrackingAccessService;
  constructor(private db: SupabaseRestClient) {
    this.access = new TrackingAccessService(db);
  }
  async rules(slug: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    const [row] = await this.db.select<{ cooldown_days: number; time_zone: string }>(
      "workspace_application_rules",
      "cooldown_days,time_zone",
      { workspace_id: `eq.${context.workspace.id}` }
    );
    return row
      ? { cooldownDays: row.cooldown_days, timeZone: row.time_zone }
      : defaultApplicationRules;
  }
  async saveRules(slug: string, user: AuthUser, rules: ApplicationRules) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "admin");
    const [existing] = await this.db.select<{ workspace_id: string }>(
      "workspace_application_rules",
      "workspace_id",
      { workspace_id: `eq.${context.workspace.id}` }
    );
    const values = {
      cooldown_days: rules.cooldownDays,
      time_zone: rules.timeZone,
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
  async eligibilityForContext(context: TrackingContext, bidIds: string[]) {
    const [settings] = await this.db.select<{ cooldown_days: number; time_zone: string }>(
      "workspace_application_rules",
      "cooldown_days,time_zone",
      { workspace_id: `eq.${context.workspace.id}` }
    );
    const rules = settings
      ? { cooldownDays: settings.cooldown_days, timeZone: settings.time_zone }
      : defaultApplicationRules;
    const data = await this.db.rpc<{
      targets: ApplicationRow[];
      history: ApplicationRow[];
      assignments: Array<{ bid_id: string; profile_id: string }>;
    }>("application_eligibility_data", { p_workspace_id: context.workspace.id, p_bid_ids: bidIds });
    const targets = data.targets;
    const companies = new Set(targets.map((row) => normalizeCompanyName(row.company)));
    const rows = data.history.filter((row) => companies.has(normalizeCompanyName(row.company)));
    const assignments = data.assignments;
    const now = new Date();
    return {
      rules,
      checkedAt: now.toISOString(),
      results: targets.map((row) => applicationEligibility(row, rows, assignments, rules, now))
    };
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

  async markApplied(slug: string, user: AuthUser, bidId: string) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "bidder");
    await this.access.requireOwnedBid(context, bidId, "edit");
    const appliedAt = new Date().toISOString();
    const rows = await this.db.update(
      "bid_records",
      { applied_at: appliedAt, updated_at: appliedAt },
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${bidId}`,
        created_by_member_id: `eq.${context.member.id}`,
        applied_at: "is.null",
        deleted_at: "is.null"
      }
    );
    if (!rows.length)
      throw apiError(
        409,
        "This bid was already applied or is no longer available.",
        "bid_apply_conflict"
      );
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
