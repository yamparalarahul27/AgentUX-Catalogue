-- Screenshot comments — edit + reply support.
--
-- Adds three nullable columns to `public.screenshot_comments`:
--
--   updated_at  TIMESTAMPTZ  — set when the author edits the comment
--                              text. Null means "never edited". The UI
--                              shows an "(edited)" suffix when this is
--                              present.
--
--   deleted_at  TIMESTAMPTZ  — soft-delete marker. When a comment has
--                              children (its `id` is referenced by
--                              another row's `parent_id`), the UI
--                              soft-deletes it (set deleted_at, render
--                              "Comment removed" placeholder) so the
--                              replies stay in context. Childless
--                              comments still hard-delete.
--
--   parent_id   UUID         — self-reference. NULL = top-level
--                              comment. Non-null = reply to the
--                              referenced row. v1 caps the UI at one
--                              level — replies-of-replies are not
--                              composable from the client.
--
-- RLS notes:
--   The existing `authed_full_access` policy (from
--   20260513_enable_rls_public_release.sql) already grants
--   authenticated users full ALL access. Ownership gating happens in
--   the client UI. Tightening the policy to `user_email = auth.email()`
--   on UPDATE/DELETE is a separate hardening item — out of scope here.
--
-- Companion code:
--   - designer/src/types.ts                                  — ScreenshotComment type
--   - designer/src/components/CatalogueFamilyLightbox.tsx    — load query, edit + reply handlers
--   - designer/src/components/CatalogueFamilyLightboxCommentItem.tsx — inline edit + reply UI
--   - designer/src/lib/mutation-queue.ts                     — add-comment op carries optional parent_id
--
-- Rollback:
--   alter table public.screenshot_comments drop column if exists parent_id;
--   alter table public.screenshot_comments drop column if exists deleted_at;
--   alter table public.screenshot_comments drop column if exists updated_at;
--   drop index if exists screenshot_comments_parent_idx;

alter table public.screenshot_comments
  add column if not exists updated_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists parent_id uuid
    references public.screenshot_comments(id) on delete set null;

-- Used by the lightbox to know which top-level comments have children
-- (so a hard-delete vs. soft-delete decision can be made client-side).
create index if not exists screenshot_comments_parent_idx
  on public.screenshot_comments (parent_id)
  where parent_id is not null;
