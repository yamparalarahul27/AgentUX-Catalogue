import { useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { LabelVocabEntry, LabelVocabKind } from '../lib/labeling/types';

// Module-scoped per-kind cache. Each combobox calls useLabelVocabKind for the
// one kind it cares about; fetches happen on demand and survive across mounts
// (no refetch when an editor closes and reopens).
const cache: Partial<Record<LabelVocabKind, LabelVocabEntry[]>> = {};
const inFlight: Partial<Record<LabelVocabKind, Promise<LabelVocabEntry[]>>> = {};

async function loadKind(kind: LabelVocabKind): Promise<LabelVocabEntry[]> {
  if (cache[kind]) return cache[kind] as LabelVocabEntry[];
  if (inFlight[kind]) return inFlight[kind] as Promise<LabelVocabEntry[]>;

  const promise = (async () => {
    const { data, error } = await supabase
      .from('label_vocab')
      .select('*')
      .eq('is_active', true)
      .eq('kind', kind)
      .order('value', { ascending: true });
    inFlight[kind] = undefined as unknown as Promise<LabelVocabEntry[]>;
    if (error || !data) return [];
    const rows = data as LabelVocabEntry[];
    cache[kind] = rows;
    return rows;
  })();
  inFlight[kind] = promise;
  return promise;
}

export function useLabelVocabKind(kind: LabelVocabKind): {
  entries: LabelVocabEntry[];
  loading: boolean;
} {
  const [entries, setEntries] = useState<LabelVocabEntry[]>(cache[kind] ?? []);
  const [loading, setLoading] = useState<boolean>(!cache[kind]);

  useEffect(() => {
    if (cache[kind]) {
      setEntries(cache[kind] as LabelVocabEntry[]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadKind(kind).then((rows) => {
      if (cancelled) return;
      setEntries(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  return { entries, loading };
}
