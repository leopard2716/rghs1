alter table public.bid_records
  add column applied_at timestamptz,
  add column imported_at timestamptz,
  add column import_batch_id uuid,
  add column import_order integer;

-- Existing records represent submitted application history. New imports explicitly remain pending.
update public.bid_records set applied_at = bid_at;

create table public.workspace_application_rules (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  cooldown_days integer not null default 45 check (cooldown_days between 1 and 3650),
  time_zone text not null default 'America/Chicago',
  updated_at timestamptz not null default now()
);
alter table public.workspace_application_rules enable row level security;
revoke all on public.workspace_application_rules from anon, authenticated;
grant all on public.workspace_application_rules to service_role;
create index bid_application_history_idx on public.bid_records(workspace_id, applied_at) where applied_at is not null;
create index bid_import_order_idx on public.bid_records(workspace_id, import_batch_id, import_order) where import_batch_id is not null;
notify pgrst, 'reload schema';
