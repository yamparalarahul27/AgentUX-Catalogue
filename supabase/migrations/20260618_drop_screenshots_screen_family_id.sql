-- Phase 4 of the screen_families removal program
-- (see docs/screen-families-audit.md).
--
-- Drop the `screen_family_id` column + its FK constraint from
-- `screenshots`. By this point no application code reads or writes
-- the column:
--   - Phase 1 removed the dead handleAssignFlow / flow_id branches
--   - Phase 3 stopped reading screen_families on cold load
--   - Phase 4 (this PR) stops writing screen_family_id on uploads
--     and removes the field from the ScreenshotNode type
--
-- Deploy ordering matters — see PR body. The frontend + telegram-bot
-- Edge Function MUST be deployed before this migration runs,
-- otherwise their INSERTs will fail with "column does not exist".
--
-- IF EXISTS guards on both statements make the migration safe to
-- re-run.

alter table public.screenshots
  drop constraint if exists screenshots_screen_family_id_fkey;

alter table public.screenshots
  drop column if exists screen_family_id;
