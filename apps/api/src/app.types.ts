import type { Context } from "hono";
import type { AuthUser } from "./auth/auth.types";

export type ApiBindings = {
  APP_NAME?: string;
  ALLOWED_ORIGINS?: string;
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
