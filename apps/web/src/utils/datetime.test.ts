import { describe, expect, it } from "vitest";
import { displayZonedDateTimeRange, zonedDateTimeToIso } from "./datetime";

describe("zoned interview date ranges", () => {
  it("converts Chicago daylight time to UTC", () => {
    expect(zonedDateTimeToIso("2026-06-18", "15:00", "America/Chicago")).toBe(
      "2026-06-18T20:00:00.000Z"
    );
  });

  it("converts Tokyo local time to UTC", () => {
    expect(zonedDateTimeToIso("2026-06-18", "15:00", "Asia/Tokyo")).toBe(
      "2026-06-18T06:00:00.000Z"
    );
  });

  it("rejects a nonexistent daylight-saving time", () => {
    expect(zonedDateTimeToIso("2026-03-08", "02:30", "America/Chicago")).toBeNull();
  });

  it("formats a range in its saved timezone", () => {
    expect(
      displayZonedDateTimeRange(
        "2026-06-18T20:00:00.000Z",
        "2026-06-18T21:00:00.000Z",
        "America/Chicago"
      )
    ).toContain("3:00 PM - 4:00 PM");
  });
});

it("prefills Central Time independently of the laptop timezone", async () => {
  const { centralDateTimeValue, centralDateTimeToIso, centralTimeZoneLabel, displayCentralDate } =
    await import("./datetime");
  const now = new Date("2026-10-14T13:00:00Z"); // 6 PM in Pakistan, 8 AM in Chicago.
  expect(centralDateTimeValue(now)).toBe("2026-10-14T08:00");
  expect(centralDateTimeToIso("2026-10-14T08:00")).toBe(now.toISOString());
  expect(centralTimeZoneLabel("2026-10-14T08:00")).toContain("CDT (UTC-05:00)");
  expect(centralTimeZoneLabel("2026-12-14T08:00")).toContain("CST (UTC-06:00)");
  expect(displayCentralDate(now.toISOString())).toContain("8:00 AM CDT");
  expect(centralDateTimeToIso("2026-03-08T02:30")).toBeNull();
});

it("filters Central calendar days across daylight-saving boundaries", async () => {
  const { centralDayRange } = await import("./datetime");
  expect(centralDayRange("2026-10-14")).toEqual({
    dateFrom: "2026-10-14T05:00:00.000Z",
    dateTo: "2026-10-15T05:00:00.000Z"
  });
  expect(centralDayRange("2026-03-08")).toEqual({
    dateFrom: "2026-03-08T06:00:00.000Z",
    dateTo: "2026-03-09T05:00:00.000Z"
  });
  expect(centralDayRange("2026-11-01")).toEqual({
    dateFrom: "2026-11-01T05:00:00.000Z",
    dateTo: "2026-11-02T06:00:00.000Z"
  });
});
