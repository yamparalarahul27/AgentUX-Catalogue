-- Phase 2 of the screen_families removal program
-- (see docs/screen-families-audit.md).
--
-- Goal: copy any meaningful `screen_families.{name, group}` data onto
-- the screenshots that reference it, so Phase 3 (dropping the
-- `SELECT * FROM screen_families` cold-load query) doesn't lose any
-- information. In ~95% of rows the screenshot's columns already match
-- the family's; this just fills the gaps.
--
-- Idempotent: re-running this is a no-op. The WHERE clause requires
-- the destination column to be NULL — after the first run, those
-- rows have values, so the predicate no longer matches.
--
-- Why not flow_id: covered by the Phase 1 cleanup. Modern flow
-- assignment lives in `screenshots.metadata.catalogue_flow_label`,
-- and the `screen_families.flow_id` column is unread by any UI.
--
-- Reversibility: the only rows touched are ones where the destination
-- column was NULL. Easy to identify via the screen_families row's
-- created_at if rollback is ever needed; in practice, this should
-- never bite because the destination was already empty / unusable.

do $$
declare
  affected integer;
begin
  with updated as (
    update public.screenshots s
    set
      name    = coalesce(s.name,    f.name),
      "group" = coalesce(s."group", f."group")
    from public.screen_families f
    where s.screen_family_id = f.id
      and (
        (s.name    is null and f.name    is not null) or
        (s."group" is null and f."group" is not null)
      )
    returning s.id
  )
  select count(*) into affected from updated;
  raise notice 'screen_families → screenshots backfill: % row(s) updated', affected;
end $$;
