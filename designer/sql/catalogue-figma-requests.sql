create table if not exists public.catalogue_figma_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete set null,
  title text,
  html_snippet text not null,
  reference_image_url text,
  requested_by_user_id text not null,
  requested_by_email text,
  status text not null default 'queued',
  node_url text,
  node_id text,
  file_key text,
  admin_notes text,
  error_message text,
  engine_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.catalogue_figma_requests
    add constraint catalogue_figma_requests_status_check
    check (status in ('queued', 'parsing', 'building', 'review', 'ready', 'failed'));
exception
  when duplicate_object then null;
end $$;

create index if not exists catalogue_figma_requests_created_idx
  on public.catalogue_figma_requests (created_at desc);

create index if not exists catalogue_figma_requests_requester_idx
  on public.catalogue_figma_requests (requested_by_user_id, created_at desc);

create index if not exists catalogue_figma_requests_status_idx
  on public.catalogue_figma_requests (status, created_at desc);

create index if not exists catalogue_figma_requests_project_idx
  on public.catalogue_figma_requests (project_id, created_at desc);
