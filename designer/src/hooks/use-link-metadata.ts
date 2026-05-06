import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface LinkMetadata {
  title: string | null;
  description: string | null;
  image: string | null;
}

const STORAGE_KEY = 'catalogue-link-meta-v1';
const BATCH_SIZE = 20;

type Cache = Record<string, LinkMetadata | null>;

function readCache(): Cache {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Cache) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Cache) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // quota exceeded or storage disabled — ignore
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function useLinkMetadata(urls: string[]): {
  metadata: Cache;
  loading: boolean;
} {
  const [metadata, setMetadata] = useState<Cache>(() => readCache());
  const [loading, setLoading] = useState(false);

  const key = urls.join('|');

  useEffect(() => {
    let cancelled = false;
    const cached = readCache();
    const missing = urls.filter((u) => !(u in cached));

    if (missing.length === 0) {
      setMetadata(cached);
      return;
    }

    setLoading(true);
    (async () => {
      const next: Cache = { ...cached };
      for (const group of chunk(missing, BATCH_SIZE)) {
        if (cancelled) return;
        try {
          const { data, error } = await supabase.functions.invoke<{
            results: Record<string, LinkMetadata | null>;
          }>('fetch-link-metadata', { body: { urls: group } });

          if (error || !data?.results) {
            for (const u of group) next[u] = null;
          } else {
            for (const u of group) {
              next[u] = data.results[u] ?? null;
            }
          }
        } catch {
          for (const u of group) next[u] = null;
        }
        if (cancelled) return;
        writeCache(next);
        setMetadata({ ...next });
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { metadata, loading };
}
