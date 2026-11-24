import type { Hono } from "hono";
import { z } from "zod";
import type { ApiBindings, ApiContext, ApiVariables } from "../../app.types";
import { authTokenFromHeader, getAuthUser, requireAal2 } from "../../auth/supabase-auth.service";
import { requireSupabaseConfig } from "../../config/env";
import { apiError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";

const header = "X-Workspace-Impersonation";
type SupportSession = { id: string; userId: string; displayName: string; expiresAt: string };

async function authorize(
  c: ApiContext,
  operation: "start" | "use" | "end",
  slug: string,
  id: string,
  write: string | null = null
) {
  if (!z.string().uuid().safeParse(id).success)
    throw apiError(400, "Invalid impersonation request.", "invalid_impersonation");
  const token = authTokenFromHeader(c.req.header("authorization"));
  if (!token) throw apiError(401, "Sign in to continue.", "auth_required");
  const config = requireSupabaseConfig(c.env);
  requireAal2(token);
  const actor = await getAuthUser(config, token);
  const result = await new SupabaseRestClient(config).rpc<SupportSession | null>(
    "workspace_impersonation",
    {
      p_actor: actor.id,
      p_slug: slug,
      p_operation: operation,
      p_id: id,
      p_write: write
    }
  );
  if (!result && operation !== "end")
    throw apiError(
      403,
      "Bidder impersonation is unavailable or has expired.",
      "impersonation_denied"
    );
  return result;
}

export function registerImpersonationRoutes(
  app: Hono<{ Bindings: ApiBindings; Variables: ApiVariables }>
) {
  // Only these routes know how to use the effective bidder. Reject a tagged request
  // everywhere else rather than falling back to the administrator's authority.
  for (const path of ["/v1/workspaces/:slug/session", "/v1/workspaces/:slug/tracking/*"]) {
    app.use(path, async (c, next) => {
      const id = c.req.header(header);
      if (id !== undefined) {
        const write =
          c.req.method === "GET" || c.req.path.endsWith("/application-eligibility")
            ? null
            : `${c.req.method} ${c.req.path}`;
        const session = await authorize(c, "use", c.req.param("slug")!, id, write);
        c.set("impersonatedUser", { id: session!.userId });
      }
      return next();
    });
  }
  app.use("*", async (c, next) => {
    if (c.req.header(header) !== undefined && !c.get("impersonatedUser"))
      throw apiError(403, "Exit impersonation to use this feature.", "impersonation_scope");
    return next();
  });
  app.post("/v1/workspaces/:slug/admin/members/:id/impersonate", async (c) => {
    const session = await authorize(c, "start", c.req.param("slug"), c.req.param("id"));
    return c.json(
      { id: session!.id, displayName: session!.displayName, expiresAt: session!.expiresAt },
      201
    );
  });
  app.delete("/v1/workspaces/:slug/impersonations/:id", async (c) => {
    await authorize(c, "end", c.req.param("slug"), c.req.param("id"));
    return c.body(null, 204);
  });
}
