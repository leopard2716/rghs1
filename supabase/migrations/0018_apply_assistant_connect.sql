create table if not exists public.extension_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  member_id uuid not null,
  token_hash text not null unique,
  scopes text[] not null,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, member_id)
    references public.workspace_members(workspace_id, id)
    on delete cascade
);

create table if not exists public.extension_connection_codes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  member_id uuid not null,
  code_hash text not null unique,
  scopes text[] not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, member_id)
    references public.workspace_members(workspace_id, id)
    on delete cascade
);

create table if not exists public.apply_assistant_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  member_id uuid not null,
  profile_id uuid,
  job_market_id uuid,
  page_url text not null,
  page_origin text not null,
  page_title text not null,
  page_snapshot jsonb,
  extracted_job jsonb,
  field_map jsonb,
  resume_versions jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apply_assistant_sessions_status_check check (
    status in ('draft', 'reviewing', 'autofilled', 'submitted', 'committed', 'abandoned')
  ),
  constraint apply_assistant_sessions_resume_versions_array_check check (
    jsonb_typeof(resume_versions) = 'array'
  ),
  foreign key (workspace_id, member_id)
    references public.workspace_members(workspace_id, id)
    on delete cascade,
  foreign key (workspace_id, profile_id)
    references public.tracking_profiles(workspace_id, id)
    on delete set null (profile_id),
  foreign key (workspace_id, job_market_id)
    references public.tracking_job_markets(workspace_id, id)
    on delete set null (job_market_id)
);

create index if not exists idx_extension_tokens_member_active
on public.extension_tokens(workspace_id, member_id, expires_at)
where revoked_at is null;

create index if not exists idx_extension_connection_codes_member_active
on public.extension_connection_codes(workspace_id, member_id, expires_at)
where consumed_at is null;

create index if not exists idx_apply_assistant_sessions_member_created
on public.apply_assistant_sessions(workspace_id, member_id, created_at desc);

alter table public.extension_tokens enable row level security;

alter table public.extension_connection_codes enable row level security;

alter table public.apply_assistant_sessions enable row level security;

comment on table public.extension_tokens is
  'Hashed browser-extension tokens scoped to one workspace member. Writes are service-role only.';

comment on table public.extension_connection_codes is
  'Short-lived one-time codes used to connect a browser extension to a workspace member.';

comment on table public.apply_assistant_sessions is
  'Apply-assistant sessions created by the browser extension for one workspace member.';

comment on column public.extension_tokens.token_hash is
  'SHA-256 hash of the opaque extension token plus the backend token secret.';

comment on column public.extension_connection_codes.code_hash is
  'SHA-256 hash of the one-time connection code plus the backend token secret.';

comment on column public.apply_assistant_sessions.page_snapshot is
  'Validated extension page snapshot used for deterministic mapping and later AI review.';
