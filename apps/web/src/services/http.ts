import { errorFromResponse, UserFacingError } from "../errors";
import { ensureFreshAuthSession, type AuthSession } from "./auth.service";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

export async function authenticatedApiFetch(
  session: AuthSession,
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const current = await ensureFreshAuthSession(session);
  if (!current) {
    throw new UserFacingError("Your session expired. Sign in again.", "invalid_auth_token");
  }

  const response = await fetch(input, withBearerToken(init, current.accessToken));
  if (response.status !== 401) {
    return response;
  }

  const refreshed = await ensureFreshAuthSession(current, true);
  if (!refreshed) {
    return response;
  }

  return fetch(input, withBearerToken(init, refreshed.accessToken));
}

export async function parseJson<T>(response: Response, fallback?: string): Promise<T> {
  if (!response.ok) {
    throw await errorFromResponse(response, fallback ?? `Request failed with ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

function withBearerToken(init: RequestInit, accessToken: string): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  return {
    ...init,
    headers
  };
}
