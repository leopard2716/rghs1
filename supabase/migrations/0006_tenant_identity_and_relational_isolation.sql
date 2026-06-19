do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_members'
      and column_name = 'user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_members'
      and column_name = 'auth_user_id'
  ) then
    alter table public.workspace_members rename column user_id to auth_user_id;
  end if;
end
$$;

comment on column public.workspace_members.id is
  'Tenant-local user identity. Roles, status, display name, and tenant activity attach to this workspace membership.';

comment on column public.workspace_members.auth_user_id is
  'Global Supabase Auth identity used only to authenticate and locate this tenant-local membership.';

alter table public.workspace_role_permissions
  add column if not exists workspace_id uuid;

update public.workspace_role_permissions wrp
set workspace_id = wr.workspace_id
from public.workspace_roles wr
where wr.id = wrp.role_id
  and wrp.workspace_id is null;

alter table public.workspace_role_permissions
  alter column workspace_id set not null;

alter table public.workspace_member_roles
  add column if not exists workspace_id uuid;

update public.workspace_member_roles wmr
set workspace_id = wm.workspace_id
from public.workspace_members wm
where wm.id = wmr.member_id
  and wmr.workspace_id is null;

alter table public.workspace_member_roles
  alter column workspace_id set not null;

alter table public.workspace_member_onboarding
  add column if not exists workspace_id uuid;

update public.workspace_member_onboarding wmo
set workspace_id = wm.workspace_id
from public.workspace_members wm
where wm.id = wmo.member_id
  and wmo.workspace_id is null;

alter table public.workspace_member_onboarding
  alter column workspace_id set not null;

alter table public.audit_logs
  add column if not exists actor_member_id uuid;

alter table public.job_markets
  add column if not exists created_by_member_id uuid;

alter table public.profiles
  add column if not exists created_by_member_id uuid;

alter table public.files
  add column if not exists owner_member_id uuid;

alter table public.resumes
  add column if not exists created_by_member_id uuid;

alter table public.job_applications
  add column if not exists created_by_member_id uuid;

alter table public.interviews
  add column if not exists created_by_member_id uuid;

alter table public.alerts
  add column if not exists created_by_member_id uuid;

update public.audit_logs al
set actor_member_id = wm.id
from public.workspace_members wm
where al.workspace_id = wm.workspace_id
  and al.actor_id = wm.auth_user_id
  and al.actor_member_id is null;

update public.job_markets jm
set created_by_member_id = wm.id
from public.workspace_members wm
where jm.workspace_id = wm.workspace_id
  and jm.created_by = wm.auth_user_id
  and jm.created_by_member_id is null;

update public.profiles p
set created_by_member_id = wm.id
from public.workspace_members wm
where p.workspace_id = wm.workspace_id
  and p.created_by = wm.auth_user_id
  and p.created_by_member_id is null;

update public.files f
set owner_member_id = wm.id
from public.workspace_members wm
where f.workspace_id = wm.workspace_id
  and f.owner_id = wm.auth_user_id
  and f.owner_member_id is null;

update public.resumes r
set created_by_member_id = wm.id
from public.workspace_members wm
where r.workspace_id = wm.workspace_id
  and r.created_by = wm.auth_user_id
  and r.created_by_member_id is null;

update public.job_applications ja
set created_by_member_id = wm.id
from public.workspace_members wm
where ja.workspace_id = wm.workspace_id
  and ja.created_by = wm.auth_user_id
  and ja.created_by_member_id is null;

update public.interviews i
set created_by_member_id = wm.id
from public.workspace_members wm
where i.workspace_id = wm.workspace_id
  and i.created_by = wm.auth_user_id
  and i.created_by_member_id is null;

update public.alerts a
set created_by_member_id = wm.id
from public.workspace_members wm
where a.workspace_id = wm.workspace_id
  and a.created_by = wm.auth_user_id
  and a.created_by_member_id is null;

