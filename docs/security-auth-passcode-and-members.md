# Auth Gate — Per-Email Passcodes + Members Admin Panel

**Status:** Design locked, implementation pending.
**Decision session:** 2026-05-12.
**Tracks:** Pre-public-release checklist item #1 (`CLAUDE.md` line 46-50).

This is a **frozen-at-decision spec**. When implementation begins, the contents
below are the source of truth. Out-of-codebase steps (Supabase dashboard
config, env vars, bootstrap SQL) are included so nothing is lost between
sessions.

Companion docs:
- [`security-rls-public-release.md`](security-rls-public-release.md) — RLS
  decisions that this work depends on.
- [`security-claude-permissions-public-release.md`](security-claude-permissions-public-release.md)
  — orthogonal hardening (Claude Code permissions, not user auth).

---

## 1. Problem

From `CLAUDE.md`:

> Today anyone visiting the catalogue can type any email at the login prompt
> and gain editing permissions. Email is self-asserted; the anon Supabase key
> is in the JS bundle, so comments / annotations / labels / bookmarks can all
> be made under a spoofed teammate identity.

11 tables in the public schema have RLS disabled. The anon key in
`designer/src/lib/supabase.ts` can read/write all of them. Identity is whatever
the user types into the email prompt.

This must be closed before the catalogue URL is linked from `hirahul.xyz`.

---

## 2. Decisions (locked)

| Aspect | Decision |
|---|---|
| Auth mechanism | Static per-email **passcode**, server-generated random, argon2id hashed |
| No magic link, no OAuth | Avoids email rate limits + survives the team's Microsoft → Zoho migration |
| Edge Functions | `auth-login`, `auth-admin` (Supabase Edge Functions, Deno) |
| Rate limit | 5 failed attempts per email → 15 min lockout |
| Session | **90-day refresh token, 3-hour access token** |
| Logout | Inside profile dropdown (existing identity widget) |
| Admin panel | New subtab `Members` in `Settings › Team`, alongside Analytics / Flows / Groups |
| Admin visibility | Subtab only shown when `useIsAdmin() === true` (driven by `admins` table) |
| Bootstrap | Manual SQL one-liner for first admin row + first passcode hash |
| Passcode generation | 12-char random, formatted `XXXX-XXXX-XXXX` |
| Passcode visibility | Plaintext shown **once** when minted; never readable from DB after |

### Status pills

| Pill | Meaning |
|---|---|
| 🟢 Active | Logged in successfully at some point |
| ⚫ Disabled | Soft-blocked by admin |
| 🔒 Locked out | Rate-limited (5 failures, 15min cooldown) |
| ⚪ Pending | Created but never logged in |

### Explicitly out of scope (v1)

- Magic link / OAuth / SSO
- Roles beyond `admin` / `member`
- Audit log (events table)
- Self-service passcode rotation (admin generates, user uses)
- Bulk member operations
- Email notifications (no email infra needed)
- Activity timeline per user

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  CLIENT (static Vite app, anon key only)                                 │
│  ┌────────────────────────┐         ┌──────────────────────────────────┐ │
│  │  PasscodeLogin         │         │  Members panel (admins only)     │ │
│  │  email + passcode      │         │  passcode-gated; mint / rotate / │ │
│  │  [ Sign in ]           │         │  toggle / delete / force-logout  │ │
│  └─────────┬──────────────┘         └───────────────┬──────────────────┘ │
└────────────┼────────────────────────────────────────┼────────────────────┘
             ↓ POST                                   ↓ POST
             ↓ /functions/v1/auth-login              ↓ /functions/v1/auth-admin
             ↓ { email, passcode }                   ↓ { admin_passcode, action, … }
┌────────────────────────────────────────────────────────────────────────┐
│  SUPABASE EDGE FUNCTIONS (Deno, service role available)                │
│  ┌────────────────────────┐   ┌─────────────────────────────────────┐  │
│  │ auth-login             │   │ auth-admin                          │  │
│  │ verify hash → session  │   │ verify admin passcode → CRUD ops    │  │
│  └────────────────────────┘   └─────────────────────────────────────┘  │
│                                                                        │
│  env vars (set in dashboard, never in repo):                           │
│  - INVITE_ADMIN_PASSCODE                                               │
│  - SUPABASE_SERVICE_ROLE_KEY (already configured for other functions)  │
│  - SUPABASE_URL                                                        │
└────────────────────────────────────────────────────────────────────────┘
             ↓                                          ↓
