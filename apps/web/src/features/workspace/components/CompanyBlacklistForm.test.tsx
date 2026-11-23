import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { AuthSession } from "../../../services/auth.service";
import { CompanyBlacklistForm } from "./CompanyBlacklistForm";

it("shows each blacklist entry's creation time in Central Time for its own scope", () => {
  const client = new QueryClient();
  const globalAddedAt = "2026-07-02T04:05:06.123456+00:00";
  const profileAddedAt = "2026-12-02T05:15:19.654321+00:00";
  const company = { company: "Example Co", reason: "" };
  client.setQueryData(["company-blacklist", "big-ben"], {
    entries: [
      { ...company, id: "global", profile_id: null, created_at: globalAddedAt },
      { ...company, id: "profile", profile_id: "alpha", created_at: profileAddedAt }
    ]
  });
  client.setQueryData(["blacklist-profiles", "big-ben"], {
    profiles: [{ id: "alpha", name: "Alpha" }]
  });

  const markup = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <CompanyBlacklistForm session={{} as AuthSession} slug="big-ben" />
    </QueryClientProvider>
  );
  expect(markup).toContain("<th>Added at</th>");
  const rows = markup.split("<tbody>")[1]!.split("</tr>");
  expect(rows[0]).toContain("Global — all profiles");
  expect(rows[0]).toContain(`dateTime="${globalAddedAt}"`);
  expect(rows[0]).toMatch(/Jul 1, 2026.*11:05:06 PM CDT/);
  expect(rows[1]).toContain("Alpha");
  expect(rows[1]).toContain(`dateTime="${profileAddedAt}"`);
  expect(rows[1]).toMatch(/Dec 1, 2026.*11:15:19 PM CST/);
});
