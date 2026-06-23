export const paths = {
  landing: "/",
  recovery: "/recover",
  adminRoot: "/admin",
  adminLogin: "/admin/login",
  adminTenants: "/admin/tenants",
  adminTenantCreate: "/admin/tenants/new",
  workspaceRoot: (slug: string) => `/${encodeURIComponent(slug)}`,
  workspaceRegister: (slug: string) => `/${encodeURIComponent(slug)}/register`,
  workspaceDashboard: (slug: string) => `/${encodeURIComponent(slug)}/dashboard`,
  workspaceProfiles: (slug: string) => `/${encodeURIComponent(slug)}/profiles`,
  workspaceBids: (slug: string) => `/${encodeURIComponent(slug)}/bids`,
  workspaceBid: (slug: string, bidId: string) =>
    `/${encodeURIComponent(slug)}/bids?bidId=${encodeURIComponent(bidId)}`,
  workspaceInterviews: (slug: string) => `/${encodeURIComponent(slug)}/interviews`,
  workspaceInterview: (slug: string, interviewId: string) =>
    `/${encodeURIComponent(slug)}/interviews?interviewId=${encodeURIComponent(interviewId)}`,
  workspaceInterviewForBid: (slug: string, bidId: string) =>
    `/${encodeURIComponent(slug)}/interviews?modal=new&bidId=${encodeURIComponent(bidId)}`,
  workspaceUsers: (slug: string) => `/${encodeURIComponent(slug)}/users`
} as const;

export function recoveryPath(returnTo: string): string {
  return `${paths.recovery}?returnTo=${encodeURIComponent(returnTo)}`;
}
