import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const app = createApp();
type JsonObject = Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RGHS1 API", () => {
  it("returns health metadata", async () => {
    const response = await app.request("/health", {}, { APP_NAME: "RGHS1 Test" });
    const body = (await response.json()) as JsonObject;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.tenantModel).toBe("workspace");
  });

  it("does not expose removed demo bootstrap data", async () => {
    const response = await app.request("/v1/bootstrap", {}, {});
    const body = (await response.json()) as JsonObject;

    expect(response.status).toBe(410);
    expect(body.error).toContain("Demo bootstrap data has been removed");
  });

  it("allows browser preflight for workspace role replacement", async () => {
    const response = await app.request(
      "/v1/workspaces/rg-team/admin/members/member-1/roles",
      {
        method: "OPTIONS",
        headers: {
          origin: "http://127.0.0.1:5173",
          "access-control-request-method": "PUT",
          "access-control-request-headers": "authorization,content-type"
        }
      },
      {
        ALLOWED_ORIGINS: "http://127.0.0.1:5173"
      }
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    expect(response.headers.get("access-control-allow-methods")).toContain("PUT");
  });

  it("returns pending membership status before MFA", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/auth/v1/user")) {
          return Response.json({
            id: "7eef51d8-6d9e-4ed2-92c6-634bb80603df",
            email: "member@example.com"
          });
        }
        if (url.includes("/rest/v1/workspaces?")) {
          return Response.json([
            {
              id: "7dc5bfd2-452b-4625-9ea3-14f307db5feb",
              name: "RG Team",
              slug: "rg-team",
              status: "active",
              created_at: "2026-06-18T00:00:00.000Z"
            }
          ]);
        }
        if (url.includes("/rest/v1/workspace_members?")) {
          return Response.json([
            {
              id: "64683d54-766c-4335-85d7-a3dd627d4282",
              workspace_id: "7dc5bfd2-452b-4625-9ea3-14f307db5feb",
              auth_user_id: "7eef51d8-6d9e-4ed2-92c6-634bb80603df",
              display_name: "Workspace Member",
              email: "member@example.com",
              status: "pending",
              created_at: "2026-06-18T00:00:00.000Z",
              updated_at: "2026-06-18T00:00:00.000Z",
              deleted_at: null
            }
          ]);
        }

        return new Response("Unexpected upstream request", { status: 500 });
      })
    );

    const response = await app.request(
      "/v1/workspaces/rg-team/membership",
      {
        headers: {
          authorization: "Bearer aal1-password-session"
        }
      },
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );
    const body = (await response.json()) as JsonObject;

    expect(response.status).toBe(200);
    expect(body.accessState).toBe("pending");
    expect(body.canAccess).toBe(false);
  });

  it("keeps the full workspace session behind MFA", async () => {
    const response = await app.request(
      "/v1/workspaces/rg-team/session",
      {
        headers: {
          authorization: "Bearer aal1-password-session"
        }
      },
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );
    const body = (await response.json()) as JsonObject;

    expect(response.status).toBe(403);
    expect(body.code).toBe("mfa_required");
  });

  it("registers tracking endpoints behind authentication", async () => {
    const response = await app.request(
      "/v1/workspaces/rg-team/tracking/bids",
      {},
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );
    const body = (await response.json()) as JsonObject;

    expect(response.status).toBe(401);
    expect(body.code).toBe("auth_required");
  });

  it("keeps unfinished tenant write endpoints disabled", async () => {
    const response = await app.request(
      "/v1/applications",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: "workspace-rghs1-demo",
          profileId: "profile-alex-rivera",
          marketId: "market-remote-global",
          jobTitle: "Cloud Engineer",
          companyName: "Example Co",
          jobLink: "https://example.com/jobs/cloud-engineer"
        })
      },
      {}
    );
    const body = (await response.json()) as JsonObject;

    expect(response.status).toBe(410);
    expect(body.error).toContain("Demo bootstrap data has been removed");
  });
});
