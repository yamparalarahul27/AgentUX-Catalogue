-- Trash: soft-delete for screenshots with a 15-day recovery window.
-- Deleting a card now sets deleted_at = now() on every screenshot in
-- the family, instead of hard-deleting the rows. A nightly pg_cron job
-- hard-deletes anything that's been in trash 15+ days.
--
-- The column lives on `screenshots` (not `screen_families`) because most
-- cards in the current data shape don't have a screen_families row —
-- uploads default screen_family_id to NULL, and the UI treats those as
-- "legacy families" derived from the screenshot itself.

alter table public.screenshots
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by_email text null;

-- Partial index speeds up the Trash list without bloating reads of
-- live data (which only care about deleted_at IS NULL).
create index if not exists screenshots_deleted_at_idx
  on public.screenshots (deleted_at)
  where deleted_at is not null;

-- Purge function: hard-deletes screenshots (and their connections)
-- that have been in trash for 15+ days. Storage objects are NOT
-- removed here — they become orphans in the 'screenshots' bucket.
-- Follow-up: schedule an Edge Function via pg_net to do storage
-- cleanup. For v1 the marginal storage cost is acceptable.

create or replace function public.purge_trashed_screenshots()
returns int
language plpgsql
security definer
as $$
declare
  v_screenshot_ids uuid[];
  v_count int;
begin
  select array_agg(id) into v_screenshot_ids
  from public.screenshots
  where deleted_at is not null
    and deleted_at < now() - interval '15 days';

  if v_screenshot_ids is null or array_length(v_screenshot_ids, 1) is null then
    return 0;
  end if;

  delete from public.connections
  where source_id = any(v_screenshot_ids)
     or target_id = any(v_screenshot_ids);

  delete from public.screenshots
  where id = any(v_screenshot_ids);

  v_count := array_length(v_screenshot_ids, 1);
  return v_count;
end;
$$;

-- Enable pg_cron extension. On Supabase this also needs to be
-- toggled on in Dashboard → Database → Extensions if not already.
create extension if not exists pg_cron;

-- Schedule nightly purge at 03:00 UTC. Idempotent — unschedule
-- guard handles re-runs of this migration.
do $$
begin
  perform cron.unschedule('purge-trashed-screenshots');
exception
  when others then null;
end $$;

select cron.schedule(
  'purge-trashed-screenshots',
  '0 3 * * *',
  $$ select public.purge_trashed_screenshots(); $$
);
