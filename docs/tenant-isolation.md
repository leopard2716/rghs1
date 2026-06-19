# Tenant Isolation

The product model is:

```txt
tenant = workspace
```

The logical structure is:

```txt
tenant1 / workspace_id = uuid-a
  tracking profiles
  resumes
  bids
  interviews
  notifications

tenant2 / workspace_id = uuid-b
  tracking profiles
  resumes
  bids
  interviews
  notifications
```

In the MVP database, that logical tree is implemented with shared tables and `workspace_id`:

```txt
job_applications
  row 1 -> workspace_id uuid-a
  row 2 -> workspace_id uuid-a
  row 3 -> workspace_id uuid-b
```

Supabase Row Level Security enforces that users can only read/write rows for workspaces where they are active members.

## Identity Model

Supabase Auth is global authentication only. `workspace_members.id` is the tenant-local user
identity:

```txt
auth.users
  person@example.com
    -> workspace A / member-a / admin / "Acme Administrator"
    -> workspace B / member-b / bidder / "Bidder Team User"
    -> platform_admins / global monitoring access
```

The memberships have independent display names, statuses, roles, onboarding, and audit identities.
Deleting or disabling a membership affects only that workspace. Workspace APIs expose the local
membership id and do not expose the global Auth UUID.

Because the email maps to one Supabase Auth identity, its password and TOTP factors remain global
authentication credentials. They do not grant tenant access by themselves; every request must
resolve an active membership in the requested workspace. Separate passwords or MFA factors for the
same email would require separate Auth identities or separate Supabase projects per tenant.

Soft-deleted workspaces are treated as inaccessible tenants. The `is_workspace_member()` RLS helper checks `workspaces.deleted_at is null`, so members lose direct table access while a tenant is waiting for permanent purge.

## Isolation Levels

Recommended MVP:

```txt
shared database
shared schema
workspace_id on every tenant-owned table
RLS policies for isolation
composite foreign keys on (workspace_id, referenced_id)
```

Migration `0006_tenant_identity_and_relational_isolation.sql` also prevents a profile, resume,
application, interview, member-role assignment, or onboarding row from referencing another
workspace. Platform-admin tokens have no direct RLS access to tenant rows; global monitoring uses
the backend service layer and returns aggregate operational metadata only.

Migrations `0007` and `0008` introduced the tracking relationships. Migrations `0011` and `0012`
convert tracking values to typed plaintext columns and remove the legacy encrypted envelopes.
An interview's profile must still be assigned to its bid in the same workspace. Each optional
resume is stored on that tenant-scoped bid/profile assignment.

Plaintext storage does not weaken tenant routing or foreign-key isolation, but it changes who can
read content: Supabase administrators, service-role holders, and database backups can inspect it.
Production access to those capabilities must be restricted and audited.

Tracking deletions are soft deletions scoped by `workspace_id`. Profile deletion leaves
`bid_record_profiles` and `interview_records` untouched for historical display. Bid and interview
deletion additionally filters by `created_by_member_id`, preventing one tenant-local member from
deleting another member's records.

Future enterprise option:

```txt
separate database or Supabase project per enterprise tenant
```

Avoid schema-per-tenant at this stage. It makes migrations, reporting, auth, and free-tier deployment harder without giving enough benefit for an early startup.

## Current Tables

These are tenant-owned and must always carry `workspace_id`:

```txt
workspace_members
workspace_roles
workspace_role_permissions
workspace_member_roles
workspace_member_onboarding
job_markets
profiles
files
resumes
job_applications
interviews
notifications
audit_logs
tracking_profiles
tracking_profile_requests
bid_records
bid_record_profiles
interview_records
```

Older databases may still contain the original `alerts` table from migration `0001`; the
application no longer reads or writes it. Durable recipient-scoped notifications replace that
feature without destructively dropping historical rows.

These are platform/global:

```txt
platform_admins
workspaces
login_events
```
