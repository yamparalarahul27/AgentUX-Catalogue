-- Allow 'youtube' as a value for source_type on catalogue_video_references.
-- The original table CHECK constraint whitelisted only 'x_post'; adding
-- YouTube needs that constraint widened. Drop + re-add is the standard
-- Postgres pattern for extending a CHECK list — no data backfill needed
-- since existing rows are all 'x_post' which stays valid.
--
-- Companion code:
--   - supabase/functions/fetch-youtube-metadata/
--   - designer/src/components/CatalogueVideosSection.tsx
--   - designer/src/components/YouTubeLightbox.tsx

alter table public.catalogue_video_references
  drop constraint if exists catalogue_video_references_source_type_check;

alter table public.catalogue_video_references
  add constraint catalogue_video_references_source_type_check
  check (source_type in ('x_post', 'youtube'));
