create table if not exists public.catalogue_link_references (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  normalized_url text not null,
  host text not null,
  title text,
  added_by_email text,
  created_at timestamptz not null default now()
);

create unique index if not exists catalogue_link_references_normalized_uidx
  on public.catalogue_link_references (normalized_url);

create index if not exists catalogue_link_references_created_idx
  on public.catalogue_link_references (created_at desc);

create index if not exists catalogue_link_references_host_idx
  on public.catalogue_link_references (host);
