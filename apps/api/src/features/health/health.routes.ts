import type { Hono } from "hono";
import type { ApiBindings, ApiVariables } from "../../app.types";

type ApiApp = Hono<{
  Bindings: ApiBindings;
  Variables: ApiVariables;
}>;

export function registerHealthRoutes(app: ApiApp): void {
  app.get("/health", (c) => {
    return c.json({
      ok: true,
      service: c.env.APP_NAME ?? "RGHS1",
      runtime: "cloudflare-workers",
      tenantModel: "workspace",
      checkedAt: new Date().toISOString()
    });
  });
}
