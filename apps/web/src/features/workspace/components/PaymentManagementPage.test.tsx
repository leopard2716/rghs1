import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AuthSession } from "../../../services/auth.service";
import type { PaymentsResponse } from "../../../services/tracking.service";
import type { WorkspaceSession } from "../../../services/workspace.service";
import { paymentListQueryFromParams } from "../tracking-list-url";
import { PaymentManagementPage } from "./PaymentManagementPage";

const session: AuthSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: Date.now() + 60_000,
  user: {
    id: "user-1",
    email: "admin@example.com"
  },
  scope: "workspace:rg-team"
};

const workspaceSession: WorkspaceSession = {
  workspace: {
    id: "workspace-1",
    name: "RG Team",
    slug: "rg-team",
    status: "active",
    createdAt: "2026-06-18T00:00:00.000Z"
  },
  member: {
    id: "member-1",
    email: "admin@example.com",
    displayName: "Workspace Admin",
    status: "active",
    roleKeys: ["admin"],
    avatarUpdatedAt: null,
    avatarMimeType: null
  },
  accessState: "active",
  canAccess: true,
  requiresPasswordChange: false,
  temporaryPasswordExpiresAt: null
};

const emptyPaymentsResponse: PaymentsResponse = {
  canCreate: true,
  canPay: true,
  jobRecords: [],
  payments: [],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0
  }
};

function renderPaymentsPage(route: string, data: PaymentsResponse = emptyPaymentsResponse) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });
  const search = route.split("?")[1] ?? "";
  const listQuery = paymentListQueryFromParams(new URLSearchParams(search));

  queryClient.setQueryData(["tracking-payments", "rg-team", "member-1", listQuery], data);

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={queryClient}>
        <PaymentManagementPage
          session={session}
          workspaceSession={workspaceSession}
          onRecoverPassword={() => undefined}
          onSignOut={() => undefined}
        />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("PaymentManagementPage", () => {
  it("keeps the add payment button available when no job records exist", () => {
    const markup = renderPaymentsPage("/rg-team/payments");

    expect(markup).toContain("Add payment");
    expect(markup).toContain('class="primary-action small" type="button"');
    expect(markup).not.toContain('class="primary-action small" type="button" disabled=""');
  });

  it("shows an empty job record message in the add payment modal", () => {
    const markup = renderPaymentsPage("/rg-team/payments?modal=new");

    expect(markup).toContain("Add Payment Record");
    expect(markup).toContain("No active job records are available for payment.");
    expect(markup).toContain('class="primary-action small" type="submit" disabled=""');
  });
});
