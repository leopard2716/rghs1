import { describe, expect, it } from "vitest";
import { can } from "./permissions";
import type { WorkspaceMember, WorkspaceRole } from "./types";

const sharedAuthUserId = "auth-user-1";

const bidderRole: WorkspaceRole = {
  id: "role-bidder",
  workspaceId: "workspace-a",
  name: "Bidder",
  key: "bidder",
  permissions: ["application:create"],
  system: true
};

const interviewerRole: WorkspaceRole = {
  id: "role-interviewer",
  workspaceId: "workspace-b",
  name: "Interviewer",
  key: "interviewer",
  permissions: ["interview:create"],
  system: true
};

describe("tenant-local user identity", () => {
  it("keeps roles independent for memberships sharing one Auth identity", () => {
    const workspaceABidder: WorkspaceMember = {
      id: "member-a",
      workspaceId: "workspace-a",
      authUserId: sharedAuthUserId,
      displayName: "Bidder Identity",
      email: "person@example.com",
      roleKeys: ["bidder"],
      status: "active"
    };
    const workspaceBInterviewer: WorkspaceMember = {
      id: "member-b",
      workspaceId: "workspace-b",
      authUserId: sharedAuthUserId,
      displayName: "Interviewer Identity",
      email: "person@example.com",
      roleKeys: ["interviewer"],
      status: "active"
    };

    expect(can(workspaceABidder, [bidderRole], "application:create")).toBe(true);
    expect(can(workspaceABidder, [bidderRole], "interview:create")).toBe(false);
    expect(can(workspaceBInterviewer, [interviewerRole], "interview:create")).toBe(true);
    expect(can(workspaceBInterviewer, [interviewerRole], "application:create")).toBe(false);
    expect(
      can(workspaceABidder, [{ ...bidderRole, workspaceId: "workspace-b" }], "application:create")
    ).toBe(false);
  });
});
