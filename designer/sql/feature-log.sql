-- Feature Log foundation
--
-- Global, scalable tracking for feature lifecycle:
-- planned -> designed -> shipped
--
-- This migration is additive and safe to deploy before UI usage.

create extension if not exists pg_trgm;

create table if not exists public.feature_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  description text,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_log_status_check
    check (status in ('planned', 'designed', 'shipped'))
);

alter table public.feature_log
  add column if not exists search_document tsvector
    generated always as (
      setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(description, '')), 'B')
    ) stored;

create table if not exists public.feature_log_links (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references public.feature_log (id) on delete cascade,
  screenshot_id uuid not null,
  link_type text not null default 'design',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_log_links_type_check
    check (link_type in ('design', 'shipped')),
  constraint feature_log_links_unique
    unique (feature_id, screenshot_id)
);

create index if not exists idx_feature_log_status_updated
  on public.feature_log (status, updated_at desc, id desc);

create index if not exists idx_feature_log_user_updated
  on public.feature_log (user_id, updated_at desc, id desc);

create index if not exists idx_feature_log_updated
  on public.feature_log (updated_at desc, id desc);

create index if not exists idx_feature_log_title_trgm
  on public.feature_log using gin (title gin_trgm_ops);

create index if not exists idx_feature_log_description_trgm
  on public.feature_log using gin ((coalesce(description, '')) gin_trgm_ops);

create index if not exists idx_feature_log_search_document
  on public.feature_log using gin (search_document);

create index if not exists idx_feature_log_links_feature_type_created
  on public.feature_log_links (feature_id, link_type, created_at desc);

create index if not exists idx_feature_log_links_feature_created
  on public.feature_log_links (feature_id, created_at desc);

create index if not exists idx_feature_log_links_screenshot
  on public.feature_log_links (screenshot_id);

create or replace function public.feature_log_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_feature_log_set_updated_at on public.feature_log;
create trigger trg_feature_log_set_updated_at
before update on public.feature_log
for each row
execute function public.feature_log_set_updated_at();

drop trigger if exists trg_feature_log_links_set_updated_at on public.feature_log_links;
create trigger trg_feature_log_links_set_updated_at
before update on public.feature_log_links
for each row
execute function public.feature_log_set_updated_at();

create or replace function public.feature_log_recompute_status(p_feature_id uuid)
returns text
language plpgsql
as $$
declare
  v_has_shipped boolean;
  v_has_design boolean;
  v_next_status text;
begin
  if not exists (select 1 from public.feature_log where id = p_feature_id) then
    raise exception 'Feature % not found', p_feature_id;
  end if;

  select exists(
    select 1
    from public.feature_log_links
    where feature_id = p_feature_id
      and link_type = 'shipped'
  )
  into v_has_shipped;

  select exists(
    select 1
    from public.feature_log_links
    where feature_id = p_feature_id
      and link_type = 'design'
  )
  into v_has_design;

  if v_has_shipped then
    v_next_status := 'shipped';
  elsif v_has_design then
    v_next_status := 'designed';
  else
    v_next_status := 'planned';
  end if;

  update public.feature_log
  set status = v_next_status
  where id = p_feature_id
    and status is distinct from v_next_status;

  return v_next_status;
end;
$$;

