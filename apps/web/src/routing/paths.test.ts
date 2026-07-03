import { describe, expect, it } from "vitest";
import { paths, recoveryPath, workspaceRecoveryPath } from "./paths";

describe("workspace paths", () => {
  it("separates workspace duties into stable routes", () => {
    expect(paths.workspaceRoot("rg-team")).toBe("/rg-team");
    expect(paths.workspaceRecovery("rg-team")).toBe("/rg-team/recover");
    expect(paths.workspaceRegister("rg-team")).toBe("/rg-team/register");
    expect(paths.workspaceAccount("rg-team")).toBe("/rg-team/account");
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
    expect(paths.workspacePaymentLedger("rg-team")).toBe("/rg-team/payments/ledger");
    expect(paths.workspaceUsers("rg-team")).toBe("/rg-team/users");
  });

  it("preserves the workspace duty route through password recovery", () => {
    expect(workspaceRecoveryPath("rg-team", paths.workspaceUsers("rg-team"))).toBe(
      "/rg-team/recover?returnTo=%2Frg-team%2Fusers"
    );
  });

  it("preserves the admin route through global password recovery", () => {
    expect(recoveryPath(paths.adminLogin)).toBe("/recover?returnTo=%2Fadmin%2Flogin");
  });

  it("keeps the legacy global recovery helper available", () => {
    expect(recoveryPath(paths.workspaceUsers("rg-team"))).toBe(
      "/recover?returnTo=%2Frg-team%2Fusers"
    );
  });
});
