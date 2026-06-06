import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

import { clearCatalogueFullScopeCache } from '../hooks/use-catalogue-full-scope';
import { supabase } from './supabase';

// Reads the real Supabase Auth session minted by auth-login. The
// `loading` flag is true until the initial getSession() resolves so
// callers can avoid flashing the login screen for users who already
// have a persisted session in localStorage.
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Clear the IndexedDB catalogue cache + module cache on every logout
  // path so a user logging out + the next user logging in on the same
  // device never sees the previous account's screenshots.
  async function logout() {
    await supabase.auth.signOut({ scope: 'local' });
    await clearCatalogueFullScopeCache();
  }

  // Invalidates every refresh token issued to this user — kicks out
  // all tabs / devices / browsers. Reach for this if you suspect
  // session theft or want to forcibly cycle credentials.
  async function logoutEverywhere() {
    await supabase.auth.signOut({ scope: 'global' });
    await clearCatalogueFullScopeCache();
  }

  return { user, loading, logout, logoutEverywhere };
}
