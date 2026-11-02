import { useEffect, useState } from "react";
import type { EligibilityResult } from "../../../services/tracking.service";

export function ApplicationEligibilityBadge({
  result,
  importedAt,
  timeZone,
  onReview
}: {
  result: EligibilityResult;
  importedAt: string | null;
  timeZone: string;
  onReview: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  if (
    !result.blacklisted &&
    (!importedAt || format.format(new Date(importedAt)) !== format.format(new Date(now)))
  )
    return null;
  return (
    <button
      type="button"
      className="secondary-action small"
      onClick={(event) => {
        event.stopPropagation();
        onReview();
      }}
    >
      {result.blacklisted
        ? "⛔ Blacklisted"
        : result.duplicated
          ? "❌ Duplicated"
          : "✅ Applicable"}
    </button>
  );
}
