alter table public.apply_assistant_sessions
  add column if not exists step_snapshots jsonb not null default '[]'::jsonb;

update public.apply_assistant_sessions
set step_snapshots = jsonb_build_array(page_snapshot)
where page_snapshot is not null
  and jsonb_array_length(step_snapshots) = 0;

alter table public.apply_assistant_sessions
  drop constraint if exists apply_assistant_sessions_step_snapshots_array_check;

alter table public.apply_assistant_sessions
  add constraint apply_assistant_sessions_step_snapshots_array_check check (
    jsonb_typeof(step_snapshots) = 'array'
  );

comment on column public.apply_assistant_sessions.step_snapshots is
  'Ordered page snapshots extracted across a manual multi-step job application.';

notify pgrst, 'reload schema';
