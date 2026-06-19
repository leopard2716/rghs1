alter table public.workspaces
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_at timestamptz,
  add column if not exists deletion_requested_by uuid references auth.users(id) on delete set null;

create index if not exists idx_workspaces_deletion_scheduled_at
on public.workspaces(deletion_scheduled_at)
where deleted_at is not null;

comment on column public.workspaces.deleted_at is
  'Soft-delete marker. While set, the workspace is hidden from tenant URLs and can be restored until deletion_scheduled_at.';

comment on column public.workspaces.deletion_scheduled_at is
  'Time when the global admin deletion grace period ends and the workspace can be permanently purged.';

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
      and wm.user_id = (select auth.uid())
      and wm.status = 'active'
      and wm.deleted_at is null
      and w.deleted_at is null
  );
$$;
