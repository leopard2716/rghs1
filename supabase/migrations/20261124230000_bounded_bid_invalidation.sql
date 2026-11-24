alter table public.bid_eligibility_cache add column company_keys text[];
create index bid_cache_company_keys_idx on public.bid_eligibility_cache using gin (company_keys);
create index bid_cache_matches_idx on public.bid_eligibility_cache using gin (matches jsonb_path_ops);

-- Old snapshots have no company keys. The API recomputes them on their next read.
create function public.invalidate_bid_eligibility(
  p_workspace_id uuid, p_profile_ids uuid[], p_company_keys text[]
) returns bigint language sql volatile security invoker set search_path = public, pg_temp as $$
  with removed as (
    delete from bid_eligibility_cache
    where workspace_id = p_workspace_id
      and company_keys && p_company_keys
      and profile_ids && p_profile_ids
    returning 1
  )
  select count(*) from removed;
$$;

-- Commit the submitted bid, its assignments and affected cache entries together.
create function public.create_submitted_bid(
  p_workspace_id uuid, p_member_id uuid, p_bid jsonb, p_profiles jsonb, p_company_keys text[]
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  bid public.bid_records%rowtype;
  selected_profiles uuid[];
begin
  select * into bid from jsonb_populate_record(null::public.bid_records, p_bid);
  insert into bid_records (workspace_id, created_by_member_id, job_market_id, job_title,
    company, job_link, bid_at, applied_at, job_description)
  values (p_workspace_id, p_member_id, bid.job_market_id, bid.job_title,
    bid.company, bid.job_link, bid.bid_at, bid.bid_at, bid.job_description)
  returning * into bid;

  with assigned as (
    insert into bid_record_profiles (workspace_id, bid_id, profile_id, resume)
    select p_workspace_id, bid.id, p.profile_id, p.resume
    from jsonb_to_recordset(p_profiles) as p(profile_id uuid, resume text)
    returning profile_id
  )
  select array_agg(profile_id) into selected_profiles from assigned;

  if selected_profiles is null then raise exception 'At least one profile is required'; end if;
  perform invalidate_bid_eligibility(p_workspace_id, selected_profiles, p_company_keys);
  return to_jsonb(bid);
end;
$$;

-- Every company-history match carries its original bid ID, including rejected
-- and nonblocking matches. Exact-opening and blacklist checks are already live.
create function public.clear_deleted_bid_cache() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  delete from bid_eligibility_cache c using removed_bids b
    where c.workspace_id = b.workspace_id and c.bid_id = b.id;
  delete from bid_eligibility_cache c using removed_bids b
    where c.workspace_id = b.workspace_id
      and c.matches @> jsonb_build_array(jsonb_build_object('id', b.id));
  return null;
end;
$$;
create trigger clear_deleted_bid_cache after delete on public.bid_records
  referencing old table as removed_bids for each statement execute function public.clear_deleted_bid_cache();

revoke all on function public.invalidate_bid_eligibility(uuid,uuid[],text[]),
  public.create_submitted_bid(uuid,uuid,jsonb,jsonb,text[]),
  public.clear_deleted_bid_cache() from public, anon, authenticated;
grant execute on function public.invalidate_bid_eligibility(uuid,uuid[],text[]),
  public.create_submitted_bid(uuid,uuid,jsonb,jsonb,text[]) to service_role;
notify pgrst, 'reload schema';
