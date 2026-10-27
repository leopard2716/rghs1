import { describe, expect, it } from "vitest";
import { companyNamesMatch } from "./company-name";

describe("explicit parent-company names", () => {
  it.each([
    ["URUS Group", "VAS, a URUS Group company"],
    ["VAS", "VAS, a URUS Group company"],
    ["URUS Group LLC", "VAS (a URUS Group company)"],
    ["URUS Group", "VAS — a URUS Group company"],
    ["URUS Group", "VAS a URUS Group company"]
  ])("matches %s and %s in both directions", (left, right) => {
    expect(companyNamesMatch(left, right)).toBe(true);
    expect(companyNamesMatch(right, left)).toBe(true);
  });

  it.each([
    ["URUS Group", "Other Group"],
    ["URUS", "URUS Group"],
    ["URUS Group", "VAS, a Different Group company"],
    ["VAS", "VAST"],
    ["", ""]
  ])("does not infer a relationship between %s and %s", (left, right) => {
    expect(companyNamesMatch(left, right)).toBe(false);
  });
});
