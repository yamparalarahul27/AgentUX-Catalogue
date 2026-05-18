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

const STORAGE_KEY = 'catalogue:role-capabilities:v1';

let cachedCapabilities: Set<string> | null = null;
let cachedRole: string | null = null;
let inflight: Promise<{ role: string | null; capabilities: Set<string> }> | null = null;

// Module-level listeners that need notification when caps change.
const subscribers = new Set<() => void>();

function notifySubscribers() {
  for (const fn of subscribers) fn();
}

// Hydrate the module cache from localStorage so the first paint after a
// page reload doesn't show gated buttons as "missing" while the async
// RPC + role_capabilities fetch completes. Cache invalidates on auth
// state change (sign-in / sign-out / user updated) so a role flip can't
// leave stale capabilities behind.
function readPersistedCache(): { role: string | null; capabilities: Set<string> } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { role: string | null; capabilities: string[] };
    if (!parsed || !Array.isArray(parsed.capabilities)) return null;
    return {
      role: parsed.role,
      capabilities: new Set(parsed.capabilities),
    };
  } catch {
    return null;
  }
}

function writePersistedCache(role: string | null, capabilities: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      role,
      capabilities: [...capabilities],
    }));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function clearPersistedCache() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

// Seed the module cache from localStorage at import time so the very
// first useCapability() call returns the persisted value synchronously.
const persisted = readPersistedCache();
if (persisted) {
  cachedRole = persisted.role;
  cachedCapabilities = persisted.capabilities;
}

export function invalidateMyCapabilities() {
  cachedCapabilities = null;
  cachedRole = null;
  inflight = null;
  clearPersistedCache();
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
    writePersistedCache(result.role, result.capabilities);
    inflight = null;
    notifySubscribers();
    return result;
  });
  return inflight;
}

// Background revalidate — used to refresh persisted-cache hits without
// blocking the first paint. The result lands via the same cache +
// subscriber mechanism, so consumers get the latest values when they
// drift. No-op if a fetch is already in flight.
function revalidateInBackground() {
  if (inflight) return;
  inflight = fetchCapabilities().then((result) => {
    cachedRole = result.role;
    cachedCapabilities = result.capabilities;
    writePersistedCache(result.role, result.capabilities);
    inflight = null;
    notifySubscribers();
    return result;
  });
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

// Tracks whether the current module-level cache came straight from
// localStorage (persisted hit) — if so, we still kick off a background
// fetch so a server-side capability change propagates by the next paint.
let hasRevalidatedThisSession = false;

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
    } else {
      if (caps !== cachedCapabilities) setCaps(cachedCapabilities);
      // Persisted-cache hit: revalidate once per session against the
      // server so a role change since the last visit propagates.
      if (!hasRevalidatedThisSession) {
        hasRevalidatedThisSession = true;
        revalidateInBackground();
      }
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
