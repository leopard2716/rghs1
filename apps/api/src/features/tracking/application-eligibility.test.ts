import { describe, expect, it } from "vitest";
import { applicationEligibility, type ApplicationRow } from "./application-eligibility";

const now = new Date("2026-10-12T18:00:00Z");
const rules = { cooldownDays: 45, timeZone: "America/Chicago" };
const target: ApplicationRow = {
  id: "target",
  company: "Acme Inc.",
  job_title: "Engineer",
  applied_at: null,
  imported_at: "2026-10-12T17:00:00Z",
  import_batch_id: "batch",
  import_order: 1,
  deleted_at: null
};
const prior: ApplicationRow = {
  id: "prior",
  company: " ACME LLC ",
  job_title: "Other role",
  applied_at: "2026-10-01T12:00:00Z",
  deleted_at: null
};
const assignments = [
  { bid_id: "target", profile_id: "profile" },
  { bid_id: "prior", profile_id: "profile" }
];
const check = (history: ApplicationRow[], date = now) =>
  applicationEligibility(target, history, assignments, rules, date);

describe("company application cooldown", () => {
  it("matches company aliases across roles for the same profile", () => {
    expect(check([target, prior])).toMatchObject({ duplicated: true, showBadge: true });
  });
  it("does not match a different profile or different company", () => {
    expect(
      applicationEligibility(
        target,
        [prior],
        [
          { bid_id: "target", profile_id: "one" },
          { bid_id: "prior", profile_id: "two" }
        ],
        rules,
        now
      ).duplicated
    ).toBe(false);
    expect(check([{ ...prior, company: "Other Inc" }]).duplicated).toBe(false);
  });
  it("allows the company at the exact cooldown boundary and retains older results", () => {
    const old = { ...prior, applied_at: new Date(now.getTime() - 45 * 86400000).toISOString() };
    expect(check([old])).toMatchObject({
      duplicated: false,
      matches: [{ reason: "Outside cooldown" }]
    });
    expect(
      check([{ ...old, applied_at: new Date(Date.parse(old.applied_at) + 1).toISOString() }])
        .duplicated
    ).toBe(true);
  });
  it("uses the admin's cooldown value", () => {
    expect(
      applicationEligibility(target, [prior], assignments, { ...rules, cooldownDays: 1 }, now)
        .duplicated
    ).toBe(false);
  });
  it("counts only earlier pending rows of the same import", () => {
    const pending = { ...prior, applied_at: null, import_batch_id: "batch", import_order: 0 };
    expect(check([pending]).duplicated).toBe(true);
    expect(check([{ ...pending, import_order: 2 }]).duplicated).toBe(false);
    expect(check([{ ...pending, import_batch_id: "different" }]).duplicated).toBe(false);
  });
  it("releases deleted pending rows but preserves deleted applied history", () => {
    expect(check([{ ...prior, deleted_at: now.toISOString() }]).duplicated).toBe(true);
    expect(
      check([
        {
          ...prior,
          applied_at: null,
          import_batch_id: "batch",
          import_order: 0,
          deleted_at: now.toISOString()
        }
      ]).duplicated
    ).toBe(false);
  });
  it("never counts the target itself", () => {
    expect(check([target]).duplicated).toBe(false);
  });
  it("hides badges at workspace midnight", () => {
    expect(check([prior], new Date("2026-10-13T04:59:59Z")).showBadge).toBe(true);
    expect(check([prior], new Date("2026-10-13T05:00:00Z")).showBadge).toBe(false);
  });
  it("does not show a badge for an old non-imported application", () => {
    expect(applicationEligibility(prior, [target], assignments, rules, now).showBadge).toBe(false);
  });
});
