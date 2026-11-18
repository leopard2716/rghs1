-- Cache only duplicate computations. Blacklist and presentation state remain live.
create table if not exists public.bid_eligibility_cache (
  workspace_id uuid not null,
  bid_id uuid not null,
  duplicated boolean not null,
  matches jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null,
  refresh_after timestamptz,
  primary key (workspace_id, bid_id)
);
create index if not exists bid_eligibility_cache_refresh_idx
  on public.bid_eligibility_cache (workspace_id, refresh_after)
  where refresh_after is not null;
alter table public.bid_eligibility_cache enable row level security;
grant select, insert, update, delete on public.bid_eligibility_cache to service_role;
