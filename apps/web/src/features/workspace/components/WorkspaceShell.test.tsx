import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AuthSession } from "../../../services/auth.service";
import type { WorkspaceSession } from "../../../services/workspace.service";
import type { WorkspaceView } from "../workspace.types";
import { WorkspaceShell } from "./WorkspaceShell";

const session: AuthSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: Date.now() + 60_000,
  user: {
    id: "user-1",
    email: "member@example.com"
  },
  scope: "workspace:rg-team"
};

function workspaceSession(roleKeys: string[]): WorkspaceSession {
  return {
    workspace: {
      id: "workspace-1",
      name: "RG Team",
      slug: "rg-team",
      status: "active",
      createdAt: "2026-06-18T00:00:00.000Z"
    },
    member: {
      id: "member-1",
      email: "member@example.com",
      displayName: "Workspace Member",
      status: "active",
      roleKeys
    },
    accessState: "active",
    canAccess: true,
    requiresPasswordChange: false,
    temporaryPasswordExpiresAt: null
  };
}

function renderShell(roleKeys: string[], view: WorkspaceView) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });
  const routeByView: Record<WorkspaceView, string> = {
    overview: "/rg-team/dashboard",
    profiles: "/rg-team/profiles",
    bids: "/rg-team/bids",
    interviews: "/rg-team/interviews",
    users: "/rg-team/users"
  };

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[routeByView[view]]}>
      <QueryClientProvider client={queryClient}>
        <WorkspaceShell
          session={session}
          workspaceSession={workspaceSession(roleKeys)}
          view={view}
          onRecoverPassword={() => undefined}
          onSignOut={() => undefined}
        >
          <div>Page content</div>
        </WorkspaceShell>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("WorkspaceShell navigation", () => {
  it("lets workspace admins switch between workspace and administration", () => {
    const markup = renderShell(["admin", "bidder"], "users");

    expect(markup).toContain("Workspace");
    expect(markup).toContain("Administration");
    expect(markup).toContain("/rg-team/dashboard");
    expect(markup).toContain("/rg-team/profiles");
    expect(markup).toContain("/rg-team/bids");
    expect(markup).toContain("/rg-team/interviews");
    expect(markup).toContain("/rg-team/users");
  });

  it("does not expose administration navigation to regular users", () => {
    const markup = renderShell(["bidder"], "overview");

    expect(markup).not.toContain("Administration");
    expect(markup).not.toContain("User management");
  });

  it("exposes tracking duties to active regular workspace members", () => {
    const markup = renderShell(["bidder"], "bids");

    expect(markup).toContain("/rg-team/profiles");
    expect(markup).toContain("/rg-team/bids");
    expect(markup).toContain("/rg-team/interviews");
    expect(markup).not.toContain("/rg-team/users");
  });
});
