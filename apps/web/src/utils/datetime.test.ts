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