┌────────────────────────────────────────────────────────────────────────┐
│  SUPABASE (Auth + Postgres)                                            │
│                                                                        │
│  user_passcodes (RLS: service role only, no client access)             │
│  admins         (RLS: self-select only — for `useIsAdmin()` check)     │
│  auth.users     (managed by Supabase Auth)                             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Database schema

**Migration:** `supabase/migrations/20260512_auth_passcodes.sql`

```sql
-- Per-email static passcode, server-generated, argon2 hashed.
-- Service-role only — no anon/authed access.

create table public.user_passcodes (
  email           text primary key,
  passcode_hash   text not null,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_login_at   timestamptz,
  last_failed_at  timestamptz,
  failed_count    int not null default 0,
  locked_until    timestamptz
);

alter table public.user_passcodes enable row level security;
-- No policies → only service role (Edge Functions) can read/write.

-- Admins table — emails that see the Members admin panel.
-- Cascade so removing the passcode removes admin status too.

create table public.admins (
  email      text primary key references public.user_passcodes(email) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Authed users can only see whether THEIR OWN email is in admins.
-- They cannot list other admins.
create policy admins_self_select on public.admins
  for select to authenticated
  using (email = auth.jwt() ->> 'email');
```

**Why this shape:**
- `email` as primary key (not a `user_id`) — keeps it dead-simple. The
  Supabase Auth `auth.users` row is created lazily on first login via
  `admin.generateLink`, and gets the same email.
- `failed_count` + `locked_until` colocated with the row — no separate
  attempts table for v1 (a separate table would be needed for IP-based
  rate-limiting, which is out of scope).
- `admins_self_select` is the only client-readable thing in this schema.
  Lets the React hook decide whether to render the Members subtab.

---

## 5. Edge Function — `auth-login`

**File:** `supabase/functions/auth-login/index.ts`

```ts
// Login: validate passcode, return Supabase Auth session.
// No public signup. Email must already exist in user_passcodes.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';
import { hash, verify } from 'https://deno.land/x/argon2@v0.10.0/lib/mod.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const LOCKOUT_AFTER = 5;
const LOCKOUT_MINUTES = 15;

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { email?: string; passcode?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const email = body.email?.trim().toLowerCase();
  const passcode = body.passcode?.trim();
  if (!email || !passcode) return json({ error: 'bad_request' }, 400);

  const { data: row, error } = await supabase
    .from('user_passcodes')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error || !row) return json({ error: 'invalid_credentials' }, 401);
  if (!row.enabled) return json({ error: 'disabled' }, 403);

  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    return json({
      error: 'locked',
      retry_after: row.locked_until,
    }, 423);
  }

  const ok = await verify(row.passcode_hash, passcode);
  if (!ok) {
    const failed = row.failed_count + 1;
    const updates: Record<string, unknown> = {
      failed_count: failed,
      last_failed_at: new Date().toISOString(),
    };
    if (failed >= LOCKOUT_AFTER) {
      updates.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
      updates.failed_count = 0;
    }
    await supabase.from('user_passcodes').update(updates).eq('email', email);
    return json({ error: 'invalid_credentials' }, 401);
  }

  // Success: clear counters, set last_login_at, mint a session via Supabase Auth.
  await supabase
    .from('user_passcodes')
    .update({ failed_count: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq('email', email);

  // Ensure the auth.users row exists (idempotent).
  await supabase.auth.admin.createUser({ email, email_confirm: true }).catch(() => {
    // 422 if already exists — fine.
  });

  // Generate a magic-link token, then immediately verify it to produce a
  // session. The user never sees an email.
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return json({ error: 'session_mint_failed' }, 500);
  }

  const { data: sessionData, error: sessErr } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  });
  if (sessErr || !sessionData.session) return json({ error: 'session_mint_failed' }, 500);

  return json({
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    expires_in: sessionData.session.expires_in,
    expires_at: sessionData.session.expires_at,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
```

