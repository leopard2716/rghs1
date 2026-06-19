create extension if not exists pg_trgm with schema extensions;

alter table public.tracking_profiles
  add column if not exists name text;

alter table public.tracking_profile_requests
  add column if not exists name text;

alter table public.tracking_job_markets
  add column if not exists name text;

alter table public.bid_records
  add column if not exists job_title text,
  add column if not exists company text,
  add column if not exists job_link text,
  add column if not exists bid_at timestamptz,
  add column if not exists job_description jsonb;

alter table public.bid_records
  add column if not exists search_text text generated always as (
    lower(coalesce(company, '') || ' ' || coalesce(job_title, ''))
  ) stored;

alter table public.bid_record_profiles
  add column if not exists resume text;

alter table public.interview_records
  add column if not exists step text,
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists time_zone text,
  add column if not exists interview_link text,
  add column if not exists notes text;

alter table public.tracking_profiles
  alter column encrypted_payload drop not null;

alter table public.tracking_profile_requests
  alter column encrypted_payload drop not null;

alter table public.bid_records
  alter column encrypted_payload drop not null;

alter table public.interview_records
  alter column encrypted_payload drop not null;

alter table public.tracking_job_markets
  drop constraint if exists tracking_job_markets_payload_check;

update public.tracking_job_markets
set name = case market_key
  when 'us' then 'US Job Market'
  when 'eu' then 'EU Job Market'
  when 'philippines' then 'Philippine Job Market'
  when 'japan' then 'Japan Job Market'
  else initcap(replace(market_key, '_', ' '))
end
where system
  and name is null;

create or replace function public.seed_tracking_job_markets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tracking_job_markets (
    workspace_id,
    market_key,
    name,
    system
  )
  values
    (new.id, 'us', 'US Job Market', true),
    (new.id, 'eu', 'EU Job Market', true),
    (new.id, 'philippines', 'Philippine Job Market', true),
    (new.id, 'japan', 'Japan Job Market', true)
  on conflict (workspace_id, market_key)
  do update set name = excluded.name;

  return new;
end;
$$;

create index if not exists idx_tracking_profiles_workspace_name
on public.tracking_profiles(workspace_id, lower(name))
where deleted_at is null;

create index if not exists idx_tracking_job_markets_workspace_name
on public.tracking_job_markets(workspace_id, lower(name))
where deleted_at is null;

create index if not exists idx_bid_records_workspace_bid_at
on public.bid_records(workspace_id, bid_at desc)
where deleted_at is null;

create index if not exists idx_bid_records_workspace_company
on public.bid_records(workspace_id, lower(company), bid_at desc)
where deleted_at is null;

create index if not exists idx_bid_records_workspace_title
on public.bid_records(workspace_id, lower(job_title), bid_at desc)
where deleted_at is null;

create index if not exists idx_bid_records_search
on public.bid_records
using gin (search_text extensions.gin_trgm_ops)
where deleted_at is null;

create index if not exists idx_bid_record_profiles_workspace_profile_bid
on public.bid_record_profiles(workspace_id, profile_id, bid_id);

create index if not exists idx_interview_records_workspace_start
on public.interview_records(workspace_id, start_at desc)
where deleted_at is null;

create index if not exists idx_interview_records_workspace_profile_start
on public.interview_records(workspace_id, profile_id, start_at desc)
where deleted_at is null;

comment on table public.tracking_profiles is
  'Workspace-scoped plaintext tracking profiles. Tenant isolation is enforced relationally and by API authorization.';

comment on table public.bid_records is
  'Workspace-scoped plaintext bid records optimized for indexed filtering, sorting, and analytics.';

comment on column public.bid_record_profiles.resume is
  'Optional resume content used for this profile on this bid.';

comment on table public.interview_records is
  'Workspace-scoped plaintext interview records with UTC timestamps and an IANA timezone.';
