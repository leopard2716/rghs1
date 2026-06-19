import { describe, expect, it } from "vitest";
import { searchTimeZones, timeZoneInputLabel } from "./timezone-search";

const zones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Manila",
  "Asia/Tokyo",
  "UTC"
];

describe("timezone search", () => {
  it("matches a city with spaces instead of IANA underscores", () => {
    expect(searchTimeZones("New York", zones)[0]?.id).toBe("America/New_York");
  });

  it("matches US regional names", () => {
    expect(searchTimeZones("eastern", zones)[0]?.id).toBe("America/New_York");
    expect(searchTimeZones("central", zones)[0]?.id).toBe("America/Chicago");
  });

  it("matches abbreviations and international aliases", () => {
    expect(searchTimeZones("PST", zones)[0]?.id).toBe("America/Los_Angeles");
    expect(searchTimeZones("Philippines", zones)[0]?.id).toBe("Asia/Manila");
  });

  it("provides a human-readable selected label", () => {
    expect(timeZoneInputLabel("America/Chicago", new Date("2026-06-18T12:00:00.000Z"))).toContain(
      "Chicago - Central Time"
    );
  });
});
