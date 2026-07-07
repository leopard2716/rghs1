# Apply Assistant Extension Guide

This story adds a browser extension that helps a workspace member apply from an external job page,
generate a tailored resume through the backend, autofill detected fields, and write the final bid
record back into RGHS1.

The current repo is a good fit for this as a new `apps/extension` workspace plus a new Worker
feature under `apps/api/src/features/apply-assistant`. Reuse the existing tenant model, MFA-gated
workspace authorization, tracking profiles, job descriptions, resume template fields, R2 storage,
and bid records.

## Story

As a bidder, I can open a job page, click the RGHS1 extension, review the detected job and form
fields, generate a profile-specific resume, optionally modify it with a prompt, autofill the
application form, and save the application into RGHS1.

## Recommended MVP Flow

```txt
Job page
  -> user clicks extension
  -> first run: user pastes the packaged RGHS1 extension token and clicks Next
  -> extension validates the token with the backend and loads workspace/member/profile/market context
  -> content script extracts visible job text, URL, title, fields, labels, and buttons
  -> extension sends a compact snapshot to RGHS1 API
  -> backend normalizes job description and creates an apply session
  -> backend generates tailored resume from tracking profile + resume template + JD
  -> extension shows split view: job page left, RGHS1 assistant/resume preview right
  -> user reviews, modifies prompt if needed, and selects a resume version
  -> user clicks autofill
  -> content script fills inputs and highlights low-confidence fields
  -> user confirms next/submit actions
  -> backend creates or updates the RGHS1 bid record with the selected profile and resume
```

Do not make hidden submissions in the MVP. Always require a user click before `Next` and especially
before `Submit`.

## Current Project Fit

- `apps/api` is the integration point for AI provider calls, extension tokens, apply sessions, R2
  writes, and bid creation.
- `apps/web` should get a small "Connect extension" and "Apply assistant settings" surface.
- `apps/extension` should contain Manifest V3 extension code.
- `packages/domain` should get shared permission names and DTO types only when those types are used
  by both API and extension/web.
- `tracking_profiles` already stores structured profile fields plus `resume_html_template` and
  `resume_tailoring_note`, so resume generation can start without a new profile model.
- `bid_records` and `bid_record_profiles.resume` already store job/application data and per-profile
  resume content. Add generated resume tables for versioning and PDF storage rather than overloading
  the current text field.

## Model Routing

Current OpenAI docs recommend GPT-5.5 as the flagship model for complex reasoning/coding and
GPT-5.4 mini or GPT-5.4 nano when optimizing for latency and cost. OpenAI also recommends the
Responses API for text generation apps, especially with reasoning models, and recommends Structured
Outputs over JSON mode when schema adherence matters.

Gemini is worth trying for low-reasoning extraction and classification. Current Gemini docs list
Gemini 3.1 Flash-Lite as a high-volume/simple-processing model and Gemini 2.5 Flash-Lite as a very
low-cost option. Gemini also supports structured JSON-schema outputs, which is the key requirement
for safe JD extraction and field-map outputs.

Use AI only where semantic judgment helps. Keep DOM scanning, input filling, clicking, PDF rendering,
auth, tenant checks, and persistence as normal code.

| Step                                         | Default model                   | Reasoning      | Why                                                                     |
| -------------------------------------------- | ------------------------------- | -------------- | ----------------------------------------------------------------------- |
| Job text cleanup and JD extraction           | `gemini-2.5-flash-lite`         | low            | Cheapest candidate for schema-first extraction after local DOM cleanup. |
| Company/title/location/skills classification | `gemini-2.5-flash-lite`         | low            | Short structured extraction with low risk and high volume potential.    |
| Form field semantic mapping                  | `gemini-3.1-flash-lite`         | low            | Cheap first pass for labels/options; fall back if confidence is low.    |
| Screening-question draft answers             | `gpt-5.4-mini`                  | medium         | Needs profile evidence matching and careful wording.                    |
| Resume tailoring first pass                  | `gpt-5.4-mini`                  | medium         | Best MVP balance for resume quality, speed, and cost.                   |
| Resume final polish / high-value jobs        | `gpt-5.5`                       | medium or high | Use only when the user selects "best quality" or confidence is low.     |
| Resume modification prompt                   | `gpt-5.4-mini`                  | medium         | Usually a constrained rewrite of an existing generated resume.          |
| Extraction or resume QA rubric               | `gemini-3.1-flash-lite`         | low            | Good low-cost validation path; compare against OpenAI in evals.         |
| Field/resume fallback                        | `gpt-5.4-nano` / `gpt-5.4-mini` | low/medium     | Keep a same-provider fallback for Gemini outages or weaker eval scores. |

