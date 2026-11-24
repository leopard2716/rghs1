-- A posting has a stable ATS identifier or a specific job URL. Keep unknown query
-- parameters and hash routes, since they can distinguish two openings.
create function public.job_opening_key(link text) returns text
language plpgsql immutable strict parallel safe set search_path = pg_catalog as $$
declare
  url_parts text[];
  host text;
  path text;
  query text;
  fragment text;
  req text[];
begin
  url_parts := regexp_match(trim(link), '^https?://([^/?#]+)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$', 'i');
  if url_parts is null then return null; end if;
  host := lower(url_parts[1]);
  path := rtrim(url_parts[2], '/');
  select string_agg(param, '&' order by param collate "C") into query
    from unnest(string_to_array(url_parts[3], '&')) param
    where param <> '' and lower(split_part(param, '=', 1)) !~ '^(utm_.*|gh_src|source|trackingid|trkid|fbclid|gclid|lever-source)$';
  fragment := case when coalesce(url_parts[4], '') = '' or lower(url_parts[4]) in ('apply','description','top','apply-now')
    then '' else '#' || url_parts[4] end;

  if host in ('boards.greenhouse.io','job-boards.greenhouse.io','boards.eu.greenhouse.io','job-boards.eu.greenhouse.io') then
    req := regexp_match(path, '/jobs/([0-9]+)(/apply)?$');
    if req is null and path = '/embed/job_app' then
      req := regexp_match(query, '(?:^|&)token=([0-9]+)(&|$)');
    end if;
    if req is not null then
      return 'greenhouse:' || case when host like '%.eu.%' then 'eu:' else 'us:' end || req[1];
    end if;
    if path !~ '/jobs/' then return null; end if;
  elsif host in ('jobs.lever.co','jobs.eu.lever.co','jobs.ashbyhq.com') then
    req := regexp_match(path, '^/([^/]+)/([0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})(?:/(?:apply|application))?$');
    if req is not null then return host || '/' || req[1] || '/' || lower(req[2]); end if;
    if path ~ '^/[^/]+$' then return null; end if;
  elsif host like '%.icims.com' then
    req := regexp_match(path, '^/jobs/([0-9]+)(?:/|$)');
    if req is not null then return host || '/jobs/' || req[1]; end if;
  elsif host = 'jobs.smartrecruiters.com' then
    req := regexp_match(path, '^/([^/]+)/([0-9]+)(?:-|/|$)');
    if req is not null then return host || '/' || req[1] || '/' || req[2]; end if;
  elsif host like '%.myworkdayjobs.com' then
    req := regexp_match(path, '/job/.+_((?:[a-z]+[-_]?)?[0-9]+)(?:/apply)?$', 'i');
    if req is not null then return 'workday:' || split_part(host,'.',1) || ':' || lower(req[1]); end if;
  end if;

  -- When the URL explicitly identifies a requisition, ignore changes to the
  -- display slug under the same site section. Preserve other query parameters
  -- (for example a tenant identifier) and fragment routes.
  if query ~* '(^|&)(requisitionid|requisition_id|reqid|jobid|job_id)=[^&]+' then
    return host || '/' || split_part(ltrim(path, '/'), '/', 1) || '?' || query || fragment;
  end if;
  if path ~* '^(/(careers?|jobs?|search|openings?|apply|opportunities))*$' and query is null and fragment = '' then
    return null;
  end if;
  return host || path || coalesce('?' || query, '') || fragment;
end;
$$;

create index bid_applied_opening_idx on public.bid_records
  (workspace_id, md5(public.job_opening_key(job_link)))
  where applied_at is not null and deleted_at is null;

-- Shared by the badge, export and write guard. Never filter by bidder or rejection.
create function public.previous_opening(w uuid, target uuid, profile uuid, opening text)
returns table(id uuid, applied_at timestamptz)
language sql stable strict set search_path = public as $$
  select h.id,h.applied_at from bid_records h
  join bid_record_profiles p on p.workspace_id=h.workspace_id and p.bid_id=h.id
  where h.workspace_id=w and p.profile_id=profile and h.id<>target
    and h.applied_at is not null and h.deleted_at is null
    and md5(job_opening_key(h.job_link))=md5(opening) and job_opening_key(h.job_link)=opening
  order by h.applied_at desc,h.id limit 1;
$$;

create function public.applied_opening_matches(p_workspace_id uuid,p_bid_ids uuid[])
returns table(bid_id uuid, prior_id uuid, applied_at timestamptz)
language sql stable set search_path=public as $$
  select distinct on (b.id) b.id, prior.id, prior.applied_at
  from bid_records b join bid_record_profiles p on p.workspace_id=b.workspace_id and p.bid_id=b.id
  cross join lateral previous_opening(b.workspace_id,b.id,p.profile_id,job_opening_key(b.job_link)) prior
  where b.workspace_id=p_workspace_id and b.id=any(p_bid_ids) and b.applied_at is null and b.deleted_at is null
  order by b.id,prior.applied_at desc,prior.id;
