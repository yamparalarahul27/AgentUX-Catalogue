-- Roles + per-role capabilities — PR A0 of the role system.
--
-- Adds:
--   1. `roles`               — one row per role, with display name + flags
--   2. `role_capabilities`   — many-to-many between roles and capability strings
--   3. `user_passcodes.role` — every member gets exactly one role
--   4. `screenshots.uploaded_by` — text email of the uploader, enforced
--                                  by RLS policies in the next migration
--   5. Two SECURITY DEFINER helper functions used by RLS policies:
--        - current_member_role()
--        - current_member_has_capability(text)
--
-- This migration only adds schema + seeds the 5 named roles. The RLS
-- policy rewrites that actually USE the helper functions are in the
-- companion migration `20260515_role_enforced_policies.sql` — apply
-- this one first, verify the seed + helpers, then apply that one.
--
-- Companion code (PR A0):
--   - supabase/functions/auth-admin/index.ts       — set_member_role
--   - designer/src/lib/auth-passcode.ts            — MemberRow.role
--   - designer/src/components/CatalogueMembersSection.tsx — role dropdown
--
-- Migrations are idempotent: re-running this file is a no-op once
-- everything is in place (uses `if not exists` + `on conflict do nothing`).

-- ════════════════════════════════════════════════════════════════════
-- 1. roles table
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.roles (
  id                text primary key,
  name              text not null,
  description       text,
  is_system         boolean not null default false,
  requires_approval boolean not null default false,
  created_at        timestamptz not null default now()
);

alter table public.roles enable row level security;

-- Authenticated users can read the role catalogue (so the Members panel
-- can render the role dropdown, and the client can resolve role → name).
-- All writes go through the auth-admin Edge Function as service role.
drop policy if exists roles_authed_read on public.roles;
create policy roles_authed_read on public.roles
  for select to authenticated using (true);

comment on table public.roles is
  'Named roles (admin, researcher, marketing, etc.). Mapping role → capabilities '
  'lives in role_capabilities. is_system = true means the role cannot be edited or '
  'deleted via the admin UI (currently only "admin"). requires_approval = true means '
  'uploads from this role enter a pending state until an Admin approves (wired up in '
  'a later PR — column is in schema now to avoid a second migration).';

-- ════════════════════════════════════════════════════════════════════
-- 2. role_capabilities table
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.role_capabilities (
  role_id    text not null references public.roles(id) on delete cascade,
  capability text not null,
  primary key (role_id, capability)
);

alter table public.role_capabilities enable row level security;

drop policy if exists role_capabilities_authed_read on public.role_capabilities;
create policy role_capabilities_authed_read on public.role_capabilities
  for select to authenticated using (true);

comment on table public.role_capabilities is
  'Join table: which capability strings (upload, delete_own, delete_any, edit_metadata, '
  'share, labeling_studio, manage_members, manage_flags) a role grants. Capability '
  'strings are an enum in code (designer/src/lib/role-capabilities.ts) — server-side '
  'RLS policies match them by string.';

-- ════════════════════════════════════════════════════════════════════
-- 3. Seed the 5 named roles
-- ════════════════════════════════════════════════════════════════════

insert into public.roles (id, name, description, is_system, requires_approval) values
  ('admin',         'Admin',         'Full access to everything',                                 true,  false),
  ('researcher',    'Researcher',    'Upload, share, delete own work',                            false, false),
  ('researcher_ai', 'ResearcherAI',  'Researcher + Labeling Studio access',                       false, false),
  ('marketing',     'Marketing',     'Upload + share; uploads need admin approval',               false, true ),
  ('qa',            'QA',            'Marketing + edit metadata; uploads need admin approval',    false, true )
on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════════
-- 4. Seed capabilities per role
-- ════════════════════════════════════════════════════════════════════

