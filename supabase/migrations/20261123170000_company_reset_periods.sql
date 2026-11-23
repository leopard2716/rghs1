alter table public.workspace_application_rules
  add column company_resets jsonb not null default '[]' check (jsonb_typeof(company_resets) = 'array');
alter table public.bid_eligibility_cache add column company_reset_days integer;

-- Keep in sync with companyResetKey in the domain package.
create function public.company_reset_key(name text) returns text
language sql immutable strict parallel safe set search_path = public as $$
  select regexp_replace(regexp_replace(trim(regexp_replace(lower(replace(name, '&', ' and ')),
    '[^a-z0-9]+', ' ', 'g')), '( (inc|incorporated|llc|corp|corporation|co|company|limited|ltd))+$', ''), ' ', '', 'g');
$$;
create index bid_records_company_reset_history on public.bid_records
  (workspace_id, public.company_reset_key(company), applied_at desc)
  where applied_at is not null and deleted_at is null;

create function public.company_reset_days(w uuid, employer text) returns integer
language sql stable set search_path = public as $$
  select (rule->>'days')::integer from workspace_application_rules s
  cross join lateral jsonb_array_elements(s.company_resets) rule
  where s.workspace_id=w and company_reset_key(rule->>'company')=company_reset_key(employer)
  limit 1;
$$;

-- Both application writes and profile assignments can complete a submitted bid.
create function public.enforce_company_reset() returns trigger language plpgsql set search_path = public as $$
declare
  bid bid_records%rowtype;
  days integer;
  profile uuid;
begin
  if tg_table_name='bid_record_profiles' then
    select * into bid from bid_records where id=new.bid_id and workspace_id=new.workspace_id for update;
  else
    bid := new;
  end if;
  if bid.applied_at is null or bid.deleted_at is not null then return new; end if;
  days := company_reset_days(bid.workspace_id,bid.company);
  if days is null then return new; end if;
  for profile in select profile_id from bid_record_profiles
    where workspace_id=bid.workspace_id and bid_id=bid.id order by profile_id loop
    perform pg_advisory_xact_lock(hashtextextended(bid.workspace_id::text || profile::text || company_reset_key(bid.company),0));
    if exists(select 1 from bid_records h join bid_record_profiles p
      on p.bid_id=h.id and p.workspace_id=h.workspace_id
      where h.workspace_id=bid.workspace_id and h.id<>bid.id and p.profile_id=profile
        and company_reset_key(h.company)=company_reset_key(bid.company) and h.deleted_at is null
        and h.applied_at > bid.applied_at-days*interval '24 hours'
        and h.applied_at < bid.applied_at+days*interval '24 hours') then
      raise exception using errcode='PT409',message=format('Company reset period of %s days applies to this profile.',days);
    end if;
    delete from bid_eligibility_cache cache using bid_records candidate,bid_record_profiles link
      where cache.workspace_id=bid.workspace_id and candidate.workspace_id=cache.workspace_id and candidate.id=cache.bid_id
      and company_reset_key(candidate.company)=company_reset_key(bid.company)
      and link.workspace_id=cache.workspace_id and link.bid_id=cache.bid_id and link.profile_id=profile;
  end loop;
  return new;
end; $$;
create trigger bid_company_reset after update of applied_at,company,deleted_at on public.bid_records
  for each row when (new.applied_at is distinct from old.applied_at or new.company is distinct from old.company
  or new.deleted_at is distinct from old.deleted_at) execute function public.enforce_company_reset();
create trigger profile_company_reset after insert or update of profile_id,bid_id on public.bid_record_profiles
  for each row execute function public.enforce_company_reset();

create function public.blocked_company_reset_exports(p_workspace_id uuid,p_bid_ids uuid[]) returns table(id uuid)
language sql stable set search_path=public as $$
  select b.id from bid_records b cross join lateral (select company_reset_days(b.workspace_id,b.company) days) rule
  where b.workspace_id=p_workspace_id and b.id=any(p_bid_ids) and rule.days is not null
    and exists(select 1 from bid_record_profiles target join bid_record_profiles prior
      on prior.workspace_id=target.workspace_id and prior.profile_id=target.profile_id
      join bid_records h on h.workspace_id=prior.workspace_id and h.id=prior.bid_id
      where target.workspace_id=b.workspace_id and target.bid_id=b.id and h.id<>b.id
      and company_reset_key(h.company)=company_reset_key(b.company) and h.deleted_at is null
      and h.applied_at<=now() and h.applied_at>now()-rule.days*interval '24 hours');
$$;
revoke all on function public.blocked_company_reset_exports(uuid,uuid[]), public.company_reset_days(uuid,text), public.enforce_company_reset() from public,anon,authenticated;
grant execute on function public.blocked_company_reset_exports(uuid,uuid[]), public.company_reset_days(uuid,text), public.enforce_company_reset() to service_role;
notify pgrst,'reload schema';
