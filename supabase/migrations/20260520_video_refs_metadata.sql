-- Add tweet metadata columns to catalogue_video_references so the
-- Videos section can render thumbnail-first cards without loading
-- X's widgets.js on every paint. Populated by the new
-- `fetch-tweet-metadata` Edge Function (which hits
-- cdn.syndication.twitter.com/tweet-result).
--
-- Companion code:
--   - supabase/functions/fetch-tweet-metadata/
--   - designer/src/components/CatalogueVideosSection.tsx

alter table public.catalogue_video_references
  add column if not exists author_handle text null,
  add column if not exists author_name text null,
  add column if not exists text_excerpt text null,
  add column if not exists poster_url text null,
  add column if not exists liked_count integer null,
  add column if not exists posted_at timestamptz null,
  add column if not exists metadata_fetched_at timestamptz null;

-- Index supports the "lazy backfill" pass — find rows that have a
-- url but haven't had metadata fetched yet.
create index if not exists catalogue_video_references_needs_metadata_idx
  on public.catalogue_video_references (metadata_fetched_at)
  where metadata_fetched_at is null;
