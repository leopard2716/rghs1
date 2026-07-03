alter table public.workspace_members
  add column if not exists avatar_storage_key text,
  add column if not exists avatar_mime_type text,
  add column if not exists avatar_updated_at timestamptz;

comment on column public.workspace_members.avatar_storage_key is
  'Private object storage key for the tenant-local member avatar.';
comment on column public.workspace_members.avatar_mime_type is
  'MIME type for the current member avatar object.';
comment on column public.workspace_members.avatar_updated_at is
  'Timestamp used by the frontend to refresh cached member avatars.';
