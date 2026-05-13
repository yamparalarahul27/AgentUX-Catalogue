// auth-login
//
// Validates an (email, passcode) pair against public.user_passcodes and,
// on success, issues a Supabase Auth session (access + refresh tokens).
// No public signup — email must already exist in the table (minted via
// auth-admin). Argon2id verify; 5 failures → 15-minute lockout.
//
// Companion code:
//   - supabase/migrations/20260513_auth_passcodes.sql
//   - supabase/functions/auth-admin/index.ts
//   - docs/security-auth-passcode-and-members.md  (§5)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';
import { argon2Verify } from 'https://esm.sh/hash-wasm@4.11.0';

// hash-wasm runs pure WebAssembly — works on Supabase Edge Functions
// where Rust-plugin-based argon2 packages do not. Produces / accepts
// the standard PHC string format ($argon2id$v=19$...) so hashes are
// interoperable with the node `argon2` npm package used for the
// out-of-codebase bootstrap.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const LOCKOUT_AFTER = 5;        // consecutive failed attempts
const LOCKOUT_MINUTES = 15;     // cool-down duration

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function verify(passcodeHash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2Verify({ hash: passcodeHash, password: plaintext });
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { email?: string; passcode?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const passcode = body.passcode?.trim();
  if (!email || !passcode) return json({ error: 'bad_request' }, 400);

  // Look up the passcode row.
  const { data: row, error: lookupErr } = await supabase
    .from('user_passcodes')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  // Generic 401 to avoid leaking whether an email is registered.
  if (lookupErr || !row) return json({ error: 'invalid_credentials' }, 401);
  if (!row.enabled) return json({ error: 'disabled' }, 403);

  // Lockout window still active?
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    return json({
      error: 'locked',
      retry_after: row.locked_until,
    }, 423);
  }

  // Verify the hash.
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

  // Success: reset counters and stamp the login.
  await supabase
    .from('user_passcodes')
    .update({
      failed_count: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    })
    .eq('email', email);

  // Ensure the auth.users row exists. 422 if already there — fine.
  try {
    await supabase.auth.admin.createUser({ email, email_confirm: true });
  } catch {
    // ignore — user already exists
  }

  // Mint a session without sending a real magic-link email. The
  // generateLink → verifyOtp pair is the documented Supabase pattern
  // for issuing a session from the service role.
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
  if (sessErr || !sessionData.session) {
    return json({ error: 'session_mint_failed' }, 500);
  }

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
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}
