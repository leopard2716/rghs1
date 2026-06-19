delete from public.workspace_member_roles
where role_id in (
  select id
  from public.workspace_roles
  where key = 'viewer'
);

delete from public.workspace_role_permissions
where role_id in (
  select id
  from public.workspace_roles
  where key = 'viewer'
);

delete from public.workspace_roles
where key = 'viewer';
