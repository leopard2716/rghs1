import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "./auth.service";
import { authenticatedApiFetch } from "./http";

const sessionStorageKey = "rghs1.auth.session";

describe("authenticatedApiFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: createLocalStorage()
    });
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("refreshes a nearly expired session before calling the API", async () => {
    const session = authSession(Date.now() + 1_000);
    window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/v1/token?grant_type=refresh_token")) {
        return Response.json({
          access_token: "fresh-access-token",
          refresh_token: "fresh-refresh-token",
          expires_in: 3600,
          user: session.user
        });
      }

      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-access-token");
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await authenticatedApiFetch(
      session,
      "https://api.example.com/v1/workspaces/rg-team/membership"
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes and retries once when the API rejects an expired JWT", async () => {
    const session = authSession(Date.now() + 3_600_000);
    window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
    let apiCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/v1/token?grant_type=refresh_token")) {
        return Response.json({
          access_token: "retried-access-token",
          refresh_token: "retried-refresh-token",
          expires_in: 3600,
          user: session.user
        });
      }

      apiCalls += 1;
      if (apiCalls === 1) {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token");
        return Response.json(
          {
            error: "Token has expired",
            code: "invalid_auth_token"
          },
          { status: 401 }
        );
      }

      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer retried-access-token");
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await authenticatedApiFetch(
      session,
      "https://api.example.com/v1/workspaces/rg-team/membership"
    );

    expect(response.status).toBe(200);
    expect(apiCalls).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

function authSession(expiresAt: number): AuthSession {
  return {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt,
    user: {
      id: "user-1",
      email: "member@example.com"
    },
    scope: "workspace:rg-team",
    flow: "password"
  };
}

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}
