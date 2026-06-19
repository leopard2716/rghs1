import { describe, expect, it } from "vitest";
import type { BidRecord } from "../../services/tracking.service";
import { matchingJobs } from "./job-match";

describe("matchingJobs", () => {
  const bids = [
    bid("frontend", "R3Tech LLC", "Senior Frontend Engineer"),
    bid("backend", "R3 Technologies Inc", "Backend Developer"),
    bid("other", "Northwind Ltd", "Frontend Engineer")
  ];

  it("matches company keywords", () => {
    expect(matchingJobs("r3tech", bids).map(({ id }) => id)).toContain("frontend");
  });

  it("matches job-title keywords", () => {
    expect(matchingJobs("backend", bids).map(({ id }) => id)).toEqual(["backend"]);
  });

  it("matches a combination of company and title keywords", () => {
    expect(matchingJobs("r3 frontend", bids).map(({ id }) => id)).toEqual(["frontend"]);
  });

  it("shows newest jobs when the search is empty", () => {
    expect(matchingJobs("", bids, 2)).toHaveLength(2);
  });
});

function bid(id: string, company: string, jobTitle: string): BidRecord {
  return {
    id,
    createdByMemberId: null,
    company,
    jobTitle,
    jobLink: `https://example.com/${id}`,
    bidAt: `2026-06-1${id === "frontend" ? "8" : "7"}T12:00:00.000Z`,
    jobDescription: null,
    jobMarket: {
      id: "market-1",
      name: "US Job Market",
      system: true,
      createdAt: "2026-06-18T12:00:00.000Z",
      deletedAt: null,
      canDelete: false
    },
    profiles: [],
    bidder: null,
    createdAt: "2026-06-18T12:00:00.000Z",
    deletedAt: null,
    canDelete: false,
    canEdit: false
  };
}
