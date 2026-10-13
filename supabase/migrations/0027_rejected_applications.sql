alter table public.bid_records add column if not exists rejected_at timestamptz;
alter table public.bid_records add constraint bid_rejection_requires_applied
  check (rejected_at is null or applied_at is not null);
notify pgrst, 'reload schema';
