create table public.workspace_impersonations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  admin_member_id uuid not null,
  bidder_member_id uuid not null,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  ended_at timestamptz,
  foreign key (workspace_id, admin_member_id) references public.workspace_members(workspace_id, id) on delete cascade,
  foreign key (workspace_id, bidder_member_id) references public.workspace_members(workspace_id, id) on delete cascade,
  check (admin_member_id <> bidder_member_id)
);
alter table public.workspace_impersonations enable row level security;
revoke all on public.workspace_impersonations from public, anon, authenticated;
grant select, insert, update on public.workspace_impersonations to service_role;

-- Every use rechecks the real administrator, the effective bidder and the workspace.
-- The API supplies the verified administrator identity. The session ID alone grants no access.
create function public.workspace_impersonation(
  p_slug text, p_actor uuid, p_operation text, p_id uuid, p_write text default null
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  ws uuid;
  admin_id uuid;
  target_id uuid;
  bidder public.workspace_members;
  support public.workspace_impersonations;
begin
  select w.id, a.id into ws, admin_id
  from workspaces w join workspace_members a on a.workspace_id = w.id
  where w.slug = p_slug and w.deleted_at is null and w.status = 'active'
    and a.auth_user_id = p_actor and a.deleted_at is null and a.status = 'active'
    and exists (
      select 1 from workspace_member_roles mr join workspace_roles r
        on r.workspace_id = mr.workspace_id and r.id = mr.role_id
      where mr.workspace_id = w.id and mr.member_id = a.id and r.key = 'admin' and r.deleted_at is null
    );
  if admin_id is null then return null; end if;

  if p_operation = 'start' then
    target_id := p_id;
  elsif p_operation in ('use', 'end') then
    select * into support from workspace_impersonations
      where id = p_id and workspace_id = ws and admin_member_id = admin_id and ended_at is null;
    if support.id is null then return null; end if;
    target_id := support.bidder_member_id;
    if p_operation = 'end' then
      update workspace_impersonations set ended_at = now() where id = support.id and ended_at is null;
      if found then
        insert into audit_logs(workspace_id, actor_id, actor_member_id, action, target_type, target_id, metadata)
          values (ws, p_actor, admin_id, 'workspace.impersonation.ended', 'workspace_member', target_id,
            jsonb_build_object('sessionId', support.id));
      end if;
      return jsonb_build_object('ended', true);
    end if;
    if support.expires_at <= now() then return null; end if;
  else
    return null;
  end if;

  select m.* into bidder from workspace_members m
    where m.workspace_id = ws and m.id = target_id and m.id <> admin_id
      and m.status = 'active' and m.deleted_at is null
      and exists (
        select 1 from workspace_member_roles mr join workspace_roles r
          on r.workspace_id = mr.workspace_id and r.id = mr.role_id
        where mr.workspace_id = ws and mr.member_id = m.id and r.deleted_at is null
        having bool_or(r.key = 'bidder') and not bool_or(r.key = 'admin')
      );
  if bidder.id is null then return null; end if;

  if p_operation = 'start' then
    insert into workspace_impersonations(workspace_id, admin_member_id, bidder_member_id)
      values (ws, admin_id, target_id) returning * into support;
  end if;
  if p_operation = 'start' or p_write is not null then
    insert into audit_logs(workspace_id, actor_id, actor_member_id, action, target_type, target_id, metadata)
      values (ws, p_actor, admin_id,
        case when p_operation = 'start' then 'workspace.impersonation.started' else 'workspace.impersonation.operation_requested' end,
        'workspace_member', target_id, jsonb_strip_nulls(jsonb_build_object('sessionId', support.id, 'request', p_write)));
  end if;
  return jsonb_build_object('id', support.id, 'expiresAt', support.expires_at,
    'displayName', bidder.display_name, 'userId', bidder.auth_user_id, 'adminMemberId', admin_id);
end;
$$;
revoke all on function public.workspace_impersonation(text, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.workspace_impersonation(text, uuid, text, uuid, text) to service_role;
notify pgrst, 'reload schema';