Recommended launch configuration:

```txt
APPLY_ASSISTANT_EXTRACT_PROVIDER=gemini
APPLY_ASSISTANT_EXTRACT_MODEL=gemini-2.5-flash-lite
APPLY_ASSISTANT_FIELD_PROVIDER=gemini
APPLY_ASSISTANT_FIELD_MODEL=gemini-3.1-flash-lite
APPLY_ASSISTANT_RESUME_PROVIDER=openai
APPLY_ASSISTANT_RESUME_MODEL=gpt-5.4-mini
APPLY_ASSISTANT_PREMIUM_PROVIDER=openai
APPLY_ASSISTANT_PREMIUM_MODEL=gpt-5.5
```

Do not default to GPT-5.5 for every application. Use it as an upgrade path because the current
standard short-context pricing is much higher than mini/nano and Gemini Flash-Lite:

```txt
gpt-5.5                  input $5.00 / 1M, output $30.00 / 1M
gpt-5.4                  input $2.50 / 1M, output $15.00 / 1M
gpt-5.4-mini             input $0.75 / 1M, output $4.50 / 1M
gpt-5.4-nano             input $0.20 / 1M, output $1.25 / 1M
gemini-3.1-flash-lite    input $0.25 / 1M, output $1.50 / 1M
gemini-2.5-flash-lite    input $0.10 / 1M, output $0.40 / 1M
```

Do not plan the MVP around GPT-5.6. The current model page describes it as a preview for select
trusted partners, not a broadly available default.

Rough interactive cost target, assuming standard short-context prices:

```txt
JD extraction:       8k input + 1k output on Gemini 2.5 Flash-Lite ~= $0.0012
Field mapping:       6k input + 1k output on Gemini 3.1 Flash-Lite ~= $0.0030
Resume generation: 20k input + 4k output on GPT-5.4 mini           ~= $0.0330
Total MVP target per application before caching                    ~= $0.04
Premium GPT-5.5 resume pass with the same resume tokens             ~= $0.22
```

Actual costs depend on token count and selected service tier. Keep a per-workspace daily/monthly
budget and log provider, model, input tokens, output tokens, cached tokens, latency, and success
state.

## Cost and Speed Controls

- Extract a compact page snapshot locally before calling AI. Do not send the full HTML document by
  default.
- Use Gemini Flash-Lite or OpenAI nano for normalization first. Only call mini/flagship when needed.
- Put all providers behind one backend router. The extension should never know which model provider
  is selected.
- Cache static prompt sections and profile/resume template context. OpenAI prompt caching is
  automatic for prompts of 1024 tokens or longer; Gemini paid tier also supports context caching.
- Use provider-native structured outputs for extraction, field mapping, resume metadata, and QA
  results.
- Cap output tokens for extraction and field mapping aggressively.
- Store generated resume versions and reuse them during the same apply session.
- Avoid AI for button clicking and autofill. Local code should execute the already-reviewed field map.
- Run Batch/Flex only for offline evals or nightly quality checks, not for the live extension flow.
- Use the Gemini paid tier for production. The free tier is useful for development, but provider docs
  state free-tier content may be used to improve products.

## Backend Design

Add a new feature:

