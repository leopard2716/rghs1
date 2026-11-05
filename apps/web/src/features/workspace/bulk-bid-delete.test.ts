import { describe, expect, it } from "vitest";
import { bulkBidDeleteFilter } from "./bulk-bid-delete";

describe("bulk bid deletion filters", () => {
  it("includes both Central Time dates and handles daylight saving", () => {
    expect(bulkBidDeleteFilter({ date: "2026-03-08" }, "2026-03-08", "", false)).toMatchObject({
      dateFrom: "2026-03-08T06:00:00.000Z",
      dateTo: "2026-03-09T05:00:00.000Z"
    });
  });

  it("rejects an unfiltered request, inverted dates, and impossible dates", () => {
    expect(bulkBidDeleteFilter({}, "", "", false)).toBeNull();
    expect(bulkBidDeleteFilter({ date: "2026-10-13" }, "2026-10-12", "", false)).toBeNull();
    expect(bulkBidDeleteFilter({ date: "2026-02-30" }, "2026-03-02", "", false)).toBeNull();
  });

  it("carries the table filters and preserves exact-company and duplicate filtering", () => {
    expect(
      bulkBidDeleteFilter(
        {
          profileId: "profile",
          memberId: "bidder",
          search: " Engineer ",
          status: "pending",
          sortBy: "company",
          sortDirection: "asc"
        },
        "",
        " Acme Inc. ",
        true
      )
    ).toEqual({
      profileId: "profile",
      memberId: "bidder",
      search: "Engineer",
      status: "pending",
      sortBy: "company",
      sortDirection: "asc",
      activeOnly: true,
      company: "Acme Inc.",
      duplicatedOnly: true
    });
  });
});
