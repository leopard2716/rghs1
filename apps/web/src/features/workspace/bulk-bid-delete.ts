import type { BulkBidDeleteFilter, TrackingListQuery } from "../../services/tracking.service";
import { centralDayRange } from "../../utils/datetime";

export function bulkBidDeleteFilter(
  query: TrackingListQuery,
  through: string,
  company: string,
  duplicatedOnly: boolean
): BulkBidDeleteFilter | null {
  const { date, profileId, memberId, status, sortBy, sortDirection } = query;
  const search = query.search?.trim();
  const exactCompany = company.trim();
  if (
    !profileId &&
    !memberId &&
    !status &&
    !search &&
    !exactCompany &&
    !date &&
    !through &&
    !duplicatedOnly
  ) {
    return null;
  }
  if (date && through && through < date) return null;

  try {
    return {
      profileId,
      memberId,
      status,
      sortBy,
      sortDirection,
      activeOnly: true,
      ...(search ? { search } : {}),
      ...(date ? { dateFrom: centralDayRange(date).dateFrom } : {}),
      ...(through ? { dateTo: centralDayRange(through).dateTo } : {}),
      ...(exactCompany ? { company: exactCompany } : {}),
      ...(duplicatedOnly ? { duplicatedOnly: true } : {})
    };
  } catch {
    return null;
  }
}
