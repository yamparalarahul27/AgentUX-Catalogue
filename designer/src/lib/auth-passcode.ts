// auth-passcode
//
// Client wrapper for the auth-login Edge Function. Submits an
// (email, passcode) pair, receives session tokens, hands them to
// supabase.auth.setSession() so the rest of the app sees a real
// authenticated session.
//
// Companion code:
//   - supabase/functions/auth-login/index.ts  — server-side validation
//   - components/PasscodeLogin.tsx            — the form that calls this
//   - docs/security-auth-passcode-and-members.md  (§5, §8)

import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type RedeemResult =
  | { ok: true }
  | { ok: false; code: 'invalid_credentials' | 'disabled' | 'network' | 'unknown' }
  | { ok: false; code: 'locked'; retryAfter: string };

export async function redeemPasscode(email: string, passcode: string): Promise<RedeemResult> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/auth-login`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, passcode }),
    });
  } catch {
    return { ok: false, code: 'network' };
  }

  if (res.status === 401) return { ok: false, code: 'invalid_credentials' };
  if (res.status === 403) return { ok: false, code: 'disabled' };
  if (res.status === 423) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, code: 'locked', retryAfter: body?.retry_after ?? '' };
  }
  if (!res.ok) return { ok: false, code: 'unknown' };

  const body = await res.json().catch(() => null);
  if (!body?.access_token || !body?.refresh_token) {
    return { ok: false, code: 'unknown' };
  }

  // Hand the tokens to the supabase client so the rest of the app sees
  // a real authenticated session. onAuthStateChange listeners (useAuth)
  // fire and the gate flips from PasscodeLogin → Catalogue.
  const { error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error) return { ok: false, code: 'unknown' };

  return { ok: true };
}
