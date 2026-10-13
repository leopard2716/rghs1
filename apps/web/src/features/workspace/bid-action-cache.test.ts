import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { BidsResponse } from "../../services/tracking.service";
import { updateBidActionCache, updateBidRejectionCache } from "./bid-action-cache";

import { bidData } from "./bid-action-test-fixtures";
const key = ["tracking-bids", "big-ben", "member-1", {}];

describe("bid action cache updates", () => {
  it("marks a row applied immediately while preserving other rows and the count", () => {
    const client = new QueryClient();
    client.setQueryData(key, bidData);
    updateBidActionCache(client, "big-ben", "member-1", "bid-1", "2026-10-12T18:00:00Z");
    const data = client.getQueryData<BidsResponse>(key)!;
    expect(data.bids[0]?.appliedAt).toBe("2026-10-12T18:00:00Z");
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
