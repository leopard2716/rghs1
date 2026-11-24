import { afterEach, expect, it, vi } from "vitest";
import type { AuthSession } from "./auth.service";
import { authenticatedApiFetch } from "./http";
import { currentImpersonation, endImpersonation, impersonateBidder } from "./impersonation.service";

vi.mock("./http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./http")>()),
  authenticatedApiFetch: vi.fn()
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("opens the selected bidder's bids in this tab and returns to the admin Users page", async () => {
  const values = new Map<string, string>();
  const replace = vi.fn();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    },
    location: { replace }
  });
  const admin = { user: { id: "real-admin" } } as AuthSession;
  const support = { id: "support-id", displayName: "Bidder B", expiresAt: "2026-11-24T15:30:00Z" };
  vi.mocked(authenticatedApiFetch).mockResolvedValueOnce(Response.json(support));
  await impersonateBidder(admin, "team", "member-b");
  expect(authenticatedApiFetch).toHaveBeenCalledWith(
    admin,
    expect.stringMatching(/\/team\/admin\/members\/member-b\/impersonate$/),
    { method: "POST" }
  );
  expect(currentImpersonation(admin, "team")).toEqual(support);
  expect(currentImpersonation(admin, "other")).toBeNull();
  expect(currentImpersonation({ ...admin, user: { id: "other-admin" } }, "team")).toBeNull();
  expect(replace).toHaveBeenCalledWith("/team/bids");
  vi.mocked(authenticatedApiFetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
  await endImpersonation(admin, "team", support.id);
  expect(currentImpersonation(admin, "team")).toBeNull();
  expect(replace).toHaveBeenLastCalledWith("/team/users");
});
