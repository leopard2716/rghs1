create table if not exists public.tracking_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  encrypted_payload jsonb not null,
  encryption_version smallint not null default 1 check (encryption_version > 0),
  created_by_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id)
);

create table if not exists public.bid_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  encrypted_payload jsonb not null,
  encryption_version smallint not null default 1 check (encryption_version > 0),
  created_by_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id)
);

create table if not exists public.bid_record_profiles (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bid_id uuid not null,
  profile_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, bid_id, profile_id),
  foreign key (workspace_id, bid_id)
    references public.bid_records(workspace_id, id) on delete cascade,
  foreign key (workspace_id, profile_id)
    references public.tracking_profiles(workspace_id, id) on delete cascade
);

create table if not exists public.interview_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bid_id uuid not null,
  profile_id uuid not null,
  encrypted_payload jsonb not null,
  encryption_version smallint not null default 1 check (encryption_version > 0),
  created_by_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, bid_id)
    references public.bid_records(workspace_id, id) on delete cascade,
  foreign key (workspace_id, profile_id)
    references public.tracking_profiles(workspace_id, id),
  foreign key (workspace_id, bid_id, profile_id)
    references public.bid_record_profiles(workspace_id, bid_id, profile_id),
  foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id)
);

create index if not exists idx_tracking_profiles_workspace_created
on public.tracking_profiles(workspace_id, created_at desc)
where deleted_at is null;

create index if not exists idx_bid_records_workspace_created
on public.bid_records(workspace_id, created_at desc)
where deleted_at is null;

create index if not exists idx_interview_records_workspace_created
on public.interview_records(workspace_id, created_at desc)
where deleted_at is null;

alter table public.tracking_profiles enable row level security;
alter table public.bid_records enable row level security;
alter table public.bid_record_profiles enable row level security;
alter table public.interview_records enable row level security;

create policy "members can read encrypted tracking profiles"
on public.tracking_profiles for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members can read encrypted bids"
on public.bid_records for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members can read encrypted bid profile assignments"
on public.bid_record_profiles for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members can read encrypted interviews"
on public.interview_records for select to authenticated
using (public.is_workspace_member(workspace_id));

comment on column public.tracking_profiles.encrypted_payload is
  'AES-256-GCM envelope. Profile display values must not be stored in plaintext.';

comment on column public.bid_records.encrypted_payload is
  'AES-256-GCM envelope containing job title, company, job link, bid time, and optional resume link.';

comment on column public.interview_records.encrypted_payload is
  'AES-256-GCM envelope containing interview step, UTC start/end, IANA timezone, and interview link.';
