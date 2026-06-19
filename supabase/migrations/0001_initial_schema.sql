create extension if not exists pgcrypto;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, user_id)
);

create table if not exists public.workspace_roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  key text not null,
  system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, key)
);

create table if not exists public.workspace_role_permissions (
  role_id uuid not null references public.workspace_roles(id) on delete cascade,
  permission text not null,
  primary key (role_id, permission)
);

create table if not exists public.workspace_member_roles (
  member_id uuid not null references public.workspace_members(id) on delete cascade,
  role_id uuid not null references public.workspace_roles(id) on delete cascade,
  primary key (member_id, role_id)
);

create table if not exists public.job_markets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  country_code text,
  region text,
  timezone text,
  is_global boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  display_name text not null,
  headline text not null default '',
  default_market_id uuid references public.job_markets(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid references auth.users(id),
  profile_id uuid references public.profiles(id) on delete set null,
  storage_key text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes >= 0),
  visibility text not null default 'private' check (visibility in ('private', 'workspace')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  version integer not null default 1 check (version > 0),
  source_type text not null check (source_type in ('link', 'file')),
  source_url text,
  file_id uuid references public.files(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (
    (source_type = 'link' and source_url is not null and file_id is null)
    or
    (source_type = 'file' and file_id is not null)
  )
);

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  market_id uuid not null references public.job_markets(id),
  resume_id uuid references public.resumes(id) on delete set null,
  job_title text not null,
  company_name text not null,
  job_link text not null,
  status text not null default 'saved' check (
    status in ('saved', 'applied', 'interview_requested', 'interviewing', 'offer', 'rejected', 'withdrawn', 'archived')
  ),
  applied_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  application_id uuid not null references public.job_applications(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  interview_type text not null check (interview_type in ('initial', 'hr', 'technical', 'final', 'client', 'custom')),
  status text not null default 'requested' check (status in ('requested', 'scheduled', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  due_at timestamptz,
  read boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  ip_hash text,
  country_code text,
  user_agent text,
  success boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_members_user_id on public.workspace_members(user_id);
create index if not exists idx_workspace_members_workspace_id on public.workspace_members(workspace_id);
create index if not exists idx_workspace_roles_workspace_id on public.workspace_roles(workspace_id);
create index if not exists idx_job_markets_workspace_id on public.job_markets(workspace_id);
create index if not exists idx_profiles_workspace_id on public.profiles(workspace_id);
create index if not exists idx_files_workspace_id on public.files(workspace_id);
create index if not exists idx_resumes_workspace_id on public.resumes(workspace_id);
create index if not exists idx_job_applications_workspace_id on public.job_applications(workspace_id);
create index if not exists idx_job_applications_profile_id on public.job_applications(profile_id);
create index if not exists idx_interviews_workspace_id on public.interviews(workspace_id);
create index if not exists idx_alerts_workspace_id on public.alerts(workspace_id);
create index if not exists idx_audit_logs_workspace_id on public.audit_logs(workspace_id);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = (select auth.uid())
      and status = 'active'
      and deleted_at is null
  );
$$;

alter table public.platform_admins enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_roles enable row level security;
alter table public.workspace_role_permissions enable row level security;
alter table public.workspace_member_roles enable row level security;
alter table public.job_markets enable row level security;
alter table public.profiles enable row level security;
alter table public.files enable row level security;
alter table public.resumes enable row level security;
alter table public.job_applications enable row level security;
alter table public.interviews enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_logs enable row level security;
alter table public.login_events enable row level security;

create policy "platform admins can read platform admins"
on public.platform_admins for select to authenticated
using (public.is_platform_admin());

create policy "members can read their workspaces"
on public.workspaces for select to authenticated
using (public.is_platform_admin() or public.is_workspace_member(id));

create policy "authenticated users can create workspaces"
on public.workspaces for insert to authenticated
with check (created_by = (select auth.uid()));

create policy "members can read workspace members"
on public.workspace_members for select to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can read workspace roles"
on public.workspace_roles for select to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can read role permissions"
on public.workspace_role_permissions for select to authenticated
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.workspace_roles wr
    where wr.id = role_id
      and public.is_workspace_member(wr.workspace_id)
  )
);

create policy "members can read member roles"
on public.workspace_member_roles for select to authenticated
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.workspace_members wm
    where wm.id = member_id
      and public.is_workspace_member(wm.workspace_id)
  )
);

create policy "members can read job markets"
on public.job_markets for select to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can write job markets"
on public.job_markets for all to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id))
with check (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can read profiles"
on public.profiles for select to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can write profiles"
on public.profiles for all to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id))
with check (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can read files"
on public.files for select to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can write files"
on public.files for all to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id))
with check (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can read resumes"
on public.resumes for select to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can write resumes"
on public.resumes for all to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id))
with check (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can read job applications"
on public.job_applications for select to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can write job applications"
on public.job_applications for all to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id))
with check (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can read interviews"
on public.interviews for select to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can write interviews"
on public.interviews for all to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id))
with check (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can read alerts"
on public.alerts for select to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can write alerts"
on public.alerts for all to authenticated
using (public.is_platform_admin() or public.is_workspace_member(workspace_id))
with check (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "members can read audit logs"
on public.audit_logs for select to authenticated
using (
  public.is_platform_admin()
  or (workspace_id is not null and public.is_workspace_member(workspace_id))
);

create policy "users can read their login events"
on public.login_events for select to authenticated
using (public.is_platform_admin() or user_id = (select auth.uid()));

