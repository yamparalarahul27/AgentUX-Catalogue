// auth-admin
//
// Admin operations behind the INVITE_ADMIN_PASSCODE env secret.
// Runs with service role privileges — every action mutates
// public.user_passcodes / public.admins and never trusts client input
// beyond the constant-time-compared admin passcode.
//
// Actions (POST body: { admin_passcode, action, payload }):
//   - list           → { members: MemberRow[] }
//   - mint           { email }                 → { passcode (plaintext, once) }
//   - rotate         { email }                 → { passcode (plaintext, once) }
//   - toggle         { email, enabled: bool }  → { ok: true }
//   - delete         { email }                 → { ok: true }
//   - force_logout   { email }                 → { ok: true }
//   - reset_lockout  { email }                 → { ok: true }
//
// Companion code:
//   - supabase/migrations/20260513_auth_passcodes.sql
//   - supabase/functions/auth-login/index.ts
//   - docs/security-auth-passcode-and-members.md  (§6)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';
import { argon2id } from 'https://esm.sh/hash-wasm@4.11.0';

// hash-wasm runs pure WebAssembly — works on Supabase Edge Functions
// where Rust-plugin-based argon2 packages do not. Produces the
// standard PHC string format ($argon2id$v=19$...) so hashes are
// interoperable with the node `argon2` npm package used for the
// out-of-codebase bootstrap and with auth-login's verify.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ADMIN_PASSCODE = Deno.env.get('INVITE_ADMIN_PASSCODE')!;

async function hash(plaintext: string): Promise<string> {
  // OWASP-recommended argon2id parameters as of 2024:
  // memory ≥ 47 MiB, iterations ≥ 3, parallelism 1. We use 64 MiB.
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return await argon2id({
    password: plaintext,
    salt,
    iterations: 3,
    parallelism: 1,
    memorySize: 65536, // 64 MiB
    hashLength: 32,
    outputType: 'encoded',
  });
}

type Action =
  | 'list'
  | 'mint'
  | 'rotate'
  | 'toggle'
  | 'delete'
  | 'force_logout'
  | 'reset_lockout';

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
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  if (!body.admin_passcode || !constantTimeEqual(body.admin_passcode, ADMIN_PASSCODE)) {
    return json({ error: 'unauthorized' }, 401);
  }

  switch (body.action) {
    case 'list':           return handleList();
    case 'mint':           return handleMint(body.payload);
    case 'rotate':         return handleRotate(body.payload);
    case 'toggle':         return handleToggle(body.payload);
    case 'delete':         return handleDelete(body.payload);
    case 'force_logout':   return handleForceLogout(body.payload);
    case 'reset_lockout':  return handleResetLockout(body.payload);
    default:               return json({ error: 'bad_action' }, 400);
  }
});

// ────────────────────────────────────────────────────────────────────
// list — every member, with admin flag joined in.
// ────────────────────────────────────────────────────────────────────
async function handleList() {
  const { data: passcodes, error } = await supabase
    .from('user_passcodes')
    .select('email, enabled, created_at, last_login_at, failed_count, locked_until')
    .order('created_at', { ascending: true });
  if (error) return json({ error: 'list_failed', detail: error.message }, 500);

  const { data: adminRows } = await supabase.from('admins').select('email');
  const adminSet = new Set((adminRows ?? []).map((r) => r.email));

  const members: MemberRow[] = (passcodes ?? []).map((p) => ({
    ...p,
    is_admin: adminSet.has(p.email),
  }));
  return json({ members });
}

