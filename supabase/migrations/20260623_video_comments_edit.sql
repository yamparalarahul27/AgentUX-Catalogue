-- Video comments — edit support.
--
-- Mirrors the screenshot-comments edit migration (20260620). Adds a
-- nullable `updated_at` column so the UI can:
--   - distinguish "never edited" rows (null) from edited rows
--   - render a small "(edited)" suffix next to the timestamp when set
--
-- RLS unchanged — the existing `authed_full_access` policy already
-- covers UPDATE for authenticated users; ownership is gated client-
-- side via `user_email`.
--
-- Companion code:
--   - designer/src/components/CatalogueVideosSection.tsx — VideoComment
--     interface, editVideoComment handler, inline edit affordance on
--     the X-post / YouTube preview modal
--
-- Rollback:
--   alter table public.catalogue_video_comments drop column if exists updated_at;

alter table public.catalogue_video_comments
  add column if not exists updated_at timestamptz;
