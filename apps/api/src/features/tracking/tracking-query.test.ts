import { describe, expect, it } from "vitest";
import { countBy, matchesJobSearch, paginate, sortJobRecords, trendByDate } from "./tracking-query";

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
});
