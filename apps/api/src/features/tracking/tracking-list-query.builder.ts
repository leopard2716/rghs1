import type { BidListQuery } from "./tracking.schemas";

export class TrackingListQueryBuilder {
  bidFilters(
    workspaceId: string,
    query: BidListQuery,
    profileBidIds?: string[]
  ): Record<string, string> {
    const filters: Record<string, string> = {
      workspace_id: `eq.${workspaceId}`,
      deleted_at: "is.null"
    };
    if (query.jobMarketId) {
      filters.job_market_id = `eq.${query.jobMarketId}`;
    }
    if (profileBidIds) {
      filters.id = `in.(${profileBidIds.join(",")})`;
    }
    if (query.status === "rejected") {
      filters.rejected_at = "not.is.null";
    } else if (query.status) {
      filters.rejected_at = "is.null";
      filters.applied_at = query.status === "applied" ? "not.is.null" : "is.null";
    }
    const conditions: string[] = [];
    if (query.dateFrom) conditions.push(`bid_at.gte.${query.dateFrom}`);
    if (query.dateTo) conditions.push(`bid_at.lt.${query.dateTo}`);
    const tokens = searchTokens(query.search);
    conditions.push(...tokens.map((token) => `search_text.ilike.*${token}*`));
    if (conditions.length) filters.and = `(${conditions.join(",")})`;
    return filters;
  }

  bidOrder(query: BidListQuery): string {
    const column =
      query.sortBy === "company" ? "company" : query.sortBy === "jobTitle" ? "job_title" : "bid_at";
    return `${column}.${query.sortDirection},id.${query.sortDirection}`;
  }
}

function searchTokens(value: string | undefined): string[] {
  return (value ?? "")
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}+#-]+/gu, ""))
    .filter(Boolean)
    .slice(0, 12);
}
