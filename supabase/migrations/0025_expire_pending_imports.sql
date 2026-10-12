create index if not exists bid_pending_import_expiry_idx
  on public.bid_records(workspace_id, imported_at)
  where applied_at is null and imported_at is not null and deleted_at is null;

-- Atomic update rechecks applied_at when a concurrent submission holds the row lock.
-- Soft deletion preserves linked records and prevents pending plans becoming applied history.
create or replace function public.expire_pending_imports()
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare expired_count bigint;
begin
  with expired as (
    update public.bid_records b
    set deleted_at = statement_timestamp(), updated_at = statement_timestamp()
    from public.workspaces w
    left join public.workspace_application_rules r on r.workspace_id = w.id
    where b.workspace_id = w.id and w.deleted_at is null
      and b.deleted_at is null and b.applied_at is null and b.imported_at is not null
      and (b.imported_at at time zone coalesce(r.time_zone, 'America/Chicago'))::date
        < (statement_timestamp() at time zone coalesce(r.time_zone, 'America/Chicago'))::date
    returning b.workspace_id
  ), audited as (
    insert into public.audit_logs(workspace_id, action, target_type, target_id, metadata)
    select workspace_id, 'tracking.bid.pending_imports_expired', 'workspace', workspace_id,
      jsonb_build_object('count', count(*), 'reason', 'Unapplied imports from a previous workspace day')
    from expired group by workspace_id returning id
  ) select count(*) into expired_count from expired;
  return expired_count;
end;
$$;
revoke all on function public.expire_pending_imports() from public, anon, authenticated;
grant execute on function public.expire_pending_imports() to service_role;
notify pgrst, 'reload schema';
