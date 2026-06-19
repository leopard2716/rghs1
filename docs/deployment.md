# RGHS1 Deployment

This project is prepared for a free-friendly deployment:

```txt
GitHub repository
Cloudflare Worker       apps/api
Cloudflare Pages        apps/web
Supabase                Postgres/Auth
Cloudflare R2           resume and document storage
Resend                  transactional email
```

## 1. Push to GitHub

Create an empty GitHub repository named `rghs1`, then run:

```bash
git remote add origin https://github.com/<your-user-or-org>/rghs1.git
git branch -M main
git add .
git commit -m "Initial RGHS1 scaffold"
git push -u origin main
```

## 2. Create Supabase Project

Create one Supabase project, then apply versioned migrations with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
npx supabase migration list
```

Required values:

```txt
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Keep the service role key server-side only.

Create your first Supabase Auth user. After configuring the root `.env`, bootstrap it by email:

```bash
npm run bootstrap:platform-admin -- user@example.com
```

Enable TOTP MFA in Supabase Auth:

```txt
Authentication -> Multi-Factor Authentication -> App Authenticator (TOTP)
Enable enrollment
Enable verification
```

Set Auth URL Configuration:

```txt
Authentication -> URL Configuration
Site URL: https://<your-production-frontend-domain>
Redirect URLs:
  https://<your-production-frontend-domain>/**
  http://127.0.0.1:5173/**
  http://localhost:5173/**
```

The Site URL controls the default password recovery destination. New MFA enrollment requests
also provide the current frontend origin explicitly as the TOTP issuer.

## 3. Create R2 Buckets

Create these Cloudflare R2 buckets:

```txt
rghs1-resumes
rghs1-resumes-preview
```

The Worker binding is already configured in:

```txt
apps/api/wrangler.toml
```

## 4. Deploy API Worker

Install Wrangler login locally:

```bash
npx wrangler login
npm run deploy --workspace @rghs1/api
```

Set Worker secrets:

```bash
npx wrangler secret put SUPABASE_URL --config apps/api/wrangler.toml
npx wrangler secret put SUPABASE_ANON_KEY --config apps/api/wrangler.toml
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config apps/api/wrangler.toml
npx wrangler secret put RESEND_API_KEY --config apps/api/wrangler.toml
```

Update `ALLOWED_ORIGINS` in `apps/api/wrangler.toml` to include the Cloudflare Pages URL after the web app is created.

`apps/api/wrangler.toml` includes an hourly cron trigger. The scheduled Worker purges tenants whose 24-hour deletion grace period has expired.

## 5. Deploy Web to Cloudflare Pages

Create a Cloudflare Pages project from the GitHub repo:

```txt
Project name: rghs1-web
Root directory: apps/web
Build command: npm run build --workspace @rghs1/web
Build output directory: apps/web/dist
```

Set this Pages environment variable:

```txt
VITE_API_BASE_URL=https://<your-worker-url>
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## 6. GitHub Actions Secrets

For `.github/workflows/deploy-cloudflare.yml`, add repository secrets:

```txt
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Add repository variable:

```txt
VITE_API_BASE_URL
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Notes

The global admin portal is available at `/admin`. Demo preview data has been removed. Global admin
creation, tenant monitoring, workspace-admin assignment, tenant soft deletion/cancel, MFA-gated
login, regular workspace registration, member approval, and workspace role assignment are
implemented. Migrations `0007` and `0008` add tracking relationships and analytics support.
Migrations `0011` and `0012` convert legacy encrypted tracking records to typed plaintext columns,
add indexed search/sort paths, and remove encrypted envelopes. Migration `0009_remove_viewer_role.sql` removes the
unused viewer role and its existing member assignments. Migration
`0010_realtime_notifications_and_profile_requests.sql` adds tenant-scoped durable notifications,
Supabase Realtime publication, and CSV profile approval requests.

For a database containing tracking data, the first `npx supabase db push` applies migration `0011`
and intentionally stops at guarded migration `0012`. Keep the legacy `ENCRYPTION_MASTER_KEY` in the
root `.env`, run `npm run migrate:tracking-plaintext`, then rerun `npx supabase db push`. Remove the
legacy key after `0012` succeeds. Empty databases apply both migrations directly.

For regular workspace registration, disable Confirm email in the Supabase Email provider. RGHS1
uses the short-lived signup session to create a pending membership and signs it out immediately.
