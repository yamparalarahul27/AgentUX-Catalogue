-- Share-page comments — per-comment public flag.
--
-- Today the share page (single-screenshot mode at /share?id=…) is
-- visible to anonymous visitors, but `screenshot_comments` is locked
-- to authenticated full access (see 20260513_enable_rls_public_release.sql).
-- Authors who left feedback assumed a team-only audience.
--
-- Rather than open all comments to anon, this migration adds a per-comment
-- opt-in: comments stay private by default. Comment authors (or admins)
-- can flip `is_public = true` to surface a specific comment on the share
-- page. Anon role can SELECT only those rows, and only when the parent
-- screenshot is not soft-deleted.
--
-- Companion code:
--   - designer/src/components/CatalogueFamilyLightbox.tsx — Show on share
--     page toggle per comment
--   - designer/src/components/SharePage.tsx — fetches is_public=true
--     comments in single-screenshot mode
--
-- Rollback:
--   drop policy if exists share_page_anon_read_public on public.screenshot_comments;
--   alter table public.screenshot_comments drop column if exists is_public;

alter table public.screenshot_comments
  add column if not exists is_public boolean not null default false;

create index if not exists screenshot_comments_is_public_idx
  on public.screenshot_comments (screenshot_id)
  where is_public = true;

-- Anon SELECT — only is_public=true rows, only for non-deleted screenshots.
-- The screenshots table already has its own anon SELECT policy gated on
-- deleted_at; the subselect here re-applies that gate so a soft-deleted
-- screenshot's public comments don't keep leaking.
drop policy if exists share_page_anon_read_public on public.screenshot_comments;
create policy share_page_anon_read_public on public.screenshot_comments
  for select to anon
  using (
    is_public = true
    and exists (
      select 1 from public.screenshots s
      where s.id = screenshot_comments.screenshot_id
        and s.deleted_at is null
    )
  );
