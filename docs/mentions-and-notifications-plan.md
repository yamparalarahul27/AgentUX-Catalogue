# Mentions & Notifications — Plan

> **Status:** Draft, awaiting approval before any code change.
> **Scope:** `@`-mention syntax in comment composers + in-app notification bell.
> **Out of scope for v1:** email delivery, mention-on-edit, role-aware mentions
> ("@team" / "@everyone"), reactions, push notifications.

---

## 1. Why

Today, you can post a comment but there's no way to tell a specific teammate
"hey, look at this." The only way they find out is by happening to revisit the
screenshot. Adding `@user` mentions + a notification bell closes that loop
without adding email infrastructure.

---

## 2. The shift

**Before:**
- Comments are plain text. No way to address a specific person.
- No notification surface. The bell area in the header is empty.

**After:**
- Typing `@` in any comment composer opens a typeahead of team members.
  Selecting one inserts the mention and writes a row to a mention table.
- A bell icon in the catalogue header shows unread mention count.
- Clicking the bell opens a dropdown with the last N notifications
  (actor avatar, "mentioned you in …", relative time, deep-link to the
  comment in context).
- Clicking a notification marks it read and navigates to the lightbox /
  video preview with the comment scrolled into view.
- New mentions stream in via Supabase Realtime — no polling.

---

## 3. Decisions baked into this plan

These follow defaults the proposing turn suggested. Flag any to revisit
*before* the first PR; flipping them after the schema lands is much harder.

| Decision | Choice | Why |
|---|---|---|
| **Who can be mentioned?** | Only existing team members from the Members panel roster | Closes a spam-mention vector against arbitrary emails. Keeps the auth allowlist as the only door. |
| **Bell placement** | Top-right of the catalogue header, immediately before the account chip | Same spatial slot as GitHub / Slack / Linear. Already-built tooltip recipe (`IconTooltip`) applies. |
| **Mention surfaces** | Both screenshot lightbox comments and video preview comments (X-post + YouTube) | Two composers, same typeahead component, one mention table — no extra cost to cover both. |
| **Email channel** | Defer to v2 | Ship the bell first. Add an Edge Function + per-user `notify_by_email` toggle later if real users ask. |
| **Self-mention** | Don't notify yourself | Standard everywhere. |
| **Mention-on-edit** | Don't fire | v1 only on insert. Edge cases multiply otherwise (what if the edit *removes* a mention?). |
| **Comment soft-delete** | Notification stays, but click-through shows "Comment removed" tombstone | The Thanos-snap behavior PR #211 already handles tombstones — notification just lands you on it. |

---

## 4. Schema

Two new tables. Both keyed by `auth.users(id)` directly — no new `profiles`
table needed (consistent with how `screenshot_comments` and
`catalogue_video_comments` already reference users via `user_email`).

```sql
-- ─────────────────────────────────────────────────────────────────
-- 1. comment_mentions — join table, source of truth for "who was
--    mentioned in which comment." One row per (comment, user).
--    Notification rows are derived from these, but we keep this
--    table separate so the comment_text stays human-readable and
--    we can query "all mentions of user X" cheaply.
-- ─────────────────────────────────────────────────────────────────
create table public.comment_mentions (
  id uuid primary key default gen_random_uuid(),
  comment_kind text not null check (comment_kind in ('screenshot', 'video')),
  comment_id uuid not null,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (comment_kind, comment_id, mentioned_user_id)
);

create index idx_comment_mentions_user_recent
  on public.comment_mentions (mentioned_user_id, created_at desc);

create index idx_comment_mentions_comment
  on public.comment_mentions (comment_kind, comment_id);

-- ─────────────────────────────────────────────────────────────────
-- 2. notifications — the bell's queue. One row per "thing the user
--    should know about." Mentions are the only type for v1; the
--    schema reserves room for future types (reply, react, etc.).
-- ─────────────────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('mention')),
  source_kind text not null check (source_kind in ('screenshot_comment', 'video_comment')),
  source_id uuid not null,
  -- Short text preview shown in the bell dropdown without having to
  -- join back to the comment table. Trimmed to 140 chars by the
  -- client before insert.
  preview text,
  -- Used for deep-linking. e.g. ?lightbox=<screenshot_id>&comment=<id>
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- Hot index: "give me my unread notifications, newest first."
create index idx_notifications_recipient_unread
  on public.notifications (recipient_user_id, created_at desc)
  where read_at is null;

-- Cover-all index for the "show last N (read or unread)" path.
create index idx_notifications_recipient_recent
  on public.notifications (recipient_user_id, created_at desc);
```

