# Catalogue Figma Pipeline V1

## Goal
Add a production-ready `Figma` section inside Catalogue where users can submit HTML snippets and track conversion jobs until a Figma node URL is attached.

## UX in Scope
- New tab: `Catalogue > Figma`.
- Card list of requests with job status (`Queued -> Parsing -> Building -> Review -> Ready/Failed`).
- Empty state with `Create New`.
- Create modal with:
  - Optional component name
  - Optional project
  - Required HTML/Div code
  - Optional reference screenshot URL
- Admin controls (inside each card):
  - Change status
  - Attach node URL
  - Add notes/failure reason
  - Copy HTML or payload for build workers

## Data Model
SQL migration: `designer/sql/catalogue-figma-requests.sql`

Table: `public.catalogue_figma_requests`
- `id uuid primary key`
- `project_id uuid null references projects(id)`
- `title text null`
- `html_snippet text not null`
- `reference_image_url text null`
- `requested_by_user_id text not null`
- `requested_by_email text null`
- `status text not null default 'queued'`
- `node_url text null`
- `node_id text null`
- `file_key text null`
- `admin_notes text null`
- `error_message text null`
- `engine_payload jsonb not null default '{}'`
- `created_at timestamptz`
- `updated_at timestamptz`

## Frontend Components
- New component: `designer/src/components/CatalogueFigmaSection.tsx`
- Header tab update: `designer/src/components/CatalogueHeader.tsx`
- Section routing update: `designer/src/components/Catalogue.tsx`
- Styles: `designer/src/styles/catalogue-figma.scss`
- Entry import: `designer/src/catalogue-main.tsx`

## Current Behavior
- Non-admin users see their own requests.
- Admin users (existing team gate) can see and update all requests.
- List auto-refreshes every 12s.
- Cards show status message + linkouts + copy actions.
- Backend worker available: `scripts/figma-component-worker.mjs`
  - Claims `queued` requests
  - Generates parsing/build payload into `engine_payload`
  - Advances status to `review` (or `ready` if `FIGMA_WORKER_AUTO_READY=1`)
  - Moves to `failed` with `error_message` on processing errors

## Worker Runbook
- Required env:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Helpful commands:
  - `npm run worker:figma` (daemon)
  - `npm run worker:figma:once` (single pass)
  - `npm run worker:figma:selftest` (parser self-check without Supabase)

## V2 Recommendations
- Add server worker that consumes `queued` jobs and writes `engine_payload`, status updates, and final node links.
- Add job ownership fields (`assigned_to`, `started_at`, `completed_at`).
- Add screenshot upload (storage) in create modal, not only URL.
- Add row-level security policies per user/admin role.