do $$
begin
  if exists (
    select 1
    from public.workspace_member_roles wmr
    join public.workspace_members wm on wm.id = wmr.member_id
    join public.workspace_roles wr on wr.id = wmr.role_id
    where wm.workspace_id <> wr.workspace_id
  ) then
    raise exception 'Cross-workspace member role references exist';
  end if;

  if exists (
    select 1
    from public.profiles p
    join public.job_markets jm on jm.id = p.default_market_id
    where p.workspace_id <> jm.workspace_id
  ) then
    raise exception 'Cross-workspace profile market references exist';
  end if;

  if exists (
    select 1
    from public.files f
    join public.profiles p on p.id = f.profile_id
    where f.workspace_id <> p.workspace_id
  ) then
    raise exception 'Cross-workspace file profile references exist';
  end if;

  if exists (
    select 1
    from public.resumes r
    join public.profiles p on p.id = r.profile_id
    where r.workspace_id <> p.workspace_id
  ) or exists (
    select 1
    from public.resumes r
    join public.files f on f.id = r.file_id
    where r.workspace_id <> f.workspace_id
  ) then
    raise exception 'Cross-workspace resume references exist';
  end if;

  if exists (
    select 1
    from public.job_applications ja
    join public.profiles p on p.id = ja.profile_id
    where ja.workspace_id <> p.workspace_id
  ) or exists (
    select 1
    from public.job_applications ja
    join public.job_markets jm on jm.id = ja.market_id
    where ja.workspace_id <> jm.workspace_id
  ) or exists (
    select 1
    from public.job_applications ja
    join public.resumes r on r.id = ja.resume_id
    where ja.workspace_id <> r.workspace_id
  ) then
    raise exception 'Cross-workspace application references exist';
  end if;

  if exists (
    select 1
    from public.interviews i
    join public.job_applications ja on ja.id = i.application_id
    where i.workspace_id <> ja.workspace_id
  ) or exists (
    select 1
    from public.interviews i
    join public.profiles p on p.id = i.profile_id
    where i.workspace_id <> p.workspace_id
  ) then
    raise exception 'Cross-workspace interview references exist';
  end if;
end
$$;

alter table public.workspace_members
  drop constraint if exists workspace_members_workspace_id_id_key,
  add constraint workspace_members_workspace_id_id_key unique (workspace_id, id);

alter table public.workspace_roles
  drop constraint if exists workspace_roles_workspace_id_id_key,
  add constraint workspace_roles_workspace_id_id_key unique (workspace_id, id);

alter table public.job_markets
  drop constraint if exists job_markets_workspace_id_id_key,
  add constraint job_markets_workspace_id_id_key unique (workspace_id, id);

alter table public.profiles
  drop constraint if exists profiles_workspace_id_id_key,
  add constraint profiles_workspace_id_id_key unique (workspace_id, id);

alter table public.files
  drop constraint if exists files_workspace_id_id_key,
  add constraint files_workspace_id_id_key unique (workspace_id, id);

alter table public.resumes
  drop constraint if exists resumes_workspace_id_id_key,
  add constraint resumes_workspace_id_id_key unique (workspace_id, id);

alter table public.job_applications
  drop constraint if exists job_applications_workspace_id_id_key,
  add constraint job_applications_workspace_id_id_key unique (workspace_id, id);

alter table public.workspace_role_permissions
  drop constraint if exists workspace_role_permissions_workspace_id_fkey,
  drop constraint if exists workspace_role_permissions_role_tenant_fkey,
  add constraint workspace_role_permissions_workspace_id_fkey
    foreign key (workspace_id) references public.workspaces(id) on delete cascade,
  add constraint workspace_role_permissions_role_tenant_fkey
    foreign key (workspace_id, role_id)
    references public.workspace_roles(workspace_id, id) on delete cascade;

