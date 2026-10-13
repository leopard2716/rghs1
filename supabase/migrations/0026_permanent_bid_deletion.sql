-- Purge previously deleted bids. Job-linked bids remain protected by their foreign key.
-- Profile assignments and interviews cascade; job/payment history is not deleted.
with purged as (
  delete from public.bid_records b
  where b.deleted_at is not null
    and not exists (select 1 from public.job_records j where j.workspace_id = b.workspace_id and j.bid_id = b.id)
  returning b.workspace_id
)
insert into public.audit_logs(workspace_id, action, target_type, target_id, metadata)
select workspace_id, 'tracking.bid.soft_deleted_purged', 'workspace', workspace_id,
  jsonb_build_object('count', count(*))
from purged group by workspace_id;

-- Future next-day expiry uses permanent deletion as well.
create or replace function public.expire_pending_imports()
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare expired_count bigint;
begin
  with expired as (
    delete from public.bid_records b
    using public.workspaces w
    left join public.workspace_application_rules r on r.workspace_id = w.id
    where b.workspace_id = w.id and w.deleted_at is null
      and b.deleted_at is null and b.applied_at is null and b.imported_at is not null
      and not exists (select 1 from public.job_records j where j.workspace_id = b.workspace_id and j.bid_id = b.id)
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