```txt
apps/api/src/features/apply-assistant/
  apply-assistant.routes.ts
  apply-assistant.schemas.ts
  apply-assistant.service.ts
  apply-assistant.types.ts
  apply-assistant.mapper.ts
  ai-provider.types.ts
  openai-ai.client.ts
  gemini-ai.client.ts
  apply-assistant-ai.router.ts
  apply-assistant.service.test.ts
  apply-assistant.schemas.test.ts
```

Register it in `apps/api/src/app.ts` after workspace/tracking routes are available.

Add Worker bindings:

```ts
OPENAI_API_KEY?: string;
GEMINI_API_KEY?: string;
APPLY_ASSISTANT_EXTRACT_PROVIDER?: string;
APPLY_ASSISTANT_EXTRACT_MODEL?: string;
APPLY_ASSISTANT_FIELD_PROVIDER?: string;
APPLY_ASSISTANT_FIELD_MODEL?: string;
APPLY_ASSISTANT_RESUME_PROVIDER?: string;
APPLY_ASSISTANT_RESUME_MODEL?: string;
APPLY_ASSISTANT_PREMIUM_PROVIDER?: string;
APPLY_ASSISTANT_PREMIUM_MODEL?: string;
EXTENSION_TOKEN_SECRET?: string;
```

Set `OPENAI_API_KEY`, `GEMINI_API_KEY`, and `EXTENSION_TOKEN_SECRET` as Wrangler secrets. Never
expose them to `apps/web` or `apps/extension`.

### Provider Router

Keep one internal interface for all AI calls:

```ts
type ApplyAssistantProvider = "openai" | "gemini";

type AiTask = "extract_job" | "map_fields" | "generate_resume" | "modify_resume" | "qa_resume";

type AiRequest<TInput> = {
  task: AiTask;
  provider: ApplyAssistantProvider;
  model: string;
  input: TInput;
  schemaName: string;
  jsonSchema: unknown;
};
```

Each adapter must return raw provider metadata plus parsed Zod-validated data. If validation fails,
retry once with a stricter repair prompt on the same provider; if it still fails, fall back to the
configured secondary provider.

### API Routes

Use the existing `/v1/workspaces/:slug/...` pattern.

```txt
POST /v1/workspaces/:slug/apply-assistant/connect
  Creates a one-time connection code from the signed-in web app.

POST /v1/workspaces/:slug/apply-assistant/token
  Exchanges the one-time code for an extension token.

GET /v1/apply-assistant/token-context
  Validates an extension token and returns safe workspace/member/profile/market context.

GET /v1/workspaces/:slug/apply-assistant/tokens
  Lists active extension-token metadata for the signed-in workspace member.

DELETE /v1/workspaces/:slug/apply-assistant/token/:tokenId
  Revokes an extension token.

POST /v1/workspaces/:slug/apply-assistant/sessions
  Creates an apply session from page snapshot + selected profile/market.

GET /v1/workspaces/:slug/apply-assistant/sessions/:sessionId
  Reads session state, extracted job, field map, resume versions.

POST /v1/workspaces/:slug/apply-assistant/sessions/:sessionId/field-map
  Generates or refreshes semantic field mapping.

POST /v1/workspaces/:slug/apply-assistant/sessions/:sessionId/resumes
  Generates a tailored resume version.

POST /v1/workspaces/:slug/apply-assistant/sessions/:sessionId/resumes/:versionId/modify
  Regenerates from a user modification prompt.

POST /v1/workspaces/:slug/apply-assistant/sessions/:sessionId/commit-bid
  Creates/updates the bid record and bid-profile resume snapshot.

POST /v1/workspaces/:slug/apply-assistant/sessions/:sessionId/events
  Stores extension events: autofill_started, next_clicked, submit_confirmed, failed, abandoned.
```

Current implementation status:

- Implemented:
  - `POST /v1/workspaces/:slug/apply-assistant/connect`
  - `POST /v1/workspaces/:slug/apply-assistant/token`
  - `GET /v1/apply-assistant/token-context`
  - `GET /v1/workspaces/:slug/apply-assistant/tokens`
  - `DELETE /v1/workspaces/:slug/apply-assistant/token/:tokenId`
  - `POST /v1/workspaces/:slug/apply-assistant/sessions`
  - `POST /v1/workspaces/:slug/apply-assistant/sessions/:sessionId/field-map`
- Implemented in web:
  - Workspace account page can generate an extension token, show it once, copy it, list active
    token metadata, and revoke active tokens.
  - Copied extension tokens are packaged as `rghs1-apply.<base64url-json>` and include API base URL,
    workspace, current member/user, selected profile, and selected job market. The backend still
    stores/verifies only the raw opaque token hash.
  - One workspace member can generate multiple active tokens with different stored default profiles
    and job markets; the active-token list shows those defaults.
- Implemented in extension:
  - First-run popup asks only for an extension token, then loads settings from token context.
  - Profile and job market are dropdowns backed by backend token context.
  - Settings can later edit API base URL, token, profile, and market.
  - Content script is built separately as an IIFE bundle to avoid Chrome's `Cannot use import
statement outside a module` content-script failure.
- Current field-map route is deterministic and conservative. It maps common profile fields from
  `tracking_profiles`, forces sensitive/screening fields into `user.review`, and always requires
  submit confirmation.
- AI provider routing, resume generation, PDF generation, bid commit, event storage, and web UI
  budget/settings controls are still next-phase work.

Use Zod schemas for every request and response. Validate selector strings, URL protocols, text
sizes, model tier, selected profile IDs, and prompt length.

### Authentication

The cleanest model for this repo:

1. User signs into RGHS1 web with normal Supabase session and AAL2.
2. User opens `/{workspace-slug}/account` or a new extension settings page.
3. Web app calls `POST /apply-assistant/connect`.
4. Backend creates a short-lived one-time code tied to `workspace_id`, `member_id`, and scopes.
5. Web app exchanges the one-time code for a raw opaque extension token.
6. Web app packages the raw token with non-secret connection context for copy/paste into the
   extension.
7. Extension stores the raw token, calls `/v1/apply-assistant/token-context`, and populates
   workspace/member/profile/market settings from the validated backend response.
8. Backend stores only a token hash, expiry, last-used time, workspace/member scope, and revocation
   state.

Extension token scope should be narrower than a full Supabase session:

```txt
workspace_id
member_id
default_profile_id
default_job_market_id
role/permission snapshot
scopes:
  apply_assistant:use
  application:create
  application:update
  resume:upload
expires_at
revoked_at
```

Continue to support normal Supabase bearer tokens for web. For extension endpoints, accept only
extension tokens or Supabase AAL2 tokens. Existing tracking routes can stay Supabase-token only
until they need direct extension access.

### CORS and Host Origins

Update `apps/api/wrangler.toml` after the production extension ID is fixed:

```txt
ALLOWED_ORIGINS = "https://rghs1-web-prod.pages.dev,chrome-extension://<extension-id>"
```

Route API calls through the extension background/service worker. Content scripts should message the
extension worker instead of calling the backend directly.

## Database Design

The current implementation uses `supabase/migrations/0018_apply_assistant_connect.sql` with:

```txt
extension_tokens
extension_connection_codes
apply_assistant_sessions
```

The future resume/version/event tables should be added once resume generation and bid commit are
implemented.

Longer-term recommended tables:

Recommended tables:

```sql
create table public.apply_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid,
  job_market_id uuid,
  selected_resume_version_id uuid,
  created_by_member_id uuid not null,
  page_url text not null,
  page_origin text not null,
  page_title text,
  company text,
  job_title text,
  job_description jsonb,
  extracted_job jsonb not null default '{}'::jsonb,
  field_map jsonb not null default '{}'::jsonb,
  confidence jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz,
  constraint apply_sessions_workspace_id_id_unique unique (workspace_id, id),
  constraint apply_sessions_status_check
    check (status in ('draft', 'reviewing', 'autofilled', 'submitted', 'committed', 'abandoned')),
  foreign key (workspace_id, profile_id)
    references public.tracking_profiles(workspace_id, id),
  foreign key (workspace_id, job_market_id)
    references public.tracking_job_markets(workspace_id, id),
  foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
);

