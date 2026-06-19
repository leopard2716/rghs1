import type { MarketDensity } from "../workspace.metrics";

export function MarketList({ marketDensity }: { marketDensity: MarketDensity }) {
  return (
    <div className="market-list">
      {marketDensity.map((market) => (
        <div className="market-row" key={market.marketId}>
          <span>{market.marketName}</span>
          <strong>{market.count}</strong>
        </div>
      ))}
    </div>
  );
}
