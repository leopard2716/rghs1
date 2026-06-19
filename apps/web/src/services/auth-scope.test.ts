import { describe, expect, it } from "vitest";
import {
  authScopeForLocation,
  sessionMatchesAuthScope,
  workspaceAuthScope,
  type AuthSession
} from "./auth.service";

const workspaceSession: AuthSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: Date.now() + 60_000,
  user: {
    id: "user-1",
    email: "user@example.com"
  },
  scope: "workspace:rg-team",
  flow: "password"
};

describe("authentication scope", () => {
  it("keeps routes in the same workspace session", () => {
    expect(sessionMatchesAuthScope(workspaceSession, workspaceAuthScope("rg-team"))).toBe(true);
  });

  it("requires authentication again for another workspace", () => {
    expect(sessionMatchesAuthScope(workspaceSession, workspaceAuthScope("acme"))).toBe(false);
  });

  it("does not reuse a workspace session for global admin", () => {
    expect(sessionMatchesAuthScope(workspaceSession, "admin")).toBe(false);
  });

  it("derives recovery scope from its return route", () => {
    expect(authScopeForLocation("/recover", "?returnTo=%2Fadmin%2Flogin")).toBe("admin");
    expect(authScopeForLocation("/recover", "?returnTo=%2Facme%2Fusers")).toBe("workspace:acme");
  });
});
