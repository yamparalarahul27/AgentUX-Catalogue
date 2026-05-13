-- RLS hardening — public-release readiness.
--
-- Closes the "back door" that lets anyone with the browser-bundle anon
-- key read, write, or delete catalogue data directly through the
-- Supabase REST API, bypassing the auth gate that the JS app enforces
-- client-side.
--
-- Three categories of fix:
--
--   1. Tables flagged by the Supabase linter as RLS-DISABLED — enable
--      RLS and add a permissive "any authenticated user" policy.
--
--   2. Tables that have "Allow all" policies for the `public` role —
--      drop those and replace with an authenticated-only equivalent.
--      ("Allow all" to `public` includes anon, so it's the same back
--      door even though RLS is technically on.)
--
--   3. Storage buckets — same pattern: drop public WRITE policies that
--      let any visitor upload or delete files, keep public READ where
--      the share page needs it.
--
-- Recommended design tier (Option A from docs/security-rls-public-release.md):
-- single auth gate + permissive RLS for authenticated users. Per-user
-- ownership policies are explicitly NOT part of this migration; if/when
-- the catalogue grows multi-tenant we'll revisit.
--
-- Companion code:
--   - docs/security-rls-public-release.md  — decision doc
--   - supabase/migrations/20260513_auth_passcodes.sql  — auth tables
--   - supabase/functions/auth-login/index.ts  — passcode redemption
--
-- Rollback notes:
--   To restore the pre-migration state on any table, the inverse is:
--     alter table public.X disable row level security;
--   To recreate an "Allow all" public policy:
--     create policy "Allow all" on public.X for all to public
--       using (true) with check (true);
--   The migration uses `drop policy if exists` + idempotent names so
--   re-running is safe.

-- ════════════════════════════════════════════════════════════════════
-- Section 1 — Enable RLS on the 11 currently-unprotected tables.
-- All get the same permissive policy: any authenticated user can do
-- anything. Anon users have no access at all on these tables.
-- ════════════════════════════════════════════════════════════════════

alter table public.catalogue_video_references enable row level security;
drop policy if exists authed_full_access on public.catalogue_video_references;
create policy authed_full_access on public.catalogue_video_references
  for all to authenticated using (true) with check (true);

alter table public.catalogue_video_comments enable row level security;
drop policy if exists authed_full_access on public.catalogue_video_comments;
create policy authed_full_access on public.catalogue_video_comments
  for all to authenticated using (true) with check (true);

alter table public.catalogue_link_references enable row level security;
drop policy if exists authed_full_access on public.catalogue_link_references;
create policy authed_full_access on public.catalogue_link_references
  for all to authenticated using (true) with check (true);

alter table public.catalogue_figma_requests enable row level security;
drop policy if exists authed_full_access on public.catalogue_figma_requests;
create policy authed_full_access on public.catalogue_figma_requests
  for all to authenticated using (true) with check (true);

alter table public.screenshot_annotations enable row level security;
drop policy if exists authed_full_access on public.screenshot_annotations;
create policy authed_full_access on public.screenshot_annotations
  for all to authenticated using (true) with check (true);

alter table public.screenshot_versions enable row level security;
drop policy if exists authed_full_access on public.screenshot_versions;
create policy authed_full_access on public.screenshot_versions
  for all to authenticated using (true) with check (true);

alter table public.screenshot_bookmarks enable row level security;
drop policy if exists authed_full_access on public.screenshot_bookmarks;
create policy authed_full_access on public.screenshot_bookmarks
  for all to authenticated using (true) with check (true);

alter table public.screenshot_comments enable row level security;
drop policy if exists authed_full_access on public.screenshot_comments;
create policy authed_full_access on public.screenshot_comments
  for all to authenticated using (true) with check (true);

alter table public.feature_log enable row level security;
drop policy if exists authed_full_access on public.feature_log;
create policy authed_full_access on public.feature_log
  for all to authenticated using (true) with check (true);

alter table public.feature_log_links enable row level security;
drop policy if exists authed_full_access on public.feature_log_links;
create policy authed_full_access on public.feature_log_links
  for all to authenticated using (true) with check (true);

alter table public.screen_families enable row level security;
drop policy if exists authed_full_access on public.screen_families;
create policy authed_full_access on public.screen_families
  for all to authenticated using (true) with check (true);

