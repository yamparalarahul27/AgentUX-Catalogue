// auth-passcode
//
// Client wrappers for the auth-login and auth-admin Edge Functions
// plus useIsAdmin() for "should this user see the Members panel".
//
// Companion code:
//   - supabase/functions/auth-login/index.ts  — server-side validation
//   - supabase/functions/auth-admin/index.ts  — server-side admin ops
//   - components/PasscodeLogin.tsx            — uses redeemPasscode
//   - components/CatalogueMembersSection.tsx  — uses callAdmin + useIsAdmin
//   - docs/security-auth-passcode-and-members.md  (§5, §6, §8, §9)

import { useEffect, useState } from 'react';

import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type RedeemResult =
  | { ok: true; isFirstLogin: boolean }
  | { ok: false; code: 'invalid_credentials' | 'disabled' | 'network' | 'unknown' }
  | { ok: false; code: 'locked'; retryAfter: string };

// sessionStorage key the WelcomeModal reads on mount. Set here (during
// redemption) and cleared by the modal so it survives the gate flip from
// PasscodeLogin → Catalogue but doesn't replay on subsequent renders.
export const WELCOME_FLAG = 'agentux:welcome-pending';

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

  const isFirstLogin = Boolean(body.is_first_login);
  if (isFirstLogin) {
    try {
      window.sessionStorage.setItem(WELCOME_FLAG, '1');
    } catch {
      // Private-mode / disabled storage — silently skip. Worst case the
      // user doesn't see the welcome modal, which is harmless.
    }
  }

  return { ok: true, isFirstLogin };
}

// ────────────────────────────────────────────────────────────────────
// auth-admin client wrapper
// ────────────────────────────────────────────────────────────────────

export interface MemberRow {
  email: string;
  enabled: boolean;
  created_at: string;
  last_login_at: string | null;
  failed_count: number;
  locked_until: string | null;
  role: string;
  is_admin: boolean;
}

export type AdminAction =
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

export type AdminErrorCode =
  | 'unauthorized'
  | 'already_exists'
  | 'bad_role'
  | 'not_found'
  | 'last_admin'
  | 'system_role'
  | 'role_in_use'
  | 'network'
  | 'unknown';

export interface RoleAdminRow {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  capabilities: string[];
  member_count: number;
}

export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AdminErrorCode; message?: string; member_count?: number };

export async function callAdmin<T>(
  adminPasscode: string,
  action: AdminAction,
  payload?: Record<string, unknown>,
): Promise<AdminResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/auth-admin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ admin_passcode: adminPasscode, action, payload }),
    });
  } catch {
    return { ok: false, code: 'network' };
  }

  if (res.status === 401) return { ok: false, code: 'unauthorized' };
  if (res.status === 404) return { ok: false, code: 'not_found' };
  if (res.status === 400) {
    const body = await res.json().catch(() => null);
    if (body?.error === 'bad_role') return { ok: false, code: 'bad_role' };
    return { ok: false, code: 'unknown', message: body?.detail ?? body?.error };
  }
  if (res.status === 403) {
    const body = await res.json().catch(() => null);
    if (body?.error === 'system_role') return { ok: false, code: 'system_role' };
    return { ok: false, code: 'unknown', message: body?.detail ?? body?.error };
  }
  if (res.status === 409) {
    const body = await res.json().catch(() => null);
    if (body?.error === 'last_admin')  return { ok: false, code: 'last_admin' };
    if (body?.error === 'role_in_use') return { ok: false, code: 'role_in_use', member_count: body.member_count };
    return { ok: false, code: 'already_exists' };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { ok: false, code: 'unknown', message: body?.detail ?? body?.error };
  }

  const body = await res.json().catch(() => null);
  return { ok: true, data: body as T };
}

// ────────────────────────────────────────────────────────────────────
// useIsAdmin — "should this user see the Members panel / Team section?"
// ────────────────────────────────────────────────────────────────────
//
// Reads the `admins` table via the admins_self_select RLS policy on the
// migration. Returns `null` while loading so callers can avoid flashing
// the panel for a moment before discovering the user isn't admin.

export function useIsAdmin(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData.session?.user?.email;
      if (!email) {
        if (!cancelled) setIsAdmin(false);
        return;
      }
      const { data } = await supabase
        .from('admins')
        .select('email')
        .eq('email', email)
        .maybeSingle();
      if (!cancelled) setIsAdmin(Boolean(data));
    }

    check();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return isAdmin;
}
