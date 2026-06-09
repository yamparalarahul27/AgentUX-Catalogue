-- catalogue_prototypes — single-file HTML mockups uploaded by users
-- and surfaced under the Links tab. Files live in the `prototypes`
-- Storage bucket; this table stores their metadata + visibility.
--
-- Visibility model:
--   'private'  — only the uploader sees the card in the UI
--   'public'   — everyone authenticated sees it
--
-- File access: the bucket is public-read, so anyone who knows a file's
-- storage_path can fetch it directly (similar to imgur unlisted /
-- youtube unlisted). The card visibility is "listed vs unlisted",
-- not "ACL-protected". If we ever need true file-level ACLs we'll
-- need signed URLs which complicates the Vercel subdomain proxy —
-- documented as a future consideration in docs/screen-families-audit.md
-- style follow-ups, not blocking v1.
--
-- The file is SERVED via a Vercel rewrite at mockups.hirahul.xyz to
-- a separate origin from the app — this isolates uploaded JavaScript
-- from the app's cookies / localStorage. See vercel.json.

create table public.catalogue_prototypes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  filename text not null,
  storage_path text not null unique,
  uploader_user_id uuid not null references auth.users(id) on delete cascade,
  uploader_email text,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index catalogue_prototypes_uploader_idx on public.catalogue_prototypes (uploader_user_id);
create index catalogue_prototypes_visibility_public_idx on public.catalogue_prototypes (created_at desc)
  where visibility = 'public';
create index catalogue_prototypes_created_idx on public.catalogue_prototypes (created_at desc);

alter table public.catalogue_prototypes enable row level security;

-- ─── Table policies ────────────────────────────────────────────
-- Reads: owner sees their own (any visibility) + everyone sees public.
drop policy if exists prototypes_read_own_or_public on public.catalogue_prototypes;
create policy prototypes_read_own_or_public on public.catalogue_prototypes
  for select to authenticated
  using (uploader_user_id = auth.uid() or visibility = 'public');

-- Writes: only the owner. uploader_user_id pinned to the caller via the
-- with-check predicate, so a user can't insert a row claiming to be
-- someone else.
drop policy if exists prototypes_insert_own on public.catalogue_prototypes;
create policy prototypes_insert_own on public.catalogue_prototypes
  for insert to authenticated
  with check (uploader_user_id = auth.uid());

drop policy if exists prototypes_update_own on public.catalogue_prototypes;
create policy prototypes_update_own on public.catalogue_prototypes
  for update to authenticated
  using (uploader_user_id = auth.uid())
  with check (uploader_user_id = auth.uid());

drop policy if exists prototypes_delete_own on public.catalogue_prototypes;
create policy prototypes_delete_own on public.catalogue_prototypes
  for delete to authenticated
  using (uploader_user_id = auth.uid());

-- updated_at trigger so we don't have to remember to set it in the app.
create or replace function public.touch_catalogue_prototypes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists catalogue_prototypes_touch_updated_at on public.catalogue_prototypes;
create trigger catalogue_prototypes_touch_updated_at
  before update on public.catalogue_prototypes
  for each row execute function public.touch_catalogue_prototypes_updated_at();

-- ─── Storage policies (storage.objects) ────────────────────────
-- Bucket: `prototypes` (must be created manually in the Supabase
-- Dashboard or via the supabase CLI with --public; bucket creation
-- isn't reliably idempotent via SQL).
--
-- Convention: storage_path = '<uploader_user_id>/<random-uuid>.html'
-- The folder = the user id, which is what the policy enforces.

drop policy if exists prototypes_storage_select on storage.objects;
create policy prototypes_storage_select on storage.objects
  for select to public
  using (bucket_id = 'prototypes');

drop policy if exists prototypes_storage_insert_own on storage.objects;
create policy prototypes_storage_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'prototypes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists prototypes_storage_update_own on storage.objects;
create policy prototypes_storage_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'prototypes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'prototypes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists prototypes_storage_delete_own on storage.objects;
create policy prototypes_storage_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'prototypes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
