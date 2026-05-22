// Release feed types + runtime loader for the in-app What's New panel.
//
// Content lives in `designer/public/whats-new.json` (NOT a TS array
// anymore). That file is served from `/designer/whats-new.json` at
// runtime, so adding a release no longer requires a frontend rebuild —
// commit the JSON and the next page load picks it up.
//
// Authoring convention — when a PR ships a user-facing change, prepend
// an entry to whats-new.json as part of the same PR. Two rules for
// bullets:
//   1. Lead with the benefit, not the mechanism.
//   2. Keep it short. One line, no trailing period.
//
// Each release entry has a kind-coloured badge per bullet:
//   'new'      — net-new capability / surface / shortcut
//   'improved' — existing feature got faster, clearer, or richer
//   'fix'      — a bug or papercut that's now gone

export type WhatsNewBulletKind = 'new' | 'improved' | 'fix';

export interface WhatsNewBullet {
  kind: WhatsNewBulletKind;
  text: string;
}

export interface WhatsNewRelease {
  id: string;
  date: string;
  title: string;
  imageUrl?: string;
  bullets: WhatsNewBullet[];
}

// Single-flight fetch — cached in module state so the badge-count
// helper (sync) and the panel (effect-driven) share one network read.
// Resets on full page reload, which is fine — the build-id refresh
// flow already replaces the page on new deploys.
let cache: WhatsNewRelease[] | null = null;
let inflight: Promise<WhatsNewRelease[]> | null = null;

const WHATS_NEW_URL = '/designer/whats-new.json';

export function loadWhatsNewReleases(): Promise<WhatsNewRelease[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch(WHATS_NEW_URL, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<WhatsNewRelease[]>;
    })
    .then((data) => {
      cache = Array.isArray(data) ? data : [];
      return cache;
    })
    .catch((error) => {
      // Empty cache + log so a bad JSON doesn't crash the badge or
      // the panel; users just see "no releases yet".
      console.error('[whats-new] failed to load releases', error);
      cache = [];
      return cache;
    });
  return inflight;
}

// Synchronous accessor for the badge count and other surfaces that
// can't await. Returns an empty array until the loader resolves; the
// caller is responsible for triggering a fetch on app mount so the
// cache is populated before anyone reads it.
export function getCachedWhatsNewReleases(): WhatsNewRelease[] {
  return cache ?? [];
}
