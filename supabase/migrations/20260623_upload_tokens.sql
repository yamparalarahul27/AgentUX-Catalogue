-- iOS Shortcut upload tokens.
--
-- Backs the iPhone share-to-app path (Apple Shortcut → shortcut-upload
-- Edge Function). A dedicated, upload-only, independently-revocable secret
-- per member — never the account passcode. Only the SHA-256 hash is stored;
-- the plaintext is shown once in the in-app modal and never again.
--
-- Companion code:
--   - supabase/functions/shortcut-upload/index.ts  — token redemption + ingest
--   - designer/src/lib/upload-token.ts              — client-side lifecycle
--   - designer/src/components/CatalogueIosUploadModal.tsx
--   - docs/ios-shortcut-setup.md                    — Shortcut build steps
--   - docs/ios-shortcut-share-design.md             — design spec
--
-- One active token per user (PK = email). Regenerate = upsert: overwrites
-- token_hash + created_at and clears last_used_at. Mirrors the email-keyed
-- pattern in 20260513_auth_passcodes.sql (user_passcodes / admins).

create table if not exists public.upload_tokens (
  email        text primary key references public.user_passcodes(email) on delete cascade,
  token_hash   text not null,                 -- sha256(plaintext), hex
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.upload_tokens enable row level security;

-- Owner can read/write only their own row. token_hash is the hash of the
-- owner's own token (not sensitive to them); plaintext is never stored.
-- All ingest writes happen through the shortcut-upload Edge Function with
-- the service role, which bypasses these policies.
create policy upload_tokens_own_select on public.upload_tokens
  for select to authenticated using (email = auth.jwt() ->> 'email');
create policy upload_tokens_own_insert on public.upload_tokens
  for insert to authenticated with check (email = auth.jwt() ->> 'email');
create policy upload_tokens_own_update on public.upload_tokens
  for update to authenticated using (email = auth.jwt() ->> 'email');
create policy upload_tokens_own_delete on public.upload_tokens
  for delete to authenticated using (email = auth.jwt() ->> 'email');

comment on table public.upload_tokens is
  'Per-email upload-only tokens for the iOS Shortcut ingress. Stores only '
  'the SHA-256 hash of the token. Own-row RLS for the owner; ingest reads '
  'happen via the shortcut-upload Edge Function (service role).';
