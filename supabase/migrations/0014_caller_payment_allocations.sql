do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_records'
      and column_name = 'interviewer_member_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_records'
      and column_name = 'caller_member_id'
  ) then
    alter table public.job_records
      rename column interviewer_member_id to caller_member_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_records'
      and column_name = 'interviewer_rate'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_records'
      and column_name = 'caller_rate'
  ) then
    alter table public.job_records
      rename column interviewer_rate to caller_rate;
  end if;
end $$;

drop index if exists public.idx_job_records_workspace_interview;

alter table public.job_records
  drop column if exists interview_id;

alter table public.payment_records
  add column if not exists bidder_member_id uuid,
  add column if not exists caller_member_id uuid,
  add column if not exists worker_member_id uuid,
  add column if not exists payment_manager_member_id uuid,
  add column if not exists bidder_amount numeric(12,2) not null default 0 check (bidder_amount >= 0),
  add column if not exists caller_amount numeric(12,2) not null default 0 check (caller_amount >= 0),
  add column if not exists worker_amount numeric(12,2) not null default 0 check (worker_amount >= 0),
  add column if not exists payment_manager_amount numeric(12,2) not null default 0 check (payment_manager_amount >= 0);

with calculated as (
  select
    payments.id,
    jobs.bidder_member_id,
    jobs.caller_member_id,
    jobs.worker_member_id,
    coalesce(
      payments.payment_manager_member_id,
      payments.created_by_member_id,
      jobs.created_by_member_id,
      jobs.bidder_member_id
    ) as payment_manager_member_id,
    trunc(payments.payment_amount * jobs.bidder_rate / 100, 2) as bidder_amount,
    trunc(payments.payment_amount * jobs.caller_rate / 100, 2) as caller_amount,
    trunc(payments.payment_amount * jobs.worker_rate / 100, 2) as worker_amount
  from public.payment_records payments
  join public.job_records jobs
    on jobs.workspace_id = payments.workspace_id
   and jobs.id = payments.job_record_id
)
update public.payment_records payments
set
  bidder_member_id = calculated.bidder_member_id,
  caller_member_id = calculated.caller_member_id,
  worker_member_id = calculated.worker_member_id,
  payment_manager_member_id = calculated.payment_manager_member_id,
  bidder_amount = calculated.bidder_amount,
  caller_amount = calculated.caller_amount,
  worker_amount = calculated.worker_amount,
  payment_manager_amount = payments.payment_amount
    - calculated.bidder_amount
    - calculated.caller_amount
    - calculated.worker_amount
from calculated
where payments.id = calculated.id;

alter table public.payment_records
  alter column bidder_member_id set not null,
  alter column caller_member_id set not null,
  alter column worker_member_id set not null,
  alter column payment_manager_member_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payment_records_allocation_total_check'
  ) then
    alter table public.payment_records
      add constraint payment_records_allocation_total_check
      check (
        round(
          bidder_amount + caller_amount + worker_amount + payment_manager_amount,
          2
        ) = payment_amount
      )
      not valid;
  end if;
end $$;

alter table public.payment_records
  validate constraint payment_records_allocation_total_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payment_records_bidder_member_fk'
  ) then
    alter table public.payment_records
      add constraint payment_records_bidder_member_fk
      foreign key (workspace_id, bidder_member_id)
      references public.workspace_members(workspace_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_records_caller_member_fk'
  ) then
    alter table public.payment_records
      add constraint payment_records_caller_member_fk
      foreign key (workspace_id, caller_member_id)
      references public.workspace_members(workspace_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_records_worker_member_fk'
  ) then
    alter table public.payment_records
      add constraint payment_records_worker_member_fk
      foreign key (workspace_id, worker_member_id)
      references public.workspace_members(workspace_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_records_payment_manager_member_fk'
  ) then
    alter table public.payment_records
      add constraint payment_records_payment_manager_member_fk
      foreign key (workspace_id, payment_manager_member_id)
      references public.workspace_members(workspace_id, id);
  end if;
end $$;

create index if not exists idx_job_records_workspace_members
on public.job_records(workspace_id, bidder_member_id, caller_member_id, worker_member_id)
where deleted_at is null;

create index if not exists idx_payment_records_workspace_members
on public.payment_records(
  workspace_id,
  bidder_member_id,
  caller_member_id,
  worker_member_id,
  payment_manager_member_id
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
    ('admin', 'job_record:create'),
    ('admin', 'job_record:update'),
    ('admin', 'payment:pay'),
    ('payment_manager', 'payment:create'),
    ('payment_manager', 'payment:update')
) as permissions(role_key, permission)
  on permissions.role_key = roles.key
where roles.deleted_at is null
on conflict (role_id, permission) do nothing;

delete from public.workspace_role_permissions permissions
using public.workspace_roles roles
where permissions.role_id = roles.id
  and roles.key = 'admin'
  and permissions.permission in ('payment:create', 'payment:update');

comment on table public.job_records is
  'Workspace-scoped records for jobs won from bids.';

comment on table public.payment_records is
  'Workspace-scoped payment records sourced from job records with stored per-user allocation amounts.';
