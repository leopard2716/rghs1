import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  TrackingJobMarket,
  TrackingListQuery,
  TrackingProfile
} from "../../../services/tracking.service";

export function TrackingListControls({
  query,
  profiles,
  markets,
  disabled,
  onChange
}: {
  query: TrackingListQuery;
  profiles: TrackingProfile[];
  markets: TrackingJobMarket[];
  disabled: boolean;
  onChange: (change: Partial<TrackingListQuery>) => void;
}) {
  const [search, setSearch] = useState(query.search ?? "");

  useEffect(() => {
    setSearch(query.search ?? "");
  }, [query.search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search !== (query.search ?? "")) {
        onChange({ search, page: 1 });
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [onChange, query.search, search]);

  return (
    <div className="tracking-list-controls">
      <label className="tracking-search">
        <span>Search jobs</span>
        <div className="search-input">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={search}
            placeholder="Company or job title"
            disabled={disabled}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </label>
      <label>
        Profile
        <select
          value={query.profileId ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ profileId: event.target.value || undefined, page: 1 })}
        >
          <option value="">All profiles</option>
          {profiles.map((profile) => (
            <option value={profile.id} key={profile.id}>
              {profile.name}
              {profile.deletedAt ? " (deleted)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Job market
        <select
          value={query.jobMarketId ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ jobMarketId: event.target.value || undefined, page: 1 })}
        >
          <option value="">All markets</option>
          {markets.map((market) => (
            <option value={market.id} key={market.id}>
              {market.name}
              {market.deletedAt ? " (deleted)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sort
        <select
          value={query.sortBy ?? "datetime"}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              sortBy: event.target.value as TrackingListQuery["sortBy"],
              page: 1
            })
          }
        >
          <option value="datetime">Date and time</option>
          <option value="company">Company name</option>
          <option value="jobTitle">Job title</option>
        </select>
      </label>
      <label>
        Direction
        <select
          value={query.sortDirection ?? "desc"}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              sortDirection: event.target.value as TrackingListQuery["sortDirection"],
              page: 1
            })
          }
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </label>
    </div>
  );
}
