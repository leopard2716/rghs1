import { apiError, upstreamErrorMessage } from "../errors";
import type { SupabaseConfig } from "../config/env";
import type { AuthUser } from "./auth.types";

type JwtPayload = {
  aal?: string;
};

export function authTokenFromHeader(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function authenticatorAssuranceLevelFromToken(accessToken: string): "aal1" | "aal2" | null {
  const [, payload] = accessToken.split(".");
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const claims = JSON.parse(atob(padded)) as JwtPayload;
    return claims.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return null;
  }
}

export function requireAal2(accessToken: string): void {
  if (authenticatorAssuranceLevelFromToken(accessToken) !== "aal2") {
    throw apiError(403, "MFA verification is required.", "mfa_required");
  }
}

export async function getAuthUser(config: SupabaseConfig, accessToken: string): Promise<AuthUser> {
  let response: Response;
  try {
    response = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${accessToken}`
      }
    });
  } catch {
    const host = safeHost(config.url);
    throw apiError(
      503,
      `Supabase Auth is unreachable at ${host}. Check the backend environment and restart the API.`,
      "auth_upstream_unreachable"
    );
  }

  if (!response.ok) {
    throw apiError(401, await upstreamErrorMessage(response), "invalid_auth_token");
  }

  const body = (await response.json()) as { id?: string; email?: string };
  if (!body.id) {
    throw apiError(401, "Supabase Auth did not return a user id.", "invalid_auth_token");
  }

  return {
    id: body.id,
    email: body.email
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "the configured SUPABASE_URL";
  }
}
