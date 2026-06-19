# Welcome modal didn't show for a newly onboarded user — diagnosis

> **Status:** Open. Reported 2026-06-19 after a real new-user onboarding.
> **TL;DR:** Code chain is intact end-to-end. The miss is almost certainly
> operational (Edge Function deploy lag, or `last_login_at` stamped before
> the user's real first login). This doc captures the verification path so
> the next person hitting this doesn't have to re-derive it.

---

## What's supposed to happen

| # | Where | What |
|---|-------|------|
| 1 | [`supabase/migrations/20260513_auth_passcodes.sql`](../supabase/migrations/20260513_auth_passcodes.sql) | `last_login_at timestamptz` — nullable, no default. Stays NULL on insert. |
| 2 | [`supabase/functions/auth-admin/index.ts:183-190`](../supabase/functions/auth-admin/index.ts#L183-L190) | Mints a `user_passcodes` row with `{ email, passcode_hash, enabled, role? }`. Does NOT touch `last_login_at` → stays NULL. |
| 3 | [`supabase/functions/auth-login/index.ts:100`](../supabase/functions/auth-login/index.ts#L100) | `wasFirstLogin = row.last_login_at === null` — sampled **before** the row is updated. |
| 4 | [`supabase/functions/auth-login/index.ts:141`](../supabase/functions/auth-login/index.ts#L141) | Returns `is_first_login: wasFirstLogin` in the response body. |
| 5 | [`designer/src/lib/auth-passcode.ts:67-75`](../designer/src/lib/auth-passcode.ts#L67-L75) | Client reads `body.is_first_login`, sets `sessionStorage['agentux:welcome-pending'] = '1'`. |
| 6 | [`designer/src/CatalogueApp.tsx:69`](../designer/src/CatalogueApp.tsx#L69) | Reads that flag on mount, renders the lazy `<WelcomeModal />`. |
| 7 | [`designer/src/components/WelcomeModal.tsx:79-80`](../designer/src/components/WelcomeModal.tsx#L79-L80) | Clears the flag once on mount so it's a one-shot. |

All seven steps were verified by `grep` + `read` on 2026-06-19. Nothing in the
chain is broken in `main`.

---

## Why the modal still might not show

Ranked by likelihood given the symptoms (real new user, fresh email, modal
silent on first login):

### 1. New `auth-login` Edge Function isn't deployed *(most likely)*

PR #107 introduced the `is_first_login` field. Edge Functions don't deploy
with code commits — they require a manual `supabase functions deploy
auth-login` (or a dashboard upload). If the deploy lagged:

- The deployed version returns no `is_first_login` field in its JSON body.
- The client reads `Boolean(undefined)` → `false`.
- No `WELCOME_FLAG` set, no modal.

**Verify:**
- Supabase dashboard → Edge Functions → `auth-login` → "Last deployed".
  Should be after the commit that added `is_first_login` (PR #107, 2026-05-18).
- Or, simulate from a fresh tab: log in, then in DevTools console:
  ```js
  // Just before navigation, inspect the network response of /functions/v1/auth-login.
  // Its JSON body must include is_first_login: true | false.
  ```

**Fix:** redeploy the function.

### 2. `last_login_at` was stamped before the actual user logged in

If an admin minted the passcode and then test-logged-in with it to confirm it
works, `user_passcodes.last_login_at` is now non-null. When the real user
logs in, step 3 reads `last_login_at = <admin test timestamp>` →
`wasFirstLogin = false` → no modal.

**Verify** in Supabase SQL editor:

```sql
SELECT email, created_at, last_login_at
FROM user_passcodes
WHERE email = '<new-user-email>';
```

If `last_login_at` is older than the user's actual first sign-in attempt,
this is the cause.

**Fix for this user (one-off):**
```sql
UPDATE user_passcodes
SET last_login_at = NULL
WHERE email = '<new-user-email>';
```
…then ask the user to log out + log back in. Next login will be detected as
first.

**Fix for the pattern:** admins should not test-log-in with the user's
passcode. Document this in the admin runbook.

### 3. Login bypassed the passcode flow

If the user already had a Supabase session (refresh token in their browser
from a prior attempt, magic link in URL, etc.), the SPA restores the session
without hitting `auth-login` at all. No call → no `is_first_login` → no flag.

**Verify:** ask the user whether they hit the passcode page at all on this
sign-in. If they landed straight in the catalogue, the session was restored.

### 4. Different tab

`WELCOME_FLAG` lives in **sessionStorage**, which is per-tab. If the user
authenticated in tab A and then opened the app in tab B (e.g. clicked a link
they had saved), tab B never sees the flag.

**Mitigation:** swap to `localStorage` with a per-user-id key. Cheap fix; one-
line change. Filed as a follow-up.

### 5. `sessionStorage` disabled

Private browsing in some configurations / strict cookie modes throw on
`setItem`. The setter is wrapped in `try/catch` and silently skips
([`auth-passcode.ts:71-74`](../designer/src/lib/auth-passcode.ts#L71-L74)) —
which is correct, but means the modal silently doesn't appear. Rare.

---

## Quickest single-step diagnostic

If we can ask the user to look in DevTools **right after login**, before any
navigation:

```js
sessionStorage.getItem('agentux:welcome-pending')
```

- `'1'` → flag is set; the bug is somewhere between login and `CatalogueApp`
  mount (rare; would mean the modal mounted, cleared the flag, but then
  failed to render).
- `null` → flag never got set; the cause is #1, #2, or #3 above.

---

## Suggested code-side follow-ups

1. **Self-diagnosing client.** When `auth-login` succeeds but the response is
   missing `is_first_login`, `console.warn` a one-line breadcrumb so this is
   instantly visible in DevTools next time. ~3 LOC in
   `auth-passcode.ts` after the `await res.json()`.

2. **localStorage instead of sessionStorage**, keyed on user id so the flag
   survives tab switches but doesn't replay across users on a shared device.

3. **Admin runbook entry** documenting "don't test-log-in with a user's
   passcode" — short, but it's the operational gotcha that bites hardest.

None are urgent. The actual fix for *this* user is one of:
- Redeploy `auth-login` (if #1).
- `UPDATE user_passcodes SET last_login_at = NULL WHERE email = ...` (if #2).

---

## Cross-references

- [Welcome modal PR plan](../.claude/plans/encapsulated-gliding-sphinx.md) —
  the original ship plan documents the manual deploy step that's the likely
  culprit.
- [`docs/security-auth-passcode-and-members.md`](./security-auth-passcode-and-members.md) — full passcode auth flow.
- [`supabase/migrations/20260513_auth_passcodes.sql`](../supabase/migrations/20260513_auth_passcodes.sql) — the `user_passcodes` table.
