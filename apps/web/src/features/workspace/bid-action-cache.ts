import type { QueryClient } from "@tanstack/react-query";
import type { BidRecord, BidsResponse, TrackingListQuery } from "../../services/tracking.service";

export function updateBidActionCache(
  client: QueryClient,
  slug: string,
  memberId: string,
  bidId: string,
  appliedAt?: string
) {
  const patch = (bid: BidRecord) => (bid.id === bidId && appliedAt ? { ...bid, appliedAt } : bid);
  for (const [key, data] of client.getQueriesData<BidsResponse>({
    queryKey: ["tracking-bids", slug, memberId]
  })) {
    if (!data) continue;
    const query = (key[3] ?? {}) as TrackingListQuery;
    const before =
      data.bids.find((bid) => bid.id === bidId) ??
      data.suggestionBids.find((bid) => bid.id === bidId);
    const after = before && appliedAt ? patch(before) : undefined;
    const delta = before
      ? Number(Boolean(after && matchesBidFilters(after, query))) -
        Number(matchesBidFilters(before, query))
      : 0;
    const total = Math.max(0, data.pagination.total + delta);
    client.setQueryData(key, {
      ...data,
      bids: appliedAt
        ? data.bids.map(patch).filter((bid) => matchesBidFilters(bid, query))
        : data.bids.filter((bid) => bid.id !== bidId),
      suggestionBids: appliedAt
        ? data.suggestionBids.map(patch)
        : data.suggestionBids.filter((bid) => bid.id !== bidId),
      pagination: {
        ...data.pagination,
        total,
        totalPages: Math.max(1, Math.ceil(total / data.pagination.pageSize))
      }
    });
  }
  if (appliedAt)
    client.setQueryData<{ bid: BidRecord }>(["tracking-bid", slug, memberId, bidId], (data) =>
      data ? { bid: patch(data.bid) } : data
    );
}

export function updateBidRejectionCache(
  client: QueryClient,
  slug: string,
  memberId: string,
  bidId: string,
  rejectedAt: string | null
) {
  const patch = (bid: BidRecord) => (bid.id === bidId ? { ...bid, rejectedAt } : bid);
  client.setQueriesData<BidsResponse>({ queryKey: ["tracking-bids", slug, memberId] }, (data) =>
    data
      ? { ...data, bids: data.bids.map(patch), suggestionBids: data.suggestionBids.map(patch) }
      : data
  );
  client.setQueryData<{ bid: BidRecord }>(["tracking-bid", slug, memberId, bidId], (data) =>
    data ? { bid: patch(data.bid) } : data
  );
}

export function matchesBidFilters(bid: BidRecord, query: TrackingListQuery): boolean {
  const status = bid.rejectedAt ? "rejected" : bid.appliedAt ? "applied" : "pending";
  if (query.status && status !== query.status) return false;
  if (query.profileId && !bid.profiles.some((profile) => profile.id === query.profileId))
    return false;
  if (query.jobMarketId && bid.jobMarket.id !== query.jobMarketId) return false;
  if (query.date) {
    const start = new Date(`${query.date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const time = Date.parse(bid.bidAt);
    if (!(time >= start.getTime() && time < end.getTime())) return false;
  }
  const text = `${bid.company} ${bid.jobTitle}`.toLocaleLowerCase();
  return (query.search ?? "")
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}+#-]+/gu, ""))
    .filter(Boolean)
    .slice(0, 12)
    .every((token) => text.includes(token));
}

export function addBidToCache(client: QueryClient, slug: string, memberId: string, bid: BidRecord) {
  for (const [key, data] of client.getQueriesData<BidsResponse>({
    queryKey: ["tracking-bids", slug, memberId]
  })) {
    if (!data) continue;
    const query = (key[3] ?? {}) as TrackingListQuery;
    if (
      data.bids.some((row) => row.id === bid.id) ||
      data.suggestionBids.some((row) => row.id === bid.id)
    )
      continue;
    const matches = matchesBidFilters(bid, query);
    const total = data.pagination.total + Number(matches);
    // Keep later pages stable; their boundaries reconcile when revisited.
    const bids =
      matches && data.pagination.page === 1
        ? [...data.bids, bid]
            .sort((a, b) => {
              const direction = query.sortDirection === "asc" ? 1 : -1;
              const field =
                query.sortBy === "company"
                  ? "company"
                  : query.sortBy === "jobTitle"
                    ? "jobTitle"
                    : "bidAt";
              const comparison =
                field === "bidAt"
                  ? Date.parse(a.bidAt) - Date.parse(b.bidAt)
                  : a[field].localeCompare(b[field]);
              return direction * (comparison || a.id.localeCompare(b.id));
            })
            .slice(0, data.pagination.pageSize)
        : data.bids;
    client.setQueryData(key, {
      ...data,
      bids,
      suggestionBids: [bid, ...data.suggestionBids].slice(0, 100),
      pagination: {
        ...data.pagination,
        total,
        totalPages: Math.max(1, Math.ceil(total / data.pagination.pageSize))
      }
    });
  }
  client.setQueryData(["tracking-bid", slug, memberId, bid.id], { bid });
}
