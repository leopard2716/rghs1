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
  workspaceInterviews: (slug: string) => `/${encodeURIComponent(slug)}/interviews`,
  workspaceInterviewForBid: (slug: string, bidId: string) =>
    `/${encodeURIComponent(slug)}/interviews?bidId=${encodeURIComponent(bidId)}`,
  workspaceUsers: (slug: string) => `/${encodeURIComponent(slug)}/users`
} as const;

export function recoveryPath(returnTo: string): string {
  return `${paths.recovery}?returnTo=${encodeURIComponent(returnTo)}`;
}