**Caveats / notes:**
- The `argon2` module choice is suggestive; pick whatever Deno-compatible
  argon2id implementation works at implementation time.
- The double-step `generateLink` → `verifyOtp` is the documented Supabase
  pattern for issuing a session without sending email.
- We hash on `auth-admin` (when minting); login only verifies.

---

## 6. Edge Function — `auth-admin`

**File:** `supabase/functions/auth-admin/index.ts`

```ts
// Admin operations: mint / rotate / toggle / delete / force_logout / reset_lockout / list.
// All require the admin passcode (env var, constant-time compare).
// All run with service role privileges.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';
import { hash } from 'https://deno.land/x/argon2@v0.10.0/lib/mod.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ADMIN_PASSCODE = Deno.env.get('INVITE_ADMIN_PASSCODE')!;

type Action =
  | 'mint'           // { email }                  → { passcode (plaintext, once) }
  | 'rotate'         // { email }                  → { passcode (plaintext, once) }
  | 'toggle'         // { email, enabled: bool }   → { ok: true }
  | 'delete'         // { email }                  → { ok: true }
  | 'force_logout'   // { email }                  → { ok: true }
  | 'reset_lockout'  // { email }                  → { ok: true }
  | 'list';          //                            → { members: Member[] }

interface MemberRow {
  email: string;
  enabled: boolean;
  created_at: string;
  last_login_at: string | null;
  failed_count: number;
  locked_until: string | null;
  is_admin: boolean;
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { admin_passcode?: string; action?: Action; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }

  if (!body.admin_passcode || !constantTimeEqual(body.admin_passcode, ADMIN_PASSCODE)) {
    return json({ error: 'unauthorized' }, 401);
  }

  switch (body.action) {
    case 'mint':           return handleMint(body.payload);
    case 'rotate':         return handleRotate(body.payload);
    case 'toggle':         return handleToggle(body.payload);
    case 'delete':         return handleDelete(body.payload);
    case 'force_logout':   return handleForceLogout(body.payload);
    case 'reset_lockout':  return handleResetLockout(body.payload);
    case 'list':           return handleList();
    default:               return json({ error: 'bad_action' }, 400);
  }
});

async function handleMint(payload: any) {
  const email = (payload?.email as string)?.trim().toLowerCase();
  if (!email) return json({ error: 'bad_request' }, 400);

  const existing = await supabase
    .from('user_passcodes')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (existing.data) return json({ error: 'already_exists' }, 409);

  const plaintext = generatePasscode();
  const passcodeHash = await hash(plaintext);

  const { error } = await supabase.from('user_passcodes').insert({
    email,
    passcode_hash: passcodeHash,
    enabled: true,
  });
  if (error) return json({ error: 'insert_failed', detail: error.message }, 500);

  return json({ passcode: plaintext });
}

async function handleRotate(payload: any) {
  const email = (payload?.email as string)?.trim().toLowerCase();
  if (!email) return json({ error: 'bad_request' }, 400);

  const plaintext = generatePasscode();
  const passcodeHash = await hash(plaintext);

  const { error } = await supabase
    .from('user_passcodes')
    .update({
      passcode_hash: passcodeHash,
      updated_at: new Date().toISOString(),
      failed_count: 0,
      locked_until: null,
    })
    .eq('email', email);
  if (error) return json({ error: 'update_failed' }, 500);

  return json({ passcode: plaintext });
}

async function handleToggle(payload: any) {
  const email = (payload?.email as string)?.trim().toLowerCase();
  const enabled = Boolean(payload?.enabled);
  if (!email) return json({ error: 'bad_request' }, 400);

  const { error } = await supabase
    .from('user_passcodes')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('email', email);
  if (error) return json({ error: 'update_failed' }, 500);
  return json({ ok: true });
}

async function handleDelete(payload: any) {
  const email = (payload?.email as string)?.trim().toLowerCase();
  if (!email) return json({ error: 'bad_request' }, 400);

  await forceLogoutByEmail(email);

  const { error } = await supabase.from('user_passcodes').delete().eq('email', email);
  if (error) return json({ error: 'delete_failed' }, 500);
  return json({ ok: true });
}

async function handleForceLogout(payload: any) {
  const email = (payload?.email as string)?.trim().toLowerCase();
  if (!email) return json({ error: 'bad_request' }, 400);
  await forceLogoutByEmail(email);
  return json({ ok: true });
}

async function handleResetLockout(payload: any) {
  const email = (payload?.email as string)?.trim().toLowerCase();
  if (!email) return json({ error: 'bad_request' }, 400);

  const { error } = await supabase
    .from('user_passcodes')
    .update({ failed_count: 0, locked_until: null })
    .eq('email', email);
  if (error) return json({ error: 'update_failed' }, 500);
  return json({ ok: true });
}

async function handleList() {
  const { data: passcodes, error } = await supabase
    .from('user_passcodes')
    .select('email, enabled, created_at, last_login_at, failed_count, locked_until')
    .order('created_at', { ascending: true });
  if (error) return json({ error: 'list_failed' }, 500);

  const { data: adminRows } = await supabase.from('admins').select('email');
  const adminSet = new Set((adminRows ?? []).map((r) => r.email));

  const members: MemberRow[] = (passcodes ?? []).map((p) => ({
    ...p,
    is_admin: adminSet.has(p.email),
  }));
  return json({ members });
}

async function forceLogoutByEmail(email: string) {
  const { data: userRes } = await supabase.auth.admin.listUsers();
  const user = userRes?.users?.find((u) => u.email === email);
  if (user) await supabase.auth.admin.signOut(user.id, 'global');
}

function generatePasscode(): string {
  // 9 random bytes → 12 url-safe chars → format as XXXX-XXXX-XXXX
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, 'A').replace(/\//g, 'B').replace(/=/g, '').toUpperCase();
  return `${b64.slice(0, 4)}-${b64.slice(4, 8)}-${b64.slice(8, 12)}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