$$;

create function public.enforce_previous_opening() returns trigger
language plpgsql set search_path=public as $$
declare
  bid bid_records%rowtype;
  added_profile uuid;
  profile uuid;
  opening text;
begin
  if tg_table_name='bid_record_profiles' then
    select * into bid from bid_records where workspace_id=new.workspace_id and id=new.bid_id for update;
    added_profile := new.profile_id;
  else
    bid := new;
  end if;
  if bid.applied_at is null or bid.deleted_at is not null then return new; end if;
  opening := job_opening_key(bid.job_link);
  if opening is null then return new; end if;
  for profile in select profile_id from bid_record_profiles
    where workspace_id=bid.workspace_id and bid_id=bid.id and (added_profile is null or profile_id=added_profile)
    order by profile_id loop
    perform pg_advisory_xact_lock(hashtextextended(bid.workspace_id::text || profile::text || opening, 1));
    if exists(select 1 from previous_opening(bid.workspace_id,bid.id,profile,opening)) then
      raise exception using errcode='PT409', message='This profile has already applied to this opening.';
    end if;
  end loop;
  return new;
end; $$;

create trigger bid_previous_opening after update of applied_at,deleted_at,job_link on public.bid_records
  for each row when ((old.applied_at is null and new.applied_at is not null) or old.deleted_at is distinct from new.deleted_at
    or public.job_opening_key(old.job_link) is distinct from public.job_opening_key(new.job_link))
  execute function public.enforce_previous_opening();
create trigger profile_previous_opening after insert or update of profile_id,bid_id on public.bid_record_profiles
  for each row execute function public.enforce_previous_opening();

create function public.blocked_application_exports(p_workspace_id uuid,p_bid_ids uuid[]) returns table(id uuid)
language sql stable set search_path=public as $$
  select id from blocked_company_reset_exports(p_workspace_id,p_bid_ids)
  union select bid_id from applied_opening_matches(p_workspace_id,p_bid_ids);
$$;
revoke all on function public.previous_opening(uuid,uuid,uuid,text), public.applied_opening_matches(uuid,uuid[]),
  public.enforce_previous_opening(), public.blocked_application_exports(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.previous_opening(uuid,uuid,uuid,text), public.applied_opening_matches(uuid,uuid[]),
  public.enforce_previous_opening(), public.blocked_application_exports(uuid,uuid[]) to service_role;

-- Changing an applied bid's URL or profile set can trip the guard. Commit the
-- bid and all its profile edits together so a refused edit leaves it intact.
create function public.update_bid_with_profiles(
  p_workspace_id uuid, p_bid_id uuid, p_owner_id uuid, p_expected_updated_at timestamptz,
  p_patch jsonb, p_profiles jsonb
) returns jsonb language plpgsql set search_path=public as $$
declare
  current_bid bid_records%rowtype;
  edited bid_records%rowtype;
begin
  select * into current_bid from bid_records
    where workspace_id=p_workspace_id and id=p_bid_id and deleted_at is null
      and (p_owner_id is null or created_by_member_id=p_owner_id) for update;
  if not found then return null; end if;
  if current_bid.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='PT409', message='The bid changed. Refresh and try the edit again.';
  end if;
  edited := jsonb_populate_record(current_bid,p_patch);
  delete from bid_record_profiles p where p.workspace_id=p_workspace_id and p.bid_id=p_bid_id
    and not exists(select 1 from jsonb_to_recordset(p_profiles) as item(profile_id uuid)
                   where item.profile_id=p.profile_id);
  update bid_records set job_market_id=edited.job_market_id, job_title=edited.job_title,
    company=edited.company, job_link=edited.job_link, job_description=edited.job_description,
    bid_at=edited.bid_at, updated_at=now(),
    applied_at=case when current_bid.applied_at is not null and edited.bid_at is distinct from current_bid.bid_at
      then edited.bid_at else current_bid.applied_at end
    where id=p_bid_id and workspace_id=p_workspace_id returning * into edited;
  insert into bid_record_profiles(workspace_id,bid_id,profile_id,resume)
    select p_workspace_id,p_bid_id,item.profile_id,item.resume
    from jsonb_to_recordset(p_profiles) as item(profile_id uuid,resume text) order by item.profile_id
    on conflict(workspace_id,bid_id,profile_id) do update set resume=excluded.resume;
  return to_jsonb(edited);
end; $$;
revoke all on function public.update_bid_with_profiles(uuid,uuid,uuid,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.update_bid_with_profiles(uuid,uuid,uuid,timestamptz,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