create table public.generated_resume_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  apply_session_id uuid not null,
  profile_id uuid not null,
  model_id text not null,
  prompt_version text not null,
  source_template_hash text,
  user_prompt text,
  resume_html text not null,
  resume_text text,
  pdf_storage_key text,
  quality jsonb not null default '{}'::jsonb,
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint generated_resume_versions_workspace_id_id_unique unique (workspace_id, id),
  foreign key (workspace_id, apply_session_id)
    references public.apply_sessions(workspace_id, id),
  foreign key (workspace_id, profile_id)
    references public.tracking_profiles(workspace_id, id),
  foreign key (workspace_id, created_by_member_id)
    references public.workspace_members(workspace_id, id)
);

create table public.apply_session_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  apply_session_id uuid not null,
  actor_member_id uuid not null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, apply_session_id)
    references public.apply_sessions(workspace_id, id),
  foreign key (workspace_id, actor_member_id)
    references public.workspace_members(workspace_id, id)
);

create table public.extension_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  member_id uuid not null,
  token_hash text not null unique,
  scopes text[] not null,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, member_id)
    references public.workspace_members(workspace_id, id)
);

create table public.extension_connection_codes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  member_id uuid not null,
  code_hash text not null unique,
  scopes text[] not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, member_id)
    references public.workspace_members(workspace_id, id)
);

alter table public.apply_sessions
  add constraint apply_sessions_selected_resume_version_fkey
  foreign key (workspace_id, selected_resume_version_id)
  references public.generated_resume_versions(workspace_id, id);

alter table public.apply_sessions enable row level security;
alter table public.generated_resume_versions enable row level security;
alter table public.apply_session_events enable row level security;
alter table public.extension_tokens enable row level security;
alter table public.extension_connection_codes enable row level security;

create policy "members can read apply sessions"
on public.apply_sessions for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members can read generated resume versions"
on public.generated_resume_versions for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "members can read apply session events"
on public.apply_session_events for select to authenticated
using (public.is_workspace_member(workspace_id));
```

Every tenant-owned table must include `workspace_id`, RLS, and composite foreign keys that include
`workspace_id`, matching the existing architecture. Insert/update/delete can stay service-role only
at first because the Worker should enforce role permissions and extension-token scope before writing.

Possible later table:

```txt
job_site_selector_profiles
```

Use it to learn stable selectors for common ATS systems such as Greenhouse, Lever, Workday, Ashby,
and company-built pages. Keep it global or workspace-scoped depending on whether selectors include
tenant data. Store only selectors and success metrics, not user-entered answers.

## Extension Design

Create a new workspace:

```txt
apps/extension/
  package.json
  tsconfig.json
  vite.config.ts
  vite.content.config.ts
  public/manifest.json
  src/background/
  src/content/
  src/popup/
  src/side-panel/
  src/extractors/
  src/autofill/
  src/api/
  src/storage/
```

Manifest V3 components:

- Background service worker: owns API calls, extension token storage, model session messages, and
  tab coordination.
- Content script: reads the page DOM, extracts fields, highlights detected sections, fills fields,
  dispatches input/change events, and clicks only user-approved buttons.
- Popup: token-first connection, connected account summary, settings, and active-tab actions.
- Side panel or injected overlay: review JD, field map, resume preview, modify prompt, autofill,
  next/submit confirmation.

Current popup flow:

```txt
First open
  -> paste extension token
  -> Next
  -> backend token-context validation
  -> connected account summary

Later opens
  -> account summary
  -> optional Settings button for API base URL/token/profile/market edits
  -> Analyze tab / Open panel actions
