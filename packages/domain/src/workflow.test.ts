import { describe, expect, it } from "vitest";
import { assertApplicationStatusTransition, canTransitionApplicationStatus } from "./workflow";

describe("application workflow", () => {
  it("allows a saved application to become applied", () => {
    expect(canTransitionApplicationStatus("saved", "applied")).toBe(true);
  });

  it("does not allow archived applications to reopen implicitly", () => {
    expect(canTransitionApplicationStatus("archived", "applied")).toBe(false);
  });

  it("throws for invalid transitions", () => {
    expect(() => assertApplicationStatusTransition("saved", "offer")).toThrow(
      "Cannot transition application"
    );
  });
});
