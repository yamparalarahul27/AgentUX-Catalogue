-- RLS policy rewrite on `screenshots` — PR A0 of the role system.
--
-- Replaces the permissive `authed_full_access` policy (every authenticated
-- user could do anything) with capability-aware policies that read from
-- role_capabilities via the SECURITY DEFINER helper functions defined in
-- the companion migration `20260515_roles_and_capabilities.sql`.
--
-- IMPORTANT: apply 20260515_roles_and_capabilities.sql FIRST.
--
-- Policy matrix (operation × who can do it):
--
--   SELECT  any authenticated user        + anon SELECT non-deleted (share page)
--   INSERT  upload capability              + uploaded_by must equal own email
--   UPDATE  edit_metadata capability       (any row — Admin, QA)
--   UPDATE  delete_own + uploaded_by = me  (own row — Researcher etc., includes
--                                           soft-delete via deleted_at, restore
--                                           via setting deleted_at = null, AND
--                                           per Path A: editing own metadata)
--   DELETE  delete_any capability          (Admin)
--   DELETE  delete_own + uploaded_by = me  (Researcher etc., for hard-deletes —
--                                           today the app only soft-deletes,
--                                           but gate it anyway in case of future
--                                           hard-delete paths)
--
-- Path A rationale (see PR discussion): the app uses soft-delete via
-- `UPDATE deleted_at = ...`, so "delete own" cannot be a DELETE-only policy
-- and we don't try to enumerate which columns the UPDATE may change.
-- Owners can edit their own rows freely. Spec drift is small (Researcher
-- can now fix typos on their own uploads without delete+re-upload) and
-- can be tightened later via a BEFORE UPDATE trigger or RPC functions.
--
-- Companion code (PR A0):
--   - designer/src/hooks/use-catalogue-upload.ts  — sets uploaded_by on insert
--   - designer/src/components/Catalogue.tsx       — gates affordances by capability

-- ════════════════════════════════════════════════════════════════════
-- Drop the existing permissive policy so the new split policies are
-- the only ones in effect. share_page_anon_read stays — the public
-- share page depends on it.
-- ════════════════════════════════════════════════════════════════════

drop policy if exists authed_full_access on public.screenshots;

-- Drop any prior versions of the split policies (idempotent re-runs).
drop policy if exists screenshots_select_authed       on public.screenshots;
drop policy if exists screenshots_insert_upload_cap   on public.screenshots;
drop policy if exists screenshots_update_edit_meta    on public.screenshots;
drop policy if exists screenshots_update_own          on public.screenshots;
drop policy if exists screenshots_delete_any          on public.screenshots;
drop policy if exists screenshots_delete_own          on public.screenshots;

-- ════════════════════════════════════════════════════════════════════
-- SELECT — any authenticated user can browse the catalogue.
-- (Anonymous SELECT for the share page is handled by the existing
--  share_page_anon_read policy, which this migration does not touch.)
-- ════════════════════════════════════════════════════════════════════

create policy screenshots_select_authed on public.screenshots
  for select to authenticated
  using (true);

-- ════════════════════════════════════════════════════════════════════
-- INSERT — must have `upload` capability AND must claim ownership.
-- The uploaded_by guard prevents a non-admin from inserting rows that
-- claim a different user as the uploader (which would then look like
-- those rows belonged to that user for delete_own purposes).
-- ════════════════════════════════════════════════════════════════════

create policy screenshots_insert_upload_cap on public.screenshots
  for insert to authenticated
  with check (
    public.current_member_has_capability('upload')
    and lower(uploaded_by) = lower(auth.jwt() ->> 'email')
  );

-- ════════════════════════════════════════════════════════════════════
-- UPDATE — two policies. Postgres OR's them, so any UPDATE that satisfies
-- either policy is permitted.
--
-- (a) edit_metadata: can update any row, any column. Used by Admin + QA.
-- (b) delete_own:    can update own rows (uploaded_by = me) — covers
--                    soft-delete (set deleted_at), restore (set deleted_at = null),
--                    and per Path A, metadata edits on own uploads.
--                    WITH CHECK pins uploaded_by to caller's email so an
--                    owner cannot reassign ownership to a different account.
-- ════════════════════════════════════════════════════════════════════

create policy screenshots_update_edit_meta on public.screenshots
  for update to authenticated
  using (public.current_member_has_capability('edit_metadata'))
  with check (public.current_member_has_capability('edit_metadata'));

create policy screenshots_update_own on public.screenshots
  for update to authenticated
  using (
    public.current_member_has_capability('delete_own')
    and lower(uploaded_by) = lower(auth.jwt() ->> 'email')
  )
  with check (
    public.current_member_has_capability('delete_own')
    and lower(uploaded_by) = lower(auth.jwt() ->> 'email')
  );

-- ════════════════════════════════════════════════════════════════════
-- DELETE — gated, even though the app currently soft-deletes via UPDATE.
-- Cheap defense-in-depth: if a hard-delete code path is ever added (e.g.,
-- "permanently empty Trash"), the RLS check still applies.
-- ════════════════════════════════════════════════════════════════════

create policy screenshots_delete_any on public.screenshots
  for delete to authenticated
  using (public.current_member_has_capability('delete_any'));

create policy screenshots_delete_own on public.screenshots
  for delete to authenticated
  using (
    public.current_member_has_capability('delete_own')
    and lower(uploaded_by) = lower(auth.jwt() ->> 'email')
  );
