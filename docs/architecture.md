# RGHS1 Architecture

## Tenant Model

`workspace = tenant`.

Users can log in globally and belong to multiple workspaces. Location is not used for access decisions. Authorization is based on workspace membership and role permissions.

One Supabase Auth identity may represent different tenant-local users. `workspace_members.id` is
the user identity inside a workspace, while `workspace_members.auth_user_id` is only the private
link to Supabase Auth. The same email can therefore have unrelated names, roles, status, and
activity in different workspaces and can separately be a platform admin.

Password and TOTP factors belong to the global Auth identity. Workspace authorization never derives
from those credentials alone; it derives from the tenant-local membership and roles after
authentication.

Tenant frontend URLs use the workspace slug as the public nickname:

```txt
/{workspace_slug}
/{workspace_slug}/dashboard
```

The workspace id stays internal and is used for database isolation, joins, and audit history.

Frontend duty routes:

```txt
/admin/login
/admin/tenants
/admin/tenants/new
/{workspace_slug}
/{workspace_slug}/register
/{workspace_slug}/dashboard
/{workspace_slug}/profiles
/{workspace_slug}/bids
/{workspace_slug}/interviews
/{workspace_slug}/users
/recover
```

Workspace members with the `admin` role receive a mode switch between the normal workspace
dashboard and workspace administration. The Administration destination remains hidden from
members without the admin role, and the API independently enforces the same authorization.

React Router owns browser navigation and deep-link routing. Zustand owns authentication/session
state. TanStack Query owns remote server state, caching, and mutations. Component-local state is
reserved for transient form and presentation state.

Global admins can see tenant health, member status counts, and dates only. They are not workspace members by default, and they do not receive row-level access to tenant bid/interview data.

Tracking values use typed relational Postgres columns. Tenant isolation is enforced by
`workspace_id`, composite foreign keys, RLS, tenant-local ownership, and API authorization.
Plaintext storage enables indexed search, database sorting, bounded pagination, and direct
analytics. Supabase administrators, service-role holders, and backups can read this data.

Profile, bid, and interview deletion uses `deleted_at`. Profile deletion never removes bid-profile
assignments or interview history. Bid and interview deletion is authorized against
`created_by_member_id`, so ownership is tenant-local even when the same Auth identity belongs to
multiple workspaces.

The same email may be used in both contexts. If the email already exists in Supabase Auth, assigning it as a workspace admin links that existing auth user to the workspace without resetting the password. If the email is new, RGHS1 creates the auth user with a generated temporary password and requires a first-login password change.

Protected admin and workspace-access sessions require Supabase MFA at AAL2. First login after password auth shows the TOTP QR setup screen if the user has no verified factor. Later logins show the authenticator code challenge before protected dashboard access.

The frontend binds every stored session to an authentication scope: `admin` or
`workspace:{slug}`. Routes only consume a session with an exact scope match. Moving from global
admin to a workspace, or from one workspace to another, therefore requires authentication again;
navigation within the same workspace keeps the session.

TOTP enrollment uses the exact frontend login route as the issuer: `/admin` for global admin and
`/{workspace_slug}` for workspace users. Supabase Auth uses the authenticated user's email as the
TOTP account name. RGHS1 generates the displayed QR locally from Supabase's secret so a URL issuer
containing `http:` or `https:` cannot be misread as the TOTP label separator.

Workspace registration uses standard Supabase signup with Confirm email disabled. RGHS1 uses the
short-lived signup session only to create a `pending` member, then signs out immediately. No
confirmation email is sent and no registration session remains in the browser. Workspace admins
approve, reject, disable, delete, and assign non-admin roles from `/{workspace_slug}/users`.
The current admin is included in the member list and can assign bidder/interviewer roles to
themself, but cannot approve, reject, disable, or delete their own membership. The `admin` role is
preserved by the backend and is not assignable through workspace user management.
Existing Supabase identities join additional workspaces through the same registration route; RGHS1
creates another tenant-scoped membership instead of another Auth user.

