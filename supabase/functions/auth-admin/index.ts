// auth-admin
//
// Admin operations behind the INVITE_ADMIN_PASSCODE env secret.
// Runs with service role privileges — every action mutates
// public.user_passcodes / public.admins / public.roles and never trusts
// client input beyond the constant-time-compared admin passcode.
//
// Member actions (POST body: { admin_passcode, action, payload }):
//   - list             → { members: MemberRow[] }
//   - mint             { email, role? }          → { passcode (plaintext, once) }
//   - rotate           { email }                 → { passcode (plaintext, once) }
//   - toggle           { email, enabled: bool }  → { ok: true }
//   - delete           { email }                 → { ok: true }
//   - force_logout     { email }                 → { ok: true }
//   - reset_lockout    { email }                 → { ok: true }
//   - set_member_role  { email, role }           → { ok: true }
//
// Role actions (PR A1):
//   - list_roles       → { roles: RoleRow[] }
//   - create_role      { id, name, description?, capabilities[] }  → { ok: true }
//   - update_role      { id, name?, description?, capabilities[]? } → { ok: true }
//   - delete_role      { id }                    → { ok: true }
//
// Companion code:
//   - supabase/migrations/20260513_auth_passcodes.sql
//   - supabase/migrations/20260515_roles_and_capabilities.sql
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
  | 'reset_lockout'
  | 'set_member_role'
  | 'list_roles'
  | 'create_role'
  | 'update_role'
  | 'delete_role';

interface MemberRow {
  email: string;
  enabled: boolean;
  created_at: string;
  last_login_at: string | null;
  failed_count: number;
  locked_until: string | null;
  role: string;
  is_admin: boolean;
}

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  capabilities: string[];
  member_count: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
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
    case 'list':             return handleList();
    case 'mint':             return handleMint(body.payload);
    case 'rotate':           return handleRotate(body.payload);
    case 'toggle':           return handleToggle(body.payload);
    case 'delete':           return handleDelete(body.payload);
    case 'force_logout':     return handleForceLogout(body.payload);
    case 'reset_lockout':    return handleResetLockout(body.payload);
    case 'set_member_role':  return handleSetMemberRole(body.payload);
    case 'list_roles':       return handleListRoles();
    case 'create_role':      return handleCreateRole(body.payload);
    case 'update_role':      return handleUpdateRole(body.payload);
    case 'delete_role':      return handleDeleteRole(body.payload);
    default:                 return json({ error: 'bad_action' }, 400);
  }
});

// ────────────────────────────────────────────────────────────────────
// list — every member, with their role. is_admin is derived from role
// for backward-compat with the existing client-side useIsAdmin hook
// (which reads the legacy `admins` table). Once that hook migrates to
// read from role, is_admin can be dropped.
// ────────────────────────────────────────────────────────────────────
async function handleList() {
  const { data: passcodes, error } = await supabase
    .from('user_passcodes')
    .select('email, enabled, role, created_at, last_login_at, failed_count, locked_until')
    .order('created_at', { ascending: true });
  if (error) return json({ error: 'list_failed', detail: error.message }, 500);

  const members: MemberRow[] = (passcodes ?? []).map((p) => ({
    ...p,
    is_admin: p.role === 'admin',
  }));
  return json({ members });
}

