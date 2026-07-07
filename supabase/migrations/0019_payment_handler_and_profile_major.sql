alter table public.tracking_profiles
  add column if not exists education_major text;

comment on column public.tracking_profiles.education_major is
  'Profile education major or field of study.';

alter table public.job_records
  add column if not exists payment_handler_member_id uuid;

update public.job_records
set payment_handler_member_id = coalesce(
  payment_handler_member_id,
  created_by_member_id,
  worker_member_id,
  caller_member_id,
  bidder_member_id
)
where payment_handler_member_id is null;

alter table public.job_records
  alter column payment_handler_member_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_records_payment_handler_member_fk'
      and conrelid = 'public.job_records'::regclass
  ) then
    alter table public.job_records
      add constraint job_records_payment_handler_member_fk
      foreign key (workspace_id, payment_handler_member_id)
      references public.workspace_members(workspace_id, id);
  end if;
end
$$;

drop index if exists public.idx_job_records_workspace_members;

create index if not exists idx_job_records_workspace_members
on public.job_records(
  workspace_id,
  bidder_member_id,
  caller_member_id,
  worker_member_id,
  payment_handler_member_id
)
where deleted_at is null;

insert into public.workspace_role_permissions (
  workspace_id,
  role_id,
  permission
)
select
  roles.workspace_id,
  roles.id,
  permissions.permission
from public.workspace_roles roles
join (
  values
    ('payment:create'),
    ('payment:update')
) as permissions(permission)
  on true
where roles.key = 'admin'
  and roles.deleted_at is null
on conflict (role_id, permission) do nothing;

delete from public.workspace_member_roles member_roles
using public.workspace_roles roles
where member_roles.role_id = roles.id
  and roles.key = 'payment_manager';

delete from public.workspace_role_permissions permissions
using public.workspace_roles roles
where permissions.role_id = roles.id
  and roles.key = 'payment_manager';

delete from public.workspace_roles
where key = 'payment_manager';
