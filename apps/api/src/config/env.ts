import type { ApiBindings } from "../app.types";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) {
    return ["http://localhost:5173", "http://127.0.0.1:5173"];
  }

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function requireSupabaseConfig(env: ApiBindings): SupabaseConfig {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return { url, anonKey, serviceRoleKey };
}
