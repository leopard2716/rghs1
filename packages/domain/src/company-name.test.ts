import { expect, it } from "vitest";
import { companyNamesMatch, companyEligibilityKeys, companyResetKey } from "./company-name";

it.each([
  ["AstranaHealth", "Astrana Health"],
  ["AstranaHealth", "Astrana Health, Inc"],
  ["ASTRANAHEALTH", "The Astrana Health, L.L.C."],
  ["CompanyName", "Company Name, Inc."],
  ["Fuze", "Fuze Health"],
  ["Fuze", "Fuze Health, LLC"],
  ["Fuze", "Fuze Health, Inc"],
  ["Fuze", "FuzeHealth"],
  ["Fuze Health", "FuzeHealth, Inc."],
  ["North Star", "NorthStar Technologies Ltd"],
  ["BrightSky", "Bright Sky Healthcare Group LLC"],
  ["BrightSky", "Bright Sky Health Care Inc"],
  ["Acme", "Acme Holdings, Co., Ltd."],
  ["F&G", "F and G Incorporated"],
  ["Café Works", "CafeWorks Corporation"]
])("matches company name variants %s / %s symmetrically", (a, b) => {
  expect(companyNamesMatch(a, b)).toBe(true);
  expect(companyNamesMatch(b, a)).toBe(true);
});

it.each([
  ["Fuze", "Confuze Health"],
  ["Fuze", "Fuze Financial"],
  ["Fuze", "Fuze Health Partners"],
  ["Acme Health", "Acme Technologies"],
  ["Acme East", "Acme West"],
  ["Meta", "Metaphor"],
  ["United", "United Airlines"],
  ["Health", "Health Group"],
  ["ABC", "ABC Health"],
  ["Unknown", "Unknown"],
  ["", ""],
  ["---", "---"],
  ["Microsfot", "Microsoft"],
  ["F&G", "F&G Services"]
])("keeps unrelated or ambiguous names distinct %s / %s", (a, b) => {
  expect(companyNamesMatch(a, b)).toBe(false);
  expect(companyNamesMatch(b, a)).toBe(false);
});

it("invalidates precisely the cached names matched by the eligibility rules", () => {
  const names = [
    "Acme",
    "The Acme LLC",
    "Acme Group",
    "Acme Health",
    "Acme Health Group",
    "Acme Technologies",
    "ABC",
    "ABC Health",
    "Health",
    "Health Group",
    "F&G",
    "F and G Inc.",
    "Café Works",
    "CafeWorks",
    "Unknown",
    "Unknown Company",
    "",
    "---"
  ];
  for (const cached of names) {
    const keys = companyEligibilityKeys(cached, "cached");
    for (const changed of names) {
      expect(companyEligibilityKeys(changed, "changed").some((key) => keys.includes(key))).toBe(
        companyNamesMatch(cached, changed) || companyResetKey(cached) === companyResetKey(changed)
      );
    }
  }
});