// ────────────────────────────────────────────────────────────────────
// mint — create a new member with a fresh passcode. Returns the
// plaintext passcode exactly once. Server only stores the hash.
// ────────────────────────────────────────────────────────────────────
async function handleMint(payload: any) {
  const email = normaliseEmail(payload?.email);
  if (!email) return json({ error: 'bad_request' }, 400);

  const { data: existing } = await supabase
    .from('user_passcodes')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (existing) return json({ error: 'already_exists' }, 409);

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

// ────────────────────────────────────────────────────────────────────
// rotate — replace an existing member's passcode. Clears any lockout
// counters so they can immediately log in with the new passcode.
// Returns plaintext once.
// ────────────────────────────────────────────────────────────────────
async function handleRotate(payload: any) {
  const email = normaliseEmail(payload?.email);
  if (!email) return json({ error: 'bad_request' }, 400);

  const plaintext = generatePasscode();
  const passcodeHash = await hash(plaintext);

  const { error } = await supabase
    .from('user_passcodes')
    .update({
      passcode_hash: passcodeHash,
      failed_count: 0,
      locked_until: null,
    })
    .eq('email', email);
  if (error) return json({ error: 'update_failed', detail: error.message }, 500);

  return json({ passcode: plaintext });
}

// ────────────────────────────────────────────────────────────────────
// toggle — set enabled true/false. Disabled members can't log in but
// existing sessions stay alive until they expire. Combine with
// force_logout to cut them off immediately.
// ────────────────────────────────────────────────────────────────────
async function handleToggle(payload: any) {
  const email = normaliseEmail(payload?.email);
  const enabled = Boolean(payload?.enabled);
  if (!email) return json({ error: 'bad_request' }, 400);

  const { error } = await supabase
    .from('user_passcodes')
    .update({ enabled })
    .eq('email', email);
  if (error) return json({ error: 'update_failed', detail: error.message }, 500);
  return json({ ok: true });
}

// ────────────────────────────────────────────────────────────────────
// delete — remove the passcode + sign out all sessions. The admins
// row cascades via the foreign key.
// ────────────────────────────────────────────────────────────────────
async function handleDelete(payload: any) {
  const email = normaliseEmail(payload?.email);
  if (!email) return json({ error: 'bad_request' }, 400);

  await forceLogoutByEmail(email);

  const { error } = await supabase.from('user_passcodes').delete().eq('email', email);
  if (error) return json({ error: 'delete_failed', detail: error.message }, 500);
  return json({ ok: true });
}

// ────────────────────────────────────────────────────────────────────
// force_logout — sign out all sessions for an email, but keep the
// passcode row. They can log in again with the same passcode.
// ────────────────────────────────────────────────────────────────────
async function handleForceLogout(payload: any) {
  const email = normaliseEmail(payload?.email);
  if (!email) return json({ error: 'bad_request' }, 400);
  await forceLogoutByEmail(email);
  return json({ ok: true });
}

// ────────────────────────────────────────────────────────────────────
// reset_lockout — clear failed counters and any active lockout.
// Useful when a member has been locked out unfairly (typo storm).
// ────────────────────────────────────────────────────────────────────
async function handleResetLockout(payload: any) {
  const email = normaliseEmail(payload?.email);
  if (!email) return json({ error: 'bad_request' }, 400);

  const { error } = await supabase
    .from('user_passcodes')
    .update({ failed_count: 0, locked_until: null })
    .eq('email', email);
  if (error) return json({ error: 'update_failed', detail: error.message }, 500);
  return json({ ok: true });
}

// ────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────
async function forceLogoutByEmail(email: string) {
  const { data: userRes } = await supabase.auth.admin.listUsers();
  const user = userRes?.users?.find((u) => u.email === email);
  if (user) await supabase.auth.admin.signOut(user.id, 'global');
}

function generatePasscode(): string {
  // 9 random bytes → base64 → 12 chars → format XXXX-XXXX-XXXX.
  // Substitute base64's URL-unsafe chars with letters so the output is
  // a clean uppercase set; the user types this manually.
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, 'A')
    .replace(/\//g, 'B')
    .replace(/=/g, '')
    .toUpperCase();
  return `${b64.slice(0, 4)}-${b64.slice(4, 8)}-${b64.slice(8, 12)}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normaliseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
