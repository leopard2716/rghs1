import { describe, expect, it } from "vitest";
import {
  chunkValues,
  countBy,
  matchesJobSearch,
  paginate,
  sortJobMarketsByUsage,
  sortJobRecords,
  trendByDate
} from "./tracking-query";

const records = [
  {
    company: "Zeta LLC",
    jobTitle: "Developer",
    at: "2026-06-18T18:00:00.000Z",
    market: "US"
  },
  {
    company: "Acme Inc",
    jobTitle: "Platform Engineer",
    at: "2026-06-17T18:00:00.000Z",
    market: "EU"
  }
];

describe("tracking query helpers", () => {
  it("searches company and title through one normalized value", () => {
    expect(matchesJobSearch(records[1]!, "platform acme")).toBe(true);
    expect(matchesJobSearch(records[0]!, "platform")).toBe(false);
  });

  it("sorts records and paginates them", () => {
    const sorted = sortJobRecords(records, "company", "asc", (record) => record.at);
    const result = paginate(sorted, 1, 10);

    expect(result.records[0]?.company).toBe("Acme Inc");
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 2,
      totalPages: 1
    });
  });

  it("builds grouped counts and timezone-aware trends", () => {
    expect(
      countBy(records, (record) => ({ key: record.market, label: record.market }))
    ).toHaveLength(2);
    expect(trendByDate(records, "America/Chicago", (record) => record.at)).toEqual([
      { date: "2026-06-17", value: 1 },
      { date: "2026-06-18", value: 1 }
    ]);
  });

  it("keeps profile-filter database requests bounded", () => {
    const chunks = chunkValues(
      Array.from({ length: 251 }, (_, index) => `bid-${index}`),
      100
    );

    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 51]);
  });

  it("orders markets by member usage with the built-in order as the tie breaker", () => {
    const markets = [
      { id: "custom", market_key: null, name: "Canada", created_at: "2026-01-01" },
      { id: "japan", market_key: "japan", name: "Japan", created_at: "2026-01-01" },
      { id: "us", market_key: "us", name: "US", created_at: "2026-01-01" },
      {
        id: "philippines",
        market_key: "philippines",
        name: "Philippine",
        created_at: "2026-01-01"
      },
      { id: "eu", market_key: "eu", name: "EU", created_at: "2026-01-01" }
    ];

    expect(sortJobMarketsByUsage(markets, new Map()).map((market) => market.id)).toEqual([
      "us",
      "eu",
      "philippines",
      "japan",
      "custom"
    ]);
    expect(
      sortJobMarketsByUsage(
        markets,
        new Map([
          ["custom", 4],
          ["japan", 2]
        ])
      ).map((market) => market.id)
    ).toEqual(["custom", "japan", "us", "eu", "philippines"]);
  });
});
