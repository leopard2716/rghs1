do $$
begin
  if exists (
    select 1 from public.tracking_profiles
    where name is null
  ) or exists (
    select 1 from public.tracking_profile_requests
    where name is null
  ) or exists (
    select 1 from public.tracking_job_markets
    where name is null
  ) or exists (
    select 1 from public.bid_records
    where job_title is null
       or company is null
       or job_link is null
       or bid_at is null
  ) or exists (
    select 1 from public.interview_records
    where step is null
       or start_at is null
       or end_at is null
       or time_zone is null
       or interview_link is null
  ) then
    raise exception using
      message = 'Encrypted tracking rows still require plaintext backfill.',
      hint = 'Run npm run migrate:tracking-plaintext, then rerun the Supabase migration command.';
  end if;
end
$$;

alter table public.tracking_profiles
  alter column name set not null;

alter table public.tracking_profile_requests
  alter column name set not null;

alter table public.tracking_job_markets
  alter column name set not null;

alter table public.bid_records
  alter column job_title set not null,
  alter column company set not null,
  alter column job_link set not null,
  alter column bid_at set not null;

alter table public.interview_records
  alter column step set not null,
  alter column start_at set not null,
  alter column end_at set not null,
  alter column time_zone set not null,
  alter column interview_link set not null;

alter table public.tracking_job_markets
  add constraint tracking_job_markets_identity_check check (
    (system and market_key is not null)
    or
    (not system and market_key is null)
  );

create unique index if not exists uq_tracking_profiles_workspace_active_name
on public.tracking_profiles(workspace_id, lower(name))
where deleted_at is null;

create unique index if not exists uq_tracking_job_markets_workspace_active_name
on public.tracking_job_markets(workspace_id, lower(name))
where deleted_at is null;

drop policy if exists "members can read encrypted tracking profiles"
on public.tracking_profiles;
drop policy if exists "members can read encrypted bids"
on public.bid_records;
drop policy if exists "members can read encrypted bid profile assignments"
on public.bid_record_profiles;
drop policy if exists "members can read encrypted interviews"
on public.interview_records;
drop policy if exists "members can read encrypted tracking job markets"
on public.tracking_job_markets;

create policy "members can read tracking profiles"
on public.tracking_profiles for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members can read bids"
on public.bid_records for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members can read bid profile assignments"
on public.bid_record_profiles for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members can read interviews"
on public.interview_records for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members can read tracking job markets"
on public.tracking_job_markets for select to authenticated
using (public.is_workspace_member(workspace_id));

alter table public.tracking_profiles
  drop column encrypted_payload,
  drop column encryption_version;

alter table public.tracking_profile_requests
  drop column encrypted_payload,
  drop column encryption_version;

alter table public.tracking_job_markets
  drop column encrypted_payload,
  drop column encryption_version;

alter table public.bid_records
  drop column encrypted_payload,
  drop column encryption_version;

alter table public.interview_records
  drop column encrypted_payload,
  drop column encryption_version;
