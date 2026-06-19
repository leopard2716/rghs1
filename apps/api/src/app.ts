import { Hono } from "hono";
import type { ApiBindings, ApiVariables } from "./app.types";
import { registerAdminRoutes } from "./features/admin/admin.routes";
import { registerFileRoutes } from "./features/files/files.routes";
import { registerHealthRoutes } from "./features/health/health.routes";
import { registerNotificationRoutes } from "./features/notifications/notification.routes";
import { registerTrackingRoutes } from "./features/tracking/tracking.routes";
import { registerWorkspaceRoutes } from "./features/workspace/workspace.routes";
import { ApiError, jsonError } from "./errors";
import { adminAuthMiddleware } from "./middleware/admin-auth.middleware";
import { corsMiddleware } from "./middleware/cors.middleware";

export type { ApiBindings, ApiVariables } from "./app.types";

export function createApp() {
  const app = new Hono<{
    Bindings: ApiBindings;
    Variables: ApiVariables;
  }>();

  app.use("*", corsMiddleware());
  app.use("/v1/admin/*", adminAuthMiddleware());

  registerHealthRoutes(app);
  registerNotificationRoutes(app);
  registerTrackingRoutes(app);
  registerWorkspaceRoutes(app);
  registerAdminRoutes(app);
  registerFileRoutes(app);

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.onError((error, c) => {
    console.error(error);
    if (error instanceof ApiError) {
      return jsonError(c, error.status, error.message, error.code, error.details);
    }

    return jsonError(c, 500, "Internal server error", "internal_error");
  });

  return app;
}
