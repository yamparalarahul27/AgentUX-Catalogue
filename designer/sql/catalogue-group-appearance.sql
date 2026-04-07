create table if not exists public.catalogue_group_appearance (
  project_id uuid not null references public.projects (id) on delete cascade,
  group_key text not null,
  display_label text,
  icon_emoji text,
  icon_url text,
  icon_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogue_group_appearance_pk primary key (project_id, group_key)
);

alter table public.catalogue_group_appearance
  add column if not exists display_label text,
  add column if not exists icon_emoji text,
  add column if not exists icon_url text,
  add column if not exists icon_storage_path text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'catalogue_group_appearance'
      and column_name = 'icon'
  ) then
    execute '
      update public.catalogue_group_appearance
      set icon_emoji = coalesce(icon_emoji, icon)
      where icon is not null
    ';
  end if;
exception
  when others then null;
end $$;

alter table public.catalogue_group_appearance
  drop column if exists icon;

create index if not exists catalogue_group_appearance_project_idx
  on public.catalogue_group_appearance (project_id);

create index if not exists catalogue_group_appearance_group_idx
  on public.catalogue_group_appearance (group_key);

alter table public.catalogue_group_appearance
  enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'catalogue_group_appearance'
      and policyname = 'catalogue_group_appearance_select_authenticated'
  ) then
    create policy catalogue_group_appearance_select_authenticated
      on public.catalogue_group_appearance
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'catalogue_group_appearance'
      and policyname = 'catalogue_group_appearance_insert_authenticated'
  ) then
    create policy catalogue_group_appearance_insert_authenticated
      on public.catalogue_group_appearance
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'catalogue_group_appearance'
      and policyname = 'catalogue_group_appearance_update_authenticated'
  ) then
    create policy catalogue_group_appearance_update_authenticated
      on public.catalogue_group_appearance
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'catalogue_group_appearance'
      and policyname = 'catalogue_group_appearance_delete_authenticated'
  ) then
    create policy catalogue_group_appearance_delete_authenticated
      on public.catalogue_group_appearance
      for delete
      to authenticated
      using (true);
  end if;
end $$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'catalogue-group-icons',
  'catalogue-group-icons',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'catalogue_group_icons_public_read'
  ) then
    create policy catalogue_group_icons_public_read
      on storage.objects
      for select
      to public
      using (bucket_id = 'catalogue-group-icons');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'catalogue_group_icons_insert_authenticated'
  ) then
    create policy catalogue_group_icons_insert_authenticated
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'catalogue-group-icons');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'catalogue_group_icons_update_authenticated'
  ) then
    create policy catalogue_group_icons_update_authenticated
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'catalogue-group-icons')
      with check (bucket_id = 'catalogue-group-icons');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'catalogue_group_icons_delete_authenticated'
  ) then
    create policy catalogue_group_icons_delete_authenticated
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'catalogue-group-icons');
  end if;
end $$;