```

---

## 7. Frontend file map

| File | Status | What |
|---|---|---|
| `designer/src/lib/auth-passcode.ts` | new | Client wrapper: `redeemPasscode(email, passcode)`, `callAdmin(adminPasscode, action, payload)`, `useIsAdmin()` hook |
| `designer/src/lib/useAuth.ts` | edit | Repurpose to read real Supabase session (instead of synthesizing from localStorage email). Keep exported signature so call sites don't change |
| `designer/src/components/Auth.tsx` | **delete** | Replaced by PasscodeLogin |
| `designer/src/components/PasscodeLogin.tsx` | new | The login screen (spec in §8) |
| `designer/src/components/CatalogueMembersSection.tsx` | new | The Members admin panel (spec in §9) |
| `designer/src/components/CatalogueTeamSection.tsx` | edit | Add `'members'` to `TeamSubTab`, conditional on `useIsAdmin()` |
| `designer/src/components/CatalogueHeader.tsx` (or wherever the identity widget lives) | edit | Add "Log out" + "Log out everywhere" items to the profile dropdown |
| `designer/src/lib/supabase.ts` | edit | Ensure client is configured with `autoRefreshToken: true`, `persistSession: true`, `storage: localStorage` |
| `designer/src/styles/auth.scss` | new | Login screen styles |
| `designer/src/styles/catalogue-team.scss` | extend | Members table + cards, status pills, lockout countdown |

---

## 8. PasscodeLogin component

```
┌─ login screen, full viewport ────────────────────────────────────┐
│                                                                  │
│                            [ LOGO ]                              │
│                                                                  │
│                       AgentUX Catalogue                          │
│                                                                  │
│      ┌────────────────────────────────────────────────┐          │
│      │ Email                                          │          │
│      │ ┌────────────────────────────────────────────┐ │          │
│      │ │ you@team.com                               │ │          │
│      │ └────────────────────────────────────────────┘ │          │
│      │                                                │          │
│      │ Passcode                                       │          │
│      │ ┌────────────────────────────────────────────┐ │          │
│      │ │ XXXX-XXXX-XXXX                             │ │          │
│      │ └────────────────────────────────────────────┘ │          │
│      │                                                │          │
│      │   [ ──────────── Sign in ─────────────── ]    │          │
│      │                                                │          │
│      │   Don't have a passcode? Ask the admin.       │          │
│      └────────────────────────────────────────────────┘          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**States:**
- Initial — empty form
- Submitting — button shows spinner, fields disabled
- Invalid passcode — inline error: "Email or passcode is wrong."
- Locked out — button disabled, message: "Too many attempts. Try again in 14:32" (live countdown)
- Disabled account — message: "This account is disabled. Contact the admin."
- Network error — message: "Couldn't reach the server. Try again."

