alter table public.bid_records
  add column if not exists application_metadata jsonb;

alter table public.bid_record_profiles
  add column if not exists resume_html text;

comment on column public.bid_records.application_metadata is
  'Apply Assistant source snapshot, extracted job, field map, and selected resume metadata saved with the bid.';

comment on column public.bid_record_profiles.resume_html is
  'Sanitized tailored resume HTML selected for this profile and bid.';
