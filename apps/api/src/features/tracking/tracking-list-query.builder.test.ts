import { describe, expect, it } from "vitest";
import { TrackingListQueryBuilder } from "./tracking-list-query.builder";

const builder = new TrackingListQueryBuilder();

describe("TrackingListQueryBuilder", () => {
  it("builds tenant-scoped indexed bid filters", () => {
    expect(
      builder.bidFilters(
        "workspace-1",
        {
          page: 1,
          pageSize: 20,
          search: "Acme Platform",
          sortBy: "datetime",
          sortDirection: "desc",
          jobMarketId: "market-1"
        },
        ["bid-1", "bid-2"]
      )
    ).toEqual({
      workspace_id: "eq.workspace-1",
      deleted_at: "is.null",
      job_market_id: "eq.market-1",
      id: "in.(bid-1,bid-2)",
      and: "(search_text.ilike.*acme*,search_text.ilike.*platform*)"
    });
  });

  it("maps public sort names to database columns", () => {
    expect(
      builder.bidOrder({
        page: 1,
        pageSize: 20,
        sortBy: "jobTitle",
        sortDirection: "asc"
      })
    ).toBe("job_title.asc,id.asc");
  });
});
