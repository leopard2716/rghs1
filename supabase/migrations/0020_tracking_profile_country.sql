alter table public.tracking_profiles
  add column if not exists country text;

comment on column public.tracking_profiles.country is
  'Profile address country.';
