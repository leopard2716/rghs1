create or replace function public.bulk_bid_delete_candidates(
  p_workspace_id uuid, p_member_id uuid, p_profile_id uuid,
  p_date_from timestamptz, p_date_to timestamptz, p_bid_ids uuid[] default null
)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(candidate),'[]'::jsonb) from (
  select b.id,b.company,b.job_title,b.bid_at from bid_records b
  where b.workspace_id=p_workspace_id and (p_member_id is null or b.created_by_member_id=p_member_id)
    and b.deleted_at is null and b.bid_at>=p_date_from and b.bid_at<p_date_to
    and (p_bid_ids is null or b.id=any(p_bid_ids))
    and exists(select 1 from bid_record_profiles a where a.workspace_id=p_workspace_id
      and a.bid_id=b.id and a.profile_id=p_profile_id)
  order by b.bid_at desc,b.id desc
  ) candidate;
$$;
-- API passes a null creator only after verifying an active workspace admin role.
revoke all on function public.bulk_bid_delete_candidates(uuid,uuid,uuid,timestamptz,timestamptz,uuid[]) from public,anon,authenticated;
grant execute on function public.bulk_bid_delete_candidates(uuid,uuid,uuid,timestamptz,timestamptz,uuid[]) to service_role;
