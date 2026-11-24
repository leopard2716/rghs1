import { afterEach, expect, it, vi } from "vitest";
import { createApp } from "../../app";
import { ApplicationRulesService } from "../tracking/application-rules.service";
import { TrackingService } from "../tracking/tracking.service";

const app = createApp();
const id = "01111111-1111-4111-8111-111111111111";
const env = {
  SUPABASE_URL: "https://db.example",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service"
};
const token = (aal: string) => `Bearer h.${btoa(JSON.stringify({ aal }))}.s`;
const headers = {
  authorization: token("aal2"),
  "X-Workspace-Impersonation": id,
  "content-type": "application/json"
};
function upstream(allowed: boolean) {
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "real-admin" });
      expect(url).toBe("https://db.example/rest/v1/rpc/workspace_impersonation");
      calls.push(JSON.parse(String(init.body)));
      return Response.json(
        allowed
          ? { id, userId: "bidder", displayName: "A Bidder", expiresAt: "2026-11-24T12:30:00Z" }
          : null
      );
    })
  );
  return calls;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("binds bidder operations to the authenticated admin, selected session and workspace", async () => {
  const calls = upstream(true);
  const mark = vi
    .spyOn(ApplicationRulesService.prototype, "markApplied")
    .mockResolvedValue({ appliedAt: "now" });
  const bulk = vi
    .spyOn(TrackingService.prototype, "bulkCreateBids")
    .mockResolvedValue({ imported: 1, skippedUnknownCompanies: 0 });
  const path = "/v1/workspaces/team/tracking/bids";
  const applied = await app.request(`${path}/${id}/applied`, { method: "POST", headers }, env);
  expect(applied.status).toBe(200);
  expect(mark).toHaveBeenCalledWith("team", { id: "bidder" }, id);
  const imported = await app.request(
    `${path}/bulk`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        records: [
          {
            jobTitle: "Engineer",
            company: "Acme",
            jobLink: "https://jobs.example/open",
            bidAt: "2026-11-24T12:00:00Z",
            jobMarketId: id,
            profileIds: [id]
          }
        ]
      })
    },
    env
  );
  expect(imported.status).toBe(201);
  expect(bulk).toHaveBeenCalledWith("team", { id: "bidder" }, expect.anything());
  expect(calls.map((call) => call.p_write)).toEqual([
    `POST ${path}/${id}/applied`,
    `POST ${path}/bulk`
  ]);
  expect(
    calls.every(
      (call) => call.p_actor === "real-admin" && call.p_id === id && call.p_slug === "team"
    )
  ).toBe(true);
});

it("does not run the normal handler on denied or expired sessions", async () => {
  upstream(false);
  const mark = vi.spyOn(ApplicationRulesService.prototype, "markApplied");
  const res = await app.request(
    `/v1/workspaces/team/tracking/bids/${id}/applied`,
    { method: "POST", headers },
    env
  );
  expect(res.status).toBe(403);
  expect(mark).not.toHaveBeenCalled();
});

it("requires MFA to start and rejects tagged administrator or account routes", async () => {
  const calls = upstream(true);
  const start = `/v1/workspaces/team/admin/members/${id}/impersonate`;
  expect(
    (await app.request(start, { method: "POST", headers: { authorization: token("aal1") } }, env))
      .status
  ).toBe(403);
  expect((await app.request(start, { method: "POST", headers }, env)).status).toBe(403);
  expect((await app.request("/v1/workspaces/team/account", { headers }, env)).status).toBe(403);
  expect(calls).toEqual([]);
  const res = await app.request(
    start,
    { method: "POST", headers: { authorization: token("aal2") } },
    env
  );
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({
    id,
    displayName: "A Bidder",
    expiresAt: "2026-11-24T12:30:00Z"
  });
});
