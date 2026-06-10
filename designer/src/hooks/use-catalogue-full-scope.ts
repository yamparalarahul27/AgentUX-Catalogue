import { useEffect, useState } from 'react';

import type { ScreenshotNode } from '../types';
import {
  clearCachedScreenshots,
  readCachedScreenshots,
  writeCachedScreenshots,
} from '../lib/catalogue-cache';
import { fetchAnnotationLabels } from '../lib/screenshot-annotations';
import { supabase } from '../lib/supabase';

const SCREENSHOT_PAGE_SIZE = 1000;
const COMMENT_SCREENSHOT_CHUNK_SIZE = 200;

// Two-layer cache:
//   1. Module-level `cachedScreenshots` — survives route navs within a
//      session so a catalogue ↔ group-detail jump reuses already-loaded
//      data instead of refetching.
//   2. IndexedDB (catalogue-cache.ts) — survives reloads + cold starts,
//      seeded back into the module cache on first mount so warm visits
//      paint the grid instantly while the network revalidates in the
//      background.
//
// `cachedScreenshots` is the latest successful result; `inFlightLoad` is
// the live promise when a fetch is in progress (so concurrent mounts
// share one request). Subscribers receive the data when it lands.
let cachedScreenshots: ScreenshotNode[] | null = null;
let inFlightLoad: Promise<ScreenshotNode[]> | null = null;
const cacheSubscribers = new Set<(screenshots: ScreenshotNode[]) => void>();

function notifyCacheSubscribers(data: ScreenshotNode[]) {
  for (const listener of cacheSubscribers) listener(data);
}

// Invalidate the module cache AND refetch immediately so currently-
// mounted hook instances pick up fresh data via the subscriber
// notification. Call after any mutation that changes the screenshot set
// — uploads, deletes (move to Trash), restores. Without this, the chip
// strip / Group detail page would show stale data until full reload.
export function invalidateCatalogueFullScopeCache() {
  cachedScreenshots = null;
  inFlightLoad = fetchAllScreenshots()
    .then((data) => {
      cachedScreenshots = data;
      inFlightLoad = null;
      notifyCacheSubscribers(data);
      void writeCachedScreenshots(data);
      return data;
    })
    .catch((err) => {
      inFlightLoad = null;
      throw err;
    });
}

// Hard wipe — clears the module cache AND the IndexedDB cache. Called
// from useAuth.logout / logoutEverywhere so a user logging out + the
// next user logging in on the same device doesn't see the previous
// account's screenshots.
export async function clearCatalogueFullScopeCache(): Promise<void> {
  cachedScreenshots = null;
  inFlightLoad = null;
  await clearCachedScreenshots();
}

interface ScopeScreenshotRow {
  id: string;
  group: string | null;
  platform: 'web' | 'mobile' | null;
  theme: 'light' | 'dark' | null;
  web_preset_key: string | null;
  mobile_os: 'ios' | 'android' | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  uploader_email: string | null;
  // Added so the categorised search modal can match on screenshot
  // names and render thumbnails for top matches. These extra columns
  // add roughly 150 bytes per row over the wire. Note: thumb_hash is
  // optional in the DB schema (migration 20260420_thumb_hash.sql) — we
  // deliberately don't SELECT it here so the query works on Supabase
  // projects that haven't run that migration yet. ThumbHashImage falls
  // back gracefully when the hash is missing.
  name: string | null;
  file_name: string | null;
  storage_path: string | null;
}

interface UseCatalogueFullScopeArgs {
  includeCommentedScreenshots?: boolean;
  includeAnnotatedScreenshots?: boolean;
}

function toScopeScreenshot(row: ScopeScreenshotRow): ScreenshotNode {
  const storagePath = row.storage_path ?? '';
  const imageUrl = storagePath
    ? supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl
    : undefined;
  return {
    id: row.id,
    flow_id: null,
    name: row.name ?? '',
    file_name: row.file_name ?? '',
    storage_path: storagePath,
    sequence: null,
    group: row.group,
    platform: row.platform,
    web_preset_key: row.web_preset_key,
    mobile_os: row.mobile_os,
    theme: row.theme,
    reference_url: null,
    reference_storage_path: null,
    reference_label: null,
    position_x: null,
    position_y: null,
    metadata: row.metadata ?? {},
    uploader_email: row.uploader_email,
    created_at: row.created_at ?? undefined,
    image_url: imageUrl,
  };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function fetchAllScreenshots(): Promise<ScreenshotNode[]> {
  const loadedRows: ScopeScreenshotRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('screenshots')
      .select('id,group,platform,theme,web_preset_key,mobile_os,metadata,created_at,uploader_email,name,file_name,storage_path')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, from + SCREENSHOT_PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    loadedRows.push(...(data as unknown as ScopeScreenshotRow[]));
    if (data.length < SCREENSHOT_PAGE_SIZE) break;
    from += data.length;
  }
  return loadedRows.map(toScopeScreenshot);
}