**On success:** Edge Function returns session tokens; client calls
`supabase.auth.setSession({ access_token, refresh_token })`. The existing
session-aware routing in `Catalogue.tsx` takes over.

---

## 9. CatalogueMembersSection component

### Desktop

```
┌─ Settings › Team › [Members] ─────────────────────────────────────────────────┐
│                                                                               │
│  Admin passcode required:  [•••••••••••]  [Unlock]                            │
│                            ← session-cached in React state after success      │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ [+ Add member]                                       4 members          │  │
│  │                                                                         │  │
│  │  Email                       Status         Last seen     Actions       │  │
│  │  ──────────────────────────  ────────────   ──────────── ─────────────  │  │
│  │  rahul@…  (admin)            🟢 Active      2h ago       ⟲              │  │
│  │  alice@team.com              🟢 Active      Yesterday    ⟲  ◐  🗑       │  │
│  │  bob@team.com                ⚫ Disabled    3 days ago   ⟲  ◐  🗑       │  │
│  │  carol@team.com              🔒 Locked out  —            ⟲  ◐  🗑       │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ⟲ rotate passcode · ◐ enable/disable · 🗑 remove                             │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Modals

**Add member:**
```
┌─ Add a member ───────────────────────────────────┐
│                                                  │
│  Email   [alice@team.com               ]         │
│                                                  │
│  [Cancel]                       [ Generate ]     │
└──────────────────────────────────────────────────┘
```

**Reveal-once after mint or rotate:**
```
┌─ Passcode created ───────────────────────────────┐
│                                                  │
│  alice@team.com                                  │
│                                                  │
│  Passcode:  XK3-MN9P-RT72         [ Copy ]       │
│                                                  │
│  ⚠ This is the only time you'll see this code.   │
│     Share it via a secure channel.               │
│                                                  │
│                                       [ Done ]   │
└──────────────────────────────────────────────────┘
```

**Rotate confirm:**
```
┌─ Rotate alice@team.com? ─────────────────────────┐
│                                                  │
│  Existing passcode will stop working             │
│  immediately. A new one will be generated.       │
│                                                  │
│  [Cancel]                          [ Rotate ]    │
└──────────────────────────────────────────────────┘
```

**Delete confirm:**
```
┌─ Remove alice@team.com? ─────────────────────────┐
│                                                  │
│  Their passcode will be deleted and all          │
│  active sessions will be invalidated.            │
│                                                  │
│  [Cancel]                          [ Remove ]    │
└──────────────────────────────────────────────────┘
```

### Kebab menu (row-level)

Extra actions live in a small kebab next to the inline icons:

```
Actions   ⟲  ◐  🗑  ⋯
                    ↓
                    Force log out everywhere
                    Reset lockout counter
