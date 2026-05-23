-- Videos — user-added tags.
--
-- Adds a free-form text[] column on catalogue_video_references so any
-- authenticated user can tag a video (e.g. "auth", "onboarding",
-- "trading", "skeu", "ios"). Tags are filterable from the videos grid
-- via a multi-select chip strip with OR semantics.
--
-- Schema choice — array column over a join table:
--   v1 tags are just labels (no description, colour, owner metadata).
--   Array column keeps the read path simple (one fetch, no join) and
--   lets us derive the tag-with-counts list with a single
--   SELECT unnest(tags), count(*) ... GROUP BY query. If tags ever
--   need first-class attributes (colour, description, slug normalisation
--   beyond lowercase), migrate to a tags + video_tags pair then.
--
-- Permission: authenticated full access already applies to
-- catalogue_video_references (see 20260513_enable_rls_public_release.sql).
-- Tags inherit that — any signed-in user can add or remove a tag on
-- any video. No anon access (videos surface is authenticated-only today).
--
-- Companion code:
--   designer/src/components/CatalogueVideosSection.tsx — tag chip input
--     on each card + filter strip above the grid.
--
-- Rollback:
--   drop index if exists catalogue_video_references_tags_gin;
--   alter table public.catalogue_video_references drop column if exists tags;

alter table public.catalogue_video_references
  add column if not exists tags text[] not null default '{}';

-- GIN index for the OR-style filter — `tags && ARRAY['auth','onboarding']`
-- (overlap) returns videos with at least one matching tag. Cheap when
-- the row count grows.
create index if not exists catalogue_video_references_tags_gin
  on public.catalogue_video_references using gin (tags);