export function useCatalogueFullScope({
  includeCommentedScreenshots = false,
  includeAnnotatedScreenshots = false,
}: UseCatalogueFullScopeArgs = {}) {
  // Seed from the module-level cache so re-mounts (route changes) show
  // the already-loaded data on the first paint instead of a blank grid.
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>(() => cachedScreenshots ?? []);
  const [commentedScreenshotIds, setCommentedScreenshotIds] = useState<Set<string>>(new Set());
  const [annotatedScreenshotIds, setAnnotatedScreenshotIds] = useState<Set<string>>(new Set());
  const [annotationLabels, setAnnotationLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(!cachedScreenshots);

  useEffect(() => {
    let mounted = true;

    // Subscribe so this instance picks up data from a fetch initiated by
    // another mount of the same hook (e.g. the parent route also calling
    // useCatalogueFullScope).
    const onCacheUpdate = (data: ScreenshotNode[]) => {
      if (!mounted) return;
      setScreenshots(data);
      setLoading(false);
    };
    cacheSubscribers.add(onCacheUpdate);

    async function loadScope() {
      if (cachedScreenshots) {
        setScreenshots(cachedScreenshots);
        setLoading(false);
      } else {
        setLoading(true);

        // Race: IndexedDB read (fast, ~5–30 ms) against the live
        // Supabase fetch (slower, hundreds of ms to seconds). Whichever
        // wins, that's what we paint. Once the fetch completes it
        // ALWAYS overwrites whatever the IDB seeded — so the user
        // always lands on fresh data after the first revalidation tick,
        // regardless of cache age.
        void readCachedScreenshots().then((cachedRows) => {
          if (!mounted) return;
          // Skip the seed if the network already won (cachedScreenshots
          // populated by the fetch path below), otherwise we'd briefly
          // flash stale data over fresh.
          if (!cachedRows || cachedScreenshots) return;
          cachedScreenshots = cachedRows;
          setScreenshots(cachedRows);
          setLoading(false);
          notifyCacheSubscribers(cachedRows);
        });

        if (!inFlightLoad) {
          inFlightLoad = fetchAllScreenshots()
            .then((data) => {
              cachedScreenshots = data;
              inFlightLoad = null;
              notifyCacheSubscribers(data);
              // Persist for the next cold start. Fire-and-forget; the
              // writer swallows its own errors so a quota / private-mode
              // failure can't bubble into the fetch path.
              void writeCachedScreenshots(data);
              return data;
            })
            .catch((err) => {
              inFlightLoad = null;
              throw err;
            });
        }
        try {
          await inFlightLoad;
        } catch {
          if (!mounted) return;
          setScreenshots([]);
          setCommentedScreenshotIds(new Set());
          setAnnotatedScreenshotIds(new Set());
          setAnnotationLabels([]);
          setLoading(false);
          return;
        }
      }

      if (!mounted) return;
      const mapped = cachedScreenshots ?? [];
      const ids = mapped.map((screenshot) => screenshot.id);
      const idChunks = chunkArray(ids, COMMENT_SCREENSHOT_CHUNK_SIZE);

      if (includeCommentedScreenshots && ids.length > 0) {
        const nextCommentedIds = new Set<string>();
        for (const chunk of idChunks) {
          const { data } = await supabase
            .from('screenshot_comments')
            .select('screenshot_id')
            .in('screenshot_id', chunk);
          if (!mounted) return;
          for (const row of data ?? []) {
            if (row.screenshot_id) nextCommentedIds.add(row.screenshot_id);
          }
        }
        setCommentedScreenshotIds(nextCommentedIds);
      } else {
        setCommentedScreenshotIds(new Set());
      }

      if (includeAnnotatedScreenshots && ids.length > 0) {
        const nextAnnotatedIds = new Set<string>();
        for (const chunk of idChunks) {
          const { data } = await supabase
            .from('screenshot_annotations')
            .select('screenshot_id')
            .in('screenshot_id', chunk);
          if (!mounted) return;
          for (const row of data ?? []) {
            if (row.screenshot_id) nextAnnotatedIds.add(row.screenshot_id);
          }
        }
        setAnnotatedScreenshotIds(nextAnnotatedIds);
      } else {
        setAnnotatedScreenshotIds(new Set());
      }

      const labels = await fetchAnnotationLabels();
      if (!mounted) return;
      setAnnotationLabels(labels);
      setLoading(false);
    }

    void loadScope();

    return () => {
      mounted = false;
      cacheSubscribers.delete(onCacheUpdate);
    };
  }, [includeAnnotatedScreenshots, includeCommentedScreenshots]);

  return {
    annotatedScreenshotIds,
    annotationLabels,
    commentedScreenshotIds,
    loading,
    screenshots,
    setScreenshots,
  };
}
