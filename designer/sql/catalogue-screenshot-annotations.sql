-- Catalogue: move screenshot annotations from screenshots.metadata.lightbox_annotations
-- (a JSON array, sometimes stringified) into a real screenshot_annotations table.
--
-- Deploy order:
--   1. Run this migration in the Supabase SQL editor.
--   2. Deploy the app code that reads/writes from screenshot_annotations.
--   3. (Optional) After confirming everything is healthy, drop the legacy
--      metadata key with the cleanup statement at the bottom of this file.

create table if not exists public.screenshot_annotations (
  id uuid primary key default gen_random_uuid(),
  screenshot_id uuid not null references public.screenshots(id) on delete cascade,
  shape text not null default 'pin' check (shape in ('pin', 'area')),
  x numeric not null,
  y numeric not null,
  width numeric,
  height numeric,
  text text not null,
  user_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_screenshot_annotations_screenshot
  on public.screenshot_annotations (screenshot_id, created_at);

create index if not exists idx_screenshot_annotations_text_lower
  on public.screenshot_annotations (lower(text));

-- One-time backfill from metadata.lightbox_annotations.
-- Handles both JSON-array values and JSON-string values (the lightbox has
-- historically written via JSON.stringify, but earlier code wrote arrays).
with raw as (
  select
    s.id as screenshot_id,
    case
      when jsonb_typeof(s.metadata -> 'lightbox_annotations') = 'string'
        then (s.metadata ->> 'lightbox_annotations')::jsonb
      when jsonb_typeof(s.metadata -> 'lightbox_annotations') = 'array'
        then s.metadata -> 'lightbox_annotations'
      else null
    end as entries
  from public.screenshots s
  where s.metadata ? 'lightbox_annotations'
),
exploded as (
  select
    raw.screenshot_id,
    entry
  from raw
  cross join lateral jsonb_array_elements(coalesce(raw.entries, '[]'::jsonb)) as entry
  where raw.entries is not null
)
insert into public.screenshot_annotations
  (id, screenshot_id, shape, x, y, width, height, text, user_email, created_at)
select
  case
    when (entry ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (entry ->> 'id')::uuid
    else gen_random_uuid()
  end as id,
  exploded.screenshot_id,
  case
    when entry ? 'shape' and entry ->> 'shape' in ('pin', 'area') then entry ->> 'shape'
    when entry ? 'width' and entry ? 'height' then 'area'
    else 'pin'
  end as shape,
  coalesce((entry ->> 'x')::numeric, 0) as x,
  coalesce((entry ->> 'y')::numeric, 0) as y,
  case when entry ? 'width' then (entry ->> 'width')::numeric else null end as width,
  case when entry ? 'height' then (entry ->> 'height')::numeric else null end as height,
  coalesce(entry ->> 'text', '') as text,
  nullif(entry ->> 'user_email', '') as user_email,
  coalesce(
    (entry ->> 'created_at')::timestamptz,
    (entry ->> 'createdAt')::timestamptz,
    now()
  ) as created_at
from exploded
where coalesce(entry ->> 'text', '') <> ''
  and (entry ->> 'x') is not null
  and (entry ->> 'y') is not null
on conflict (id) do nothing;

-- RPC: return distinct screenshot ids that have any annotation whose text
-- (case-insensitive) matches one of the supplied labels, scoped to the given
-- project ids. Used by the toolbar's annotation multi-select filter.
create or replace function public.screenshots_with_annotation_labels(
  project_ids uuid[],
  labels text[]
) returns table(screenshot_id uuid)
language sql
stable
security invoker
as $$
  select distinct sa.screenshot_id
  from public.screenshot_annotations sa
  join public.screenshots s on s.id = sa.screenshot_id
  where s.project_id = any(project_ids)
    and lower(sa.text) = any(labels);
$$;

-- Optional cleanup — run only after verifying the new table is in use and the
-- app no longer reads from metadata.lightbox_annotations. Leaving the key in
-- place is safe; the new code ignores it.
--
-- update public.screenshots
--   set metadata = metadata - 'lightbox_annotations'
--   where metadata ? 'lightbox_annotations';
