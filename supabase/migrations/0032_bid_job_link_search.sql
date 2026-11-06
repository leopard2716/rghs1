create index if not exists idx_bid_records_job_link_search
on public.bid_records
using gin (job_link extensions.gin_trgm_ops)
where deleted_at is null;
