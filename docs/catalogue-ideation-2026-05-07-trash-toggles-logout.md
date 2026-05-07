# Catalogue Ideation — May 7 2026 — Trash, per-email toggles, logout

> Roadmap doc for the next batch of features after the Labelling Studio
> merges (PRs #48–54). No implementation work yet — this captures the
> three asks, the recommended approach for each, the decisions awaiting
> a call, and the suggested order. We iterate on this doc, then split
> each feature into its own PR.

---

## 1. The asks

Verbatim from the user, post-merge of PRs #48 / #52 / #53 / #54:

1. **Trash** — *"where deleted screenshots will be after user delete, so
   user can restore if want and it will be automatically deleted after
   15 days if not restored."*
2. **Per-email feature toggles** — *"as admin, i want to have control
   over what features each email have, as simple as toggle on."*
3. **Logout** — *"user when comes and enter their email, there is no way
   to logout."*

---

## 2. Trash for deleted screenshots

### Goal
A 15-day soft-delete window. Deleting a card moves it to Trash. From
Trash the user can restore (full fidelity) or wait — after 15 days the
row + storage objects are purged automatically.

### Approach (recommended)
- Add `deleted_at timestamptz` to the family table (delete is
  family-level today; matches the current entry point).
- Every catalogue read filters `deleted_at IS NULL`.
- New "Trash" view (admin-only) lists rows with
  `deleted_at IS NOT NULL AND deleted_at > now() - interval '15 days'`.
- "Restore" sets `deleted_at = NULL`. Annotations and comments are
  untouched by the soft-delete, so they come back intact.
- "Empty Trash" admin button purges immediately.
- Background purge: `pg_cron` extension runs nightly, deletes families
  past the 15-day boundary plus their storage objects.

### Decisions awaiting a call

| # | Decision | Recommendation |
|---|----------|----------------|
| T1 | **Unit:** family-level (current delete unit) vs per-screenshot. | Family-level — matches the existing delete entry point. |
| T2 | **Purge mechanism:** (a) `pg_cron` nightly, (b) scheduled edge function, (c) opportunistic on app load. | (a) `pg_cron` — reliable, no client dependency. (c) is fragile. |
| T3 | **Visibility:** Trash page visible to all users vs admin-only. | Admin-only — matches how Delete works today. |
| T4 | **Storage:** delete storage objects at soft-delete vs at final purge. | At final purge only — restore is full-fidelity. |
| T5 | **Annotations / comments on restore:** preserved intact vs reset. | Preserved — the restore is reverting the delete, not a new card. |
| T6 | **UI entry:** Trash as a new top-level section in the sidebar vs a tab in Team Settings. | Sidebar section, only rendered for admin. Discoverable. |

### Out of scope (call out, don't do)
- Versioning / undo for non-delete edits (renames, crops). That's a
  separate "history" feature.
- Cross-account trash. Single-team app today.

---

## 3. Per-email feature toggles (admin)

### Goal
Admin can pick which features a given email has access to, by flipping
a toggle. Today flags are compile-time constants in
`designer/src/lib/feature-flags.ts` and apply globally.

### Approach (recommended)
- New table `user_feature_overrides(email text, flag_name text, enabled boolean, primary key (email, flag_name))`.
- Curated set of flag names is whitelisted in code — only boolean,
  user-facing flags appear in the matrix. Threshold flags (e.g.
  `ANNOTATION_EDIT_MIN_VIEWPORT_PX`) stay compile-time.
- Frontend: on auth, fetch the user's overrides into a context. A
  `useFeatureFlag(name)` hook returns the override if present, else
  the compile-time default.
- Admin UI: matrix of users × overridable flags. Each cell is a toggle.

### Decisions awaiting a call

| # | Decision | Recommendation |
|---|----------|----------------|
| F1 | **Scope:** all flags from `feature-flags.ts` vs a curated set. | Curated set — only boolean, user-facing ones. Marked in code. |
| F2 | **Granularity:** per-email vs per-team. | Per-email (what was asked). Per-team is cleaner long-term but premature. |
| F3 | **Default behaviour when no row exists:** fall back to compile-time constant vs treat absence as off. | Fall back to compile-time constant. Avoids breaking everyone on day one. |
| F4 | **UI location:** new "Feature Access" admin page vs a tab in Team Settings. | Tab in Team Settings — keeps admin surface in one place. |
| F5 | **User list source:** seeded from existing `comments.user_email` / `annotations.user_email` history vs a new `users` table. | Seed from history. Avoids a new auth-shaped table that overlaps with the pending RLS work. |
| F6 | **Coupling with auth:** ship before or after the auth gate. | After. Without real auth, "per-email" is self-asserted (anyone can type any email). See §5 for why this is load-bearing. |

### Out of scope
- Per-flag analytics (who has what enabled).
- Group-level toggles (admin / member).
- Time-bounded access (expires in N days).

---

## 4. Logout

### Goal
The "enter email" entry screen has no exit. Add a way for the user to
log out and return to the entry screen.

### Approach (recommended)
- Email is in `localStorage` today (no real session).
- Header shows a small avatar / email pill. Click → dropdown with
  "Logout".
- Logout clears the email key only and routes to the entry screen.
- UI prefs (filters, view mode) survive logout — losing them is
  annoying and unnecessary.

### Decisions awaiting a call

| # | Decision | Recommendation |
|---|----------|----------------|
| L1 | **Entry point:** header avatar / email pill vs link in Team Settings. | Header — discoverable, matches expectation. |
| L2 | **Confirm dialog:** prompt before logout vs just go. | Just go. Low blast radius. |
| L3 | **What to clear:** email only vs email + all cached prefs. | Email only. UI prefs persist. |

---

## 5. Coupling with the public-release checklist

The `CLAUDE.md` pre-public-release checklist already names two blockers
that overlap with this work:

- **RLS + auth gate** — anon key currently in the browser; anyone with
  the URL can read/write/delete. See
  [docs/security-rls-public-release.md](security-rls-public-release.md).
- **Claude Code permissions hardening** — see
  [docs/security-claude-permissions-public-release.md](security-claude-permissions-public-release.md).

The auth gate is load-bearing for **§3 Per-email feature toggles**.
Without it, the email a user types in is unverified — toggles can be
spoofed by typing someone else's email. Two options:

- **(A)** Ship #2 first, accept that "admin spoof prevention" lands
  later with the auth gate. Documented limitation.
- **(B)** Treat #2 + auth gate as one project. Larger PR but the
  feature-toggles story is honest from day one.

**Recommendation: (B).** Otherwise we ship a control surface that
literally cannot enforce its rule.

---

## 6. Suggested order

1. **#3 Logout** — self-contained UI change. Days, not weeks.
2. **#1 Trash** — localized data-model addition. One column, one new
   view, one cron job.
3. **Auth gate** (from the public-release checklist) bundled with
   **#2 Per-email feature toggles**.

Reason for the order:
- #3 unblocks #2 (you need to know who is logged in before you can
  toggle features for them).
- #1 is independent of both — could ship in parallel with #3 if there's
  bandwidth, but sequential is cleaner for review.
- #2 + auth gate together avoids the spoof gap.

---

## 7. Open questions for the user

Before any of this becomes code:

- Confirm the recommendations in §2, §3, §4. Especially T2 (`pg_cron`),
  F1 (curated flag set), and the §5 coupling decision (A vs B).
- Confirm the order in §6. If trash is more urgent than logout, swap
  them — they're independent.
- Anything missing from the lists above? E.g. should "deleted by"
  (email) appear on Trash rows for audit?

---

## 8. Status

**Planning — awaiting decisions.** No code. No DB migrations. No new
deps. This doc is the discussion artefact; once the decisions above are
called, each feature splits into its own implementation doc + PR.
