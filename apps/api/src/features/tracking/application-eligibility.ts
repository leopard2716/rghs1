import { companyNamesMatch } from "@rghs1/domain";

export type ApplicationRow = {
  id: string;
  company: string;
  job_title: string;
  expired_at?: string | null;
  applied_at?: string | null;
  rejected_at?: string | null;
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
  const matches = history
    .filter(
      (row) =>
        row.id !== target.id &&
        sharedIds.has(row.id) &&
        companyNamesMatch(target.company, row.company) &&
        (row.applied_at ||
          (!row.deleted_at &&
            !isExpiredImport(row, now) &&
            !!row.imported_at &&
            calendarDay(row.imported_at, "America/Chicago") ===
              calendarDay(now.toISOString(), "America/Chicago") &&
            target.import_batch_id &&
            row.import_batch_id === target.import_batch_id &&
            (row.import_order ?? Infinity) < (target.import_order ?? -1)))
    )
    .map((row) => {
      const inCooldown =
        !!row.applied_at &&
        !row.rejected_at &&
        Date.parse(row.applied_at) <= now.getTime() &&
        now.getTime() - Date.parse(row.applied_at) < rules.cooldownDays * 86400000;
      const pendingEarlier = !row.applied_at;
      return {
        id: row.id,
        company: row.company,
        jobTitle: row.job_title,
        appliedAt: row.applied_at ?? null,
        rejectedAt: row.rejected_at ?? null,
        importedAt: row.imported_at ?? null,
        profileIds: assignments
          .filter((item) => item.bid_id === row.id && profileIds.has(item.profile_id))
          .map((item) => item.profile_id),
        deleted: !!row.deleted_at,
        blocks: inCooldown || pendingEarlier,
        reason: row.rejected_at
          ? "Rejected — cooldown released"
          : pendingEarlier
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
    pending: !target.applied_at && !isExpiredImport(target, now),
    showBadge:
      !!target.imported_at &&
      calendarDay(target.imported_at, "America/Chicago") ===
        calendarDay(now.toISOString(), "America/Chicago"),
    duplicated: matches.some((item) => item.blocks),
    matches
  };
}

export function isExpiredImport(
  row: { applied_at?: string | null; imported_at?: string | null; expired_at?: string | null },
  now = new Date()
): boolean {
  return (
    !row.applied_at &&
    (!!row.expired_at ||
      (!!row.imported_at &&
        calendarDay(row.imported_at, "America/Chicago") <
          calendarDay(now.toISOString(), "America/Chicago")))
  );
}
export function centralDayStart(now = new Date()): string {
  const day = calendarDay(now.toISOString(), "America/Chicago");
  const guess = Date.parse(`${day}T00:00:00Z`);
  let result = guess;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(result));
    const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    result +=
      guess -
      Date.parse(
        `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:00Z`
      );
  }
  return new Date(result).toISOString();
}
