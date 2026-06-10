-- Phase 5 of the screen_families removal program
-- (see docs/screen-families-audit.md).
--
-- Final step: drop the table. By this point:
--   - Phase 1 removed dead handleAssignFlow + flow_id branches
--   - Phase 2 verified no data to backfill (0 divergent rows)
--   - Phase 3 stopped reading the table on cold load
--   - Phase 4 dropped the screen_family_id FK column from screenshots
--   - This PR also cleans up the mutation queue's now-dead
--     `screen_families` UPDATE branch.
--
-- No CASCADE — if any unexpected dependency exists, the migration
-- fails loudly so we can investigate. Phase 4 dropped the only FK
-- pointing at this table (screenshots.screen_family_id), so this
-- should drop cleanly. IF EXISTS keeps the migration safe to re-run.

drop table if exists public.screen_families;
