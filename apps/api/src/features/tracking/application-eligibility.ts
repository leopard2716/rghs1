import { normalizeCompanyName } from "@rghs1/domain";

export type ApplicationRow = {
  id: string;
  company: string;
  job_title: string;
  applied_at?: string | null;
  imported_at?: string | null;
  import_batch_id?: string | null;
  import_order?: number | null;
  deleted_at: string | null;
};
export type ApplicationRules = { cooldownDays: number; timeZone: string };
export const defaultApplicationRules: ApplicationRules = {
  cooldownDays: 45,
  timeZone: "America/Chicago"
};

export function calendarDay(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

export function applicationEligibility(
  target: ApplicationRow,
  history: ApplicationRow[],
  assignments: Array<{ bid_id: string; profile_id: string }>,
  rules: ApplicationRules,
  now: Date
) {
  const profileIds = new Set(
    assignments.filter((item) => item.bid_id === target.id).map((item) => item.profile_id)
  );
  const sharedIds = new Set(
    assignments.filter((item) => profileIds.has(item.profile_id)).map((item) => item.bid_id)
  );
  const company = normalizeCompanyName(target.company);
  const today = calendarDay(now.toISOString(), rules.timeZone);
  const matches = history
    .filter(
      (row) =>
        row.id !== target.id &&
        sharedIds.has(row.id) &&
        company !== "" &&
        normalizeCompanyName(row.company) === company &&
        (row.applied_at ||
          (!row.deleted_at &&
            target.import_batch_id &&
            row.import_batch_id === target.import_batch_id &&
            (row.import_order ?? Infinity) < (target.import_order ?? -1)))
    )
    .map((row) => {
      const inCooldown =
        !!row.applied_at &&
        Date.parse(row.applied_at) <= now.getTime() &&
        now.getTime() - Date.parse(row.applied_at) < rules.cooldownDays * 86400000;
      const pendingEarlier = !row.applied_at;
      return {
        id: row.id,
        company: row.company,
        jobTitle: row.job_title,
        appliedAt: row.applied_at ?? null,
        importedAt: row.imported_at ?? null,
        profileIds: assignments
          .filter((item) => item.bid_id === row.id && profileIds.has(item.profile_id))
          .map((item) => item.profile_id),
        deleted: !!row.deleted_at,
        blocks: inCooldown || pendingEarlier,
        reason: pendingEarlier
          ? "Earlier pending row in this import"
          : inCooldown
            ? "Within cooldown"
            : "Outside cooldown"
      };
    })
    .sort((a, b) =>
      (b.appliedAt ?? b.importedAt ?? "").localeCompare(a.appliedAt ?? a.importedAt ?? "")
    );
  return {
    bidId: target.id,
    pending: !target.applied_at,
    showBadge: !!target.imported_at && calendarDay(target.imported_at, rules.timeZone) === today,
    duplicated: matches.some((item) => item.blocks),
    matches
  };
}
