import type { Context } from "hono";
import type { AuthUser } from "./auth/auth.types";

export type ApiBindings = {
  APP_NAME?: string;
  ALLOWED_ORIGINS?: string;
  APPLY_ASSISTANT_EXTRACT_MODEL?: string;
  APPLY_ASSISTANT_EXTRACT_PROVIDER?: string;
  APPLY_ASSISTANT_FIELD_MODEL?: string;
  APPLY_ASSISTANT_FIELD_PROVIDER?: string;
  APPLY_ASSISTANT_RESUME_MODEL?: string;
  APPLY_ASSISTANT_RESUME_PROVIDER?: string;
  EXTENSION_TOKEN_SECRET?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  RESUME_BUCKET?: R2Bucket;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type ApiVariables = {
  authUser: AuthUser;
};

export type ApiContext = Context<{
  Bindings: ApiBindings;
  Variables: ApiVariables;
}>;