insert into public.role_capabilities (role_id, capability) values
  -- Admin: everything
  ('admin', 'upload'),
  ('admin', 'delete_own'),
  ('admin', 'delete_any'),
  ('admin', 'edit_metadata'),
  ('admin', 'share'),
  ('admin', 'labeling_studio'),
  ('admin', 'manage_members'),
  ('admin', 'manage_flags'),

  -- Researcher: upload + share + delete own
  ('researcher', 'upload'),
  ('researcher', 'delete_own'),
  ('researcher', 'share'),

  -- ResearcherAI: Researcher + Studio
  ('researcher_ai', 'upload'),
  ('researcher_ai', 'delete_own'),
  ('researcher_ai', 'share'),
  ('researcher_ai', 'labeling_studio'),

  -- Marketing: same as Researcher (approval gate handled in PR B via requires_approval flag)
  ('marketing', 'upload'),
  ('marketing', 'delete_own'),
  ('marketing', 'share'),

  -- QA: Marketing + edit metadata
  ('qa', 'upload'),
  ('qa', 'delete_own'),
  ('qa', 'share'),
  ('qa', 'edit_metadata')
on conflict (role_id, capability) do nothing;

-- ════════════════════════════════════════════════════════════════════
-- 5. Add `role` to user_passcodes
--    Default = 'researcher' (least-privilege safe default for new members
--    minted before an admin has picked their role). Existing rows that
--    have an `admins` entry get bumped to 'admin' by the backfill below.
-- ════════════════════════════════════════════════════════════════════

alter table public.user_passcodes
  add column if not exists role text not null default 'researcher'
  references public.roles(id);

comment on column public.user_passcodes.role is
  'Role assigned to this member. Drives RLS via current_member_has_capability(). '
  'Defaults to "researcher" for new mints — admin can promote via the Members panel.';

-- Backfill: existing admins (rows in public.admins) → role = 'admin'.
-- Safe to re-run: idempotent because the WHERE clause is unconditional.
update public.user_passcodes
  set role = 'admin'
  where email in (select email from public.admins)
    and role <> 'admin';

-- ════════════════════════════════════════════════════════════════════
-- 6. Add `uploaded_by` to screenshots
--    Nullable: existing rows stay NULL (only `delete_any` can remove them,
--    which matches the "admin manages legacy content" mental model).
--    New uploads will set this from the client.
-- ════════════════════════════════════════════════════════════════════

alter table public.screenshots
  add column if not exists uploaded_by text;

comment on column public.screenshots.uploaded_by is
  'Lowercase email of the member who uploaded this screenshot. NULL for rows that '
  'predate the roles system (PR A0). Used by the delete_own RLS policy to gate '
  'self-delete; NULL rows are only deletable by members with the delete_any capability.';

-- Index on (uploaded_by, deleted_at) — speeds up "my uploads" queries that
-- PR A1's Roles tab will use to count "members with this role". Tiny table
-- now, but cheap insurance.
create index if not exists screenshots_uploaded_by_idx
  on public.screenshots (uploaded_by)
  where deleted_at is null;

-- ════════════════════════════════════════════════════════════════════
-- 7. Helper functions used by RLS policies (in the next migration)
--
-- Both are SECURITY DEFINER because they read from user_passcodes, which
-- has RLS that blocks all client reads (service-role only). The function
-- owner (postgres) bypasses RLS — the function then exposes only the
-- minimal answer (the current member's role / a single boolean).
--
-- `set search_path = public` is a security best practice for SECURITY
-- DEFINER functions — prevents schema-shadowing attacks where a caller
-- creates a malicious `roles` table in a search-path schema.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.current_member_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role
    from public.user_passcodes
   where email = lower(auth.jwt() ->> 'email')
     and enabled = true
$$;

comment on function public.current_member_role() is
  'Returns the role string for the currently-authenticated member, or NULL if the '
  'caller has no enabled passcode row. Used by RLS policies via '
  'current_member_has_capability(). SECURITY DEFINER so policies can read the '
  'service-role-only user_passcodes table.';

create or replace function public.current_member_has_capability(cap text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.role_capabilities
     where role_id = public.current_member_role()
       and capability = cap
  )
$$;

comment on function public.current_member_has_capability(text) is
  'Returns true if the currently-authenticated member''s role includes the named '
  'capability. Returns false (not NULL) for anon callers and for disabled members. '
  'Pair with RLS policies that say `using (current_member_has_capability(''delete_any''))`.';

-- Only authenticated callers should execute these (anon never has a JWT
-- email to look up). Defensive — `revoke from public` undoes the default
-- `grant execute to public` that Postgres applies on function creation.
revoke execute on function public.current_member_role()                from public;
revoke execute on function public.current_member_has_capability(text)  from public;
grant  execute on function public.current_member_role()                to authenticated;
grant  execute on function public.current_member_has_capability(text)  to authenticated;
