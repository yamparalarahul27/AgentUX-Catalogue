# Mentions, Notifications & Tasks — Addendum

> **Status:** Decisions locked 2026-06-22. M0 migration **drafted** (not yet applied). UI milestones pending.
> **Companion to:** [`mentions-and-notifications-plan.md`](./mentions-and-notifications-plan.md) — read that first for the full v1 design.
> **What this doc adds:**
> 1. **[Part A](#part-a--identity-model-reconciliation)** — corrects the original plan's identity assumption (`auth.users(id)` + `display_name`) against how this codebase *actually* models users. This is a **blocker** for the M0 migration.
> 2. **[Part B](#part-b--mention--task-rahuls-idea)** — Rahul's idea: a mention can optionally create a *task* the recipient must act on, not just a passive ping.

<details>
<summary><strong>Why this addendum exists (read me)</strong></summary>

The original plan was written before anyone verified how identity flows through
this project. On inspection, two of its core assumptions don't match reality, and
getting them wrong would bake a mismatch into the schema that's painful to undo
later (foreign keys + RLS policies are the hardest things to change after data
lands). Part A fixes that. Part B is net-new scope Rahul asked to capture so it's
not lost.

Everything here is **verified against the actual code** — every claim cites a
`file:line`. Nothing is assumed from "projects like this usually…".

</details>

---

## Part A — Identity model reconciliation

### A.1 What the original plan assumed

The plan's §4 schema keys both new tables on `auth.users(id)` and renders mentions
using a `display_name`:

```sql
mentioned_user_id uuid not null references auth.users(id) on delete cascade,
actor_user_id     uuid references auth.users(id) on delete set null,
```

…and RLS uses `auth.uid()`:

```sql
with check (actor_user_id = auth.uid())
using (recipient_user_id = auth.uid())
```

…and the typeahead roster is `{ user_id, email, display_name }`
([plan §5 / §6.1](./mentions-and-notifications-plan.md)).

### A.2 What the code actually does

| Question | Reality | Evidence |
|---|---|---|
| **Do `auth.users` rows exist?** | **Yes** — but **lazily**. The first time an email redeems its passcode, `auth-login` calls `createUser`. A member who's been *minted but never logged in* has **no `auth.users.id` yet**. | [`auth-login/index.ts:110-115`](../supabase/functions/auth-login/index.ts) — `supabase.auth.admin.createUser({ email, email_confirm: true })` |
| **How do comments identify a user?** | By **email string**, not a UUID FK. | [`CatalogueFamilyLightbox.tsx:113`](../designer/src/components/CatalogueFamilyLightbox.tsx) `user_email: string`; insert at `:882` / `:1134` uses `user_email: userEmail` |
| **How does existing per-user RLS work?** | By **email from the JWT**, not `auth.uid()`. | [`20260513_auth_passcodes.sql:59-61`](../supabase/migrations/20260513_auth_passcodes.sql) — `admins_self_select … using (email = auth.jwt() ->> 'email')` |
| **What does the Members roster expose?** | `email`, `enabled`, `role`, `is_admin`, timestamps. **No `user_id`. No `display_name`.** | [`auth-passcode.ts:84-93`](../designer/src/lib/auth-passcode.ts) `interface MemberRow` |
| **Is there a `display_name` anywhere?** | **No.** The display convention is the **email local-part**. | `grep display_name` → only the plan doc + unrelated video code. Handle derived at [`CatalogueFamilyLightbox.tsx:1983`](../designer/src/components/CatalogueFamilyLightbox.tsx): `parent.user_email.split('@')[0]` |

### A.3 The problem in one sentence

> The plan's `auth.users(id)` FK is *technically valid* (rows do exist), but it
> diverges from the **email-based identity** every other table and policy in this
> project already uses — and it breaks for **minted-but-never-logged-in members**,
> who have no `auth.users.id` to mention yet.

Two concrete failure modes if we ship the plan as written:

1. **You can't mention a teammate who hasn't logged in yet.** The typeahead would
   need their `user_id`, which doesn't exist until their first login. They're in
   the Members roster (by email) but have no auth row.
2. **RLS inconsistency.** `auth.uid()` vs `auth.jwt() ->> 'email'` — mixing the two
   across tables makes policies harder to reason about and audit.

### A.4 Recommendation — key everything by email

Mirror what comments and the `admins` policy already do. This is the
**lowest-surprise** path and removes the lazy-creation gap entirely.

> **Trade-off, stated honestly:** email-as-key means if a teammate's email ever
> changes, their historical mentions/notifications don't auto-follow. In practice
> emails are stable here (they're the passcode primary key — changing one is a
> delete+re-mint today anyway), so this is acceptable. If we ever add real account
> portability, a `user_id` migration is a contained follow-up.

#### Revised schema (email-keyed)

```sql
-- comment_mentions — who was mentioned in which comment.
create table public.comment_mentions (
  id uuid primary key default gen_random_uuid(),
  comment_kind text not null check (comment_kind in ('screenshot', 'video')),
  comment_id uuid not null,
  mentioned_email text not null,          -- was: mentioned_user_id uuid → auth.users(id)
  actor_email     text not null,          -- was: actor_user_id
  created_at timestamptz not null default now(),
  unique (comment_kind, comment_id, mentioned_email)
);

create index idx_comment_mentions_user_recent
  on public.comment_mentions (mentioned_email, created_at desc);
create index idx_comment_mentions_comment
  on public.comment_mentions (comment_kind, comment_id);

-- notifications — the bell's queue.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,           -- was: recipient_user_id uuid
  actor_email     text not null,           -- was: actor_user_id
  type text not null check (type in ('mention')),
  source_kind text not null check (source_kind in ('screenshot_comment', 'video_comment')),
  source_id uuid not null,
  preview text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index idx_notifications_recipient_unread
  on public.notifications (recipient_email, created_at desc)
  where read_at is null;
create index idx_notifications_recipient_recent
  on public.notifications (recipient_email, created_at desc);
```

> **Note on FKs:** we *could* `references public.user_passcodes(email)` to keep
> mentions pointing at real members. Recommended **yes** for `mentioned_email` and
> `actor_email` with `on delete cascade` / `set null` semantics mirrored from the
> `admins` table — it guarantees you can't mention a non-member and cleans up if a
> member is deleted. Confirm before M0.

#### Revised RLS (JWT email, matching `admins_self_select`)

```sql
alter table public.comment_mentions enable row level security;
alter table public.notifications   enable row level security;

create policy "comment_mentions_insert" on public.comment_mentions
  for insert to authenticated
  with check (actor_email = auth.jwt() ->> 'email');

create policy "comment_mentions_select" on public.comment_mentions
  for select to authenticated
  using (
    mentioned_email = auth.jwt() ->> 'email'
    or actor_email  = auth.jwt() ->> 'email'
  );

create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (recipient_email = auth.jwt() ->> 'email');

create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (recipient_email = auth.jwt() ->> 'email')
  with check (recipient_email = auth.jwt() ->> 'email');

create policy "notifications_insert" on public.notifications
  for insert to authenticated
  with check (actor_email = auth.jwt() ->> 'email');
```

#### Display label

Use the **email local-part** (`email.split('@')[0]`) as the rendered handle,
exactly like the existing comment author display
([`CatalogueFamilyLightbox.tsx:1983`](../designer/src/components/CatalogueFamilyLightbox.tsx)).
Mention chips render `@rahul` from `rahul@equicomtech.com`. If real display names
are wanted later, add a `display_name` column to `user_passcodes` and resolve
through it — a clean, additive follow-up that doesn't touch the mention tables.

#### Roster source

The plan's `useTeamRoster()` hook can read straight from the existing
`MemberRow[]` (`callAdmin('list', …)`) — **but** that's an admin-only Edge Function
today. Non-admins need a roster too, to mention people. **Open question A-1**
(below) covers how to expose a minimal, non-sensitive roster (just emails) to all
authenticated users.

### A.5 Impact on the plan's milestones

| Plan milestone | Change |
|---|---|
| **M0 — Migration** | Use the **email-keyed** schema + RLS above instead of plan §4. ~same LOC. |
| **M1 — MentionTypeahead** | Roster shape becomes `{ email }` (label = local-part). Drop `user_id` / `display_name`. |
| **M2 — Wire composers** | Insert `mentioned_email` / `actor_email`. Self-mention check compares `email`, not `user_id`. |
| **M3 — Bell + hook** | Realtime filter becomes `recipient_email=eq.<email>`. Hook takes `email` not `userId`. |
| **M4 — Deep-link** | Unchanged. |
| **M5 — Polish** | Unchanged. |

---

## Part B — Mention → Task (Rahul's idea)

> **The idea:** tagging someone in a comment can do more than notify them — it can
> create a *task* they're expected to act on, that stays open until they resolve it.

### B.1 Framing: a ping vs. an obligation

A **mention** says *"FYI, look at this."* A **task** says *"you owe an action here,
and it stays open until closed."* That difference is the whole feature: a task
carries **state** (open → done) that a notification doesn't. Everything below is
about adding the smallest amount of state that makes "open until done" real.

### B.2 Three ways to build it

| Option | What it is | Cost | Verdict |
|---|---|---|---|
| **1. Notify-only** | Mentions are just read/unread pings. No task concept. (= the original plan.) | Zero extra | The v1 baseline. |
| **2. Mention-as-task (lean)** | A mention can be flagged "needs action." It shows as a task in the bell and stays open until the recipient marks it done. **Two extra columns, no new table.** | Tiny | ⭐ **Recommended next step.** |
| **3. First-class tasks** | Separate `tasks` table: assignee, status, due date, dedicated "My Tasks" board. Mentions optionally spawn a task. | Real feature, own UI surface | Defer until 2 proves the need. |

**Recommendation:** ship the plan (option 1) first; design the notifications table
now so **option 2 is a clean additive follow-on**; don't build option 3 until
people actually use mentions. This mirrors how the plan already defers email to v2.

### B.3 Option 2 in detail (the recommended extension)

#### Schema delta — two columns on `notifications`

```sql
alter table public.notifications
  add column requires_action boolean not null default false,
  add column resolved_at     timestamptz,
  add column resolved_by     text;          -- email of who closed it (usually = recipient)
```

That's the entire data model. No new table. A "task" is simply a notification with
`requires_action = true` that isn't yet `resolved_at`.

> Widen the `type` check to make intent explicit and queryable:
> ```sql
> -- from: check (type in ('mention'))
> -- to:   check (type in ('mention', 'task'))
> ```
> A `'task'`-type row is a mention the author explicitly turned into an action item.

#### How the author marks a mention as a task

In the comment composer, after picking `@rahul`, a small affordance turns the
mention into an ask:

```
┌──────────────────────────────────────────────┐
│  Comment composer                              │
│  ┌──────────────────────────────────────────┐ │
│  │ @rahul can you re-shoot the empty state?  │ │
│  └──────────────────────────────────────────┘ │
│  ◻ Needs action from @rahul        [ Post ]    │   ← unchecked = plain mention
└──────────────────────────────────────────────┘
```

- **Unchecked** → today's behavior: a `'mention'` notification, read/unread only.
- **Checked** → a `'task'` notification with `requires_action = true`.

> Keep it dead simple for v1: **one checkbox per comment**, applying to all
> mentions in that comment. Per-mention granularity ("task for Rahul, FYI for
> Sara") is an option-3 nicety — don't build it yet.

#### Recipient's bell — two sections

```
┌─────────────────────────────────────────────────┐
│  Notifications                          ⚙        │
│ ───────────────────────────────────────────────  │
│  NEEDS YOUR ACTION (1)                            │
│  ┌─────────────────────────────────────────────┐ │
│  │ ● Rahul asked you to act          2m ago    │ │
│  │   "@rahul can you re-shoot the empty…"      │ │
│  │   Lightbox · groups/auth/screen-01          │ │
│  │                              [ Mark done ✓ ] │ │   ← sets resolved_at
│  └─────────────────────────────────────────────┘ │
│ ───────────────────────────────────────────────  │
│  EARLIER                                          │
│   Sara mentioned you             1h ago           │
│   …                                               │
└─────────────────────────────────────────────────┘
```

- Tasks pin to a **"Needs your action"** group at the top; they do **not** clear on
  click (unlike plain mentions). They clear only on **Mark done**.
- The bell badge can show two numbers later (e.g. `2 · 1`= 2 unread, 1 open task);
  for v1 a single count of *unread + open tasks* is fine.
- **Open question B-1:** should "Mark done" be doable only by the recipient, or also
  by the author (who might resolve it themselves)? Default: recipient only; author
  can see status but not close. RLS already restricts UPDATE to the recipient — so
  recipient-only is the free default.

#### Flow delta (vs. plan §7)

Identical to the plan's client-side insert, with one field added:

```ts
await supabase.from('notifications').insert(
  toNotify.map((email) => ({
    recipient_email: email,
    actor_email:     selfEmail,
    type:            needsAction ? 'task' : 'mention',
    requires_action: needsAction,
    source_kind:     'screenshot_comment',
    source_id:       comment.id,
    preview:         text.slice(0, 140),
    context:         { screenshot_id: screenshotId },
  })),
);
```

Resolving:

```ts
await supabase.from('notifications')
  .update({ resolved_at: new Date().toISOString(), resolved_by: selfEmail })
  .eq('id', notificationId);   // RLS guarantees you can only resolve your own
```

### B.4 What option 2 deliberately does NOT do (and how option 3 would)

| Capability | Option 2 | Option 3 (later) |
|---|---|---|
| Open/done state | ✅ (`resolved_at`) | ✅ |
| Due dates | ❌ | ✅ `due_at` column |
| A "My Tasks" page separate from the bell | ❌ (lives in the bell) | ✅ dedicated board |
| Tasks not tied to a comment | ❌ (always born from a mention) | ✅ standalone tasks |
| Reassigning a task | ❌ | ✅ |
| Per-mention task granularity | ❌ (one checkbox per comment) | ✅ |

The forward-compatibility win: because a task is just a `notifications` row, the
columns added in B.3 (`requires_action`, `resolved_at`, `resolved_by`) are exactly
the ones a future `tasks` table would need — so option 3 can either grow the
`notifications` table further or migrate task-rows out into their own table without
reworking the mention pipeline.

---

## Decisions — LOCKED (2026-06-22)

All resolved with Rahul. These are now binding for the M0 migration and the
implementation milestones.

<table>
<tr><th>#</th><th>Question</th><th>Decision</th></tr>
<tr>
  <td><strong>A-1</strong></td>
  <td>How do <em>non-admin</em> users get the mentionable roster?</td>
  <td>✅ <strong>Read-only emails view.</strong> A Postgres view over
  <code>user_passcodes</code> exposing <em>only</em> <code>email</code> +
  <code>enabled</code> (no hashes, no lockout state), readable by all
  authenticated users. The <code>@</code> typeahead reads from it.</td>
</tr>
<tr>
  <td><strong>A-2</strong></td>
  <td>Email-as-key — accept that a future email change won't carry history?</td>
  <td>✅ <strong>Yes.</strong> Emails are the passcode PK and effectively
  immutable today.</td>
</tr>
<tr>
  <td><strong>A-3</strong></td>
  <td>FK <code>mentioned_email</code>/<code>actor_email</code> →
  <code>user_passcodes(email)</code>?</td>
  <td>✅ <strong>Yes, with cascade.</strong> Prevents mentioning non-members;
  auto-cleans on member delete. Mirrors the <code>admins</code> FK.</td>
</tr>
<tr>
  <td><strong>B-1</strong></td>
  <td>Build mention-as-task now, or ship plain mentions first?</td>
  <td>✅ <strong>Build tasks fully now.</strong> Task columns land in M0 <em>and</em>
  the task UI (composer checkbox, "Needs your action" bell section, Mark done)
  ships in v1.</td>
</tr>
<tr>
  <td><strong>B-2</strong></td>
  <td>Who can mark a task done?</td>
  <td>✅ <strong>Recipient only.</strong> Free under the recipient-only UPDATE RLS.</td>
</tr>
<tr>
  <td><strong>—</strong></td>
  <td>Delivery channel</td>
  <td>✅ <strong>In-app only.</strong> Bell + dropdown. No email, no push. (Email
  remains a v2 consideration.)</td>
</tr>
</table>

> **Migration drafted from these decisions:**
> [`supabase/migrations/20260622_mentions_notifications_tasks.sql`](../supabase/migrations/20260622_mentions_notifications_tasks.sql)
> — **draft, not yet applied to any database.** Review before running against staging.

---

## Spec amendments — 2026-06-22 (post-review)

A focused review of the draft migration surfaced five gaps. Two are fixed
in the migration itself; three are spec-level clarifications below that
the implementation milestones (M2, M3) depend on.

### Migration changes (applied in same PR)

1. **`mentionable_members` filters `WHERE enabled = true`.** Disabled
   members can't be mentioned — enforced at the view rather than expected
   of every client. The view also drops the `enabled` column from its
   projection since every row is `true` by definition.
2. **`notifications` added to the `supabase_realtime` publication.** The
   bell's `postgres_changes` subscription would otherwise return
   success but receive no events — silent failure that M3 would have to
   debug from scratch.

### Spec clarification — badge count formula (binding for M3)

The bell badge shows `unread + open tasks`, deduplicated. A row that is
both unread AND an open task counts **once**. SQL:

```sql
select count(*) from public.notifications
where recipient_email = (auth.jwt() ->> 'email')
  and (
    read_at is null
    or (requires_action = true and resolved_at is null)
  );
```

Display cap: `9+` for any count ≥ 10. No badge below 1.

### Spec clarification — mention-on-edit (binding for M2)

If a user edits a comment to **add** a new mention, **no** notification fires
(matches the original "no edit-fire" decision in §3).

If a user edits a comment to **remove** an existing `@<email>` from the text,
the corresponding `comment_mentions` row and any unread `notifications` row
**stay**. Rationale:

- Recipient may have already seen the bell; rewriting history is jarring.
- Edit-time mention-diffing is non-trivial (would need text → mention
  parse-and-compare) for a v1 nicety.
- Comment text and mention metadata diverging is acceptable — the chip
  renderer falls back to plain text when no matching mention row exists,
  so the displayed comment is internally consistent.

M2 must therefore: parse mentions **only on insert**, never re-derive on
update.

### Spec clarification — orphan-on-comment-delete (binding for M2)

`notifications.source_id` is intentionally not a FK (it points into one of
two comment tables). If a comment is **hard-deleted**, the linked mention +
notification rows are orphaned.

For v1 this is fine — comments use the soft-delete tombstone path
([`CatalogueFamilyLightboxCommentItem`](../designer/src/components/CatalogueFamilyLightboxCommentItem.tsx#L159))
and aren't actually removed. The bell click-through lands on the tombstone
("Comment removed"), which is acceptable.

When a hard-delete sweep is ever added (future cleanup migration), add
either:
- A Postgres trigger on `screenshot_comments` / `catalogue_video_comments`
  `BEFORE DELETE` that deletes related `comment_mentions` and
  `notifications` rows, **or**
- A nightly cron that prunes orphans (cheaper to maintain but eventual-consistency).

### Nits documented but not addressed in v1

- **Long-email display labels** (`firstname.lastname@…` → `@firstname.lastname`)
  look awkward in chips. Add a `display_name` column to `user_passcodes`
  later — additive, doesn't touch the mention tables.
- **No mention-burst rate limit.** A user could `@`-blast the whole team in
  one comment. Fine at the current team size; revisit if the member count
  ever exceeds ~20.
- **`mentionable_members` runs as view owner.** If Supabase ever flips view
  defaults toward `security_invoker = true`, the view stops bypassing
  base-table RLS and breaks. Hardening: pin
  `security_invoker = false` explicitly, or move to a base-table policy
  grant. Low-priority.

---

## Cross-references

- [`mentions-and-notifications-plan.md`](./mentions-and-notifications-plan.md) — the v1 plan this corrects/extends.
- [`supabase/functions/auth-login/index.ts`](../supabase/functions/auth-login/index.ts) — lazy `auth.users` creation (A.2).
- [`supabase/migrations/20260513_auth_passcodes.sql`](../supabase/migrations/20260513_auth_passcodes.sql) — email-based RLS precedent (`admins_self_select`).
- [`designer/src/lib/auth-passcode.ts`](../designer/src/lib/auth-passcode.ts) — `MemberRow` (no `user_id` / `display_name`).
- [`designer/src/components/CatalogueFamilyLightbox.tsx`](../designer/src/components/CatalogueFamilyLightbox.tsx) — comment identity (`user_email`) + display convention (`split('@')[0]`).
- [`docs/security-auth-passcode-and-members.md`](./security-auth-passcode-and-members.md) — frozen auth/members spec.
</content>
</invoke>
