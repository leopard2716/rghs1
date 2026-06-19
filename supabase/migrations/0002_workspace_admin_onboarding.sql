create table if not exists public.workspace_member_onboarding (
  member_id uuid primary key references public.workspace_members(id) on delete cascade,
  temp_password_hash text,
  temp_password_expires_at timestamptz,
  requires_password_change boolean not null default true,
  password_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_member_onboarding_requires_password_change
on public.workspace_member_onboarding(requires_password_change);

alter table public.workspace_member_onboarding enable row level security;

drop policy if exists "members can read workspace onboarding" on public.workspace_member_onboarding;
create policy "members can read workspace onboarding"
on public.workspace_member_onboarding for select to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.id = member_id
      and wm.user_id = (select auth.uid())
      and wm.status = 'active'
      and wm.deleted_at is null
  )
);

drop policy if exists "members can read job markets" on public.job_markets;
create policy "members can read job markets"
on public.job_markets for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can write job markets" on public.job_markets;
create policy "members can write job markets"
on public.job_markets for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "members can read profiles" on public.profiles;
create policy "members can read profiles"
on public.profiles for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can write profiles" on public.profiles;
create policy "members can write profiles"
on public.profiles for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "members can read files" on public.files;
create policy "members can read files"
on public.files for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can write files" on public.files;
create policy "members can write files"
on public.files for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "members can read resumes" on public.resumes;
create policy "members can read resumes"
on public.resumes for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can write resumes" on public.resumes;
create policy "members can write resumes"
on public.resumes for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "members can read job applications" on public.job_applications;
create policy "members can read job applications"
on public.job_applications for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can write job applications" on public.job_applications;
create policy "members can write job applications"
on public.job_applications for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "members can read interviews" on public.interviews;
create policy "members can read interviews"
on public.interviews for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can write interviews" on public.interviews;
create policy "members can write interviews"
on public.interviews for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "members can read alerts" on public.alerts;
create policy "members can read alerts"
on public.alerts for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can write alerts" on public.alerts;
create policy "members can write alerts"
on public.alerts for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "members can read audit logs" on public.audit_logs;
create policy "members can read audit logs"
on public.audit_logs for select to authenticated
using (workspace_id is not null and public.is_workspace_member(workspace_id));
