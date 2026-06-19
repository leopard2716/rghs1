alter table public.workspace_members
  drop constraint if exists workspace_members_status_check;

alter table public.workspace_members
  add constraint workspace_members_status_check
  check (status in ('active', 'invited', 'pending', 'rejected', 'disabled'));

create index if not exists idx_workspace_members_workspace_status
on public.workspace_members(workspace_id, status)
where deleted_at is null;

comment on column public.workspace_members.status is
  'pending registrations require workspace-admin approval; rejected registrations remain auditable; disabled members cannot enter the workspace.';