```

### Self-protect

The current admin's own row:
- No ◐ icon (can't disable yourself)
- No 🗑 icon (can't delete yourself)
- ⟲ still allowed
- Status pill says "(admin)" suffix

### Mobile

Table converts to one card per member:

```
┌─ Member ─────────────────────────────────────────┐
│ alice@team.com                                   │
│ 🟢 Active · Last seen yesterday                  │
│                                                  │
│ [⟲ Rotate]  [◐ Disable]  [🗑 Remove]  [⋯]       │
└──────────────────────────────────────────────────┘
```

---

## 10. Profile dropdown — logout entries

Add two items to the existing identity/profile dropdown (likely in
`CatalogueHeader.tsx`):

```
┌─ profile dropdown ────────────────────────────┐
│  Signed in as alice@team.com                  │
│                                               │
│  ⓘ  My bookmarks                              │
│  ⚙  Settings                                  │
│  ──────────────────────────────────────       │
│  ⎋  Log out                                   │  ← signOut({ scope: 'local' })
│  ⎋  Log out everywhere                        │  ← signOut({ scope: 'global' })
└───────────────────────────────────────────────┘
```

`scope: 'local'` clears the current device's session only. `scope: 'global'`
invalidates every refresh token issued to that user.

---

## 11. Session configuration

### On the Supabase dashboard (Project Settings → Auth → JWT)

| Setting | Value |
|---|---|
| JWT expiry | `10800` (3 hours, in seconds) |
| Refresh token rotation | enabled |
| Refresh token reuse interval | `10` (default) |
| Inactivity timeout | `0` (disabled) |
| Refresh token expiry | **`7776000` (90 days, in seconds)** |

### In `designer/src/lib/supabase.ts`

```ts
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storage: localStorage,
    flowType: 'pkce',  // keep as default if unset
  },
});
```

The client will silently refresh the 3h access token using the 90d refresh
token. Users effectively "stay logged in for 90 days" with no re-typing.

---

## 12. Out-of-codebase setup (post-merge)

Run these in order **after** the implementation PR merges:

### Step 1 — Apply the migration

In Supabase SQL Editor (or via `supabase db push`), run
`supabase/migrations/20260512_auth_passcodes.sql`.

### Step 2 — Set Edge Function secrets

Dashboard → Project Settings → Edge Functions → Manage secrets:

```
INVITE_ADMIN_PASSCODE = <a long random string, e.g. 32+ chars>
```

(`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are auto-injected by Supabase
for Edge Functions; no manual setup.)

Generate the admin passcode locally:
```bash
openssl rand -base64 32
```

Save it in your password manager. **It does not go in the repo or .env files.**

### Step 3 — Deploy the Edge Functions

```bash
supabase functions deploy auth-login
supabase functions deploy auth-admin
```

### Step 4 — Configure session length

Dashboard → Authentication → Configuration → JWT settings:
- Access token: `10800` seconds (3 hours)
- Refresh token: `7776000` seconds (90 days)

### Step 5 — Bootstrap the first admin

Locally:
```bash
# Generate the first admin's passcode.
openssl rand -base64 9
# Hash it using a small node one-off:
node -e "
  const argon2 = require('argon2');
  argon2.hash('PASTE_PASSCODE_HERE', { type: argon2.argon2id })
    .then(h => console.log(h));
"
```

Then in SQL Editor:
```sql
insert into user_passcodes (email, passcode_hash, enabled)
values ('YOUR_EMAIL', 'PASTE_HASH_HERE', true);

insert into admins (email) values ('YOUR_EMAIL');
```

### Step 6 — Test

1. Visit catalogue, you should see PasscodeLogin instead of the old fake auth.
2. Enter your email + the plaintext passcode you generated in Step 5.
3. You should land in the catalogue. Navigate to Settings → Team → Members.
4. Confirm the Members subtab is visible (because your email is in `admins`).
5. Type the admin passcode (from Step 2) to unlock the panel.
6. Mint a passcode for a teammate. Verify they can log in.

---

## 13. Operational runbook

### Add a member
1. Settings → Team → Members. Type admin passcode if not already unlocked.
2. Click "+ Add member". Enter their email. Click Generate.
3. Copy the revealed passcode. Share via secure channel (Signal, Slack DM).
4. Click Done. (Passcode disappears from screen — only the hash is stored.)

### Rotate a passcode
1. Same panel, click ⟲ on the row. Confirm.
2. New passcode revealed once. Share with the user.
3. Their old passcode no longer works; their existing sessions stay until refresh expires.
4. If you want to cut them off immediately, also click ⋯ → "Force log out everywhere".

### Suspend a teammate temporarily
- Click ◐ to disable. They can't log in with their passcode. Existing sessions still work.
- For immediate cut: ⋯ → Force log out everywhere.
- Re-enable: click ◐ again.

### Remove a teammate
- Click 🗑. Confirms, deletes the passcode, signs out all their sessions.
- The `admins` cascade removes admin status if they had it.

### Reset a lockout
- If a user is locked out (5 failed attempts), they wait 15 min OR you click ⋯ → "Reset lockout counter".

### Rotate the admin passcode itself
- Update `INVITE_ADMIN_PASSCODE` in Supabase dashboard → Edge Functions secrets.
- Effective immediately. Previously-cached admin-panel-unlocks fail on next operation.

### Forgot the admin passcode
- Reset via dashboard. There's no recovery within the app.

