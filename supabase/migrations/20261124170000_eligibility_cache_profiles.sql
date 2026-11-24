-- A cache entry is valid only for the profile links used to compute its history.
-- Leave existing entries NULL so the first read recomputes them with the current links.
alter table public.bid_eligibility_cache add column profile_ids uuid[];
notify pgrst, 'reload schema';