alter table public.workspace_member_roles
  drop constraint if exists workspace_member_roles_workspace_id_fkey,
  drop constraint if exists workspace_member_roles_member_tenant_fkey,
  drop constraint if exists workspace_member_roles_role_tenant_fkey,
  add constraint workspace_member_roles_workspace_id_fkey
    foreign key (workspace_id) references public.workspaces(id) on delete cascade,
  add constraint workspace_member_roles_member_tenant_fkey
    foreign key (workspace_id, member_id)
    references public.workspace_members(workspace_id, id) on delete cascade,
  add constraint workspace_member_roles_role_tenant_fkey
    foreign key (workspace_id, role_id)
    references public.workspace_roles(workspace_id, id) on delete cascade;

alter table public.workspace_member_onboarding
  drop constraint if exists workspace_member_onboarding_workspace_id_fkey,
  drop constraint if exists workspace_member_onboarding_member_tenant_fkey,
  add constraint workspace_member_onboarding_workspace_id_fkey
    foreign key (workspace_id) references public.workspaces(id) on delete cascade,
  add constraint workspace_member_onboarding_member_tenant_fkey
    foreign key (workspace_id, member_id)
    references public.workspace_members(workspace_id, id) on delete cascade;

alter table public.audit_logs
  drop constraint if exists audit_logs_actor_member_tenant_fkey,
  add constraint audit_logs_actor_member_tenant_fkey
    foreign key (workspace_id, actor_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (actor_member_id);

alter table public.job_markets
  drop constraint if exists job_markets_creator_member_tenant_fkey,
  add constraint job_markets_creator_member_tenant_fkey
    foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id);

alter table public.profiles
  drop constraint if exists profiles_creator_member_tenant_fkey,
  add constraint profiles_creator_member_tenant_fkey
    foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id);

alter table public.files
  drop constraint if exists files_owner_member_tenant_fkey,
  add constraint files_owner_member_tenant_fkey
    foreign key (workspace_id, owner_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (owner_member_id);

alter table public.resumes
  drop constraint if exists resumes_creator_member_tenant_fkey,
  add constraint resumes_creator_member_tenant_fkey
    foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id);

alter table public.job_applications
  drop constraint if exists job_applications_creator_member_tenant_fkey,
  add constraint job_applications_creator_member_tenant_fkey
    foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id);

alter table public.interviews
  drop constraint if exists interviews_creator_member_tenant_fkey,
  add constraint interviews_creator_member_tenant_fkey
    foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id);

alter table public.alerts
  drop constraint if exists alerts_creator_member_tenant_fkey,
  add constraint alerts_creator_member_tenant_fkey
    foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id);

alter table public.profiles
  drop constraint if exists profiles_default_market_id_fkey,
  drop constraint if exists profiles_default_market_tenant_fkey,
  add constraint profiles_default_market_tenant_fkey
    foreign key (workspace_id, default_market_id)
    references public.job_markets(workspace_id, id)
    on delete set null (default_market_id);

alter table public.files
  drop constraint if exists files_profile_id_fkey,
  drop constraint if exists files_profile_tenant_fkey,
  add constraint files_profile_tenant_fkey
    foreign key (workspace_id, profile_id)
    references public.profiles(workspace_id, id)
    on delete set null (profile_id);

alter table public.resumes
  drop constraint if exists resumes_profile_id_fkey,
  drop constraint if exists resumes_file_id_fkey,
  drop constraint if exists resumes_profile_tenant_fkey,
  drop constraint if exists resumes_file_tenant_fkey,
  add constraint resumes_profile_tenant_fkey
    foreign key (workspace_id, profile_id)
    references public.profiles(workspace_id, id) on delete cascade,
  add constraint resumes_file_tenant_fkey
    foreign key (workspace_id, file_id)
    references public.files(workspace_id, id)
    on delete set null (file_id);