### Lost access to the only admin account
- Use Supabase SQL Editor to insert a new admin row:
  ```sql
  insert into admins (email) values ('NEW_EMAIL') on conflict do nothing;
  ```
- Make sure that email has a passcode row too (or mint one via SQL with a known hash).

---

## 14. Security checklist

- [x] Passcodes hashed with argon2id (never plaintext at rest)
- [x] Admin passcode in env var only, never in repo
- [x] Service role key only accessible to Edge Functions
- [x] RLS on `user_passcodes` denies all client access (no select policy for authed)
- [x] RLS on `admins` only lets a user see their own row
- [x] Rate limiting: 5 failures → 15 min lockout per email
- [x] Constant-time compare for admin passcode
- [x] Hashed passcodes use argon2id (modern, OWASP-recommended)
- [x] 90-day refresh tokens with rotation enabled (refresh-token replay detection)
- [x] No client-side check trusted alone; every gate enforced server-side too
- [x] Force-logout invalidates refresh tokens via `auth.admin.signOut(user, 'global')`
- [ ] Audit log — not in v1; consider later if compliance pressure appears
- [ ] IP-based rate limiting — not in v1; current per-email limit covers most abuse

---

## 15. Trade-offs accepted

| Decision | Trade-off |
|---|---|
| Static passcodes (not magic link / OAuth) | Permanent secret per user. Mitigated by random generation, hashing, rotation, force-logout. |
| Email ownership not verified | Anyone with the right (email, passcode) pair gets in. Mitigated by passcodes being long random strings shared only with the intended recipient. |
| Admin generates passcodes, not users | Admin overhead at the moment of issuance. Acceptable for a small team. |
| No self-service rotate | Admin must mint a new one if user forgets. Same overhead as the "forgot password" flow that doesn't exist. |
| Flat permissions (admin / member) | No editor / viewer split. If granularity is needed later, add roles + RLS conditionals. |
| No audit log | Can't reconstruct who minted / rotated / deleted what. Acceptable while team is small and trusted. |
| 90-day session | After 90 days, user must re-enter passcode. Reasonable balance between friction and blast radius. |
| Force-logout doesn't invalidate the 3h access token instantly | Up to 3 hours of in-flight session after a force-logout. RLS still applies — they can't do anything they couldn't do before. For tighter cut, deploy alongside an access-token revocation list (out of scope). |

---

## 16. Future work (out of scope)

- **Audit log** (`auth_events` table: minted, rotated, redeemed, disabled, deleted, force-logged-out)
- **IP-based rate limiting** (separate `auth_attempts` table keyed by IP)
- **Magic-link fallback** (for users who lose their passcode and can't reach admin)
- **OAuth providers** (when Zoho migration settles — Zoho One supports SAML/OIDC)
- **Roles** (editor / viewer / admin with RLS conditionals)
- **Self-service rotate** (user can rotate own passcode if they remember the current one)
- **Activity timeline** per user in the Members panel
- **Bulk member operations** (multi-select rows)
- **Email notifications** (notify admin on suspicious activity)

---

## 17. Rollout plan

This work ships in **one PR** (no staged rollout). Reasoning:
- The fake-auth surface and the real-auth surface can't coexist cleanly.
- Catalogue is unlisted; no live users to break.
- All-in-one PR is the simplest review.

**Order of operations on merge day:**
1. Merge PR.
2. Run migration (Step 1 above).
3. Set secrets + deploy functions (Steps 2-3).
4. Configure session length (Step 4).
5. Bootstrap admin (Step 5).
6. Smoke test (Step 6).
7. Mint passcodes for all current teammates and share OOB.
8. Announce: "Use this passcode to log in from now on."
9. Once everyone has logged in successfully, this issue closes and the
   pre-public-release checklist item in `CLAUDE.md` is removed.

---

## 18. Once shipped — update `CLAUDE.md`

Remove these lines from the pre-public-release checklist:
- The "Non-signed-in user experience / auth gate" bullet
- The "RLS + auth gate" bullet (RLS work happens as part of this — see §4)

Update `memory/parked_auth_gate.md` (currently doesn't exist; gets created or
left absent) with: "Closed — implemented per
`docs/security-auth-passcode-and-members.md` on YYYY-MM-DD."
