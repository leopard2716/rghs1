alter table public.tracking_profiles
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists gender text,
  add column if not exists date_of_birth date,
  add column if not exists email text,
  add column if not exists phone_number text,
  add column if not exists street text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists linkedin_url text,
  add column if not exists education_university text,
  add column if not exists education_location text,
  add column if not exists education_degree text,
  add column if not exists education_date_from date,
  add column if not exists education_date_to date,
  add column if not exists career_experiences jsonb default '[]'::jsonb,
  add column if not exists resume_html_template text,
  add column if not exists resume_tailoring_note text;

update public.tracking_profiles
set career_experiences = '[]'::jsonb
where career_experiences is null;

alter table public.tracking_profiles
  alter column career_experiences set default '[]'::jsonb,
  alter column career_experiences set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tracking_profiles_gender_check'
      and conrelid = 'public.tracking_profiles'::regclass
  ) then
    alter table public.tracking_profiles
      add constraint tracking_profiles_gender_check
      check (gender is null or gender in ('man', 'woman'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tracking_profiles_education_date_range_check'
      and conrelid = 'public.tracking_profiles'::regclass
  ) then
    alter table public.tracking_profiles
      add constraint tracking_profiles_education_date_range_check
      check (
        education_date_from is null
        or education_date_to is null
        or education_date_to >= education_date_from
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tracking_profiles_career_experiences_array_check'
      and conrelid = 'public.tracking_profiles'::regclass
  ) then
    alter table public.tracking_profiles
      add constraint tracking_profiles_career_experiences_array_check
      check (jsonb_typeof(career_experiences) = 'array');
  end if;
end
$$;

comment on column public.tracking_profiles.name is
  'Original profile name used by tracking records, imports, and history labels.';
comment on column public.tracking_profiles.gender is
  'Profile gender selection. Accepted values are man and woman.';
comment on column public.tracking_profiles.career_experiences is
  'Repeatable profile career entries stored as an ordered JSON array.';
comment on column public.tracking_profiles.resume_html_template is
  'Workspace-admin managed resume HTML template for this profile.';
comment on column public.tracking_profiles.resume_tailoring_note is
  'Workspace-admin managed resume tailoring notes for this profile.';