```

Build note:

```txt
vite.config.ts           builds popup, side panel, and module service worker
vite.content.config.ts   builds src/content/content.ts as dist/assets/content.js IIFE
```

Chrome content scripts from `scripting.executeScript({ files: [...] })` are not loaded as ES
modules. If `dist/assets/content.js` starts with `import`, Chrome throws `Cannot use import
statement outside a module` and the popup's Analyze action will fail because no page snapshot is
returned. The current split build prevents that by bundling content script dependencies into one
plain script.

## Local Testing

Run the API and web app from the repo root:

```sh
npm run dev
```

Run the extension build watcher from `apps/extension`:

```sh
npm run dev
```

This now starts two watchers: one for popup/background/side-panel and one for the content-script
IIFE bundle. Load `apps/extension/dist` in Chrome at `chrome://extensions` with Developer mode
enabled. After any extension rebuild, click the extension reload button in Chrome.

Generate a token from the workspace account page:

```txt
/{workspaceSlug}/account -> Apply assistant extension -> choose default profile/market -> Generate token -> Copy
```

Then click the extension icon, paste the copied token, and click Next. If using a raw opaque token
instead of the packaged token, the extension defaults the API base URL to `http://localhost:8787`;
you can edit it later in Settings.

Chrome's docs describe content scripts as code that can read and modify web pages through the DOM
and message other extension parts. They also note that host permissions are required for URL
patterns the extension interacts with. Use the narrowest permissions that still support the product:

```json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "scripting", "storage", "sidePanel"],
  "host_permissions": [
    "https://*.greenhouse.io/*",
    "https://jobs.lever.co/*",
    "https://*.myworkdayjobs.com/*",
    "https://<api-host>/*"
  ]
}
```

Prefer `activeTab` plus user-triggered injection for broad job-page support. Add persistent
`host_permissions` only for sites where the extension needs automatic operation.

## Extraction Strategy

Run local extractors first:

```txt
1. Identify ATS/site family from URL and page markers.
2. Extract canonical URL, document title, headings, visible text, and JSON-LD job posting if present.
3. Find forms, inputs, labels, ARIA labels, placeholders, select options, file inputs, and buttons.
4. Generate stable element references:
   - CSS selector when stable
   - text label path
   - DOM index fallback
   - input name/id fallback
5. Redact password fields, hidden tokens, cookies, and page scripts.
6. Send compact snapshot to backend.
```

Then call AI for semantic normalization:

```json
{
  "jobTitle": "Senior Frontend Engineer",
  "company": "Acme",
  "location": "Remote",
  "employmentType": "Full-time",
  "requirements": [],
  "responsibilities": [],
  "skills": [],
  "jobDescriptionText": "...",
  "confidence": 0.91,
  "warnings": []
}
```

Low-confidence extraction should stop at review instead of autofilling.

## Field Mapping Strategy

Use deterministic mapping before AI:

```txt
email -> profile.email
phone -> profile.phoneNumber
first name -> profile.firstName
last name -> profile.lastName
linkedin -> profile.linkedinUrl
resume/cv upload -> generated resume file
cover letter -> optional generated cover letter
```

Use `gpt-5.4-mini` only for ambiguous or site-specific fields. The model should return a structured
map:

```json
{
  "fields": [
    {
      "elementRef": "field-12",
      "label": "LinkedIn Profile",
      "valueSource": "profile.linkedinUrl",
      "value": "https://linkedin.com/in/example",
      "confidence": 0.96,
      "requiresUserReview": false
    }
  ],
  "actions": {
    "nextButtonRef": "button-2",
    "submitButtonRef": "button-7",
    "submitRequiresConfirmation": true
  },
  "warnings": []
}
```

Never let the model provide executable JavaScript. It should return data only.

## Resume Generation Strategy

Input:

- `tracking_profiles` structured fields.
- `resume_html_template`.
- `resume_tailoring_note`.
- Normalized job description.
- User modification prompt, if any.

Output:

