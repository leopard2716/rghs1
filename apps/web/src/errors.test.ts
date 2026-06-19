import { describe, expect, it } from "vitest";
import { errorFromResponse, UserFacingError } from "./errors";

describe("API error handling", () => {
  it("preserves the API code used by route-specific recovery actions", async () => {
    const error = await errorFromResponse(
      new Response(
        JSON.stringify({
          error: "Workspace registration is required.",
          code: "workspace_registration_required"
        }),
        {
          status: 403,
          headers: { "content-type": "application/json" }
        }
      ),
      "Request failed."
    );

    expect(error).toBeInstanceOf(UserFacingError);
    expect(error.code).toBe("workspace_registration_required");
    expect(error.message).toBe("Register for this workspace before signing in.");
  });

  it("shows the required workspace-status migration", async () => {
    const error = await errorFromResponse(
      new Response(
        JSON.stringify({
          error:
            "Workspace registration requires Supabase migration 0005_repair_workspace_member_status_constraint.sql.",
          code: "workspace_member_status_migration_required"
        }),
        {
          status: 503,
          headers: { "content-type": "application/json" }
        }
      ),
      "Request failed."
    );

    expect(error.code).toBe("workspace_member_status_migration_required");
    expect(error.message).toBe("Apply Supabase migration 0005 before registering workspace users.");
  });

  it("shows the tenant identity isolation migration", async () => {
    const error = await errorFromResponse(
      new Response(
        JSON.stringify({
          error:
            "Tenant identity isolation requires Supabase migration 0006_tenant_identity_and_relational_isolation.sql.",
          code: "tenant_identity_migration_required"
        }),
        {
          status: 503,
          headers: { "content-type": "application/json" }
        }
      ),
      "Request failed."
    );

    expect(error.code).toBe("tenant_identity_migration_required");
    expect(error.message).toBe(
      "Apply Supabase migration 0006 before using workspace identity features."
    );
  });

  it("normalizes expired JWT responses into a session-expired error", async () => {
    const error = await errorFromResponse(
      new Response(
        JSON.stringify({
          error:
            "invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired"
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" }
        }
      ),
      "Request failed."
    );

    expect(error.code).toBe("invalid_auth_token");
    expect(error.message).toBe("Your session expired. Sign in again.");
  });
});