The workspace membership endpoint checks only the current user's approval state with an AAL1
password session. Pending, rejected, and disabled users see their status before MFA. Only active
members continue to TOTP setup or challenge. The full workspace session, roles, onboarding state,
and protected workspace operations require AAL2.

Tenant deletion is a lifecycle state on `workspaces`, not an immediate destructive action. Global admin sets `deleted_at`, `deletion_requested_at`, and `deletion_scheduled_at`; tenant URLs stop resolving while `deleted_at` is set. Global admin can clear the deletion fields before `deletion_scheduled_at`. Expired deleted workspaces are purged through the admin overview, the protected purge endpoint, or the deployed Worker cron trigger, and database cascades remove tenant-owned rows.

See [tenant-isolation.md](tenant-isolation.md) for the physical database isolation strategy.

## Module Boundaries

The codebase starts as a modular monorepo:

```txt
apps/
  api/     Cloudflare Worker API
  web/     React portal

packages/
  domain/  shared business types, permissions, workflow rules
```

Backend source layout:

```txt
apps/api/src/
  app.ts               composition root only
  app.types.ts         Worker bindings and Hono variables
  auth/                Supabase Auth user lookup
  config/              environment parsing
  features/
    admin/             global admin routes, schemas, service, tenant health
    files/             resume upload route and R2 upload service
    health/            health endpoint
    notifications/     durable scoped notifications and realtime delivery
    tracking/          profiles, markets, bids, interviews, query builders, mappers, and analytics
    workspace/         workspace membership and administration
  infrastructure/      external adapters such as Supabase REST
  middleware/          CORS, dev actor, global-admin auth
  utils/               small pure helpers
```

Frontend source layout:

```txt
apps/web/src/
  App.tsx              app composition, navigation, auth callback handling
  components/shared/   reusable UI components
  features/
    admin/             global admin pages/components
    landing/           product landing page
    setup/             setup-required state
    workspace/         workspace dashboard, tables, modals, metrics
  routing/             named paths and browser route composition
  services/            API/Auth service functions
  stores/              client-owned application state
  utils/               pure form/date/slug helpers
```

Job descriptions use Tiptap as a WYSIWYG editor and persist a restricted ProseMirror-compatible
JSON document. The shared domain schema accepts paragraphs, level-two/level-three headings,
bold/italic marks, ordered lists, bullet lists, and hard breaks. Rendering uses React elements
from that validated structure rather than raw HTML.

Supabase Realtime is used only as the delivery signal. Notifications remain durable Postgres rows,
and each recipient gets an independent row with tenant-aware RLS. On receipt, the frontend
invalidates active TanStack Query data so workflow screens refresh through the authorized API
instead of trusting the realtime payload as business data.

Each backend feature should keep this boundary:

```txt
schemas          request validation
routes           HTTP handlers only
service          use cases and business rules
types            feature DTOs / persistence row types
utils            pure helpers local to the feature
infrastructure   external adapters shared across features
```

The tracking feature additionally separates HTTP query construction and persistence-row mapping
from the use-case service. The service coordinates authorization and workflows; mapper and query
builder classes own deterministic transformation and indexed query construction.

## RBAC

Use permission strings, not hardcoded role names, for authorization decisions.

Default workspace roles:

```txt
admin
bidder
interviewer
```

Examples:

```txt
application:create
application:update
interview:create
workspace:manage
member:invite
global:tenant.view
```

## Data Rules

Every tenant-owned table must have:

```txt
workspace_id
created_by
created_at
updated_at
deleted_at
```

Tenant-to-tenant references use composite foreign keys containing `workspace_id`. The database
rejects cross-workspace joins and RLS rejects cross-workspace access even if a bug exists in the
API.

## Service Split Strategy

Start as a modular monolith. Split physical services only when there is a proven scaling or team-ownership need.

Likely future service boundaries:

```txt
identity-service
workspace-service
application-service
interview-service
file-service
notification-service
admin-service
```
