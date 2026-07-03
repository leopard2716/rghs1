import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeAuthSessionFromUrl, requestPasswordRecovery } from "./auth.service";

const passwordRecoveryRedirectStorageKey = "rghs1.auth.passwordRecoveryRedirect";
const sessionStorageKey = "rghs1.auth.session";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("password recovery URL handling", () => {
  it("remembers the requested recovery route after Supabase accepts the email request", async () => {
    const storage = createLocalStorage();
    stubWindow({
      pathname: "/rg-team/recover",
      search: "?returnTo=%2Frg-team",
      hash: "",
      storage
    });
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    const fetchMock = vi.fn(async (_input: string | URL | Request) => {
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestPasswordRecovery(
      "member@example.com",
      "http://localhost:3000/rg-team/recover?returnTo=%2Frg-team"
    );

    const stored = JSON.parse(
      storage.getItem(passwordRecoveryRedirectStorageKey) ?? "{}"
    ) as Record<string, unknown>;
    expect(stored.path).toBe("/rg-team/recover?returnTo=%2Frg-team");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "redirect_to=http%3A%2F%2Flocalhost%3A3000%2Frg-team%2Frecover%3FreturnTo%3D%252Frg-team"
    );
  });

  it("uses the remembered tenant recovery route when Supabase falls back to the root hash", () => {
    const storage = createLocalStorage();
    storage.setItem(
      passwordRecoveryRedirectStorageKey,
      JSON.stringify({
        path: "/rg-team/recover?returnTo=%2Frg-team",
        createdAt: Date.now()
      })
    );
    const replaceState = stubWindow({
      pathname: "/",
      search: "",
      hash: recoveryHash(),
      storage
    });

    const session = consumeAuthSessionFromUrl();

    expect(session?.scope).toBe("workspace:rg-team");
    expect(session?.flow).toBe("recovery");
    expect(storage.getItem(passwordRecoveryRedirectStorageKey)).toBeNull();
    expect(JSON.parse(storage.getItem(sessionStorageKey) ?? "{}")).toMatchObject({
      scope: "workspace:rg-team",
      flow: "recovery"
    });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/rg-team/recover?returnTo=%2Frg-team");
  });

  it("moves an unscoped root recovery hash to the recovery page with a clear error", () => {
    const storage = createLocalStorage();
    const replaceState = stubWindow({
      pathname: "/",
      search: "",
      hash: recoveryHash(),
      storage
    });

    expect(() => consumeAuthSessionFromUrl()).toThrow(
      "The authentication link does not identify an RGHS1 portal."
    );
    expect(storage.getItem(sessionStorageKey)).toBeNull();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/recover");
  });
});

function recoveryHash(): string {
  return new URLSearchParams({
    access_token: accessToken({ sub: "user-1", email: "member@example.com" }),
    refresh_token: "refresh-token",
    expires_in: "3600",
    token_type: "bearer",
    type: "recovery"
  }).toString();
}

function accessToken(payload: Record<string, unknown>): string {
  return [
    base64UrlEncode({ alg: "ES256", typ: "JWT" }),
    base64UrlEncode(payload),
    "signature"
  ].join(".");
}

function base64UrlEncode(value: Record<string, unknown>): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stubWindow({
  pathname,
  search,
  hash,
  storage
}: {
  pathname: string;
  search: string;
  hash: string;
  storage: Storage;
}) {
  const location = {
    origin: "http://localhost:3000",
    pathname,
    search,
    hash: hash ? `#${hash.replace(/^#/, "")}` : ""
  };
  const replaceState = vi.fn((_state: unknown, _title: string, nextUrl: string) => {
    const url = new URL(nextUrl, location.origin);
    location.pathname = url.pathname;
    location.search = url.search;
    location.hash = url.hash;
  });

  vi.stubGlobal("window", {
    location,
    localStorage: storage,
    history: {
      state: null,
      replaceState
    }
  });

  return replaceState;
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
