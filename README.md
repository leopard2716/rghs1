# RGHS1

RGHS1 is a multi-tenant bid and interview tracking portal. Each workspace is a tenant with its own members, roles, profiles, job markets, resumes, job applications, interviews, notifications, and audit history.

## Stack

- Frontend: React, TypeScript, Vite, React Router, Zustand, TanStack Query, lucide-react
- API: Hono on Cloudflare Workers
- Database/Auth target: Supabase Postgres/Auth with Row Level Security
- File storage target: Cloudflare R2
- Tests: Vitest
- CI/CD: GitHub Actions, Cloudflare Workers, Cloudflare Pages

## Local Start

```bash
npm install
npm run dev
```

The web app runs on `http://127.0.0.1:5173`. The Worker API runs on `http://localhost:8787`.

The local app uses your cloud Supabase project for Auth and Postgres. Copy `.env.example` to `.env`, then set:

```txt
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_BASE_URL
```

Open the global admin portal at `http://127.0.0.1:5173/admin`.

For a Supabase project that already contains encrypted tracking records:

```bash
npx supabase db push
npm run migrate:tracking-plaintext
npx supabase db push
```

The first push applies the plaintext columns and intentionally stops before removing legacy
envelopes. Keep the old `ENCRYPTION_MASTER_KEY` in `.env` only for the conversion command, then
remove it after the second push succeeds. New or empty projects only need `npx supabase db push`.

Primary duty routes:

```txt
/admin/login
/admin/tenants
/admin/tenants/new
/{workspace-slug}
/{workspace-slug}/register
/{workspace-slug}/dashboard
/{workspace-slug}/profiles
/{workspace-slug}/bids
/{workspace-slug}/interviews
/{workspace-slug}/users
/recover
```

Global admin sign-in uses Supabase email/password auth, then QR-code TOTP MFA. Protected admin and
workspace operations require an AAL2 Supabase session; the current user's workspace membership
status is checked at AAL1 so pending users do not set up MFA before approval.

Authenticator entries use the exact login URL as issuer and the signed-in email as account name.
RGHS1 generates the displayed QR locally from the Supabase-issued secret to preserve both values.

Promote an existing Supabase Auth user without manual SQL:

```bash
npm run bootstrap:platform-admin -- user@example.com
```

Workspace admins sign in from `http://127.0.0.1:5173/{workspace-slug}` with email/password. Brand-new workspace admin accounts receive a generated temporary password, set up or verify TOTP MFA, and must replace the temporary password before the workspace dashboard opens. Existing auth users, including the same email used for global admin, keep their current password.

Browser sessions are portal-scoped. An admin session, a session for workspace A, and a session for
workspace B are separate login contexts. Opening another workspace ignores the current context and
requires email/password authentication again.

Regular users register at `/{workspace-slug}/register`. Registration creates a pending workspace
membership through standard Supabase signup with Confirm email disabled, so no confirmation email
is sent. The signup session is ended immediately. The user waits for a workspace admin to approve
the account and assign bidder or interviewer roles. On the first login after approval, the
user sets up TOTP MFA and enters the workspace.
An already signed-in Supabase user can register the same identity in another workspace without
creating a duplicate Auth account.

Workspace administration is split by duty:

```txt
/{workspace-slug}/dashboard   member overview
/{workspace-slug}/profiles    shared application profiles; admin creates
/{workspace-slug}/bids        bid records; bidder creates
/{workspace-slug}/interviews  interview records; interviewer creates
/{workspace-slug}/users       admin approval and role management
```

Workspace admins have a header mode switch between **Workspace** and **Administration**. This lets
an admin use the normal member dashboard and return to user management without changing accounts.
Regular users do not see the Administration destination.

Global admins can soft-delete tenants. A deleted tenant is hidden immediately, can be restored for 24 hours, and is permanently purged with tenant-owned database rows after the grace period by the admin overview purge or deployed Worker cron trigger.

Password recovery is available from the dashboard profile icon and both sign-in pages. Recovery
links return to `/recover`, require MFA, and then allow the user to set a new password. Every
password field includes a reveal/hide control.

The frontend requires the API. Demo preview data has been removed so missing auth/API wiring fails visibly during development.

## Verify

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
```

## Workspace Tenancy

The MVP uses one shared database and a shared schema. Tenant isolation is enforced by `workspace_id` plus Supabase RLS policies. Do not create one database per workspace for the MVP.

Supabase Auth identities are global, but workspace users are not. The same email can map to a
different `workspace_members.id`, display name, status, and role set in every workspace, and can
also be a global platform admin. Composite tenant foreign keys prevent records from referencing
another workspace.

Tracking data is stored in typed plaintext Postgres columns. Tenant isolation is enforced with
`workspace_id`, composite foreign keys, RLS, MFA-gated API authorization, and server-only service
credentials. Database administrators, service-role holders, and database backups can read tracking
content, so access to Supabase and production backups must be tightly controlled.

Interview schedules are saved as UTC start/end instants plus the selected IANA timezone. The
frontend defaults to the device timezone and converts locally, so no third-party timezone API is
required and daylight-saving transitions remain explicit.

Bid tables use indexed backend pagination, combined company/title search, profile and market
filters, and server-side sorting. The API fetches only the requested page and a bounded suggestion
set instead of loading the tenant's full bid history.

Bidder CSV imports support drag-and-drop preview, header mapping, a manually selected job market,
profile matching, and an optional mapped resume column for each selected profile. Users can exclude
detected profiles before importing; excluded profiles are removed from mixed-profile rows, while
rows containing only excluded profiles are skipped. Each imported row stores any non-empty resume
from that profile's assigned CSV column. Unknown CSV profile names can be submitted to workspace
admins for approval. Imports have no fixed
application row limit; parsing runs off the main thread and database writes are batched. Actual
maximum size is still bounded by browser memory and the cloud request-size limit. Already-created
rows are removed if a later batch fails. Bid dates may be mapped from full date/time values or
month/day-only values such as `1/26`; the importer provides a manual year for date values that omit
it.

Durable per-recipient notifications are stored in Postgres and delivered through Supabase Realtime.
Workspace events are scoped to the exact tenant, platform events are restricted to global admins,
and incoming events invalidate active frontend queries so other signed-in users see workflow
changes without manually refreshing. Priorities are critical, error, warning, info, and success.

Tracking deletion is history preserving. Workspace admins can soft-delete profiles, which removes
them from future bid/interview selection without removing their historical names. Bidders and
interviewers can soft-delete only bid or interview records created by their own tenant-local
member identity. Interviewers can also start scheduling directly from a specific bid row.

Clicking a bid or interview row opens its details. The creating bidder or interviewer can edit the
record while retaining the required role; ownership and `workspace_id` are rechecked by the API.

## Deployment

See [docs/deployment.md](docs/deployment.md).

## Architecture

See [docs/architecture.md](docs/architecture.md).
