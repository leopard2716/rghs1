import { describe, expect, it } from "vitest";
import {
  clearTrackingModalParams,
  paymentListQueryFromParams,
  trackingListQueryFromParams,
  updatePaymentListParams,
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

  it("round-trips payment status filters", () => {
    const params = updatePaymentListParams(new URLSearchParams("paymentRecordId=payment-1"), {
      status: "pending",
      page: 1
    });

    expect(params.get("paymentRecordId")).toBe("payment-1");
    expect(params.get("status")).toBe("pending");
    expect(paymentListQueryFromParams(params).status).toBe("pending");
  });

  it("removes deprecated payment range filters when updating payment URLs", () => {
    const params = updatePaymentListParams(
      new URLSearchParams(
        "dateFrom=2026-06-01T00%3A00%3A00.000Z&dateTo=2026-07-01T00%3A00%3A00.000Z&amountMin=100&amountMax=500&status=paid"
      ),
      { status: "pending" }
    );

    expect(params.has("dateFrom")).toBe(false);
    expect(params.has("dateTo")).toBe(false);
    expect(params.has("amountMin")).toBe(false);
    expect(params.has("amountMax")).toBe(false);
    expect(params.get("status")).toBe("pending");
  });
});