### RLS

```sql
alter table public.comment_mentions enable row level security;
alter table public.notifications enable row level security;

-- comment_mentions: anyone authenticated can insert, can read mentions
-- they were the actor or recipient of. (Read access is mostly for
-- @mention-rendering inside the comment view — we resolve the user_id
-- back to a display label.)
create policy "comment_mentions_insert" on public.comment_mentions
  for insert to authenticated
  with check (actor_user_id = auth.uid());

create policy "comment_mentions_select" on public.comment_mentions
  for select to authenticated
  using (
    mentioned_user_id = auth.uid()
    or actor_user_id = auth.uid()
  );

-- notifications: recipient-only. Authenticated INSERTs are gated to
-- "the actor matches you AND the recipient is a real team member."
-- The client writes the row directly after creating the comment —
-- no Postgres trigger needed for v1.
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (recipient_user_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create policy "notifications_insert" on public.notifications
  for insert to authenticated
  with check (actor_user_id = auth.uid());
```

> **Note:** RLS for inserting notifications is permissive (`actor = auth.uid()`)
> because we can't validate via SQL that the recipient is a real team member —
> that's enforced *client-side* by only offering mentionable users from the
> Members roster. If we later need server-side enforcement, an Edge Function
> can take over the insert and validate against the allowlist.

---

## 5. Mention parsing & storage

**Storage format inside comment text:** plain `@<display_name>`. The structured
metadata lives in `comment_mentions`. This means:

- Comment bodies stay human-readable in the DB and on share pages.
- Mention rendering in the UI cross-references `comment_mentions` →
  `auth.users(id)` to resolve the current display name (so renames don't
  rot inside old comments).
- If you copy-paste a comment elsewhere, you get `@Rahul` as text.

**Round-trip:**

```ts
// On compose:
//   user types "Looking good @Rahul!"
//   typeahead resolves "Rahul" → user_id "u_123"
//   we INSERT comment text "Looking good @Rahul!"
//   we INSERT comment_mentions { comment_id, mentioned_user_id: "u_123", ... }
//
// On render:
//   1. Fetch comment + its mention rows (already cheap via the
//      idx_comment_mentions_comment index).
//   2. Split text by /@(\w+)/ regex.
//   3. For each @<name> segment, look up the matching mention row
//      → render as a clickable chip with current display name.
```

### Mentionable user roster

`useTeamRoster()` hook (new) returns the same list `CatalogueMembersSection`
already loads — `{ user_id, email, display_name }`. Cached at session level
because the roster changes rarely.

---

## 6. UI components

### 6.1 `<MentionTypeahead>` — new

Used by **both** comment composers. Detects `@` at the cursor, opens a popover
anchored below the input, filters the team roster by what the user types after
the `@`.

```ts
interface MentionTypeaheadProps {
  inputRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
  onMentionSelected: (user: { user_id: string; display_name: string }) => void;
  roster: Array<{ user_id: string; email: string; display_name: string }>;
}
```

**Behavior:**

- `@` keystroke → open the popover at cursor coords.
- Type more → filter roster (`includes` on `display_name` + `email` prefix).
- ↑ / ↓ navigate; `Enter` or `Tab` selects; `Esc` closes.
- Selection replaces the `@<partial>` token with `@<display_name>` and fires
  `onMentionSelected` so the composer can collect mention IDs for the
  `comment_mentions` insert.
- Click outside closes without inserting.
- Backspacing through the `@` closes.

**Internal:** uses the same `IconTooltipProvider` portal trick the Radix tooltip
uses so the popover doesn't get clipped by the lightbox / modal boundary.

### 6.2 `<NotificationBell>` — new

Sits in the catalogue header next to the existing account chip. Three states:

| State | Rendering |
|---|---|
| Logged out | Hidden |
| Logged in, 0 unread | Bell icon, no badge |
| Logged in, N unread | Bell icon + indigo `N` badge (capped visually at `9+`) |

**Click** → opens a dropdown with the most recent 20 notifications, ordered
`created_at DESC`. Each item:

