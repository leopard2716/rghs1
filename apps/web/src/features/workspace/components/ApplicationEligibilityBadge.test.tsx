import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApplicationEligibilityBadge } from "./ApplicationEligibilityBadge";

it.each([null, "2000-01-01T12:00:00Z"])(
  "shows blacklisted companies regardless of import date (%s)",
  (importedAt) => {
    const markup = renderToStaticMarkup(
      <ApplicationEligibilityBadge
        importedAt={importedAt}
        timeZone="America/Chicago"
        onReview={() => undefined}
        result={{
          bidId: "bid",
          blacklisted: true,
          showBadge: false,
          duplicated: true,
          matches: []
        }}
      />
    );
    expect(markup).toContain("Blacklisted");
    expect(markup).not.toContain("Applicable");
  }
);
it("retains the existing import-day limit on duplicate badges", () => {
  const markup = renderToStaticMarkup(
    <ApplicationEligibilityBadge
      importedAt="2000-01-01T12:00:00Z"
      timeZone="America/Chicago"
      onReview={() => undefined}
      result={{ bidId: "bid", blacklisted: false, showBadge: false, duplicated: true, matches: [] }}
    />
  );
  expect(markup).toBe("");
});

it.each([
  [
    { duplicated: true, previousOpening: { bidId: "prior", appliedAt: "2026-11-18T12:00:00Z" } },
    "Duplicated · Already applied"
  ],
  [{ duplicated: false, possibleRepeat: true }, "Possible repeat"]
] as const)(
  "explains earlier applications independently of the company cooldown",
  (flags, label) => {
    const markup = renderToStaticMarkup(
      <ApplicationEligibilityBadge
        result={{ bidId: "target", showBadge: true, matches: [], ...flags }}
        importedAt={new Date().toISOString()}
        timeZone="America/Chicago"
        onReview={() => undefined}
      />
    );
    expect(markup).toContain(label);
    expect(markup).not.toContain("Applicable");
  }
);