-- ════════════════════════════════════════════════════════════════════
-- Section 2 — Replace "Allow all" public policies on 4 tables.
-- These already have RLS enabled, but the policy itself is wide open.
-- ════════════════════════════════════════════════════════════════════

drop policy if exists "Allow all" on public.comparisons;
drop policy if exists authed_full_access on public.comparisons;
create policy authed_full_access on public.comparisons
  for all to authenticated using (true) with check (true);

drop policy if exists "Allow all" on public.connections;
drop policy if exists authed_full_access on public.connections;
create policy authed_full_access on public.connections
  for all to authenticated using (true) with check (true);

drop policy if exists "Allow all" on public.flows;
drop policy if exists authed_full_access on public.flows;
create policy authed_full_access on public.flows
  for all to authenticated using (true) with check (true);

drop policy if exists "Allow all" on public.projects;
drop policy if exists authed_full_access on public.projects;
create policy authed_full_access on public.projects
  for all to authenticated using (true) with check (true);

-- ════════════════════════════════════════════════════════════════════
-- Section 3 — screenshots.
-- Three things here:
--   (a) Drop "Allow all" public.
--   (b) Drop `screenshots_update_own` — it would otherwise be the only
--       remaining UPDATE policy and it requires the row's project be
--       owned by the caller's auth.uid(). That breaks the team-shared
--       model (other admins / members couldn't edit each other's
--       uploads). Replace with the standard permissive policy.
--   (c) Add anon SELECT, scoped to non-deleted rows, so the public
--       share page (/share/...) continues to work for unauthenticated
--       visitors. They still need to know the group/platform/flow
--       from the share URL — the URL is the access token.
-- ════════════════════════════════════════════════════════════════════

drop policy if exists "Allow all" on public.screenshots;
drop policy if exists screenshots_update_own on public.screenshots;
drop policy if exists authed_full_access on public.screenshots;
drop policy if exists share_page_anon_read on public.screenshots;

create policy authed_full_access on public.screenshots
  for all to authenticated using (true) with check (true);

create policy share_page_anon_read on public.screenshots
  for select to anon using (deleted_at is null);

-- ════════════════════════════════════════════════════════════════════
-- Section 4 — catalogue_group_appearance.
-- Currently has 8 policies: four for `anon` (read/insert/update/delete,
-- all `using true`) plus four matching `authenticated` policies. Drop
-- the anon set; only authenticated users should be able to read or
-- mutate group appearance. The share page does NOT read this table.
-- ════════════════════════════════════════════════════════════════════

drop policy if exists catalogue_group_appearance_select_anon
  on public.catalogue_group_appearance;
drop policy if exists catalogue_group_appearance_insert_anon
  on public.catalogue_group_appearance;
drop policy if exists catalogue_group_appearance_update_anon
  on public.catalogue_group_appearance;
drop policy if exists catalogue_group_appearance_delete_anon
  on public.catalogue_group_appearance;

-- ════════════════════════════════════════════════════════════════════
-- Section 5 — Storage policies on storage.objects.
-- Two buckets in use: `screenshots` and `catalogue-group-icons`.
--
-- `screenshots` bucket today allows public DELETE and public INSERT —
-- anyone with the anon key can wipe or overwrite stored images. Fix:
-- keep public SELECT (share page renders images via getPublicUrl()),
-- restrict INSERT/DELETE to authenticated.
--
-- `catalogue-group-icons` bucket today allows anon INSERT/UPDATE/
-- DELETE. Drop those; only authenticated users should mutate icons.
-- Keep public SELECT — group icons are essentially branding assets,
-- safe to leave readable.
-- ════════════════════════════════════════════════════════════════════

-- screenshots bucket: lock down writes ──────────────────────────────
drop policy if exists "Allow public deletes" on storage.objects;
drop policy if exists "Allow public uploads" on storage.objects;
drop policy if exists screenshots_authed_delete on storage.objects;
drop policy if exists screenshots_authed_insert on storage.objects;

create policy screenshots_authed_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'screenshots');

create policy screenshots_authed_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'screenshots');

-- ("Allow public reads" on `screenshots` bucket stays — share page
-- depends on it.)

-- catalogue-group-icons bucket: drop the four anon policies ─────────
drop policy if exists catalogue_group_icons_insert_anon on storage.objects;
drop policy if exists catalogue_group_icons_update_anon on storage.objects;
drop policy if exists catalogue_group_icons_delete_anon on storage.objects;

-- (The matching `_authenticated` policies and the public SELECT for
-- icon rendering stay as-is.)