alter table public.job_applications
  drop constraint if exists job_applications_profile_id_fkey,
  drop constraint if exists job_applications_market_id_fkey,
  drop constraint if exists job_applications_resume_id_fkey,
  drop constraint if exists job_applications_profile_tenant_fkey,
  drop constraint if exists job_applications_market_tenant_fkey,
  drop constraint if exists job_applications_resume_tenant_fkey,
  add constraint job_applications_profile_tenant_fkey
    foreign key (workspace_id, profile_id)
    references public.profiles(workspace_id, id) on delete cascade,
  add constraint job_applications_market_tenant_fkey
    foreign key (workspace_id, market_id)
    references public.job_markets(workspace_id, id),
  add constraint job_applications_resume_tenant_fkey
    foreign key (workspace_id, resume_id)
    references public.resumes(workspace_id, id)
    on delete set null (resume_id);

alter table public.interviews
  drop constraint if exists interviews_application_id_fkey,
  drop constraint if exists interviews_profile_id_fkey,
  drop constraint if exists interviews_application_tenant_fkey,
  drop constraint if exists interviews_profile_tenant_fkey,
  add constraint interviews_application_tenant_fkey
    foreign key (workspace_id, application_id)
    references public.job_applications(workspace_id, id) on delete cascade,
  add constraint interviews_profile_tenant_fkey
    foreign key (workspace_id, profile_id)
    references public.profiles(workspace_id, id) on delete cascade;

create index if not exists idx_workspace_role_permissions_workspace_id
on public.workspace_role_permissions(workspace_id);

create index if not exists idx_workspace_member_roles_workspace_id
on public.workspace_member_roles(workspace_id);

create index if not exists idx_workspace_member_onboarding_workspace_id
on public.workspace_member_onboarding(workspace_id);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = (select auth.uid())
      and wm.status = 'active'
      and wm.deleted_at is null
      and w.deleted_at is null
  );
$$;

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    join public.workspace_member_roles wmr
      on wmr.workspace_id = wm.workspace_id
      and wmr.member_id = wm.id
    join public.workspace_roles wr
      on wr.workspace_id = wmr.workspace_id
      and wr.id = wmr.role_id
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = (select auth.uid())
      and wm.status = 'active'
      and wm.deleted_at is null
      and wr.key = 'admin'
      and wr.deleted_at is null
      and w.deleted_at is null
  );
$$;

drop policy if exists "platform admins can read platform admins" on public.platform_admins;
create policy "platform admins can read own platform identity"
on public.platform_admins for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "members can read their workspaces" on public.workspaces;
create policy "members can read their workspaces"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

drop policy if exists "authenticated users can create workspaces" on public.workspaces;

drop policy if exists "members can read workspace members" on public.workspace_members;
create policy "members can read own membership or admins can manage members"
on public.workspace_members for select to authenticated
using (
  auth_user_id = (select auth.uid())
  or public.is_workspace_admin(workspace_id)
);

drop policy if exists "members can read workspace roles" on public.workspace_roles;
create policy "members can read workspace roles"
on public.workspace_roles for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can read role permissions" on public.workspace_role_permissions;
create policy "members can read role permissions"
on public.workspace_role_permissions for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can read member roles" on public.workspace_member_roles;
create policy "members can read own roles or admins can manage member roles"
on public.workspace_member_roles for select to authenticated
using (
  public.is_workspace_admin(workspace_id)
  or exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_member_roles.workspace_id
      and wm.id = workspace_member_roles.member_id
      and wm.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "members can read workspace onboarding" on public.workspace_member_onboarding;
create policy "members can read own workspace onboarding"
on public.workspace_member_onboarding for select to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_member_onboarding.workspace_id
      and wm.id = workspace_member_onboarding.member_id
      and wm.auth_user_id = (select auth.uid())
      and wm.status = 'active'
      and wm.deleted_at is null
  )
);

drop policy if exists "users can read their login events" on public.login_events;
create policy "users can read their login events"
on public.login_events for select to authenticated
using (user_id = (select auth.uid()));
