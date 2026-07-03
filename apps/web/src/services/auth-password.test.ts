import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "./auth.service";

const sessionStorageKey = "rghs1.auth.session";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("password verification", () => {
  it("checks the password without storing the returned Supabase session", async () => {
    const storage = createLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co/");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          access_token: "temporary-access-token",
          refresh_token: "temporary-refresh-token",
          expires_in: 3600,
          user: { id: "user-1", email: "member@example.com" }
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await verifyPassword("member@example.com", "original-password");

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://example.supabase.co/auth/v1/token?grant_type=password"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        apikey: "anon-key",
        "content-type": "application/json"
      }
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      email: "member@example.com",
      password: "original-password"
    });
    expect(storage.getItem(sessionStorageKey)).toBeNull();
  });

  it("reports invalid credentials as an original password error", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
        return new Response(JSON.stringify({ error_code: "invalid_credentials" }), {
          status: 400
        });
      })
    );

    await expect(verifyPassword("member@example.com", "wrong-password")).rejects.toThrow(
      "Original password is incorrect."
    );
  });
});

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
