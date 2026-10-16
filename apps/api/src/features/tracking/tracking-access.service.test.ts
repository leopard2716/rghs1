import { describe, expect, it, vi } from "vitest";
import type { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { TrackingAccessService, type TrackingContext } from "./tracking-access.service";

const context = (roles: string[]) =>
  ({ workspace: { id: "workspace" }, member: { id: "actor" }, roleKeys: roles }) as TrackingContext;

describe("admin record ownership override", () => {
  for (const method of ["requireOwnedBid", "requireOwnedInterview", "requireOwnedJob"] as const) {
    it(`${method} allows workspace admins, preserves owner, and scopes reads to workspace`, async () => {
      const record = { id: "record", created_by_member_id: "bidder" };
      const select = vi.fn(async () => [record]);
      const access = new TrackingAccessService({ select } as unknown as SupabaseRestClient);
      expect(await access[method](context(["admin"]), "record", "edit")).toBe(record);
      expect(select).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
        workspace_id: "eq.workspace",
        id: "eq.record",
        deleted_at: "is.null"
      });
      await expect(access[method](context(["bidder"]), "record", "edit")).rejects.toMatchObject({
        status: 403
      });
      select.mockResolvedValueOnce([]);
      await expect(access[method](context(["admin"]), "record", "delete")).rejects.toMatchObject({
        status: 404
      });
    });
  }
  it("allows admin corrections to another member's pending payment but keeps paid records locked", async () => {
    const select = vi.fn(async () => [
      { id: "record", created_by_member_id: "bidder", status: "pending" }
    ]);
    const access = new TrackingAccessService({ select } as unknown as SupabaseRestClient);
    await expect(
      access.requireOwnedPendingPayment(context(["admin"]), "record")
    ).resolves.toMatchObject({ created_by_member_id: "bidder" });
    select.mockResolvedValueOnce([
      { id: "record", created_by_member_id: "bidder", status: "paid" }
    ]);
    await expect(
      access.requireOwnedPendingPayment(context(["admin"]), "record")
    ).rejects.toMatchObject({ status: 409 });
  });
});
