create table public.company_blacklist (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid,
  company text not null check (length(trim(company)) between 1 and 250),
  company_key text not null check (length(trim(company_key)) > 0),
  reason text not null default '' check (length(reason) <= 2000),
  created_by_member_id uuid,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, profile_id) references public.tracking_profiles(workspace_id, id) on delete cascade,
  foreign key (workspace_id, created_by_member_id) references public.workspace_members(workspace_id, id) on delete set null (created_by_member_id)
);
create unique index company_blacklist_global_key on public.company_blacklist(workspace_id, company_key) where profile_id is null;
create unique index company_blacklist_profile_key on public.company_blacklist(workspace_id, profile_id, company_key) where profile_id is not null;
alter table public.company_blacklist enable row level security;
revoke all on public.company_blacklist from anon, authenticated;
grant all on public.company_blacklist to service_role;
notify pgrst, 'reload schema';
