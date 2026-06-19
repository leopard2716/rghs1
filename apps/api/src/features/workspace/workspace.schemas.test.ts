import { describe, expect, it } from "vitest";
import {
  workspaceMemberRolesInput,
  workspaceMemberStatusInput,
  workspaceRegistrationInput
} from "./workspace.schemas";

describe("workspace member schemas", () => {
  it("accepts a regular workspace registration", () => {
    const result = workspaceRegistrationInput.safeParse({
      email: "member@example.com",
      displayName: "Workspace Member"
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid registration email", () => {
    const result = workspaceRegistrationInput.safeParse({
      email: "not-an-email",
      displayName: "Workspace Member"
    });

    expect(result.success).toBe(false);
  });

  it("only accepts statuses controlled by workspace admins", () => {
    expect(workspaceMemberStatusInput.safeParse({ status: "active" }).success).toBe(true);
    expect(workspaceMemberStatusInput.safeParse({ status: "rejected" }).success).toBe(true);
    expect(workspaceMemberStatusInput.safeParse({ status: "disabled" }).success).toBe(true);
    expect(workspaceMemberStatusInput.safeParse({ status: "pending" }).success).toBe(false);
  });

  it("accepts only bidder and interviewer role assignments", () => {
    expect(
      workspaceMemberRolesInput.safeParse({
        roleKeys: ["bidder", "interviewer"]
      }).success
    ).toBe(true);
    expect(
      workspaceMemberRolesInput.safeParse({
        roleKeys: ["viewer"]
      }).success
    ).toBe(false);
  });
});