```json
{
  "resumeHtml": "<section>...</section>",
  "resumeText": "...",
  "changes": [
    "Moved React and TypeScript work higher.",
    "Added job-relevant cloud deployment bullet from existing profile notes."
  ],
  "missingEvidence": ["No profile evidence found for Kubernetes."],
  "warnings": [],
  "quality": {
    "jdCoverage": 0.86,
    "fabricationRisk": "low",
    "atsReadability": "good"
  }
}
```

Rules:

- Do not invent employers, degrees, dates, tools, certifications, or metrics.
- If the job asks for something not in the profile, either omit it or put it in `missingEvidence`.
- Preserve truthful chronology.
- Keep HTML to an allowlist of resume-safe tags and attributes.
- Store every generated version. Do not overwrite the previous version when the user modifies it.

### PDF Generation

Cloudflare Workers are not a full headless-browser runtime, so do not assume Puppeteer-style PDF
generation inside `apps/api`.

MVP options:

1. Generate sanitized resume HTML on the backend, render it in the extension split view, and let the
   extension create a `Blob`/`File` for upload when the site accepts it.
2. Use a browser-side PDF library in the extension for simple ATS-safe PDFs.
3. Add a small PDF rendering service later, or use a Cloudflare-compatible browser rendering
   product, then store `pdf_storage_key` in R2.

The existing `/v1/files/resumes` route uploads user-provided files to R2. Add a backend-side
generated-resume storage path for AI-created PDFs so the extension does not need direct R2 access.

## RGHS1 Web Changes

Add or modify:

- Account/settings page: "Connect browser extension", token list, revoke button.
- Workspace settings: apply assistant enabled/disabled, monthly budget, premium model toggle.
- Profiles page: improve `resume_html_template` editing with variable preview and template
  validation.
- Bids page: show source as `manual`, `csv`, or `extension`; show generated resume version and apply
  session link.
- Optional admin controls: allowed job domains, model tier defaults, budget usage.

## Permission Changes

Current permissions include `application:create`, `application:update`, and `resume:upload`. Add
extension-specific permissions if workspace admins need finer control:

```txt
"apply_assistant:use"
"apply_assistant:manage"
```

Default suggestion:

```txt
admin:  apply_assistant:manage, apply_assistant:use
bidder: apply_assistant:use
```

Keep actual bid creation authorized by `application:create`.

## Safety, Privacy, and Abuse Controls

- No OpenAI or Gemini key in the extension.
- No Supabase service role key outside the Worker.
- Treat job descriptions and page text as untrusted prompt input.
- Put job-page content in a delimited data block and tell the model it cannot override system or
  developer instructions.
- Store raw page snapshots only if needed for debugging, with a short TTL. Prefer storing normalized
  extracted job data.
- Do not collect job-site cookies, hidden inputs, CSRF tokens, password fields, or unrelated page
  content.
- Require user confirmation for submit.
- Add per-workspace model budgets and per-member rate limits.
- Track provider-level quality and cost separately so Gemini extraction can be disabled without
  changing the whole workflow.
- Add audit events for generation, autofill, next, submit confirmation, and bid commit.
- Validate generated HTML before rendering in web or extension.
- Keep user-visible warnings for low confidence, missing evidence, suspicious field maps, and
  blocked file-upload insertion.
- Some job sites may restrict automation. Keep the product user-driven and provide a manual fallback.

## Implementation Milestones

### Phase 1: Foundation

- Add `apps/extension` with Manifest V3, TypeScript, popup, background worker, and content script.
- Add extension connection flow and token table.
- Add `apply_sessions`, `generated_resume_versions`, and `apply_session_events`.
- Add `apply_assistant:use` and `apply_assistant:manage` if fine-grained permission is needed.
- Add API route skeleton and tests.

Acceptance:

```txt
Given an active workspace bidder,
when they connect the extension,
then the backend stores a revocable, scoped extension token.
```

### Phase 2: Page Extraction and Highlighting

- Extract visible job text and fields from the active tab.
- Create apply session.
- Normalize job description using the configured low-reasoning extraction provider, defaulting to
  `gemini-2.5-flash-lite`.
- Highlight detected job description, fields, file input, next button, and submit button.

