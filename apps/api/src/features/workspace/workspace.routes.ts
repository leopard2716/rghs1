import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { authTokenFromHeader, getAuthUser, requireAal2 } from "../../auth/supabase-auth.service";
import type { ApiBindings, ApiContext, ApiVariables } from "../../app.types";
import { requireSupabaseConfig } from "../../config/env";
import { ApiError, jsonError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import {
  workspaceMemberRolesInput,
  workspaceMemberStatusInput,
  workspaceRegistrationInput
} from "./workspace.schemas";
import { WorkspaceAccessService } from "./workspace-access.service";
import { WorkspaceService } from "./workspace.service";

type ApiApp = Hono<{
  Bindings: ApiBindings;
  Variables: ApiVariables;
}>;

const workspaceService = new WorkspaceService();

function workspaceAccessService(env: ApiBindings): WorkspaceAccessService {
  const config = requireSupabaseConfig(env);
  return new WorkspaceAccessService(new SupabaseRestClient(config));
}

async function requireAuthUser(c: ApiContext, options: { requireMfa?: boolean } = {}) {
  const config = requireSupabaseConfig(c.env);
  const token = authTokenFromHeader(c.req.header("authorization"));
  if (!token) {
    throw new ApiError(401, "Authorization bearer token is required.", "auth_required");
  }

  if (options.requireMfa) {
    requireAal2(token);
  }

  return getAuthUser(config, token);
}

function routeError(c: ApiContext, error: unknown) {
  if (error instanceof ApiError) {
    if (
      error.message.includes("workspace_members_status_check") ||
      (error.message.includes("workspace_members") &&
        error.message.includes("violates check constraint"))
    ) {
      return jsonError(
        c,
        503,
        "Workspace registration requires Supabase migration 0005_repair_workspace_member_status_constraint.sql.",
        "workspace_member_status_migration_required"
      );
    }

    return jsonError(c, error.status, error.message, error.code);
  }

  return jsonError(
    c,
    500,
    error instanceof Error ? error.message : "Workspace request failed.",
    "workspace_request_failed"
  );
}

export function registerWorkspaceRoutes(app: ApiApp): void {
  app.get("/v1/workspaces/by-slug/:slug/public", async (c) => {
    try {
      const service = workspaceAccessService(c.env);
      return c.json(await service.getPublicWorkspace(c.req.param("slug")));
    } catch (error) {
      return routeError(c, error);
    }
  });

  app.post(
    "/v1/workspaces/:slug/register",
    zValidator("json", workspaceRegistrationInput),
    async (c) => {
      try {
        const service = workspaceAccessService(c.env);
        const authenticatedUser = await requireAuthUser(c);
        return c.json(
          await service.registerWorkspaceMember(
            c.req.param("slug"),
            c.req.valid("json"),
            authenticatedUser
          ),
          201
        );
      } catch (error) {
        return routeError(c, error);
      }
    }
  );

  app.get("/v1/workspaces/:slug/membership", async (c) => {
    try {
      const user = await requireAuthUser(c);
      const service = workspaceAccessService(c.env);
      return c.json(await service.getWorkspaceMembership(c.req.param("slug"), user));
    } catch (error) {
      return routeError(c, error);
    }
  });

  app.get("/v1/workspaces/:slug/session", async (c) => {
    try {
      const user = await requireAuthUser(c, { requireMfa: true });
      const service = workspaceAccessService(c.env);
      return c.json(await service.getWorkspaceSession(c.req.param("slug"), user));
    } catch (error) {
      return routeError(c, error);
    }
  });

  app.post("/v1/workspaces/:slug/password-change-complete", async (c) => {
    try {
      const user = await requireAuthUser(c, { requireMfa: true });
      const service = workspaceAccessService(c.env);
      return c.json(await service.completePasswordChange(c.req.param("slug"), user));
    } catch (error) {
      return routeError(c, error);
    }
  });

  app.get("/v1/workspaces/:slug/admin/members", async (c) => {
    try {
      const user = await requireAuthUser(c, { requireMfa: true });
      const service = workspaceAccessService(c.env);
      return c.json(await service.getWorkspaceMembers(c.req.param("slug"), user));
    } catch (error) {
      return routeError(c, error);
    }
  });

  app.patch(
    "/v1/workspaces/:slug/admin/members/:memberId/status",
    zValidator("json", workspaceMemberStatusInput),
    async (c) => {
      try {
        const user = await requireAuthUser(c, { requireMfa: true });
        const service = workspaceAccessService(c.env);
        return c.json(
          await service.updateWorkspaceMemberStatus(
            c.req.param("slug"),
            c.req.param("memberId"),
            user,
            c.req.valid("json")
          )
        );
      } catch (error) {
        return routeError(c, error);
      }
    }
  );

  app.put(
    "/v1/workspaces/:slug/admin/members/:memberId/roles",
    zValidator("json", workspaceMemberRolesInput),
    async (c) => {
      try {
        const user = await requireAuthUser(c, { requireMfa: true });
        const service = workspaceAccessService(c.env);
        return c.json(
          await service.updateWorkspaceMemberRoles(
            c.req.param("slug"),
            c.req.param("memberId"),
            user,
            c.req.valid("json")
          )
        );
      } catch (error) {
        return routeError(c, error);
      }
    }
  );

  app.delete("/v1/workspaces/:slug/admin/members/:memberId", async (c) => {
    try {
      const user = await requireAuthUser(c, { requireMfa: true });
      const service = workspaceAccessService(c.env);
      return c.json(
        await service.deleteWorkspaceMember(c.req.param("slug"), c.req.param("memberId"), user)
      );
    } catch (error) {
      return routeError(c, error);
    }
  });

  app.get("/v1/bootstrap", (c) => {
    return c.json(workspaceService.removedBootstrapResponse(), 410);
  });

  app.post("/v1/applications", (c) => {
    return c.json(workspaceService.removedBootstrapResponse(), 410);
  });

  app.post("/v1/interviews", (c) => {
    return c.json(workspaceService.removedBootstrapResponse(), 410);
  });
}
