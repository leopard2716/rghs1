import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { AuthSession } from "../../../services/auth.service";
import { PendingBidExportModal } from "./PendingBidExportModal";

const props = {
  session: {} as AuthSession,
  slug: "big-ben",
  members: [
    { id: "james", name: "James" },
    { id: "david", name: "David" }
  ],
  profiles: [
    { id: "frank", name: "Frank" },
    { id: "leo", name: "Leo" }
  ],
  onClose: () => undefined
};
it("requires explicit selections before enabling admin export", () => {
  const html = renderToStaticMarkup(<PendingBidExportModal {...props} />);
  expect(html).toContain('role="dialog"');
  expect(html).toContain("All bidders");
  expect(html).toContain("All profiles");
  expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
});
it("prefills the current bidder/profile and enables export", () => {
  const html = renderToStaticMarkup(
    <PendingBidExportModal {...props} initialMemberId="james" initialProfileId="frank" />
  );
  expect(html).toContain("<strong>Bidders:</strong> James");
  expect(html).toContain("<strong>Profiles:</strong> Frank");
  expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/);
});
