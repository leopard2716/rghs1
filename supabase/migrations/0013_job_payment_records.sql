create table if not exists public.job_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bid_id uuid not null,
  bidder_member_id uuid not null,
  caller_member_id uuid not null,
  worker_member_id uuid not null,
  bidder_rate numeric(5,2) not null check (bidder_rate >= 0 and bidder_rate <= 100),
  caller_rate numeric(5,2) not null check (caller_rate >= 0 and caller_rate <= 100),
  worker_rate numeric(5,2) not null check (worker_rate >= 0 and worker_rate <= 100),
  discount_rate numeric(5,2) not null default 0 check (discount_rate >= 0 and discount_rate <= 100),
  created_by_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  check (bidder_rate + caller_rate + worker_rate + discount_rate = 100),
  foreign key (workspace_id, bid_id)
    references public.bid_records(workspace_id, id),
  foreign key (workspace_id, bidder_member_id)
    references public.workspace_members(workspace_id, id),
  foreign key (workspace_id, caller_member_id)
    references public.workspace_members(workspace_id, id),
  foreign key (workspace_id, worker_member_id)
    references public.workspace_members(workspace_id, id),
  foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id)
);

create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_record_id uuid not null,
  payment_amount numeric(12,2) not null check (payment_amount > 0),
  bidder_member_id uuid not null,
  caller_member_id uuid not null,
  worker_member_id uuid not null,
  payment_manager_member_id uuid not null,
  bidder_amount numeric(12,2) not null check (bidder_amount >= 0),
  caller_amount numeric(12,2) not null check (caller_amount >= 0),
  worker_amount numeric(12,2) not null check (worker_amount >= 0),
  payment_manager_amount numeric(12,2) not null check (payment_manager_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_by_member_id uuid,
  paid_by_member_id uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  constraint payment_records_allocation_total_check check (
    round(
      bidder_amount + caller_amount + worker_amount + payment_manager_amount,
      2
    ) = payment_amount
  ),
  foreign key (workspace_id, job_record_id)
    references public.job_records(workspace_id, id),
  constraint payment_records_bidder_member_fk
    foreign key (workspace_id, bidder_member_id)
    references public.workspace_members(workspace_id, id),
  constraint payment_records_caller_member_fk
    foreign key (workspace_id, caller_member_id)
    references public.workspace_members(workspace_id, id),
  constraint payment_records_worker_member_fk
    foreign key (workspace_id, worker_member_id)
    references public.workspace_members(workspace_id, id),
  constraint payment_records_payment_manager_member_fk
    foreign key (workspace_id, payment_manager_member_id)
    references public.workspace_members(workspace_id, id),
  foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id),
  foreign key (workspace_id, paid_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (paid_by_member_id)
);

create index if not exists idx_job_records_workspace_created
on public.job_records(workspace_id, created_at desc)
where deleted_at is null;

create index if not exists idx_job_records_workspace_bid
on public.job_records(workspace_id, bid_id)
where deleted_at is null;

create index if not exists idx_job_records_workspace_members
on public.job_records(workspace_id, bidder_member_id, caller_member_id, worker_member_id)
where deleted_at is null;

create index if not exists idx_payment_records_workspace_created
on public.payment_records(workspace_id, created_at desc)
where deleted_at is null;

create index if not exists idx_payment_records_workspace_status
on public.payment_records(workspace_id, status, created_at desc)
where deleted_at is null;

create index if not exists idx_payment_records_workspace_job
on public.payment_records(workspace_id, job_record_id)
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

alter table public.job_records enable row level security;
alter table public.payment_records enable row level security;

create policy "members can read job records"
on public.job_records for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members can read payment records"
on public.payment_records for select to authenticated
using (public.is_workspace_member(workspace_id));

insert into public.workspace_roles (
  workspace_id,
  name,
  key,
  system
)
select
  workspaces.id,
  'Payment Manager',
  'payment_manager',
  true
from public.workspaces
on conflict (workspace_id, key)
do update set
  name = excluded.name,
  system = true,
  deleted_at = null,
  updated_at = now();

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

comment on table public.job_records is
  'Workspace-scoped records for jobs won from bids.';

comment on table public.payment_records is
  'Workspace-scoped payment records sourced from job records with stored per-user allocation amounts.';
