-- Mentions, notifications & tasks — M0 schema.
--
-- Backs @-mentions in comment composers, an in-app notification bell, and
-- mention-as-task (a mention the author flags as "needs action", which the
-- recipient resolves). In-app only — no email/push.
--
-- DESIGN DECISIONS (locked 2026-06-22, see docs/mentions-notifications-tasks-addendum.md):
--   - Identity is EMAIL-based, not auth.users(id). This matches every existing
--     pattern in the project: screenshot_comments.user_email, and the
--     admins_self_select RLS policy (auth.jwt() ->> 'email'). auth.users rows
--     are created lazily on first login, so a minted-but-never-logged-in member
--     has no id to mention — email is the only stable key for the whole roster.
--   - mentioned_email / recipient_email FK → user_passcodes(email) ON DELETE
--     CASCADE: you can only mention real members; their rows clean up on delete.
--   - actor_email FK → user_passcodes(email) ON DELETE SET NULL: keep the row,
--     drop attribution if the actor is later removed.
--   - A "task" is a notification with requires_action = true and resolved_at
--     null. Only the recipient can resolve it (recipient-only UPDATE RLS).
--   - Non-admins need the roster to know who to @, so a read-only view exposes
--     ONLY email + enabled (no hashes, no lockout state) to authenticated users.
--
-- Companion code (to be added in later milestones — none exists yet):
--   - designer/src/hooks/use-team-roster.ts        (M1, reads mentionable_members)
--   - designer/src/components/MentionTypeahead.tsx (M1)
--   - designer/src/hooks/use-notifications.ts      (M3)
--   - designer/src/components/NotificationBell.tsx (M3)
--
-- Rollback:
--   drop view if exists public.mentionable_members;
--   drop table if exists public.notifications;
--   drop table if exists public.comment_mentions;

-- ────────────────────────────────────────────────────────────────────
-- 1. comment_mentions — who was mentioned in which comment.
--    One row per (comment, mentioned member). The comment text keeps the
--    plain "@local-part" string; this table is the structured source of
--    truth for rendering chips and querying "all mentions of X".
-- ────────────────────────────────────────────────────────────────────
create table if not exists public.comment_mentions (
  id              uuid primary key default gen_random_uuid(),
  comment_kind    text not null check (comment_kind in ('screenshot', 'video')),
  comment_id      uuid not null,
  mentioned_email text not null references public.user_passcodes(email) on delete cascade,
  actor_email     text          references public.user_passcodes(email) on delete set null,
  created_at      timestamptz not null default now(),
  unique (comment_kind, comment_id, mentioned_email)
);

create index if not exists idx_comment_mentions_user_recent
  on public.comment_mentions (mentioned_email, created_at desc);

create index if not exists idx_comment_mentions_comment
  on public.comment_mentions (comment_kind, comment_id);

comment on table public.comment_mentions is
  'Structured @-mentions. Keyed by email (project convention); FK to '
  'user_passcodes so only real members can be mentioned.';

-- ────────────────────────────────────────────────────────────────────
-- 2. notifications — the bell''s queue. One row per thing the recipient
--    should know about. type = ''mention'' (passive) or ''task'' (needs
--    action). The task columns make "open until done" real without a
--    separate tasks table.
-- ────────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_email text not null references public.user_passcodes(email) on delete cascade,
  actor_email     text          references public.user_passcodes(email) on delete set null,
  type            text not null check (type in ('mention', 'task')),
  source_kind     text not null check (source_kind in ('screenshot_comment', 'video_comment')),
  -- The comment id. Not a FK: it points into one of two comment tables
  -- (screenshot_comments / catalogue_video_comments) depending on source_kind.
  source_id       uuid not null,
  -- Short preview for the dropdown without joining back to the comment.
  -- Trimmed to 140 chars client-side before insert.
  preview         text,
  -- Deep-link payload, e.g. { "screenshot_id": "…" } or { "external_id": "…" }.
  context         jsonb not null default '{}'::jsonb,
  -- Task fields. requires_action = true → shows in "Needs your action" and
  -- stays open until resolved_at is set. resolved_by = email of who closed it
  -- (recipient only, per RLS).
  requires_action boolean not null default false,
  resolved_at     timestamptz,
  resolved_by     text,
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);

-- Hot path: "my unread notifications, newest first."
create index if not exists idx_notifications_recipient_unread
  on public.notifications (recipient_email, created_at desc)
  where read_at is null;

-- "show last N (read or unread)".
create index if not exists idx_notifications_recipient_recent
  on public.notifications (recipient_email, created_at desc);

-- "my open tasks" — the "Needs your action" section.
create index if not exists idx_notifications_recipient_open_tasks
  on public.notifications (recipient_email, created_at desc)
  where requires_action = true and resolved_at is null;

comment on table public.notifications is
  'In-app notification queue. type=mention (passive) or task (needs action). '
  'Email-keyed; recipient-only read/update via RLS.';

-- ────────────────────────────────────────────────────────────────────
-- RLS — email-based, matching admins_self_select (auth.jwt() ->> 'email').
-- ────────────────────────────────────────────────────────────────────
alter table public.comment_mentions enable row level security;
alter table public.notifications   enable row level security;

-- comment_mentions: insert as yourself; read mentions you sent or received.
drop policy if exists comment_mentions_insert on public.comment_mentions;
create policy comment_mentions_insert on public.comment_mentions
  for insert to authenticated
  with check (actor_email = auth.jwt() ->> 'email');

drop policy if exists comment_mentions_select on public.comment_mentions;
create policy comment_mentions_select on public.comment_mentions
  for select to authenticated
  using (
    mentioned_email = auth.jwt() ->> 'email'
    or actor_email  = auth.jwt() ->> 'email'
  );

-- notifications: recipient-only read/update; insert as yourself (the actor).
-- Recipient enforcement of "real member" is via the FK + client-side roster;
-- if server-side validation is ever needed, an Edge Function takes the insert.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_email = auth.jwt() ->> 'email');

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_email = auth.jwt() ->> 'email')
  with check (recipient_email = auth.jwt() ->> 'email');

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (actor_email = auth.jwt() ->> 'email');

-- ────────────────────────────────────────────────────────────────────
-- 3. mentionable_members — read-only roster for the @ typeahead.
--
--    user_passcodes has RLS with no policies → only the service role can
--    read it. Non-admins still need the list of who to mention. This view
--    exposes ONLY email + enabled — never passcode_hash, lockout state, or
--    counters. A standard (non-security_invoker) view runs with the view
--    owner''s rights, so authenticated users read these two columns through
--    it without gaining access to the base table.
--
--    Security note: this intentionally surfaces every member''s email to
--    every authenticated user. Acceptable — members are internal teammates
--    and emails are required to address them. Flagged as security-sensitive
--    in the addendum; revisit if the member set ever includes outsiders.
-- ────────────────────────────────────────────────────────────────────
create or replace view public.mentionable_members as
  select email, enabled
  from public.user_passcodes;

grant select on public.mentionable_members to authenticated;

comment on view public.mentionable_members is
  'Read-only roster for @-mention typeahead. Exposes only email + enabled '
  'from user_passcodes to authenticated users; no secrets or lockout state.';
