import { afterEach, describe, expect, it, vi } from "vitest";
import { SupabaseRestClient } from "./supabase-rest.client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SupabaseRestClient pagination", () => {
  it("returns exact totals and sends bounded ordering options", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        Response.json([{ id: "bid-1" }], {
          status: 206,
          headers: { "content-range": "20-20/41" }
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new SupabaseRestClient({
      url: "https://example.supabase.co",
      anonKey: "anon",
      serviceRoleKey: "service"
    });

    await expect(
      client.selectPage<{ id: string }>(
        "bid_records",
        "id",
        { workspace_id: "eq.workspace-1" },
        { limit: 20, offset: 20, order: "bid_at.desc" }
      )
    ).resolves.toEqual({
      records: [{ id: "bid-1" }],
      total: 41
    });

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) {
      throw new Error("Expected Supabase REST fetch to be called.");
    }
    const [url, init] = call;
    expect(String(url)).toContain("limit=20");
    expect(String(url)).toContain("offset=20");
    expect(String(url)).toContain("order=bid_at.desc");
    expect(init?.headers).toMatchObject({
      Prefer: "count=exact",
      Range: "20-39"
    });
  });

  it("loads every page when a table exceeds the Supabase row cap", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: `bid-${index}` }));
    const secondPage = Array.from({ length: 400 }, (_, index) => ({
      id: `bid-${index + 1000}`
    }));
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get("offset") ?? "0");
      return Response.json(offset === 0 ? firstPage : secondPage, {
        status: 206,
        headers: {
          "content-range": offset === 0 ? "0-999/1400" : "1000-1399/1400"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new SupabaseRestClient({
      url: "https://example.supabase.co",
      anonKey: "anon",
      serviceRoleKey: "service"
    });

    const records = await client.selectAll<{ id: string }>(
      "bid_records",
      "id",
      { workspace_id: "eq.workspace-1" },
      { order: "id.asc" }
    );

    expect(records).toHaveLength(1400);
    expect(records.at(-1)).toEqual({ id: "bid-1399" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("offset=1000");
  });
});
