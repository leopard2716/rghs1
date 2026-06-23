import { describe, expect, it } from "vitest";
import { paths, recoveryPath } from "./paths";

describe("workspace paths", () => {
  it("separates workspace duties into stable routes", () => {
    expect(paths.workspaceRoot("rg-team")).toBe("/rg-team");
    expect(paths.workspaceRegister("rg-team")).toBe("/rg-team/register");
    expect(paths.workspaceDashboard("rg-team")).toBe("/rg-team/dashboard");
    expect(paths.workspaceProfiles("rg-team")).toBe("/rg-team/profiles");
    expect(paths.workspaceBids("rg-team")).toBe("/rg-team/bids");
    expect(paths.workspaceBid("rg-team", "bid-1")).toBe("/rg-team/bids?bidId=bid-1");
    expect(paths.workspaceInterviews("rg-team")).toBe("/rg-team/interviews");
    expect(paths.workspaceInterview("rg-team", "interview-1")).toBe(
      "/rg-team/interviews?interviewId=interview-1"
    );
    expect(paths.workspaceInterviewForBid("rg-team", "bid-1")).toBe(
      "/rg-team/interviews?modal=new&bidId=bid-1"
    );
    expect(paths.workspaceUsers("rg-team")).toBe("/rg-team/users");
  });

  it("preserves the workspace duty route through password recovery", () => {
    expect(recoveryPath(paths.workspaceUsers("rg-team"))).toBe(
      "/recover?returnTo=%2Frg-team%2Fusers"
    );
  });
});
