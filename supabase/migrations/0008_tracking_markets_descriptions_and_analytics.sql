create table if not exists public.tracking_job_markets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  market_key text,
  encrypted_payload jsonb,
  encryption_version smallint not null default 1 check (encryption_version > 0),
  system boolean not null default false,
  created_by_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  unique (workspace_id, market_key),
  foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id),
  constraint tracking_job_markets_payload_check check (
    (system and market_key is not null and encrypted_payload is null)
    or
    (not system and market_key is null and encrypted_payload is not null)
  )
);

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
    system
  )
  values
    (new.id, 'us', true),
    (new.id, 'eu', true),
    (new.id, 'philippines', true),
    (new.id, 'japan', true)
  on conflict (workspace_id, market_key) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_tracking_job_markets_after_workspace_insert
on public.workspaces;

create trigger seed_tracking_job_markets_after_workspace_insert
after insert on public.workspaces
for each row execute function public.seed_tracking_job_markets();

insert into public.tracking_job_markets (
  workspace_id,
  market_key,
  system
)
select
  workspaces.id,
  defaults.market_key,
  true
from public.workspaces
cross join (
  values
    ('us'),
    ('eu'),
    ('philippines'),
    ('japan')
) as defaults(market_key)
on conflict (workspace_id, market_key) do nothing;

alter table public.bid_records
add column if not exists job_market_id uuid;

update public.bid_records as bids
set job_market_id = markets.id
from public.tracking_job_markets as markets
where markets.workspace_id = bids.workspace_id
  and markets.market_key = 'us'
  and bids.job_market_id is null;

alter table public.bid_records
alter column job_market_id set not null;

alter table public.bid_records
drop constraint if exists bid_records_workspace_job_market_fkey;

alter table public.bid_records
add constraint bid_records_workspace_job_market_fkey
foreign key (workspace_id, job_market_id)
references public.tracking_job_markets(workspace_id, id);

create index if not exists idx_tracking_job_markets_workspace_created
on public.tracking_job_markets(workspace_id, created_at)
where deleted_at is null;

create index if not exists idx_bid_records_workspace_market
on public.bid_records(workspace_id, job_market_id)
where deleted_at is null;

alter table public.tracking_job_markets enable row level security;

create policy "members can read encrypted tracking job markets"
on public.tracking_job_markets for select to authenticated
using (public.is_workspace_member(workspace_id));

comment on column public.tracking_job_markets.encrypted_payload is
  'AES-256-GCM envelope. Custom job-market names must not be stored in plaintext.';

comment on column public.tracking_job_markets.market_key is
  'Stable key for built-in job markets. Custom job-market names are encrypted instead.';

comment on column public.bid_records.encrypted_payload is
  'AES-256-GCM envelope containing job title, company, job link, bid time, per-profile resumes, and optional structured rich-text job description.';

comment on column public.interview_records.encrypted_payload is
  'AES-256-GCM envelope containing interview step, UTC start/end, IANA timezone, interview link, and optional notes.';
