create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_auth_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  scope text not null check (scope in ('admin', 'workspace')),
  priority text not null default 'info'
    check (priority in ('critical', 'error', 'warning', 'info', 'success')),
  event_type text not null,
  title text not null,
  message text not null,
  action_url text,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_notifications_recipient_created
on public.notifications(recipient_auth_user_id, created_at desc);

create index if not exists idx_notifications_recipient_unread
on public.notifications(recipient_auth_user_id, created_at desc)
where read_at is null;

alter table public.notifications enable row level security;

create policy "users can read own notifications"
on public.notifications for select to authenticated
using (
  recipient_auth_user_id = (select auth.uid())
  and (
    (scope = 'admin' and public.is_platform_admin())
    or
    (
      scope = 'workspace'
      and workspace_id is not null
      and public.is_workspace_member(workspace_id)
    )
  )
);

create policy "users can mark own notifications read"
on public.notifications for update to authenticated
using (
  recipient_auth_user_id = (select auth.uid())
  and (
    (scope = 'admin' and public.is_platform_admin())
    or
    (
      scope = 'workspace'
      and workspace_id is not null
      and public.is_workspace_member(workspace_id)
    )
  )
)
with check (
  recipient_auth_user_id = (select auth.uid())
  and (
    (scope = 'admin' and public.is_platform_admin())
    or
    (
      scope = 'workspace'
      and workspace_id is not null
      and public.is_workspace_member(workspace_id)
    )
  )
);

create table if not exists public.tracking_profile_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  encrypted_payload jsonb not null,
  encryption_version smallint not null default 1 check (encryption_version > 0),
  requested_by_member_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied')),
  reviewed_by_member_id uuid,
  resolved_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, requested_by_member_id)
    references public.workspace_members(workspace_id, id) on delete cascade,
  foreign key (workspace_id, reviewed_by_member_id)
    references public.workspace_members(workspace_id, id)
    on delete set null (reviewed_by_member_id),
  foreign key (workspace_id, resolved_profile_id)
    references public.tracking_profiles(workspace_id, id)
);

create index if not exists idx_tracking_profile_requests_workspace_status
on public.tracking_profile_requests(workspace_id, status, created_at desc);

alter table public.tracking_profile_requests enable row level security;

create policy "members can read profile requests"
on public.tracking_profile_requests for select to authenticated
using (public.is_workspace_member(workspace_id));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

comment on table public.notifications is
  'Durable per-recipient application notifications streamed through Supabase Realtime.';

comment on column public.tracking_profile_requests.encrypted_payload is
  'AES-256-GCM envelope containing the requested profile name.';
