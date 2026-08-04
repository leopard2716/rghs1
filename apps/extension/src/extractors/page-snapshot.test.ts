import { describe, expect, it } from "vitest";
import { isAlwaysExtractableInputType } from "./page-snapshot";

describe("page snapshot file inputs", () => {
  it("always extracts native file inputs used behind upload widgets", () => {
    expect(isAlwaysExtractableInputType("file")).toBe(true);
    expect(isAlwaysExtractableInputType("FILE")).toBe(true);
    expect(isAlwaysExtractableInputType("hidden")).toBe(false);
  });
});
