alter table public.extension_tokens
  add column if not exists default_profile_id uuid,
  add column if not exists default_job_market_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'extension_tokens_default_profile_tenant_fkey'
      and conrelid = 'public.extension_tokens'::regclass
  ) then
    alter table public.extension_tokens
      add constraint extension_tokens_default_profile_tenant_fkey
      foreign key (workspace_id, default_profile_id)
      references public.tracking_profiles(workspace_id, id)
      on delete set null (default_profile_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'extension_tokens_default_job_market_tenant_fkey'
      and conrelid = 'public.extension_tokens'::regclass
  ) then
    alter table public.extension_tokens
      add constraint extension_tokens_default_job_market_tenant_fkey
      foreign key (workspace_id, default_job_market_id)
      references public.tracking_job_markets(workspace_id, id)
      on delete set null (default_job_market_id);
  end if;
end
$$;

comment on column public.extension_tokens.default_profile_id is
  'Default tracking profile selected when this extension token was generated.';
comment on column public.extension_tokens.default_job_market_id is
  'Default tracking job market selected when this extension token was generated.';

notify pgrst, 'reload schema';
