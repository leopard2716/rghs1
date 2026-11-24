import { expect, it, vi } from "vitest";
import { loadEligibilityBatches } from "./eligibility-batches";
it("loads 100 IDs sequentially in groups of 20 and preserves successful batches after a failure", async () => {
  let active = 0;
  const load = vi.fn(async (ids: string[]) => {
    expect(++active).toBe(1);
    await Promise.resolve();
    active--;
    if (ids[0] === "20") throw new Error("503");
    return {
      rules: { cooldownDays: 45, timeZone: "America/Chicago" },
      results: ids
        .filter((id) => id !== "5")
        .map((bidId) => ({ bidId, showBadge: true, duplicated: false, matches: [] }))
    };
  });
  const publish = vi.fn();
  const result = await loadEligibilityBatches(
    Array.from({ length: 100 }, (_, i) => String(i)),
    load,
    publish,
    new AbortController().signal
  );
  expect(load).toHaveBeenCalledTimes(5);
  expect(load.mock.calls.every(([ids]) => ids.length === 20)).toBe(true);
  expect(result.failedIds).toEqual(["5", ...Array.from({ length: 20 }, (_, i) => String(20 + i))]);
  expect(result.results).toHaveLength(79);
  expect(publish).toHaveBeenCalledTimes(5);
});
it("stops obsolete batches when cancelled", async () => {
  const controller = new AbortController();
  const load = vi.fn(async () => {
    controller.abort();
    return { rules: { cooldownDays: 45, timeZone: "UTC" }, results: [] };
  });
  const publish = vi.fn();
  await expect(
    loadEligibilityBatches(Array(100).fill("id"), load, publish, controller.signal)
  ).rejects.toThrow();
  expect(load).toHaveBeenCalledTimes(1);
  expect(publish).not.toHaveBeenCalled();
});
