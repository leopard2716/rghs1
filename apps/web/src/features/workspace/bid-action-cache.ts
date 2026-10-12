import type { QueryClient } from "@tanstack/react-query";
import type { BidRecord, BidsResponse } from "../../services/tracking.service";

export function updateBidActionCache(
  client: QueryClient,
  slug: string,
  memberId: string,
  bidId: string,
  appliedAt?: string
) {
  const patch = (bid: BidRecord) =>
    bid.id === bidId && appliedAt ? { ...bid, appliedAt, bidAt: appliedAt } : bid;
  client.setQueriesData<BidsResponse>({ queryKey: ["tracking-bids", slug, memberId] }, (data) => {
    if (!data) return data;
    if (appliedAt)
      return {
        ...data,
        bids: data.bids.map(patch),
        suggestionBids: data.suggestionBids.map(patch)
      };
    const visible = data.bids.some((bid) => bid.id === bidId);
    const total = Math.max(0, data.pagination.total - (visible ? 1 : 0));
    return {
      ...data,
      bids: data.bids.filter((bid) => bid.id !== bidId),
      suggestionBids: data.suggestionBids.filter((bid) => bid.id !== bidId),
      pagination: {
        ...data.pagination,
        total,
        totalPages: Math.max(1, Math.ceil(total / data.pagination.pageSize))
      }
    };
  });
  if (appliedAt)
    client.setQueryData<{ bid: BidRecord }>(["tracking-bid", slug, memberId, bidId], (data) =>
      data ? { bid: patch(data.bid) } : data
    );
}
