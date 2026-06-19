# Local App With Cloud Supabase

Use this when local Supabase/Docker is unreliable.

## 1. Supabase Cloud

Create a cloud Supabase project, then link and migrate it through the CLI:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase migration list
```

This includes:

```txt
0004_workspace_member_registration.sql
0005_repair_workspace_member_status_constraint.sql
0006_tenant_identity_and_relational_isolation.sql
0007_encrypted_bid_interview_tracking.sql
0008_tracking_markets_descriptions_and_analytics.sql
0009_remove_viewer_role.sql
0010_realtime_notifications_and_profile_requests.sql
0011_plaintext_tracking_columns.sql
0012_finalize_plaintext_tracking.sql
```

If the project already contains tracking records, migration `0012` stops until the legacy
encrypted values are converted:

```powershell
npx supabase db push
npm run migrate:tracking-plaintext
npx supabase db push
npx supabase migration list
```

Keep the old `ENCRYPTION_MASTER_KEY` in the root `.env` only while running the one-time conversion.
After migration `0012` succeeds, remove that key. A new or empty project does not need the key or
the conversion command.

Create a Supabase Auth user:

```txt
Authentication -> Users -> Add user
```

After the root `.env` contains the new project URL and service-role key, bootstrap the global
admin by email:

```powershell
npm run bootstrap:platform-admin -- user@example.com
```

The command looks up the Auth user and idempotently upserts the RGHS1 `platform_admins` row.

Enable TOTP MFA in Supabase Auth:

```txt
Authentication -> Multi-Factor Authentication -> App Authenticator (TOTP)
Enable enrollment
Enable verification
```

Disable signup email confirmation:

```txt
Authentication -> Providers -> Email
Confirm email: Off
```

Configure Supabase Auth URLs:

```txt
Authentication -> URL Configuration

Site URL:
http://127.0.0.1:5173

Redirect URLs:
http://127.0.0.1:5173/**
http://localhost:5173/**
```

When the frontend is deployed, replace the Site URL with the production frontend URL and keep
the local URLs in the Redirect URLs list. Supabase Cloud does not read `supabase/config.toml`.
Previously generated password recovery emails and MFA QR codes keep their old URL or issuer;
request a new recovery email or start a new MFA enrollment after changing the setting.

## Apply Tenant Deletion Migration

If the admin dashboard reports that `workspaces.deletion_requested_at` does not exist, push the
pending migration through the linked CLI project:

```powershell
npx supabase db push
npx supabase migration list
```

The API can load tenant health against the older schema, but tenant deletion remains disabled
until this migration is applied.

## Repair Workspace Registration Status

If registration reports `workspace_members_status_check`, the cloud database still has the old
member-status constraint. Push the repair migration:

```powershell
npx supabase db push
npx supabase migration list
```

Verify that `0005_repair_workspace_member_status_constraint.sql` is applied. The failed signup may
already exist in Supabase Auth; refresh the workspace registration page after the migration so
RGHS1 reuses that account and creates its pending membership.

## Apply Tenant Identity Isolation

Migration `0006_tenant_identity_and_relational_isolation.sql` makes workspace membership the
tenant-local user identity and adds composite tenant foreign keys:

```powershell
npx supabase db push
npx supabase migration list
```

The migration intentionally stops if existing rows contain cross-workspace references. Do not
manually mark it applied when that happens; inspect and correct the reported data first.

## 2. Local Env

Create root `.env`:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
VITE_API_BASE_URL=http://127.0.0.1:8787
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Create `apps/web/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8787
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Do not put `SUPABASE_SERVICE_ROLE_KEY` in any frontend env file.

## 3. Run

After pulling code changes that add dependencies, run:

```powershell
npm install
```

Terminal 1:

```powershell
npm run dev --workspace @rghs1/api
```

Terminal 2:

```powershell
npm run dev --workspace @rghs1/web
```

Open:

```txt
http://127.0.0.1:5173/admin
```

## 4. Current Feature

Global admin can:

```txt
sign in with Supabase Auth email/password
set up QR-code TOTP MFA on first login
verify TOTP MFA on later logins
create workspaces
view tenant health
view workspace user status counts
view workspace dates
assign a workspace admin by email
copy the generated one-time temporary password for brand-new auth users
mark a tenant for deletion
cancel tenant deletion before the 24-hour grace period ends
```

Workspace admin first sign-in:

```txt
open /WORKSPACE_SLUG
enter email plus temporary password if the auth user is new
or enter the existing password if the same email already has an account
set up or verify TOTP MFA
set a new password before opening the workspace dashboard only when a temporary password was generated
```

Sessions are workspace-specific in the frontend. Opening another workspace slug, or moving between
a workspace and `/admin`, shows that destination's login page even when another portal session is
still active.

Password recovery:

```txt
Open the profile icon and choose Password recovery, or use Forgot password on a sign-in page.
Submit the account email.
Open the newest recovery email.
The /recover page consumes the Supabase recovery session.
Complete MFA.
Set and confirm a new password.
Sign in again with the new password.
```

Regular workspace registration:

```txt
Open /WORKSPACE_SLUG and choose Create account.
Submit display name, email, and password.
Wait for workspace-admin approval.
Workspace admin opens /WORKSPACE_SLUG/users, approves the member, and assigns roles.
Sign in after approval.
Set up or verify TOTP MFA.
Enter the workspace.
```

When the browser already has a valid Supabase session, `/WORKSPACE_SLUG/register` reuses that
identity and only asks for the workspace display name.

RGHS1 uses standard Supabase signup. Confirm email must remain off so signup returns a temporary
session without sending confirmation mail. RGHS1 creates the pending membership and immediately
signs that session out.

Tenant deletion:

```txt
Delete marks the workspace as deleted immediately.
The workspace URL is hidden from tenant users while deleted_at is set.
Global admin can cancel deletion until deletion_scheduled_at.
Expired deleted workspaces are permanently purged when the admin overview loads, when POST /v1/admin/workspaces/purge-deleted is called, or by the deployed Worker cron trigger.
```