create or replace function public.feature_log_sync_status_from_links()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.feature_log_recompute_status(old.feature_id);
    return null;
  end if;

  perform public.feature_log_recompute_status(new.feature_id);

  if tg_op = 'UPDATE' and new.feature_id is distinct from old.feature_id then
    perform public.feature_log_recompute_status(old.feature_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_feature_log_links_sync_status on public.feature_log_links;
create trigger trg_feature_log_links_sync_status
after insert or update or delete on public.feature_log_links
for each row
execute function public.feature_log_sync_status_from_links();

create or replace function public.feature_log_link_screenshots(
  p_feature_id uuid,
  p_screenshot_ids uuid[],
  p_link_type text default 'design'
)
returns table (
  inserted_count integer,
  status text
)
language plpgsql
as $$
declare
  v_missing_screenshot_ids uuid[];
  v_inserted_count integer := 0;
begin
  if p_link_type not in ('design', 'shipped') then
    raise exception 'Invalid link_type: %', p_link_type;
  end if;

  if not exists (select 1 from public.feature_log where id = p_feature_id) then
    raise exception 'Feature % not found', p_feature_id;
  end if;

  if coalesce(array_length(p_screenshot_ids, 1), 0) = 0 then
    select feature_log.status
    into status
    from public.feature_log
    where feature_log.id = p_feature_id;
    inserted_count := 0;
    return next;
    return;
  end if;

  select array_agg(missing.screenshot_id)
  into v_missing_screenshot_ids
  from (
    select distinct candidate.screenshot_id
    from unnest(p_screenshot_ids) as candidate(screenshot_id)
    except
    select screenshot.id
    from public.screenshots as screenshot
  ) as missing;

  if coalesce(array_length(v_missing_screenshot_ids, 1), 0) > 0 then
    raise exception 'One or more screenshots do not exist for linking.';
  end if;

  insert into public.feature_log_links (feature_id, screenshot_id, link_type)
  select p_feature_id, candidate.screenshot_id, p_link_type
  from (
    select distinct screenshot_id
    from unnest(p_screenshot_ids) as incoming(screenshot_id)
  ) as candidate
  on conflict (feature_id, screenshot_id) do nothing;

  get diagnostics v_inserted_count = row_count;

  select feature_log.status
  into status
  from public.feature_log
  where feature_log.id = p_feature_id;

  inserted_count := v_inserted_count;
  return next;
end;
$$;

create or replace function public.feature_log_unlink_screenshot(
  p_feature_id uuid,
  p_screenshot_id uuid
)
returns text
language plpgsql
as $$
declare
  v_status text;
begin
  if not exists (select 1 from public.feature_log where id = p_feature_id) then
    raise exception 'Feature % not found', p_feature_id;
  end if;

  delete from public.feature_log_links
  where feature_id = p_feature_id
    and screenshot_id = p_screenshot_id;

  select feature_log.status
  into v_status
  from public.feature_log
  where feature_log.id = p_feature_id;

  return v_status;
end;
$$;

create or replace function public.feature_log_mark_shipped(
  p_feature_id uuid
)
returns text
language plpgsql
as $$
begin
  if not exists (select 1 from public.feature_log where id = p_feature_id) then
    raise exception 'Feature % not found', p_feature_id;
  end if;

  if not exists (
    select 1
    from public.feature_log_links
    where feature_id = p_feature_id
      and link_type = 'shipped'
  ) then
    raise exception 'Cannot mark shipped without at least one shipped screenshot link.';
  end if;

  update public.feature_log
  set status = 'shipped'
  where id = p_feature_id;

  return 'shipped';
end;
$$;

create or replace function public.feature_log_reopen(
  p_feature_id uuid
)
returns text
language plpgsql
as $$
declare
  v_has_design boolean;
  v_next_status text;
begin
  if not exists (select 1 from public.feature_log where id = p_feature_id) then
    raise exception 'Feature % not found', p_feature_id;
  end if;

  select exists(
    select 1
    from public.feature_log_links
    where feature_id = p_feature_id
      and link_type = 'design'
  )
  into v_has_design;

  if v_has_design then
    v_next_status := 'designed';
  else
    v_next_status := 'planned';
  end if;

  update public.feature_log
  set status = v_next_status
  where id = p_feature_id;

  return v_next_status;
end;
$$;

create or replace view public.feature_log_with_counts as
select
  feature.id,
  feature.user_id,
  feature.title,
  feature.description,
  feature.status,
  feature.created_at,
  feature.updated_at,
  feature.search_document,
  coalesce(stats.design_count, 0)::integer as design_count,
  coalesce(stats.shipped_count, 0)::integer as shipped_count,
  coalesce(stats.total_count, 0)::integer as total_count
from public.feature_log as feature
left join (
  select
    link.feature_id,
    count(*) filter (where link.link_type = 'design') as design_count,
    count(*) filter (where link.link_type = 'shipped') as shipped_count,
    count(*) as total_count
  from public.feature_log_links as link
  group by link.feature_id
) as stats
  on stats.feature_id = feature.id;
