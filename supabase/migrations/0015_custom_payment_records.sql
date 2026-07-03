create table if not exists public.custom_payment_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 180),
  amount numeric(12,2) not null check (amount > 0),
  direction text not null check (direction in ('income', 'outcome')),
  created_by_member_id uuid,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  constraint custom_payment_records_member_fk
    foreign key (workspace_id, member_id)
    references public.workspace_members(workspace_id, id),
  constraint custom_payment_records_created_by_member_fk
    foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (created_by_member_id)
);

create index if not exists idx_custom_payment_records_workspace_member_recorded
on public.custom_payment_records(workspace_id, member_id, recorded_at desc)
where deleted_at is null;

create index if not exists idx_custom_payment_records_workspace_created_by
on public.custom_payment_records(workspace_id, created_by_member_id)
where deleted_at is null;

alter table public.custom_payment_records enable row level security;

create policy "members can read custom payment records"
on public.custom_payment_records for select to authenticated
using (public.is_workspace_member(workspace_id));

comment on table public.custom_payment_records is
  'Workspace-scoped custom income/outcome payment ledger records assigned to individual users.';
