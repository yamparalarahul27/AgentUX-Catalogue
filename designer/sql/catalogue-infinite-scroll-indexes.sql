-- Catalogue infinite-scroll support indexes
--
-- Required before shipping paginated queries. Without these, filter/sort
-- queries at 1K+ rows scan full tables.
--
-- Deploy order:
--   1. Run this migration in Supabase SQL editor
--   2. Verify with EXPLAIN on worst-case filter combos (see README comments below)
--   3. Only then deploy the app code that uses paginated queries

-- pg_trgm is required for ilike search indexes
create extension if not exists pg_trgm;

-- Primary pagination index (default sort: latest across all groups)
create index if not exists idx_screenshots_project_created
  on public.screenshots (project_id, created_at desc, id desc);

-- Combined platform/theme filter common case
create index if not exists idx_screenshots_project_platform_theme
  on public.screenshots (project_id, platform, theme);

-- Family join for group filtering
create index if not exists idx_screenshots_project_family
  on public.screenshots (project_id, screen_family_id);

-- JSONB metadata for flow-label filter (metadata->>'catalogue_flow_label')
create index if not exists idx_screenshots_metadata_gin
  on public.screenshots using gin (metadata);

-- Trigram indexes for ilike search on name + file_name
create index if not exists idx_screenshots_name_trgm
  on public.screenshots using gin (name gin_trgm_ops);

create index if not exists idx_screenshots_filename_trgm
  on public.screenshots using gin (file_name gin_trgm_ops);

-- Batch comment-count hydration
create index if not exists idx_screenshot_comments_screenshot
  on public.screenshot_comments (screenshot_id);

-- Batch version-count hydration
create index if not exists idx_screenshot_versions_screenshot
  on public.screenshot_versions (screenshot_id);

-- Group filter via screen_families table
create index if not exists idx_screen_families_project_group
  on public.screen_families (project_id, "group");

-- Verification queries (run manually after applying):
--
-- EXPLAIN ANALYZE
--   SELECT * FROM screenshots
--   WHERE project_id = '<some-uuid>'
--     AND platform = 'web'
--     AND theme = 'dark'
--   ORDER BY created_at DESC, id DESC
--   LIMIT 50;
--
-- Expected: Index Scan on idx_screenshots_project_platform_theme or
-- idx_screenshots_project_created (planner chooses the most selective).
-- Never a Seq Scan.
