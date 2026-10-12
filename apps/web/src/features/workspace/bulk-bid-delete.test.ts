import { describe, expect, it } from "vitest";
import { bulkBidDeleteDateFilter } from "./bulk-bid-delete";

describe("bulk bid delete date boundaries", () => {
  it("includes the whole final date and permits a one-day range", () => {
    const filter = bulkBidDeleteDateFilter("profile", "2026-10-12", "2026-10-12");
    expect(filter?.dateFrom).toBe(new Date("2026-10-12T00:00:00").toISOString());
    expect(filter?.dateTo).toBe(new Date("2026-10-13T00:00:00").toISOString());
  });
  it("rejects missing profiles, inverted ranges, and impossible dates", () => {
    expect(bulkBidDeleteDateFilter("", "2026-10-12", "2026-10-12")).toBeNull();
    expect(bulkBidDeleteDateFilter("profile", "2026-10-13", "2026-10-12")).toBeNull();
    expect(bulkBidDeleteDateFilter("profile", "2026-02-30", "2026-03-02")).toBeNull();
  });
  it("advances calendar midnights across daylight-saving transitions", () => {
    const filter = bulkBidDeleteDateFilter("profile", "2026-03-08", "2026-03-08");
    expect(filter?.dateTo).toBe(new Date("2026-03-09T00:00:00").toISOString());
  });
});

it("includes a trimmed optional company in the reviewed filter", () => {
  expect(
    bulkBidDeleteDateFilter("profile", "2026-10-12", "2026-10-12", "  Acme Inc.  ")?.company
  ).toBe("Acme Inc.");
  expect(bulkBidDeleteDateFilter("profile", "2026-10-12", "2026-10-12", "  ")).not.toHaveProperty(
    "company"
  );
});

it("carries duplicate selection in the preview and commit filter", () => {
  expect(
    bulkBidDeleteDateFilter("profile", "2026-10-12", "2026-10-12", "Acme", true)
  ).toMatchObject({ company: "Acme", duplicatedOnly: true });
  expect(
    bulkBidDeleteDateFilter("profile", "2026-10-12", "2026-10-12", "", false)
  ).not.toHaveProperty("duplicatedOnly");
});
