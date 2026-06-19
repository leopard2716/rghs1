import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import type { ApiBindings, ApiVariables } from "../../app.types";
import { requireSupabaseConfig } from "../../config/env";
import { ApiError, jsonError } from "../../errors";
import { SupabaseAuthAdminClient } from "../../infrastructure/supabase-auth-admin.client";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { assignWorkspaceAdminInput, createWorkspaceInput } from "./admin.schemas";
import { AdminService } from "./admin.service";

type ApiApp = Hono<{
  Bindings: ApiBindings;
  Variables: ApiVariables;
}>;

function adminService(env: ApiBindings): AdminService {
  const config = requireSupabaseConfig(env);
  return new AdminService(new SupabaseRestClient(config), new SupabaseAuthAdminClient(config));
}

function adminError(error: unknown) {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      message: error.message,
      code: error.code
    };
  }

  return {
    status: 500,
    message: error instanceof Error ? error.message : "Admin request failed.",
    code: "admin_request_failed"
  };
}

export function registerAdminRoutes(app: ApiApp): void {
  app.get("/v1/admin/me", async (c) => {
    const service = adminService(c.env);
    return c.json(await service.getCurrentAdmin(c.get("authUser")));
  });

  app.get("/v1/admin/overview", async (c) => {
    try {
      const service = adminService(c.env);
      return c.json(await service.getOverview(c.get("authUser")));
    } catch (error) {
      const normalized = adminError(error);
      return jsonError(c, normalized.status, normalized.message, normalized.code);
    }
  });

  app.post("/v1/admin/workspaces", zValidator("json", createWorkspaceInput), async (c) => {
    try {
      const service = adminService(c.env);
      const response = await service.createWorkspace(c.get("authUser"), c.req.valid("json"));
      return c.json(response, 201);
    } catch (error) {
      const normalized = adminError(error);
      return jsonError(c, normalized.status, normalized.message, normalized.code);
    }
  });

  app.post("/v1/admin/workspaces/purge-deleted", async (c) => {
    try {
      const service = adminService(c.env);
      const currentAdmin = await service.getCurrentAdmin(c.get("authUser"));
      if (!currentAdmin.platformAdmin) {
        throw new ApiError(403, "Global admin access is required.", "global_admin_required");
      }
      const purged = await service.purgeExpiredDeletedWorkspaces();
      return c.json({ purged });
    } catch (error) {
      const normalized = adminError(error);
      return jsonError(c, normalized.status, normalized.message, normalized.code);
    }
  });

  app.post(
    "/v1/admin/workspaces/:workspaceId/admins",
    zValidator("json", assignWorkspaceAdminInput),
    async (c) => {
      try {
        const service = adminService(c.env);
        const response = await service.assignWorkspaceAdmin(
          c.get("authUser"),
          c.req.param("workspaceId"),
          c.req.valid("json")
        );
        return c.json(response, 201);
      } catch (error) {
        const normalized = adminError(error);
        return jsonError(c, normalized.status, normalized.message, normalized.code);
      }
    }
  );

  app.post("/v1/admin/workspaces/:workspaceId/deletion", async (c) => {
    try {
      const service = adminService(c.env);
      return c.json(
        await service.requestWorkspaceDeletion(c.get("authUser"), c.req.param("workspaceId"))
      );
    } catch (error) {
      const normalized = adminError(error);
      return jsonError(c, normalized.status, normalized.message, normalized.code);
    }
  });

  app.post("/v1/admin/workspaces/:workspaceId/deletion/cancel", async (c) => {
    try {
      const service = adminService(c.env);
      return c.json(
        await service.cancelWorkspaceDeletion(c.get("authUser"), c.req.param("workspaceId"))
      );
    } catch (error) {
      const normalized = adminError(error);
      return jsonError(c, normalized.status, normalized.message, normalized.code);
    }
  });
}