// ────────────────────────────────────────────────────────────────────
// mint — create a new member with a fresh passcode. Returns the
// plaintext passcode exactly once. Server only stores the hash.
//
// payload.role is optional — defaults to 'researcher' (the column's
// own default). If 'admin' is requested, the admins row is also
// inserted so the legacy useIsAdmin hook works for that user.
// ────────────────────────────────────────────────────────────────────
async function handleMint(payload: any) {
  const email = normaliseEmail(payload?.email);
  if (!email) return json({ error: 'bad_request' }, 400);

  const requestedRole = typeof payload?.role === 'string' ? payload.role : null;
  if (requestedRole !== null && !(await roleExists(requestedRole))) {
    return json({ error: 'bad_role' }, 400);
  }

  const { data: existing } = await supabase
    .from('user_passcodes')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (existing) return json({ error: 'already_exists' }, 409);

  const plaintext = generatePasscode();
  const passcodeHash = await hash(plaintext);

  const insertRow: Record<string, unknown> = {
    email,
    passcode_hash: passcodeHash,
    enabled: true,
  };
  if (requestedRole) insertRow.role = requestedRole;

  const { error } = await supabase.from('user_passcodes').insert(insertRow);
  if (error) return json({ error: 'insert_failed', detail: error.message }, 500);

  // Keep the legacy admins table in sync for useIsAdmin compat.
  if (requestedRole === 'admin') {
    await supabase.from('admins').upsert({ email });
  }

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
// set_member_role — change the role on an existing member.
//
// Refuses to demote the last remaining enabled admin (recovery from
// "no admins exist" requires direct DB access). Mirrors the change
// into the legacy admins table so the existing useIsAdmin hook stays
// consistent.
// ────────────────────────────────────────────────────────────────────
async function handleSetMemberRole(payload: any) {
  const email = normaliseEmail(payload?.email);
  const role = typeof payload?.role === 'string' ? payload.role : null;
  if (!email || !role) return json({ error: 'bad_request' }, 400);

  if (!(await roleExists(role))) {
    return json({ error: 'bad_role' }, 400);
  }

  const { data: target, error: lookupError } = await supabase
    .from('user_passcodes')
    .select('role')
    .eq('email', email)
    .maybeSingle();
  if (lookupError) return json({ error: 'lookup_failed', detail: lookupError.message }, 500);
  if (!target) return json({ error: 'not_found' }, 404);

  if (target.role === role) {
    return json({ ok: true }); // no-op
  }

  // Refuse to demote the last enabled admin.
  if (target.role === 'admin' && role !== 'admin') {
    const { count } = await supabase
      .from('user_passcodes')
      .select('email', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('enabled', true);
    if ((count ?? 0) <= 1) {
      return json({ error: 'last_admin' }, 409);
    }
  }

  const { error } = await supabase
    .from('user_passcodes')
    .update({ role })
    .eq('email', email);
  if (error) return json({ error: 'update_failed', detail: error.message }, 500);

  // Sync the legacy admins table so useIsAdmin stays correct.
  if (role === 'admin') {
    await supabase.from('admins').upsert({ email });
  } else if (target.role === 'admin') {
    await supabase.from('admins').delete().eq('email', email);
  }

  return json({ ok: true });
}

// ────────────────────────────────────────────────────────────────────
// list_roles — every role with its capabilities + member count.
// Used by the Roles admin panel (PR A1).
// ────────────────────────────────────────────────────────────────────
async function handleListRoles() {
  const [rolesResult, capsResult, membersResult] = await Promise.all([
    supabase.from('roles').select('id, name, description, is_system').order('id'),
    supabase.from('role_capabilities').select('role_id, capability'),
    supabase.from('user_passcodes').select('role'),
  ]);

  if (rolesResult.error) return json({ error: 'list_failed', detail: rolesResult.error.message }, 500);

  const capsByRole = new Map<string, string[]>();
  for (const row of capsResult.data ?? []) {
    const list = capsByRole.get(row.role_id) ?? [];
    list.push(row.capability);
    capsByRole.set(row.role_id, list);
  }

  const memberCounts = new Map<string, number>();
  for (const row of membersResult.data ?? []) {
    memberCounts.set(row.role, (memberCounts.get(row.role) ?? 0) + 1);
  }

  const roles: RoleRow[] = (rolesResult.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    is_system: r.is_system,
    capabilities: capsByRole.get(r.id) ?? [],
    member_count: memberCounts.get(r.id) ?? 0,
  }));

  return json({ roles });
}

// ────────────────────────────────────────────────────────────────────
// create_role — admin defines a new custom role.
//
// Validates id format (lowercase letters / digits / underscores, max 32)
// so custom ids round-trip cleanly through URLs and code. The roles
// table allows arbitrary text but a normalised id avoids surprise.
// ────────────────────────────────────────────────────────────────────
async function handleCreateRole(payload: any) {
  const id          = normaliseRoleId(payload?.id);
  const name        = normaliseRoleName(payload?.name);
  const description = normaliseRoleDescription(payload?.description);
  const capabilities = normaliseCapabilityList(payload?.capabilities);

  if (!id || !name) return json({ error: 'bad_request' }, 400);

  const { data: existing } = await supabase
    .from('roles')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (existing) return json({ error: 'already_exists' }, 409);

  const { error: insertError } = await supabase
    .from('roles')
    .insert({ id, name, description, is_system: false, requires_approval: false });
  if (insertError) return json({ error: 'insert_failed', detail: insertError.message }, 500);

  if (capabilities.length > 0) {
    const rows = capabilities.map((capability) => ({ role_id: id, capability }));
    const { error: capsError } = await supabase.from('role_capabilities').insert(rows);
    if (capsError) {
      // Roll back the role insert so admin doesn't see a half-created role.
      await supabase.from('roles').delete().eq('id', id);
      return json({ error: 'insert_failed', detail: capsError.message }, 500);
    }
  }

  return json({ ok: true });
}

