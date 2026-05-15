// useMyCapabilities / useCapability / useMyRole
//
// Reads the current member's role + capability set from Supabase via
// the SECURITY DEFINER `current_member_role()` RPC and the
// authenticated-readable `role_capabilities` table.
//
// Cached at module level so multiple components calling `useCapability`
// only trigger one network round-trip per session. Auth state changes
// (sign-in / sign-out) invalidate the cache so the next mount refetches.
//
// Companion code:
//   - supabase/migrations/20260515_roles_and_capabilities.sql
//   - designer/src/lib/role-capabilities.ts

import { useEffect, useState } from 'react';

import type { CapabilityKey } from '../lib/role-capabilities';
import { supabase } from '../lib/supabase';

let cachedCapabilities: Set<string> | null = null;
let cachedRole: string | null = null;
let inflight: Promise<{ role: string | null; capabilities: Set<string> }> | null = null;

// Module-level listeners that need notification when caps change.
const subscribers = new Set<() => void>();

function notifySubscribers() {
  for (const fn of subscribers) fn();
}

export function invalidateMyCapabilities() {
  cachedCapabilities = null;
  cachedRole = null;
  inflight = null;
  notifySubscribers();
}

async function fetchCapabilities(): Promise<{ role: string | null; capabilities: Set<string> }> {
  const { data: roleData, error: roleError } = await supabase.rpc('current_member_role');
  if (roleError || !roleData) {
    return { role: null, capabilities: new Set() };
  }
  const role = roleData as string;
  const { data: capsData, error: capsError } = await supabase
    .from('role_capabilities')
    .select('capability')
    .eq('role_id', role);
  const capabilities = new Set((capsError ? [] : capsData ?? []).map((r) => r.capability));
  return { role, capabilities };
}

async function loadOrUseCache() {
  if (cachedCapabilities) return { role: cachedRole, capabilities: cachedCapabilities };
  if (inflight) return inflight;
  inflight = fetchCapabilities().then((result) => {
    cachedRole = result.role;
    cachedCapabilities = result.capabilities;
    inflight = null;
    notifySubscribers();
    return result;
  });
  return inflight;
}

// One-time module-level auth subscription so the cache is invalidated
// on sign-in / sign-out. TOKEN_REFRESHED doesn't change identity so it
// stays cached.
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      invalidateMyCapabilities();
    }
  });
}

export function useMyCapabilities(): Set<string> | null {
  const [caps, setCaps] = useState<Set<string> | null>(cachedCapabilities);

  useEffect(() => {
    let cancelled = false;
    const notify = () => {
      if (!cancelled) setCaps(cachedCapabilities);
    };
    subscribers.add(notify);

    if (!cachedCapabilities) {
      loadOrUseCache().then(() => {
        if (!cancelled) setCaps(cachedCapabilities);
      });
    } else if (caps !== cachedCapabilities) {
      setCaps(cachedCapabilities);
    }

    return () => {
      cancelled = true;
      subscribers.delete(notify);
    };
  }, [caps]);

  return caps;
}

export function useCapability(key: CapabilityKey): boolean {
  const caps = useMyCapabilities();
  return Boolean(caps?.has(key));
}

export function useMyRole(): string | null {
  const caps = useMyCapabilities();
  return caps ? cachedRole : null;
}
