import { useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

// Reads the mentionable_members view (M0 migration). The view exposes only
// active members' emails (`enabled = true` filter is in the view itself), so
// consumers don't have to filter and disabled members can never appear in
// the typeahead.
//
// Cached at module level for the session — the roster changes rarely (only
// when an admin mints / disables / deletes a member). A future enhancement
// could subscribe to user_passcodes changes via Realtime, but for v1 a cold
// session-scoped cache is sufficient and avoids an extra channel.

let cached: string[] | null = null;
let inFlight: Promise<string[]> | null = null;

async function fetchRoster(): Promise<string[]> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { data, error } = await supabase
      .from('mentionable_members')
      .select('email');
    if (error || !data) {
      // Return an empty roster on failure rather than throwing — the
      // typeahead degrades to "no matches" instead of crashing the
      // composer.
      inFlight = null;
      return [];
    }
    const emails = data
      .map((row) => (typeof row.email === 'string' ? row.email : null))
      .filter((email): email is string => email !== null);
    cached = emails;
    inFlight = null;
    return emails;
  })();

  return inFlight;
}

export interface UseTeamRosterResult {
  roster: string[];
  loading: boolean;
}

export function useTeamRoster(): UseTeamRosterResult {
  const [roster, setRoster] = useState<string[]>(() => cached ?? []);
  const [loading, setLoading] = useState<boolean>(() => cached === null);

  useEffect(() => {
    if (cached) {
      setRoster(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void fetchRoster().then((emails) => {
      if (cancelled) return;
      setRoster(emails);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { roster, loading };
}

// Display label used in mention chips and bell items — matches the existing
// comment-author convention (`email.split('@')[0]`).
export function mentionLabel(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}