// ────────────────────────────────────────────────────────────────────
// update_role — edit name / description / capabilities.
//
// Capability replacement is delete-then-insert (no transaction wrapper
// — Supabase JS doesn't expose them; the window of inconsistency is
// tiny and idempotent re-saves recover).
//
// Refuses to edit the Admin role (is_system = true). The 'admin' role
// must always exist with every capability — otherwise nobody can
// recover from a misconfiguration without direct DB access.
// ────────────────────────────────────────────────────────────────────
async function handleUpdateRole(payload: any) {
  const id = normaliseRoleId(payload?.id);
  if (!id) return json({ error: 'bad_request' }, 400);

  const { data: existing, error: lookupError } = await supabase
    .from('roles')
    .select('id, is_system')
    .eq('id', id)
    .maybeSingle();
  if (lookupError) return json({ error: 'lookup_failed', detail: lookupError.message }, 500);
  if (!existing)  return json({ error: 'not_found' }, 404);
  if (existing.is_system) return json({ error: 'system_role' }, 403);

  const patch: Record<string, unknown> = {};
  if (typeof payload?.name === 'string')        patch.name        = normaliseRoleName(payload.name);
  if (typeof payload?.description === 'string') patch.description = normaliseRoleDescription(payload.description);
  if (!patch.name && payload?.name !== undefined) return json({ error: 'bad_request' }, 400);

  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await supabase.from('roles').update(patch).eq('id', id);
    if (updateError) return json({ error: 'update_failed', detail: updateError.message }, 500);
  }

  if (Array.isArray(payload?.capabilities)) {
    const capabilities = normaliseCapabilityList(payload.capabilities);
    const { error: deleteError } = await supabase.from('role_capabilities').delete().eq('role_id', id);
    if (deleteError) return json({ error: 'update_failed', detail: deleteError.message }, 500);
    if (capabilities.length > 0) {
      const rows = capabilities.map((capability) => ({ role_id: id, capability }));
      const { error: insertError } = await supabase.from('role_capabilities').insert(rows);
      if (insertError) return json({ error: 'update_failed', detail: insertError.message }, 500);
    }
  }

  return json({ ok: true });
}

// ────────────────────────────────────────────────────────────────────
// delete_role — refuses if any member uses it (must reassign first)
// and refuses for system roles (admin).
// ────────────────────────────────────────────────────────────────────
async function handleDeleteRole(payload: any) {
  const id = normaliseRoleId(payload?.id);
  if (!id) return json({ error: 'bad_request' }, 400);

  const { data: existing } = await supabase
    .from('roles')
    .select('id, is_system')
    .eq('id', id)
    .maybeSingle();
  if (!existing)  return json({ error: 'not_found' }, 404);
  if (existing.is_system) return json({ error: 'system_role' }, 403);

  const { count } = await supabase
    .from('user_passcodes')
    .select('email', { count: 'exact', head: true })
    .eq('role', id);
  if ((count ?? 0) > 0) {
    return json({ error: 'role_in_use', member_count: count }, 409);
  }

  // role_capabilities cascades via FK on delete.
  const { error } = await supabase.from('roles').delete().eq('id', id);
  if (error) return json({ error: 'delete_failed', detail: error.message }, 500);
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

async function roleExists(roleId: string): Promise<boolean> {
  const { data } = await supabase
    .from('roles')
    .select('id')
    .eq('id', roleId)
    .maybeSingle();
  return Boolean(data);
}

function normaliseRoleId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase();
  // Lowercase letters, digits, underscores. 2-32 chars. No leading digit.
  if (!/^[a-z_][a-z0-9_]{1,31}$/.test(cleaned)) return null;
  return cleaned;
}

function normaliseRoleName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length > 64) return null;
  return cleaned;
}

function normaliseRoleDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length > 256) return cleaned.slice(0, 256);
  return cleaned;
}

function normaliseCapabilityList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  // De-dupe + filter non-strings + cap each at 64 chars defensively.
  const set = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && item.length <= 64) {
      set.add(item);
    }
  }
  return [...set];
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
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}
