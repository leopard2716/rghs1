import { describe, expect, it } from "vitest";
import {
  clearTrackingModalParams,
  trackingListQueryFromParams,
  updateTrackingListParams
} from "./tracking-list-url";

describe("tracking list URL state", () => {
  it("reads list filters while applying safe defaults", () => {
    expect(
      trackingListQueryFromParams(
        new URLSearchParams(
          "search=Frank&profileId=profile-1&page=2&pageSize=50&sortBy=company&sortDirection=asc"
        )
      )
    ).toEqual({
      page: 2,
      pageSize: 50,
      search: "Frank",
      profileId: "profile-1",
      jobMarketId: undefined,
      sortBy: "company",
      sortDirection: "asc"
    });
  });

  it("updates filters without removing an open record URL", () => {
    const params = updateTrackingListParams(
      new URLSearchParams("bidId=bid-1&profileId=profile-1"),
      {
        search: "platform",
        page: 1
      }
    );

    expect(params.get("bidId")).toBe("bid-1");
    expect(params.get("profileId")).toBe("profile-1");
    expect(params.get("search")).toBe("platform");
    expect(params.has("page")).toBe(false);
  });

  it("closes modal state without losing list filters", () => {
    const params = clearTrackingModalParams(
      new URLSearchParams("interviewId=interview-1&profileId=profile-1&sortBy=jobTitle")
    );

    expect(params.toString()).toBe("profileId=profile-1&sortBy=jobTitle");
  });
});
