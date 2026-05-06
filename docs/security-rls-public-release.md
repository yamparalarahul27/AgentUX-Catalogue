# Security: RLS & Auth — Required Before Public Release from Portfolio

**Status:** Deferred. Tracked here for the public-release milestone (when the
catalogue is linked from `hirahul.xyz` portfolio and accessible to general
visitors).

This is a **decision document, not an implementation spec**. When we're ready
to tackle this, re-read it, confirm the chosen tier, then write a focused
implementation plan.

---

## Context

The Supabase Database Linter is currently flagging **CRITICAL** issues across
the public schema. Surfaced on 2026-05-06.

### Critical findings

**RLS Disabled in Public** (11 tables):

- `public.catalogue_video_references`
- `public.catalogue_video_comments`
- `public.catalogue_link_references`
- `public.catalogue_figma_requests`
- `public.screenshot_annotations`
- `public.screenshot_versions`
- `public.screenshot_bookmarks`
- `public.screenshot_comments`
- `public.feature_log_links`
- `public.feature_log`
- `public.screen_families`

**Security Definer View:**

- `public.feature_log_with_counts` — runs with view-owner privileges, would
  bypass RLS once enabled. Recreate as `SECURITY INVOKER` (default in PG 15+).

### Warn findings (perf, not security)

- **Auth RLS Initialization Plan** on `public.catalogue_settings` and
  `public.screenshots`. Policies that call `auth.uid()` directly re-evaluate
  per row. Mechanical fix: wrap in subselect — `(select auth.uid())`.

---

## Why this matters

The designer app at [`designer/src/lib/supabase.ts`](../designer/src/lib/supabase.ts:1)
ships the `VITE_SUPABASE_ANON_KEY` to the browser, as it must for a Vite SPA.
The anon key is **not a secret** — anyone who opens DevTools can grab it.

With RLS disabled, an attacker holding the anon key can:

- Read every row in `feature_log`, `screenshot_comments`, `*_references`, etc.
- Insert/update/delete arbitrary rows.
- Wipe `screen_families` with one curl call.

Today this is mitigated only by the URL being unlisted. Once the portfolio
links to it, security-through-obscurity ends.

The codebase has **no auth at all** — no `supabase.auth.signIn`, no session
checks. Every mutation in the app runs as anonymous. This is the constraint
that shapes the options below.

---

## Options

### Option A — Single auth gate + permissive RLS *(recommended)*

Add Supabase Auth with **magic-link only**, no public signup. Whitelist
allowed emails (hardcoded in policy or in an `allowed_emails` table). Every
table gets a uniform policy:

```sql
alter table public.screen_families enable row level security;
create policy "authed users full access"
  on public.screen_families for all
  to authenticated using (true) with check (true);
```

- **Effort:** ~1 day. One login screen, session persistence, RLS migration.
- **Pros:** Closes the critical hole. Anon key becomes useless without a
  session. Doesn't require restructuring data around `user_id`.
- **Cons:** Single-tenant in spirit. If we later want per-user data, we
  migrate again.
- **Telegram bot:** keeps using service role in the edge function (already
  bypasses RLS) — no change needed.

### Option B — Full per-user ownership

Multi-tenant: every row gets `user_id`, every policy is
`auth.uid() = user_id`, real signup/login flow.

- **Effort:** 1–2 weeks. Schema migration to add `user_id` to ~15 tables,
  backfill, signup flow, sharing model (team members will want to see each
  other's data → groups/orgs table).
- **Pros:** Future-proof if the catalogue ever goes fully public.
- **Cons:** Massive yak-shave for a tool with no users asking for accounts.
  Premature.

### Option C — Server-only writes, public reads

Strip the browser to read-only. Move every `insert/update/delete` to a
Vercel API route or Edge function gated by a session cookie / shared
password.

- **Effort:** 3–5 days. Touches ~30+ mutation sites in
  `use-catalogue-family-actions.ts`, `use-catalogue-upload.ts`,
  `CompareModal.tsx`, etc.
- **Pros:** Cleanest separation of trust.
- **Cons:** Loses Supabase's main ergonomics (direct client mutations,
  realtime, storage SDK). High refactor cost.

---

## Recommendation

**Option A.** Reasons:

1. Matches the actual product shape ("your team's single source of truth") —
   a few trusted people, not a public SaaS.
2. Closes the genuine critical risk with minimum disruption.
3. Buys 12 months of runway. If usage explodes and per-user data is needed,
   migrate to B then — with real signal, not speculation.
4. Plays nicely with the existing Telegram bot edge function (already uses
   service role).

---

## Open questions (answer before implementing)

- Whitelist emails — just `rahul@equicomtech.com`? A small list?
- Where does the login gate live? Drop into `designer/src/App.tsx` as a
  full-screen gate, or a `/login` route?
- Should the Telegram bot edge function continue to be the only "service
  role" actor? (Assumed: yes.)
- Anything currently relying on anonymous access we'd break? (e.g., shared
  `?group=` URLs — do those need to keep working unauthenticated?)
- What's the recovery story if the magic-link sender (Supabase Auth email)
  fails? Backup admin path?

---

## Companion fixes (small, do at the same time)

- Recreate `public.feature_log_with_counts` as `SECURITY INVOKER`.
- Wrap `auth.uid()` calls in `catalogue_settings` / `screenshots` policies
  with `(select auth.uid())` to silence the perf lint.

---

## Out of scope for this doc

- Storage bucket policies (`screenshots`, group icons) — audit separately
  when this lands; they likely need the same auth gate.
- Rate limiting / abuse prevention for the Telegram bot edge function.
- Audit log of who did what (post-MVP if needed).
