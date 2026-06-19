import type { JobMarket, Profile } from "@rghs1/domain";

export function profileName(profiles: Profile[], profileId: string): string {
  return profiles.find((profile) => profile.id === profileId)?.displayName ?? "Unknown profile";
}

export function marketName(markets: JobMarket[], marketId: string): string {
  return markets.find((market) => market.id === marketId)?.name ?? "Unknown market";
}
