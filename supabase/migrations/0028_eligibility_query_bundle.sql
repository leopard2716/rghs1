-- Bundle eligibility history reads into one database request per Worker invocation.
create or replace function public.application_eligibility_data(p_workspace_id uuid, p_bid_ids uuid[])
returns jsonb language sql stable security invoker set search_path = public as $$
  with targets as (
    select id,company,job_title,applied_at,rejected_at,imported_at,import_batch_id,import_order,deleted_at
    from bid_records where workspace_id=p_workspace_id and id=any(p_bid_ids) and deleted_at is null
  ), profiles as (
    select distinct profile_id from bid_record_profiles
    where workspace_id=p_workspace_id and bid_id in (select id from targets)
  ), assignments as (
    select bid_id,profile_id from bid_record_profiles
    where workspace_id=p_workspace_id and profile_id in (select profile_id from profiles)
  ), history as (
    select id,company,job_title,applied_at,rejected_at,imported_at,import_batch_id,import_order,deleted_at
    from bid_records where workspace_id=p_workspace_id and id in (select bid_id from assignments)
  )
  select jsonb_build_object(
    'targets',coalesce((select jsonb_agg(t) from targets t),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(h) from history h),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(a) from assignments a),'[]'::jsonb)
  );
$$;

create or replace function public.bulk_bid_delete_candidates(
  p_workspace_id uuid, p_member_id uuid, p_profile_id uuid,
  p_date_from timestamptz, p_date_to timestamptz, p_bid_ids uuid[] default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(candidate),'[]'::jsonb) from (
  select b.id,b.company,b.job_title,b.bid_at from bid_records b
  where b.workspace_id=p_workspace_id and b.created_by_member_id=p_member_id
    and b.deleted_at is null and b.bid_at>=p_date_from and b.bid_at<p_date_to
    and (p_bid_ids is null or b.id=any(p_bid_ids))
    and exists(select 1 from bid_record_profiles a where a.workspace_id=p_workspace_id
      and a.bid_id=b.id and a.profile_id=p_profile_id)
  order by b.bid_at desc,b.id desc
  ) candidate;
$$;
-- Only the server's service role may invoke these workspace-scoped functions.
revoke all on function public.application_eligibility_data(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.application_eligibility_data(uuid,uuid[]) to service_role;
revoke all on function public.bulk_bid_delete_candidates(uuid,uuid,uuid,timestamptz,timestamptz,uuid[]) from public,anon,authenticated;
grant execute on function public.bulk_bid_delete_candidates(uuid,uuid,uuid,timestamptz,timestamptz,uuid[]) to service_role;
