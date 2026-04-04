create table if not exists public.catalogue_video_references (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  external_id text not null,
  url text not null,
  added_by_email text,
  created_at timestamptz not null default now()
);

do $$
begin
  alter table public.catalogue_video_references
    add constraint catalogue_video_references_source_type_check
    check (source_type in ('x_post'));
exception
  when duplicate_object then null;
end $$;

create unique index if not exists catalogue_video_references_source_external_uidx
  on public.catalogue_video_references (source_type, external_id);

create index if not exists catalogue_video_references_created_idx
  on public.catalogue_video_references (created_at desc);

create table if not exists public.catalogue_video_comments (
  id uuid primary key default gen_random_uuid(),
  item_key text not null,
  text text not null,
  user_email text not null,
  created_at timestamptz not null default now()
);

create index if not exists catalogue_video_comments_item_created_idx
  on public.catalogue_video_comments (item_key, created_at);
