import type { BulkBidDeleteFilter } from "../../services/tracking.service";

export function bulkBidDeleteDateFilter(
  profileId: string,
  from: string,
  to: string,
  company?: string,
  duplicatedOnly?: boolean
): BulkBidDeleteFilter | null {
  if (
    !profileId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    to < from
  )
    return null;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  const localDay = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (localDay(start) !== from || localDay(end) !== to) return null;
  // Advance a calendar day, not 24 hours: daylight-saving days can have 23 or 25 hours.
  end.setDate(end.getDate() + 1);
  return {
    profileId,
    dateFrom: start.toISOString(),
    dateTo: end.toISOString(),
    ...(company?.trim() ? { company: company.trim() } : {}),
    ...(duplicatedOnly ? { duplicatedOnly: true } : {})
  };
}
