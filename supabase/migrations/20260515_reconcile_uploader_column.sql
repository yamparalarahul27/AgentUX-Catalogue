-- Reconcile uploader tracking column — fixup for migration 1.
--
-- `20260515_roles_and_capabilities.sql` added a new `uploaded_by` column
-- on screenshots, not realising the table already had `uploader_email`
-- (and `uploader_user_id`) being populated on every insert by the
-- existing `insertScreenshotWithUploader` helper at
-- designer/src/lib/screenshot-write.ts.
--
-- `20260515_role_enforced_policies.sql` then wrote three RLS policies
-- (screenshots_insert_upload_cap, screenshots_update_own,
-- screenshots_delete_own) that reference the new `uploaded_by` column.
-- Since real upload data lives in `uploader_email`, those policies
-- silently fail ownership checks — non-admin users cannot delete or
-- edit their own uploads.
--
-- This migration:
--   1. Drops the three ownership-dependent policies + the new index
--   2. Drops the duplicate `uploaded_by` column
--   3. Re-creates the same three policies, now keyed on `uploader_email`
--   4. Adds an index on `uploader_email` for "my uploads" queries
--
-- The other three policies from 20260515_role_enforced_policies.sql
-- (select_authed, update_edit_meta, delete_any) don't reference the
-- column at all and stay untouched.
--
-- Net effect: same security model, but pointed at the column that's
-- actually populated. Zero client changes required.
--
-- Companion code:
--   - designer/src/lib/screenshot-write.ts — populates uploader_email
--   - supabase/migrations/20260515_roles_and_capabilities.sql
--   - supabase/migrations/20260515_role_enforced_policies.sql

-- ════════════════════════════════════════════════════════════════════
-- 1. Drop the three policies that reference the wrong column
-- ════════════════════════════════════════════════════════════════════

drop policy if exists screenshots_insert_upload_cap on public.screenshots;
drop policy if exists screenshots_update_own        on public.screenshots;
drop policy if exists screenshots_delete_own        on public.screenshots;

-- ════════════════════════════════════════════════════════════════════
-- 2. Drop the duplicate column + its index
-- ════════════════════════════════════════════════════════════════════

drop index if exists public.screenshots_uploaded_by_idx;
alter table public.screenshots drop column if exists uploaded_by;

-- ════════════════════════════════════════════════════════════════════
-- 3. Re-create the three policies keyed on uploader_email
--
-- Identical logic to the originals — just `uploader_email` in place of
-- `uploaded_by`. The lower() wrap is defensive against case variation:
-- the helper normalises to lowercase but JWT email casing is not
-- guaranteed by Supabase Auth in all flows.
-- ════════════════════════════════════════════════════════════════════

create policy screenshots_insert_upload_cap on public.screenshots
  for insert to authenticated
  with check (
    public.current_member_has_capability('upload')
    and lower(uploader_email) = lower(auth.jwt() ->> 'email')
  );

create policy screenshots_update_own on public.screenshots
  for update to authenticated
  using (
    public.current_member_has_capability('delete_own')
    and lower(uploader_email) = lower(auth.jwt() ->> 'email')
  )
  with check (
    public.current_member_has_capability('delete_own')
    and lower(uploader_email) = lower(auth.jwt() ->> 'email')
  );

create policy screenshots_delete_own on public.screenshots
  for delete to authenticated
  using (
    public.current_member_has_capability('delete_own')
    and lower(uploader_email) = lower(auth.jwt() ->> 'email')
  );

-- ════════════════════════════════════════════════════════════════════
-- 4. Index on uploader_email — speeds up "my uploads" queries that PR A1's
-- Roles tab will use to count members per role, and that the future
-- approval workflow (PR B) will use to find Marketing/QA pending content.
-- Partial index on non-deleted rows keeps it small.
-- ════════════════════════════════════════════════════════════════════

create index if not exists screenshots_uploader_email_idx
  on public.screenshots (uploader_email)
  where deleted_at is null;