Acceptance:

```txt
Given a supported job page,
when the user starts the assistant,
then the extension shows company, title, JD, fields, and confidence before autofill.
```

### Phase 3: Resume Tailoring and Review

- Generate resume HTML with `gpt-5.4-mini`.
- Show split view on the same page.
- Support user modification prompts.
- Store version history.
- Add PDF or file insertion fallback.

Acceptance:

```txt
Given a profile with a resume template,
when the user generates a resume,
then they can preview it, modify it, and select one version for the application.
```

### Phase 4: Autofill and Bid Commit

- Map fields deterministically and with AI fallback.
- Fill low-risk fields automatically after user approval.
- Require review for low-confidence fields.
- Require explicit confirmation for next/submit.
- Commit bid record using the existing tracking service behavior.

Acceptance:

```txt
Given a reviewed field map and selected resume,
when the user confirms autofill,
then fields are populated and the final RGHS1 bid record includes the job, profile, and resume.
```

### Phase 5: Hardening

- Add common ATS site adapters.
- Add budget/rate dashboards.
- Add eval fixtures for extraction, field mapping, and resume quality.
- Add extension e2e tests against static fixture pages.
- Prepare Chrome Web Store privacy disclosures and permission justifications.

## Test Plan

Backend:

- Zod schema tests for snapshots, field maps, resume requests, and extension tokens.
- Service tests for workspace isolation, permission checks, token expiry/revocation, and bid commit.
- OpenAI and Gemini adapter tests with mocked provider payloads.
- Provider-router tests for schema validation failure, retry, fallback, timeout, and token/cost
  logging.
- Migration tests or SQL review for RLS and composite FKs.

Extension:

- Unit tests for DOM extraction, selector generation, field filling, and event dispatching.
- Fixture pages for Greenhouse, Lever, Workday, Ashby, plain HTML, React forms, and file inputs.
- Manual tests for unsupported pages and low-confidence fallbacks.

Product quality:

- Golden JD extraction fixtures.
- Provider comparison fixtures for `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite`,
  `gpt-5.4-nano`, and `gpt-5.4-mini`.
- Resume rubric eval: truthful, ATS-readable, covers JD keywords, no fabricated claims.
- Track user edits after generation. High edit rate means prompt or model routing needs work.

## Features to Add or Modify

MVP features:

- Extension connect/revoke.
- Active-tab job extraction.
- Job description review.
- Profile and market selection.
- AI resume tailoring.
- Same-page split preview.
- Modification prompt.
- Autofill with highlighted detected fields.
- User-confirmed next/submit.
- Bid record creation/update.
- Generated resume history.

High-value next features:

- Cover letter generation.
- Screening-question answer drafts grounded in profile evidence.
- Duplicate company/job detection from existing bids.
- Apply-session timeline on the bid detail page.
- Team review before submit for sensitive profiles.
- ATS keyword coverage score.
- Job-site adapters with learned selector profiles.
- Per-workspace model budget controls.
- Premium model toggle per generation.
- Browser notification when a generated resume is ready.

Features to avoid in MVP:

- Fully automatic submit without user review.
- Storing full raw HTML long term.
- Direct OpenAI or Gemini calls from the extension.
- Direct R2 access from the extension.
- Computer-use style remote browser control for normal form filling.
- A one-model-does-everything workflow.
- Switching resume generation to Gemini by default before it beats or matches GPT-5.4 mini in the
  resume rubric eval.

## Source Links Checked

- OpenAI models: https://developers.openai.com/api/docs/models
- OpenAI pricing: https://developers.openai.com/api/docs/pricing
- OpenAI text generation and Responses API guidance: https://developers.openai.com/api/docs/guides/text
- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI prompt caching: https://developers.openai.com/api/docs/guides/prompt-caching
- Gemini models: https://ai.google.dev/gemini-api/docs/models
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini structured outputs: https://ai.google.dev/gemini-api/docs/structured-output
- Chrome content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome extension permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
