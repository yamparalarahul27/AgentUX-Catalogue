import { del, get, set } from 'idb-keyval';

import type { ScreenshotNode } from '../types';

// Single IndexedDB cache for the unfiltered "full scope" screenshots list.
// On a warm load the hook reads from this BEFORE the network call to seed
// the catalogue with cards instantly — then the live Supabase fetch
// revalidates in the background and the diff (if any) replaces the
// seeded state. See use-catalogue-full-scope.ts for the wiring.
//
// Why IndexedDB instead of localStorage:
//   - localStorage caps at ~5 MB and serializes synchronously, blocking
//     the main thread. A 5,000-row catalogue can easily exceed both.
//   - IndexedDB is async by default and has tens-of-MB quotas across all
//     modern browsers (Chrome, Safari, Firefox, mobile Safari).
//
// Failure modes (private browsing, quota exhaustion, unsupported browser)
// all swallow silently — cache is non-critical; the network fetch path
// stays correct on its own.

// Bump when ScreenshotNode's shape changes in a way that would break
// older cached rows. The version is written alongside the rows; readers
// drop the cache when the version doesn't match.
const CACHE_VERSION = 1;

const SCREENSHOTS_KEY = 'agentux:catalogue:screenshots';

interface CachedScreenshots {
  version: number;
  // Wall-clock when the rows were written. Not currently used to expire
  // the cache (revalidation handles that), but useful when debugging
  // stale-cache reports.
  writtenAt: number;
  rows: ScreenshotNode[];
}

export async function readCachedScreenshots(): Promise<ScreenshotNode[] | null> {
  try {
    const raw = (await get(SCREENSHOTS_KEY)) as CachedScreenshots | undefined;
    if (!raw || raw.version !== CACHE_VERSION || !Array.isArray(raw.rows)) {
      return null;
    }
    return raw.rows;
  } catch {
    return null;
  }
}

export async function writeCachedScreenshots(rows: ScreenshotNode[]): Promise<void> {
  try {
    const payload: CachedScreenshots = {
      version: CACHE_VERSION,
      writtenAt: Date.now(),
      rows,
    };
    await set(SCREENSHOTS_KEY, payload);
  } catch {
    /* swallow — cache is non-critical (private mode, quota, etc.) */
  }
}

export async function clearCachedScreenshots(): Promise<void> {
  try {
    await del(SCREENSHOTS_KEY);
  } catch {
    /* swallow */
  }
}
