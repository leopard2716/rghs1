import type { MiddlewareHandler } from "hono";
import type { ApiBindings, ApiVariables } from "../app.types";
import { authTokenFromHeader, getAuthUser, requireAal2 } from "../auth/supabase-auth.service";
import { requireSupabaseConfig, type SupabaseConfig } from "../config/env";
import { ApiError, jsonError } from "../errors";

export function adminAuthMiddleware(): MiddlewareHandler<{
  Bindings: ApiBindings;
  Variables: ApiVariables;
}> {
  return async (c, next) => {
    let config: SupabaseConfig;
    try {
      config = requireSupabaseConfig(c.env);
    } catch (error) {
      return jsonError(
        c,
        500,
        error instanceof Error ? error.message : "Supabase is not configured.",
        "supabase_not_configured"
      );
    }

    const token = authTokenFromHeader(c.req.header("authorization"));
    if (!token) {
      return jsonError(c, 401, "Authorization bearer token is required.", "auth_required");
    }

    try {
      requireAal2(token);
      const user = await getAuthUser(config, token);
      c.set("authUser", user);
      await next();
    } catch (error) {
      return jsonError(
        c,
        error instanceof ApiError ? error.status : 401,
        error instanceof Error ? error.message : "Invalid authentication token.",
        error instanceof ApiError ? error.code : "invalid_auth_token"
      );
    }
  };
}
