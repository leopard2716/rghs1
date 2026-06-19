import type { Interview, JobApplication, JobMarket, Profile } from "@rghs1/domain";

export type DashboardMetricsInput = {
  applications: JobApplication[];
  interviews: Interview[];
  profiles: Profile[];
  markets: JobMarket[];
};

export function buildDashboardMetrics(input: DashboardMetricsInput) {
  const activeApplications = input.applications.filter(
    (application) => !["archived", "rejected", "withdrawn"].includes(application.status)
  );
  const interviewRequests = input.applications.filter(
    (application) =>
      application.status === "interview_requested" || application.status === "interviewing"
  );
  const globalMarkets = input.markets.filter((market) => market.isGlobal && market.isActive);

  return {
    activeApplications: activeApplications.length,
    interviewRequests: interviewRequests.length + input.interviews.length,
    profiles: input.profiles.length,
    activeMarkets: input.markets.filter((market) => market.isActive).length,
    hasGlobalMarket: globalMarkets.length > 0
  };
}

export function applicationDensityByMarket(applications: JobApplication[], markets: JobMarket[]) {
  return markets.map((market) => ({
    marketId: market.id,
    marketName: market.name,
    count: applications.filter((application) => application.marketId === market.id).length
  }));
}

export type MarketDensity = ReturnType<typeof applicationDensityByMarket>;
