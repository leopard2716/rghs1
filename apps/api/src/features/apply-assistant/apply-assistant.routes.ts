import type { Hono } from "hono";
import { z } from "zod";
import { authTokenFromHeader, getAuthUser, requireAal2 } from "../../auth/supabase-auth.service";
import type { ApiBindings, ApiContext, ApiVariables } from "../../app.types";
import { requireSupabaseConfig } from "../../config/env";
import { ApiError, apiError, jsonError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import {
  applyAssistantFieldMapInput,
  applyAssistantConnectInput,
  applyAssistantSessionInput,
  applyAssistantTokenInput,
  applySessionParams,
  commitBidInput,
  extensionTokenParams,
  generateResumeInput,
  modifyResumeInput
} from "./apply-assistant.schemas";
import {
  createApplyAssistantExtractionProvider,
  createApplyAssistantFieldMapProvider,
  createApplyAssistantResumeProvider
} from "./apply-assistant-ai";
import { ApplyAssistantService } from "./apply-assistant.service";

type ApiApp = Hono<{
  Bindings: ApiBindings;
  Variables: ApiVariables;
}>;

export function registerApplyAssistantRoutes(app: ApiApp): void {
  app.post("/v1/workspaces/:slug/apply-assistant/connect", async (c) => {
    try {
      const { service, user } = await supabaseUserContext(c);
      const input = await parseOptionalJson(c, applyAssistantConnectInput);
      return c.json(await service.createConnectionCode(c.req.param("slug"), user, input), 201);
    } catch (error) {
      return applyAssistantError(c, error);
    }
  });

  app.post("/v1/workspaces/:slug/apply-assistant/token", async (c) => {
    try {
      const service = serviceForContext(c);
      const input = await parseRequiredJson(c, applyAssistantTokenInput);
      return c.json(await service.exchangeConnectionCode(c.req.param("slug"), input), 201);
    } catch (error) {
      return applyAssistantError(c, error);
    }
  });

  app.get("/v1/apply-assistant/token-context", async (c) => {
    try {
      const token = authTokenFromHeader(c.req.header("authorization"));
      if (!token) {
        throw apiError(401, "Extension bearer token is required.", "extension_auth_required");
      }

      return c.json(await serviceForContext(c).extensionTokenContext(token));
    } catch (error) {
      return applyAssistantError(c, error);
    }
  });

  app.get("/v1/workspaces/:slug/apply-assistant/tokens", async (c) => {
    try {
      const { service, user } = await supabaseUserContext(c);
      return c.json(await service.listTokens(c.req.param("slug"), user));
    } catch (error) {
      return applyAssistantError(c, error);
    }
  });

  app.delete("/v1/workspaces/:slug/apply-assistant/token/:tokenId", async (c) => {
    try {
      const { service, user } = await supabaseUserContext(c);
      const params = extensionTokenParams.parse({ tokenId: c.req.param("tokenId") });
      return c.json(await service.revokeToken(c.req.param("slug"), params.tokenId, user));
    } catch (error) {
      return applyAssistantError(c, error);
    }
  });

  app.post("/v1/workspaces/:slug/apply-assistant/sessions", async (c) => {
    try {
      const { service, extension } = await extensionContext(c);
      const input = await parseRequiredJson(c, applyAssistantSessionInput);
      return c.json(await service.createApplySession(extension, input), 201);
    } catch (error) {
      return applyAssistantError(c, error);
    }
  });

  app.post("/v1/workspaces/:slug/apply-assistant/sessions/:sessionId/field-map", async (c) => {
    try {
      const { service, extension } = await extensionContext(c);
      const params = applySessionParams.parse({ sessionId: c.req.param("sessionId") });
      const input = await parseRequiredJson(c, applyAssistantFieldMapInput);
      return c.json(await service.requestFieldMap(extension, params.sessionId, input), 201);
    } catch (error) {
      return applyAssistantError(c, error);
    }
  });

  app.post("/v1/workspaces/:slug/apply-assistant/sessions/:sessionId/resumes", async (c) => {
    try {
      const { service, extension } = await extensionContext(c);
      const params = applySessionParams.parse({ sessionId: c.req.param("sessionId") });
      const input = await parseOptionalJson(c, generateResumeInput);
      return c.json(await service.generateResume(extension, params.sessionId, input), 201);
    } catch (error) {
      return applyAssistantError(c, error);
    }
  });

  app.post(
    "/v1/workspaces/:slug/apply-assistant/sessions/:sessionId/resumes/:resumeVersionId/modify",
    async (c) => {
      try {
        const { service, extension } = await extensionContext(c);
        const params = applySessionParams.parse({ sessionId: c.req.param("sessionId") });
        const resumeVersionId = z.string().uuid().parse(c.req.param("resumeVersionId"));
        const input = await parseRequiredJson(c, modifyResumeInput);
        return c.json(
          await service.modifyResume(extension, params.sessionId, resumeVersionId, input),
          201
        );
      } catch (error) {
        return applyAssistantError(c, error);
      }
    }
  );

  app.post("/v1/workspaces/:slug/apply-assistant/sessions/:sessionId/commit-bid", async (c) => {
    try {
      const { service, extension } = await extensionContext(c, "application:create");
      const params = applySessionParams.parse({ sessionId: c.req.param("sessionId") });
      const input = await parseOptionalJson(c, commitBidInput);
      return c.json(await service.commitBid(extension, params.sessionId, input), 201);
    } catch (error) {
      return applyAssistantError(c, error);
    }
  });
}

async function supabaseUserContext(c: ApiContext) {
  const config = requireSupabaseConfig(c.env);
  const token = authTokenFromHeader(c.req.header("authorization"));
  if (!token) {
    throw apiError(401, "Authorization bearer token is required.", "auth_required");
  }

  requireAal2(token);
  return {
    user: await getAuthUser(config, token),
    service: serviceForContext(c)
  };
}

function serviceForContext(c: ApiContext): ApplyAssistantService {
  const secret = c.env.EXTENSION_TOKEN_SECRET?.trim();
  if (!secret) {
    throw apiError(
      501,
      "Extension token secret is not configured.",
      "extension_token_secret_not_configured"
    );
  }

  return new ApplyAssistantService(new SupabaseRestClient(requireSupabaseConfig(c.env)), secret, {
    extractionProvider: createApplyAssistantExtractionProvider(c.env),
    fieldMapProvider: createApplyAssistantFieldMapProvider(c.env),
    resumeProvider: createApplyAssistantResumeProvider(c.env)
  });
}

async function extensionContext(
  c: ApiContext,
  scope: "apply_assistant:use" | "application:create" = "apply_assistant:use"
) {
  const token = authTokenFromHeader(c.req.header("authorization"));
  if (!token) {
    throw apiError(401, "Extension bearer token is required.", "extension_auth_required");
  }

  const slug = c.req.param("slug");
  if (!slug) {
    throw apiError(400, "Workspace slug is required.", "validation_failed");
  }

  const service = serviceForContext(c);
  return {
    service,
    extension: await service.requireExtensionContext(slug, token, scope)
  };
}

async function parseRequiredJson<T extends z.ZodTypeAny>(
  c: ApiContext,
  schema: T
): Promise<z.infer<T>> {
  const payload = await c.req.json().catch(() => {
    throw apiError(400, "JSON body is required.", "validation_failed");
  });
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw apiError(400, "Check the apply-assistant fields and try again.", "validation_failed", {
      formErrors: result.error.flatten()
    });
  }

  return result.data;
}

async function parseOptionalJson<T extends z.ZodTypeAny>(
  c: ApiContext,
  schema: T
): Promise<z.infer<T>> {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return schema.parse(undefined);
  }

  return parseRequiredJson(c, schema);
}

function applyAssistantError(c: ApiContext, error: unknown) {
  if (error instanceof z.ZodError) {
    return jsonError(
      c,
      400,
      "Check the apply-assistant fields and try again.",
      "validation_failed",
      {
        formErrors: error.flatten()
      }
    );
  }
  if (error instanceof ApiError) {
    return jsonError(c, error.status, error.message, error.code, error.details);
  }

  return jsonError(
    c,
    500,
    error instanceof Error ? error.message : "Apply assistant request failed.",
    "apply_assistant_request_failed"
  );
}
