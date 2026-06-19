import { describe, expect, it } from "vitest";
import type { Interview, JobApplication, JobMarket, Profile } from "@rghs1/domain";
import { applicationDensityByMarket, buildDashboardMetrics } from "./dashboard";

const profiles: Profile[] = [
  {
    id: "profile-1",
    workspaceId: "workspace-1",
    displayName: "Alex Rivera",
    headline: "Full-stack Engineer",
    createdByMemberId: "member-1"
  },
  {
    id: "profile-2",
    workspaceId: "workspace-1",
    displayName: "Mika Tan",
    headline: "Frontend Engineer",
    createdByMemberId: "member-1"
  }
];

const markets: JobMarket[] = [
  {
    id: "market-global",
    workspaceId: "workspace-1",
    name: "Remote Global",
    isGlobal: true,
    isActive: true
  },
  {
    id: "market-us",
    workspaceId: "workspace-1",
    name: "US",
    isGlobal: false,
    isActive: true
  }
];

const applications: JobApplication[] = [
  {
    id: "application-1",
    workspaceId: "workspace-1",
    profileId: "profile-1",
    marketId: "market-global",
    jobTitle: "Cloud Engineer",
    companyName: "Example Co",
    jobLink: "https://example.com/jobs/cloud",
    status: "applied",
    createdByMemberId: "member-1",
    createdAt: "2026-06-17T00:00:00.000Z"
  },
  {
    id: "application-2",
    workspaceId: "workspace-1",
    profileId: "profile-2",
    marketId: "market-us",
    jobTitle: "Frontend Engineer",
    companyName: "Example Labs",
    jobLink: "https://example.com/jobs/frontend",
    status: "interview_requested",
    createdByMemberId: "member-1",
    createdAt: "2026-06-17T00:00:00.000Z"
  }
];

const interviews: Interview[] = [];
describe("dashboard metrics", () => {
  it("summarizes active workspace operations", () => {
    const metrics = buildDashboardMetrics({
      applications,
      interviews,
      profiles,
      markets
    });

    expect(metrics.activeApplications).toBe(2);
    expect(metrics.profiles).toBe(2);
    expect(metrics.hasGlobalMarket).toBe(true);
  });

  it("groups application volume by market", () => {
    const density = applicationDensityByMarket(applications, markets);
    const remote = density.find((item) => item.marketId === "market-global");

    expect(remote?.count).toBe(1);
  });
});
