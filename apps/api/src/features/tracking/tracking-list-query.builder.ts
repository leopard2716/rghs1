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
    const tokens = searchTokens(query.search);
    if (tokens.length) {
      filters.and = `(${tokens.map((token) => `search_text.ilike.*${token}*`).join(",")})`;
    }
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
