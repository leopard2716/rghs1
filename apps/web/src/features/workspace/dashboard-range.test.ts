import { describe, expect, it } from "vitest";
import { dashboardDateRange, datesInRange } from "./dashboard-range";

describe("dashboard date ranges", () => {
  it("builds a month range and today's timezone boundaries", () => {
    const range = dashboardDateRange(
      "month",
      "America/Chicago",
      "2026-06-18",
      "2026-06-18",
      new Date("2026-06-18T18:00:00.000Z")
    );

    expect(range.fromDate).toBe("2026-06-01");
    expect(range.toDateExclusive).toBe("2026-07-01");
    expect(range.from).toBe("2026-06-01T05:00:00.000Z");
  });

  it("treats a custom end date as inclusive", () => {
    const range = dashboardDateRange("custom", "UTC", "2026-06-10", "2026-06-12");

    expect(datesInRange(range.fromDate, range.toDateExclusive)).toEqual([
      "2026-06-10",
      "2026-06-11",
      "2026-06-12"
    ]);
  });
});
