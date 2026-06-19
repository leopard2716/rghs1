import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { authTokenFromHeader, getAuthUser, requireAal2 } from "../../auth/supabase-auth.service";
import type { ApiBindings, ApiContext, ApiVariables } from "../../app.types";
import { requireSupabaseConfig } from "../../config/env";
import { ApiError, jsonError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { NotificationService } from "./notification.service";

type ApiApp = Hono<{ Bindings: ApiBindings; Variables: ApiVariables }>;

const notificationQuery = z
  .object({
    workspaceSlug: z.string().trim().min(1).max(64).optional(),
    scope: z.literal("admin").optional()
  })
  .refine((query) => Boolean(query.workspaceSlug) !== Boolean(query.scope), {
    message: "Choose either workspaceSlug or admin scope."
  });

const notificationParams = z.object({
  notificationId: z.string().uuid()
});

export function registerNotificationRoutes(app: ApiApp): void {
  app.get("/v1/notifications", zValidator("query", notificationQuery), async (c) => {
    try {
      const { service, user } = await context(c);
      return c.json(await service.list(user, c.req.valid("query")));
    } catch (error) {
      return routeError(c, error);
    }
  });

  app.patch(
    "/v1/notifications/:notificationId/read",
    zValidator("param", notificationParams),
    async (c) => {
      try {
        const { service, user } = await context(c);
        return c.json(await service.markRead(user, c.req.valid("param").notificationId));
      } catch (error) {
        return routeError(c, error);
      }
    }
  );

  app.post("/v1/notifications/read-all", zValidator("query", notificationQuery), async (c) => {
    try {
      const { service, user } = await context(c);
      return c.json(await service.markAllRead(user, c.req.valid("query")));
    } catch (error) {
      return routeError(c, error);
    }
  });
}

async function context(c: ApiContext) {
  const config = requireSupabaseConfig(c.env);
  const token = authTokenFromHeader(c.req.header("authorization"));
  if (!token) {
    throw new ApiError(401, "Authorization bearer token is required.", "auth_required");
  }
  requireAal2(token);
  return {
    user: await getAuthUser(config, token),
    service: new NotificationService(new SupabaseRestClient(config))
  };
}

function routeError(c: ApiContext, error: unknown) {
  if (error instanceof ApiError) {
    return jsonError(c, error.status, error.message, error.code, error.details);
  }
  return jsonError(
    c,
    500,
    error instanceof Error ? error.message : "Notification request failed.",
    "notification_request_failed"
  );
}
