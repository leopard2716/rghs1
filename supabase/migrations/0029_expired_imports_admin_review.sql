alter table public.bid_records
  add column expired_at timestamptz,
  add column applied_recorded_at timestamptz,
  add column applied_recorded_by_member_id uuid references public.workspace_members(id) on delete set null;

create index bid_pending_review_expiry_idx on public.bid_records(imported_at,workspace_id)
  where applied_at is null and imported_at is not null and deleted_at is null and expired_at is null;

-- Preserve next-day imports for review; never purge them automatically.
create or replace function public.expire_pending_imports() returns bigint
language plpgsql security invoker set search_path=public,pg_temp as $$
declare expired_count bigint;
begin
  with expired as (
    update public.bid_records b set expired_at=statement_timestamp(),updated_at=statement_timestamp()
    from public.workspaces w
    where b.workspace_id=w.id and w.deleted_at is null and b.deleted_at is null
      and b.applied_at is null and b.imported_at is not null and b.expired_at is null
      and (b.imported_at at time zone 'America/Chicago')::date < (statement_timestamp() at time zone 'America/Chicago')::date
    returning b.workspace_id
  ), audited as (
    insert into public.audit_logs(workspace_id,action,target_type,target_id,metadata)
    select workspace_id,'tracking.bid.pending_imports_expired','workspace',workspace_id,
      jsonb_build_object('count',count(*),'reason','Pending imports from a previous Central day retained for review')
    from expired group by workspace_id returning id
  ) select count(*) into expired_count from expired;
  return expired_count;
end; $$;
revoke all on function public.expire_pending_imports() from public,anon,authenticated;
grant execute on function public.expire_pending_imports() to service_role;

create or replace function public.admin_record_bid_application(
  p_workspace_id uuid,p_bid_id uuid,p_actor_id uuid,p_actor_member_id uuid,p_applied_at timestamptz,p_reason text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous public.bid_records; recorded timestamptz:=statement_timestamp();
begin
  select * into previous from public.bid_records where workspace_id=p_workspace_id and id=p_bid_id and deleted_at is null for update;
  if not found then raise exception 'Application not found' using errcode='P0002'; end if;
  if previous.applied_at is not null then raise exception 'Application already marked applied' using errcode='40001'; end if;
  if p_applied_at is null or p_applied_at>recorded then raise exception 'Invalid application date' using errcode='22023'; end if;
  update public.bid_records set applied_at=p_applied_at,expired_at=null,
    applied_recorded_at=recorded,applied_recorded_by_member_id=p_actor_member_id,updated_at=recorded
    where workspace_id=p_workspace_id and id=p_bid_id;
  insert into public.audit_logs(workspace_id,actor_id,actor_member_id,action,target_type,target_id,metadata)
  values(p_workspace_id,p_actor_id,p_actor_member_id,'tracking.bid.applied_by_admin','tracking_record',p_bid_id,
    jsonb_build_object('bidderMemberId',previous.created_by_member_id,'appliedAt',p_applied_at,'recordedAt',recorded,
      'previousAppliedAt',previous.applied_at,'previousExpiredAt',previous.expired_at,'reason',p_reason));
  return jsonb_build_object('appliedAt',p_applied_at,'recordedAt',recorded);
end; $$;
revoke all on function public.admin_record_bid_application(uuid,uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.admin_record_bid_application(uuid,uuid,uuid,uuid,timestamptz,text) to service_role;
notify pgrst,'reload schema';