```
┌─────────────────────────────────────────────────┐
│ (R)  Rahul mentioned you                  2m ago│
│      "Hey @Yamparala, can you check this…"      │
│      Lightbox · groups/auth/screen-01           │
└─────────────────────────────────────────────────┘
```

- Unread items get a small dot + bolder text.
- Clicking an item:
  1. Marks it read (`UPDATE notifications SET read_at = now() WHERE id = …`).
  2. Decrements local unread count.
  3. Navigates: if `source_kind = 'screenshot_comment'`, opens the lightbox
     with `?screenshot=<id>&comment=<comment_id>`; if `'video_comment'`, opens
     the video preview modal scrolled to the comment.
- Footer: "Mark all read" — single `UPDATE` over all unread rows.

### 6.3 `useNotifications()` hook — new

```ts
function useNotifications(userId: string | null): {
  notifications: Notification[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}
```

- Initial fetch: most-recent 20 notifications on mount.
- Subscribes via Supabase Realtime:
  ```ts
  supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_user_id=eq.${userId}`,
      },
      (payload) => prepend(payload.new),
    )
    .subscribe();
  ```
- New notification arrives → prepended + unread count increments + soft
  ping sound (reusing the existing `useFeedback()` hook from `feedback-sounds.ts`).

---

## 7. Notification creation flow

Strictly client-side for v1. No Postgres trigger. The comment composer is
already authenticated and knows the mention IDs at submit time.

```ts
// Inside addComment() in CatalogueFamilyLightbox.tsx /
// CatalogueVideosSection.tsx (VideoCommentItem container)
async function addComment(text: string, mentions: Array<{ user_id: string }>) {
  // 1. Insert the comment as today
  const { data: comment, error } = await supabase
    .from('screenshot_comments')
    .insert({ /* …existing fields… */ text })
    .select('id')
    .single();
  if (error || !comment) return;

  // 2. Insert mention rows + notification rows in one round-trip.
  //    Each fires its own real-time event to the recipient's bell.
  if (mentions.length > 0) {
    const dedup = Array.from(new Set(mentions.map((m) => m.user_id)));
    const selfId = (await supabase.auth.getUser()).data.user?.id;
    const toNotify = dedup.filter((id) => id !== selfId);

    await supabase.from('comment_mentions').insert(
      toNotify.map((uid) => ({
        comment_kind: 'screenshot',
        comment_id: comment.id,
        mentioned_user_id: uid,
        actor_user_id: selfId,
      })),
    );

    await supabase.from('notifications').insert(
      toNotify.map((uid) => ({
        recipient_user_id: uid,
        actor_user_id: selfId,
        type: 'mention',
        source_kind: 'screenshot_comment',
        source_id: comment.id,
        preview: text.slice(0, 140),
        context: { screenshot_id: screenshotId },
      })),
    );
  }
}
```

**Trade-off documented**: two `INSERT` calls per mention burst (one to
`comment_mentions`, one to `notifications`). For 5+ mentions in one comment
this is still cheap. If it ever becomes hot, collapse into a single
SQL function + Postgres trigger.

---

## 8. Read-state semantics

- A notification is **unread** until `read_at` is set.
- `read_at` is set when the user **clicks** the item in the bell dropdown,
  OR clicks "Mark all read."
- Just opening the bell dropdown does *not* mark anything read — opening to
  glance is allowed.
- After 30 days, unread notifications are still kept (don't auto-purge). A
  future migration can add retention if the table grows.

---

## 9. Deep-link behavior

Notification click → URL with the comment in scope:

| `source_kind` | URL |
|---|---|
| `screenshot_comment` | `/designer?lightbox=<screenshot_id>&comment=<comment_id>` |
| `video_comment` | `/designer?tab=videos&v=<external_id>&comment=<comment_id>` |

The lightbox / video preview modal reads `?comment=` on mount and:
1. Opens the modal if not already.
2. Scrolls the comment thread to that specific comment's DOM node.
3. Briefly highlights it (1.5s glow via existing `--recently-viewed` keyframe).

---

## 10. Milestones

| # | Scope | Notes |
|---|-------|-------|
| **M0 — Migration** | `comment_mentions` + `notifications` tables, indexes, RLS. Verify in Supabase staging. | Blocker for M1. ~100 LOC SQL. |
| **M1 — MentionTypeahead component** | Standalone component + unit tests for cursor detection / arrow nav. Not wired into composers yet. | Self-contained, can be reviewed in isolation. |
| **M2 — Wire into both composers + notification inserts** | Lightbox `addComment` + video `addComment` collect mention IDs; create notifications on submit. | Server data starts flowing. |
| **M3 — NotificationBell + useNotifications hook** | Bell icon in header, dropdown, mark-read, real-time channel. | The bell lights up. |
| **M4 — Deep-link routing** | `?comment=<id>` handling in lightbox + video modal, scroll + highlight. | Closes the loop. |
| **M5 — Polish** | Sound + haptic on bell increment (reuse `useFeedback()`), "Mark all read" button, empty state ("No mentions yet."). | Optional but small. |

---

## 11. Definition of done

The feature ships when:

- Typing `@` in any comment composer opens the typeahead with the team roster.
- Selecting a mention writes both a `comment_mentions` row and a
  `notifications` row.
- The mentioned user sees their bell increment in real time (sub-second on
  a normal connection).
- Clicking the bell opens the dropdown; clicking an item navigates to the
  exact comment and marks it read.
- "Mark all read" clears the badge in one click.
- Self-mentions don't notify yourself.
- Mention-on-edit doesn't notify (v1 scope).
- Render path correctly resolves `@<display_name>` chips inside existing
  comments (i.e. mentions render the same in the bell, the lightbox, and
  the share page).
- RLS prevents reading other users' notifications (verified via SQL test
  with a non-recipient role).
- No regressions on the existing comment thread / edit / Thanos-snap behavior.

---

## 12. Risks & open questions

1. **Render on share page (anonymous):** the public share page renders
   comments via the existing `screenshot_comments` SELECT policy for `anon`.
   That SELECT doesn't join `comment_mentions`, so anonymous readers will see
   `@Rahul` as plain text. Acceptable for v1 (mention chip styling appears
   only for authenticated users). If we want chip rendering on share pages,
   we'd need to surface `comment_mentions` to anon-read too — *with display
   names only, no user IDs.*
2. **Roster freshness:** `useTeamRoster()` cache-lifetime. Cached for the
   session; if a member is added mid-session, the typeahead misses them
   until reload. Acceptable; a future SUBSCRIBE on `auth.users` changes
   could fix this.
3. **Typeahead anchoring inside modals:** the lightbox and video preview
   are modals — the typeahead popover must escape via portal so it doesn't
   get clipped by `overflow: hidden`. Reuses the IconTooltip portal pattern.
4. **Notification spam if a comment is edited to remove a mention:** the
   notification already fired. Acceptable per the "no edit-fire" decision —
   recipient sees it, follows the link, sees the current comment text. Mild
   surprise; acceptable.
5. **Cross-tab unread sync:** if you open the app in two tabs and mark read
   in one, the other still shows the dot until the next realtime event or
   refresh. Acceptable for v1. Fix later by subscribing to UPDATE events
   on `notifications` too.
6. **Email follow-up (v2):** the schema already has `actor_user_id` + a
   serializable `context` JSON so an Edge Function can render an email
   template from a notification row without joining anything else. Cheap
   to bolt on.

---

## 13. Out of scope (v1)

- Email delivery (defer to v2 — schema is forward-compatible).
- Mention-on-edit firing.
- Group mentions (`@team`, `@everyone`).
- Reactions (`+1`, ❤️ on a comment).
- Push notifications (browser / mobile PWA).
- Per-user notification preferences (mute thread, mute mentioner).
- Notification retention / archival.
- Server-side validation that recipient is a real team member (relies on
  client-side roster filtering + RLS allowlist).

---

## 14. Cross-references

- [`docs/backlog.md`](./backlog.md) — to be updated post-merge with v2 email
  item.
- [`supabase/migrations/20260523_screenshot_comments_public.sql`](../supabase/migrations/20260523_screenshot_comments_public.sql)
  — anon-read RLS this plan does NOT extend.
- [`supabase/migrations/20260620_screenshot_comments_edit_reply.sql`](../supabase/migrations/20260620_screenshot_comments_edit_reply.sql)
  — comment edit / reply / soft-delete behavior that we co-exist with.
- [`supabase/migrations/20260623_video_comments_edit.sql`](../supabase/migrations/20260623_video_comments_edit.sql)
  — same shape on the video side.
- `feedback-sounds.ts` + `useFeedback()` — the existing sound / haptic hook
  the bell increment reuses.
