# iOS share-to-app via Apple Shortcut — design & implementation plan

> **Status:** approved design, not yet built. Pick this up and implement.
> **Context:** follow-up to the PWA Share Target (PR #289). The Web Share Target
> API is Android/desktop-Chromium only — iOS Safari does not support it — so
> iPhone share-to-app needs its own path. This doc is that path.

---

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| **Auth path** | **A — dedicated, revocable, upload-only token** (not the account passcode) | App went through pre-public-release hardening; a new ingress should use a scoped, independently-revocable secret. Passcode stays out of the device. |
| **Landing spot** | **New `"iOS Inbox"` group** + un-triaged metadata | Keeps personal shares separate from the Marketing Bucket review queue; user files them into real groups in-app later. Reuses the existing group-as-bucket + `suggested_group` mechanism — no schema change for the landing group itself. |
| **Token storage/lifecycle** | **Client-side generate + hash, own-row RLS** (no token-management function) | `crypto.getRandomValues` + `crypto.subtle` are native (no new dep). Only the SHA-256 **hash** is stored; plaintext shown once. Avoids a second Edge Function. |
| **New dependencies** | **None** | Web Crypto is native in both the browser and Deno. |

---

## Architecture

```
iPhone (Share sheet / Shortcut)
   │  POST multipart/form-data
   │    • image: <file>
   │    • header X-Upload-Token: utk_…
   ▼
shortcut-upload  (Edge Function, service role)
   • sha256(token) → SELECT email FROM upload_tokens WHERE token_hash = $1   → 401 if no match
   • resolve auth.users.id for that email   (service-role admin lookup)
   • storage.from('screenshots').upload(<userId>/all-projects/ios-<ts>-<name>)
   • insert screenshots row: group = 'iOS Inbox', metadata.source = 'ios-shortcut'
   • UPDATE upload_tokens SET last_used_at = now()
   ▼
Image appears in the user's "iOS Inbox" group, ready to triage in-app.
```

---

## File-by-file plan

### Backend — written here, **deployed by the repo owner** (`supabase` CLI)

#### 1. `supabase/migrations/<date>_upload_tokens.sql`
```sql
create table if not exists public.upload_tokens (
  email        text primary key references public.user_passcodes(email) on delete cascade,
  token_hash   text not null,                 -- sha256(plaintext), hex
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.upload_tokens enable row level security;

-- Owner can read/write only their own row. token_hash is never sensitive to
-- the owner (it's the hash of their own token); plaintext is never stored.
create policy upload_tokens_own_select on public.upload_tokens
  for select using (email = auth.jwt() ->> 'email');
create policy upload_tokens_own_upsert on public.upload_tokens
  for insert with check (email = auth.jwt() ->> 'email');
create policy upload_tokens_own_update on public.upload_tokens
  for update using (email = auth.jwt() ->> 'email');
create policy upload_tokens_own_delete on public.upload_tokens
  for delete using (email = auth.jwt() ->> 'email');
```
One active token per user (PK = email); regenerate = upsert (overwrites hash + `created_at`, clears `last_used_at`). Mirrors the `user_passcodes` / `admins` email-keyed pattern in [`20260513_auth_passcodes.sql`](../supabase/migrations/20260513_auth_passcodes.sql).

#### 2. `supabase/functions/shortcut-upload/index.ts`
- Pattern after [`auth-login`](../supabase/functions/auth-login/index.ts): `createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false }})`.
- Accept `POST` `multipart/form-data`. Read the image from form field `image` and the token from header `X-Upload-Token` (fallback form field `token`).
- `tokenHash = sha256hex(token)` via Web Crypto (`crypto.subtle.digest`).
- `SELECT email FROM upload_tokens WHERE token_hash = tokenHash` → 401 `{ error: 'unauthorized' }` if none. **Never echo the token or reason.**
- Resolve the auth user id for the email (service-role: `auth.admin.listUsers` / direct `auth.users` query by email).
- Upload to bucket `screenshots`, path `${userId}/all-projects/ios-${Date.now()}-${safeName}` (matches the convention at [`use-catalogue-upload.ts:338`](../designer/src/hooks/use-catalogue-upload.ts#L338)).
- Insert a `screenshots` row — see **schema to confirm** below.
- `UPDATE upload_tokens SET last_used_at = now() WHERE email = …`.
- Return `{ ok: true, id, url }`. Generic `{ error }` on any failure (no internals).
- Reasonable guards: max body size, `image/*` content-type only, single file.

> ⚠️ **Schema to confirm at build time.** The `screenshots` create-table
> migration is **not in the repo** (table predates these migrations / made via
> the Supabase dashboard). Before finalizing the insert, confirm the live
> column set + NOT NULL constraints (especially `image_url` vs derived public
> URL, and whether `group`/`platform`/`theme` accept NULL). Fields the app
> writes today (from [`use-catalogue-upload.ts:351`](../designer/src/hooks/use-catalogue-upload.ts#L351)):
> `name, file_name, storage_path, group, theme, platform, metadata, suggested_group, reference_storage_path`.
> Proposed values for a shared image: `group = 'iOS Inbox'`, `platform = null`,
> `theme = null`, `metadata = { source: 'ios-shortcut' }`, `name` =
> `iOS Inbox <date>` (or filename-derived), `suggested_group = null`.

### Frontend — written here, ships in the app PR

#### 3. `designer/src/lib/ios-inbox.ts`
```ts
export const IOS_INBOX_GROUP = 'iOS Inbox';
```
Parallels [`marketing-bucket.ts`](../designer/src/lib/marketing-bucket.ts). Only add if the app needs to label/recognize the group; otherwise the Edge Function hardcodes the string and this is optional.

#### 4. `designer/src/lib/upload-token.ts`
Helpers, all client-side:
- `generateToken()` → `utk_` + base64url(`crypto.getRandomValues(32 bytes)`).
- `sha256Hex(s)` → `crypto.subtle.digest('SHA-256', …)`.
- `getTokenStatus()` → `select created_at, last_used_at from upload_tokens` (own row via RLS).
- `setToken()` → generate plaintext, upsert `{ email, token_hash }`, return plaintext **once**.
- `revokeToken()` → `delete` own row.

#### 5. `designer/src/components/CatalogueIosUploadModal.tsx`
Small modal, same pattern as [`CatalogueSettingsModal.tsx`](../designer/src/components/CatalogueSettingsModal.tsx). States:
- **No token:** `[ Generate token ]`.
- **Just generated (this session only):** show plaintext + `[Copy]` + ⚠ "Save this now — it won't be shown again." (only the hash is stored, so it can never be revealed again).
- **Token active (later visits):** "Token active · created … · last used …" + `[ Regenerate ]` `[ Revoke ]` (no reveal).
- Expandable `▸ Set up the Shortcut` linking to the setup doc / inline steps.

```
┌─ iOS Upload ────────────────────────────────── ✕ ┐
│  Share screenshots from your iPhone with an        │
│  Apple Shortcut. Images land in the "iOS Inbox"     │
│  group for you to file later.                       │
│                                                     │
│  ── No token yet ──                                 │
│            [  Generate token  ]                     │
│                                                     │
│  ── Just generated (shown once) ──                  │
│   utk_9f3a…c21   [Copy]                             │
│   ⚠ Save this now — it won't be shown again.        │
│                                                     │
│  ── Token active (later visits) ──                  │
│   Token active · created Jun 23 · last used 2h ago  │
│            [ Regenerate ]   [ Revoke ]              │
│                                                     │
│  ▸ Set up the Shortcut (step-by-step)              │
└─────────────────────────────────────────────────────┘
```

#### 6. Account-menu entry — `iOS Upload…`
Add a menu item that opens the modal. **Placement to confirm:** the sound/haptics
toggles + logout live in the header account menu (not `CatalogueSettingsModal`,
which is toolbar-only). Find that menu in [`CatalogueHeader.tsx`](../designer/src/components/CatalogueHeader.tsx)
and add the item there.

#### 7. `designer/public/whats-new.json`
New `new` entry once the feature is live (benefit-first, one line). Skip until the
backend is deployed and working.

### Docs

#### 8. `docs/ios-shortcut-setup.md`
Step-by-step Apple Shortcut build (can't ship a binary `.shortcut` — it's an
encrypted plist). Outline:
1. New Shortcut → "Receive Images from Share Sheet" (+ optionally Photos).
2. Text action holding the token (or read from a saved note / prompt once).
3. **Get Contents of URL** → `https://<project>.supabase.co/functions/v1/shortcut-upload`
   · Method POST · Headers `X-Upload-Token: <token>`, `apikey: <anon>` (Supabase
   gateway requires it) · Request Body: Form · add the image as field `image`.
4. Optional: show the result / notification.
5. Add to Share Sheet so it appears when sharing a screenshot.

---

## Deploy steps (repo owner, after merge of the build PR)
1. `supabase db push` (or apply the migration) — creates `upload_tokens`.
2. `supabase functions deploy shortcut-upload`.
3. No new env needed — reuses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
4. In-app: open **iOS Upload** → Generate token → copy.
5. Build the Shortcut per `docs/ios-shortcut-setup.md`, paste the token, test.

---

## Security notes
- Token is **upload-only** and **independently revocable** — never the account passcode.
- Only the **SHA-256 hash** is stored; plaintext is shown once and held only in
  modal memory.
- The Edge Function returns generic `{ error }` — never the token, the email, or
  internal reasons (consistent with [`auth-login`](../supabase/functions/auth-login/index.ts)
  and the CLAUDE.md secrets rules).
- A user can only write their **own** `upload_tokens` row (RLS). Setting a weak
  hash only harms themselves.
- New public ingress → call out as security-sensitive in the build PR per
  CLAUDE.md.

## Open items to resolve during build
- [ ] Confirm live `screenshots` column set + NOT NULL (esp. `image_url`, `group`, `platform`).
- [ ] Confirm the exact account-menu component + insertion point.
- [ ] Decide default `name` for a shared image (filename-derived vs `iOS Inbox <date>`).
- [ ] Confirm the Supabase Functions gateway needs the `apikey` header from a Shortcut (it usually does).
```
