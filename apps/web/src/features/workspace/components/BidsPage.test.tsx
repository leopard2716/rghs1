import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../../../services/auth.service";
import type { WorkspaceSession } from "../../../services/workspace.service";
import { bidData } from "../bid-action-test-fixtures";
import { trackingListQueryFromParams } from "../tracking-list-url";
import { BidsPage } from "./BidsPage";

vi.mock("./WorkspaceShell", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) => children
}));
const session: AuthSession = {
  accessToken: "token",
  refreshToken: "refresh",
  expiresAt: Date.now() + 60000,
  user: { id: "user-1", email: "bidder@example.com" },
  scope: "workspace:big-ben"
};
const workspaceSession: WorkspaceSession = {
  workspace: {
    id: "workspace-1",
    name: "Big Ben",
    slug: "big-ben",
    status: "active",
    createdAt: "2026-01-01T00:00:00Z"
  },
  member: {
    id: "member-1",
    email: "bidder@example.com",
    displayName: "Bidder",
    status: "active",
    roleKeys: ["bidder"],
    avatarUpdatedAt: null,
    avatarMimeType: null
  },
  accessState: "active",
  canAccess: true,
  requiresPasswordChange: false,
  temporaryPasswordExpiresAt: null
};

describe("BidsPage background refresh", () => {
  it("keeps rows and approval controls visible during a refetch", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } }
    });
    const key = [
      "tracking-bids",
      "big-ben",
      "member-1",
      trackingListQueryFromParams(new URLSearchParams())
    ];
    client.setQueryData(key, bidData);
    client.getQueryCache().find({ queryKey: key })!.setState({ fetchStatus: "fetching" });
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <BidsPage
            session={session}
            workspaceSession={workspaceSession}
            onRecoverPassword={() => undefined}
            onSignOut={() => undefined}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(markup).toContain("Acme");
    expect(markup).toContain("Other");
    expect(markup).toContain("Mark applied");
    expect(markup).not.toContain("Loading bid results");
    expect(markup).not.toMatch(/<button[^>]*disabled[^>]*>Mark applied/);
  });
});
