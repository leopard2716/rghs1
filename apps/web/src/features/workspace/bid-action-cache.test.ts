import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { BidsResponse } from "../../services/tracking.service";
import { addBidToCache, updateBidActionCache, updateBidRejectionCache } from "./bid-action-cache";

import { bidData } from "./bid-action-test-fixtures";
const key = ["tracking-bids", "big-ben", "member-1", {}];

describe("bid action cache updates", () => {
  it("marks a row applied immediately while preserving other rows and the count", () => {
    const client = new QueryClient();
    client.setQueryData(key, bidData);
    updateBidActionCache(client, "big-ben", "member-1", "bid-1", "2026-10-12T18:00:00Z");
    const data = client.getQueryData<BidsResponse>(key)!;
    expect(data.bids[0]?.appliedAt).toBe("2026-10-12T18:00:00Z");
    expect(data.bids[0]?.bidAt).toBe(bidData.bids[0]?.bidAt);
    expect(data.bids.map((bid) => bid.id)).toEqual(["bid-1", "bid-2"]);
    expect(data.bids[1]).toBe(bidData.bids[1]);
    expect(data.pagination.total).toBe(2);
  });
  it("removes the deleted row and updates the count without emptying the table", () => {
    const client = new QueryClient();
    client.setQueryData(key, bidData);
    updateBidActionCache(client, "big-ben", "member-1", "bid-1");
    expect(client.getQueryData<BidsResponse>(key)).toMatchObject({
      bids: [{ id: "bid-2" }],
      suggestionBids: [],
      pagination: { total: 1 }
    });
    updateBidActionCache(client, "big-ben", "member-1", "bid-1");
    expect(client.getQueryData<BidsResponse>(key)?.pagination.total).toBe(1);
  });
  it("does not change another workspace or member's cache", () => {
    const client = new QueryClient();
    const other = ["tracking-bids", "other", "member-2", {}];
    client.setQueryData(other, bidData);
    updateBidActionCache(client, "big-ben", "member-1", "bid-1");
    expect(client.getQueryData(other)).toBe(bidData);
  });
});

it("patches rejection and undo without replacing other rows or changing counts", () => {
  const client = new QueryClient();
  client.setQueryData(key, bidData);
  updateBidRejectionCache(client, "big-ben", "member-1", "bid-1", "2026-10-13T12:00:00Z");
  const data = client.getQueryData<BidsResponse>(key)!;
  expect(data.bids[0]?.rejectedAt).toBe("2026-10-13T12:00:00Z");
  expect(data.bids[1]).toBe(bidData.bids[1]);
  expect(data.pagination).toEqual(bidData.pagination);
  updateBidRejectionCache(client, "big-ben", "member-1", "bid-1", null);
  expect(client.getQueryData<BidsResponse>(key)?.bids[0]?.rejectedAt).toBeNull();
});

it("removes applied rows from pending results without starting a refetch", () => {
  const client = new QueryClient();
  const pendingKey = ["tracking-bids", "big-ben", "member-1", { status: "pending" }];
  client.setQueryData(pendingKey, bidData);
  updateBidActionCache(client, "big-ben", "member-1", "bid-1", "2026-10-14T12:00:00Z");
  expect(client.getQueryData<BidsResponse>(pendingKey)?.bids.map((bid) => bid.id)).toEqual([
    "bid-2"
  ]);
  expect(client.getQueryData<BidsResponse>(pendingKey)?.pagination.total).toBe(1);
});
it("inserts new matching records once and respects status filters", () => {
  const client = new QueryClient();
  client.setQueryData(key, bidData);
  const pendingKey = ["tracking-bids", "big-ben", "member-1", { status: "pending" }];
  client.setQueryData(pendingKey, bidData);
  const bid = {
    ...bidData.bids[0]!,
    id: "new",
    bidAt: "2026-10-14T12:00:00Z",
    appliedAt: "2026-10-14T12:00:00Z"
  };
  addBidToCache(client, "big-ben", "member-1", bid);
  addBidToCache(client, "big-ben", "member-1", bid);
  expect(client.getQueryData<BidsResponse>(key)?.bids[0]?.id).toBe("new");
  expect(client.getQueryData<BidsResponse>(key)?.pagination.total).toBe(3);
  expect(client.getQueryData<BidsResponse>(pendingKey)?.pagination.total).toBe(2);
  expect(client.getQueryData<BidsResponse>(pendingKey)?.bids).toEqual(bidData.bids);
});
