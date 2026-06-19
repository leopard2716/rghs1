import { describe, expect, it } from "vitest";
import type { BidRecord } from "../../services/tracking.service";
import {
  companyNameSimilarity,
  matchingCompanyBids,
  normalizeCompanyName
} from "./company-name-match";

describe("company name matching", () => {
  it("removes punctuation and common legal suffixes", () => {
    expect(normalizeCompanyName("The Acme Technologies, L.L.C.")).toBe("acme technologies");
    expect(normalizeCompanyName("Acme Technologies Co., Ltd.")).toBe("acme technologies");
  });

  it("treats legal-name variants as exact company matches", () => {
    expect(companyNameSimilarity("Acme Inc", "Acme, LLC")).toBe(1);
    expect(companyNameSimilarity("Northwind Ltd", "Northwind Corporation")).toBe(1);
  });

  it("matches partial typing and small spelling differences", () => {
    expect(companyNameSimilarity("micros", "Microsoft Corporation")).toBeGreaterThan(0.9);
    expect(companyNameSimilarity("Microsfot", "Microsoft Corporation")).toBeGreaterThan(0.5);
  });

  it("does not fuzzy-match unrelated or very short input", () => {
    expect(companyNameSimilarity("a", "Acme LLC")).toBe(0);
    expect(companyNameSimilarity("Acme", "Globex Inc")).toBe(0);
  });

  it("ranks the closest companies and newest equal matches first", () => {
    const bids = [
      bid("older", "Acme LLC", "2026-06-17T12:00:00.000Z"),
      bid("unrelated", "Globex Corporation", "2026-06-18T12:00:00.000Z"),
      bid("newer", "Acme, Inc.", "2026-06-18T12:00:00.000Z")
    ];

    expect(matchingCompanyBids("Acme Ltd", bids).map((item) => item.id)).toEqual([
      "newer",
      "older"
    ]);
  });
});

function bid(id: string, company: string, bidAt: string): BidRecord {
  return {
    id,
    createdByMemberId: null,
    company,
    bidAt,
    jobTitle: "Engineer",
    jobLink: "https://example.com/job",
    jobDescription: null,
    jobMarket: {
      id: "market-1",
      name: "US Job Market",
      system: true,
      createdAt: bidAt,
      deletedAt: null,
      canDelete: false
    },
    profiles: [],
    bidder: null,
    createdAt: bidAt,
    deletedAt: null,
    canDelete: false,
    canEdit: false
  };
}
