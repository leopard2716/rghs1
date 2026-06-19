import type { Hono } from "hono";
import { authTokenFromHeader, getAuthUser, requireAal2 } from "../../auth/supabase-auth.service";
import type { ApiBindings, ApiVariables } from "../../app.types";
import { requireSupabaseConfig } from "../../config/env";
import { ApiError, jsonError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { WorkspaceTenantGuardService } from "../workspace/workspace-tenant-guard.service";
import { ResumeUploadService } from "./resume-upload.service";

type ApiApp = Hono<{
  Bindings: ApiBindings;
  Variables: ApiVariables;
}>;

const resumeUploadService = new ResumeUploadService();

export function registerFileRoutes(app: ApiApp): void {
  app.post("/v1/files/resumes", async (c) => {
    if (!c.env.RESUME_BUCKET) {
      return jsonError(
        c,
        501,
        "R2 bucket binding RESUME_BUCKET is not configured.",
        "resume_bucket_not_configured"
      );
    }

    const config = requireSupabaseConfig(c.env);
    const token = authTokenFromHeader(c.req.header("authorization"));
    if (!token) {
      return jsonError(c, 401, "Authorization bearer token is required.", "auth_required");
    }

    try {
      requireAal2(token);
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonError(c, error.status, error.message, error.code);
      }
      throw error;
    }

    const authUser = await getAuthUser(config, token);
    const form = await c.req.formData();
    const rawFile = form.get("file");
    const workspaceId = String(form.get("workspaceId") ?? "");
    const profileId = String(form.get("profileId") ?? "");

    if (!(rawFile instanceof File) || !workspaceId || !profileId) {
      return jsonError(
        c,
        400,
        "file, workspaceId, and profileId are required.",
        "resume_upload_invalid"
      );
    }

    try {
      const guard = new WorkspaceTenantGuardService(new SupabaseRestClient(config));
      const member = await guard.requireActiveMember(workspaceId, authUser.id);
      await guard.requireProfile(workspaceId, profileId);

      const upload = await resumeUploadService.upload({
        file: rawFile,
        workspaceId,
        profileId,
        actorMemberId: member.id,
        bucket: c.env.RESUME_BUCKET
      });

      return c.json(upload, 201);
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonError(c, error.status, error.message, error.code);
      }

      throw error;
    }
  });
}
