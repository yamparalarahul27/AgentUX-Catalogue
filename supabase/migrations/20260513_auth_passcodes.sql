-- Auth Gate — per-email passcodes + admins.
--
-- New tables backing the passcode login flow and the Members admin
-- panel. Both tables are service-role only (no client-facing policies
-- on user_passcodes; admins exposes only a self-check policy so the
-- React hook can decide whether to render the Members subtab).
--
-- Companion code:
--   - supabase/functions/auth-login/index.ts  — passcode redemption
--   - supabase/functions/auth-admin/index.ts  — admin CRUD
--   - docs/security-auth-passcode-and-members.md — frozen design spec
--
-- NOTE: This migration does NOT enable RLS on the existing 11 catalogue
-- tables. That's tracked separately in docs/security-rls-public-release.md
-- and depends on a separate decision about how the public share view
-- should serve anonymous reads. Ship that as its own PR.

-- ────────────────────────────────────────────────────────────────────
-- user_passcodes — one row per allowed email.
-- ────────────────────────────────────────────────────────────────────
create table if not exists public.user_passcodes (
  email          text primary key,
  passcode_hash  text not null,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_login_at  timestamptz,
  last_failed_at timestamptz,
  failed_count   int not null default 0,
  locked_until   timestamptz
);

alter table public.user_passcodes enable row level security;
-- No policies → only the service role (Edge Functions) can read/write.

comment on table public.user_passcodes is
  'Per-email static passcodes for the auth gate. Hash is argon2id. '
  'Service-role only — never readable by anon or authenticated roles.';
comment on column public.user_passcodes.failed_count is
  'Consecutive failed login attempts. Resets on success or rotate.';
comment on column public.user_passcodes.locked_until is
  'Set when failed_count crosses the lockout threshold (5 in Edge Function). '
  'Login rejected until this time has passed.';

-- ────────────────────────────────────────────────────────────────────
-- admins — emails that see the Members admin panel.
-- Cascades: deleting the passcode removes admin status too.
-- ────────────────────────────────────────────────────────────────────
create table if not exists public.admins (
  email      text primary key references public.user_passcodes(email) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- The only client-facing read in this schema. Lets the authenticated
-- React hook check "am I an admin?" by reading their own row. Cannot
-- list other admins.
create policy admins_self_select on public.admins
  for select to authenticated
  using (email = auth.jwt() ->> 'email');

comment on table public.admins is
  'Emails that can access the Members admin panel. Read-self only via RLS; '
  'all writes happen through the auth-admin Edge Function with the admin passcode.';

-- ────────────────────────────────────────────────────────────────────
-- updated_at trigger on user_passcodes so manual updates stay correct.
-- ────────────────────────────────────────────────────────────────────
create or replace function public.user_passcodes_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_passcodes_touch_updated_at on public.user_passcodes;
create trigger user_passcodes_touch_updated_at
  before update on public.user_passcodes
  for each row execute function public.user_passcodes_touch_updated_at();
