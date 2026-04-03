create table if not exists public.screen_families (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  "group" text,
  flow_id uuid references public.flows (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalogue_settings (
  user_id text primary key,
  web_presets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.screenshots
  add column if not exists screen_family_id uuid references public.screen_families (id) on delete set null,
  add column if not exists web_preset_key text,
  add column if not exists mobile_os text check (mobile_os in ('ios', 'android'));

do $$
begin
  alter table public.screenshots
    add constraint screenshots_variant_fields_exclusive
    check (
      not (web_preset_key is not null and mobile_os is not null)
    );
exception
  when duplicate_object then null;
end $$;

create index if not exists screen_families_project_id_idx on public.screen_families (project_id);
create index if not exists screenshots_screen_family_id_idx on public.screenshots (screen_family_id);

insert into public.screen_families (project_id, name, "group", flow_id, created_at, updated_at)
select
  screenshot.project_id,
  screenshot.name,
  screenshot."group",
  screenshot.flow_id,
  coalesce(screenshot.created_at, now()),
  now()
from public.screenshots as screenshot
where screenshot.screen_family_id is null
on conflict do nothing;

update public.screenshots as screenshot
set screen_family_id = family.id
from public.screen_families as family
where screenshot.screen_family_id is null
  and family.project_id = screenshot.project_id
  and family.name = screenshot.name
  and coalesce(family."group", '') = coalesce(screenshot."group", '')
  and coalesce(family.flow_id::text, '') = coalesce(screenshot.flow_id::text, '');

create unique index if not exists screenshots_unique_web_variant_idx
  on public.screenshots (screen_family_id, theme, platform, web_preset_key)
  where platform = 'web' and screen_family_id is not null and web_preset_key is not null;

create unique index if not exists screenshots_unique_mobile_variant_idx
  on public.screenshots (screen_family_id, theme, platform, mobile_os)
  where platform = 'mobile' and screen_family_id is not null and mobile_os is not null;
