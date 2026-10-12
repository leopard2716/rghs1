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
    const selectedIds = new Set(bidIds);
    const rows = await this.db.selectAll<ApplicationRow>(
      "bid_records",
      "id,company,job_title,applied_at,imported_at,import_batch_id,import_order,deleted_at",
      { workspace_id: `eq.${context.workspace.id}` }
    );
    const assignments = await this.db.selectAll<{ bid_id: string; profile_id: string }>(
      "bid_record_profiles",
      "bid_id,profile_id",
      { workspace_id: `eq.${context.workspace.id}` }
    );
    const now = new Date();
    return {
      rules,
      checkedAt: now.toISOString(),
      results: rows
        .filter((row) => selectedIds.has(row.id) && !row.deleted_at)
        .map((row) => applicationEligibility(row, rows, assignments, rules, now))
    };
  }
  async markApplied(slug: string, user: AuthUser, bidId: string) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "bidder");
    await this.access.requireOwnedBid(context, bidId, "edit");
    const appliedAt = new Date().toISOString();
    const rows = await this.db.update(
      "bid_records",
      { applied_at: appliedAt, bid_at: appliedAt, updated_at: appliedAt },
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
