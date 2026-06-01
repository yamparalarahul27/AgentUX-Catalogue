// Pure aggregator for the /elements browse view. Walks every
// screenshot's AI label and accumulates UI elements / UX patterns /
// page types into a single catalog. For each element, picks 4
// diverse-by-group samples so the card strip tells a story:
// "look how Coinbase, Binance, Weex, Valr all handle this."
//
// Same source data as Advance Search's entity recognition
// (catalogue-search-entities.ts), but a richer aggregate — Search
// just needs counts; the browse view needs the screenshots
// themselves to render thumbnails.

import type { ScreenshotNode } from '../types';

export type ElementKind = 'ui' | 'ux' | 'page';

export interface ElementCatalogEntry {
  kind: ElementKind;
  // Display name (original casing from the AI label, deduplicated
  // case-insensitively — the most common casing wins).
  name: string;
  // URL-safe slug derived from name. Used in `/elements/:kind/:slug`.
  slug: string;
  // Every full-scope screenshot containing this element.
  screenshots: ScreenshotNode[];
  // 4 sample screenshots picked one-per-distinct-group, for the
  // card sample strip on the browse page.
  samples: ScreenshotNode[];
  // Number of distinct groups containing this element. Surfaced on
  // the drill-in page meta line.
  groupCount: number;
}

// Lower-cased, hyphen-separated, alphanumeric. Mirrors what most
// route slugs in this app use; predictable in URLs.
export function slugifyElement(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// One per group, up to N. Returns the original order of `screenshots`
// inside each group's first hit — the caller decides sort order
// upstream. Falls through to non-distinct samples if there are
// fewer than N groups.
export function pickDiverseByGroup(
  screenshots: ScreenshotNode[],
  n: number,
): ScreenshotNode[] {
  const seen = new Set<string>();
  const out: ScreenshotNode[] = [];
  for (const shot of screenshots) {
    const groupKey = (shot.group ?? '').trim().toLowerCase() || '__ungrouped';
    if (seen.has(groupKey)) continue;
    seen.add(groupKey);
    out.push(shot);
    if (out.length >= n) return out;
  }
  // Not enough distinct groups — backfill with screenshots already
  // chosen-from groups so the strip stays full.
  if (out.length < n) {
    for (const shot of screenshots) {
      if (out.includes(shot)) continue;
      out.push(shot);
      if (out.length >= n) break;
    }
  }
  return out;
}

function getLabelArray(screenshot: ScreenshotNode, path: readonly string[]): string[] {
  const metadata = screenshot.metadata as Record<string, unknown> | null | undefined;
  if (!metadata) return [];
  const label = metadata.label;
  if (!label || typeof label !== 'object') return [];
  let cursor: unknown = label;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object') return [];
    cursor = (cursor as Record<string, unknown>)[key];
  }
  if (!Array.isArray(cursor)) return [];
  return cursor.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

interface RawBucket {
  kind: ElementKind;
  // Track which casings appear so we can pick the most common one
  // as the canonical display name.
  caseTallies: Map<string, number>;
  screenshots: ScreenshotNode[];
}

// Build the full catalog from a flat screenshot array. Memoise in
// the caller; this is O(N * label-array-sizes), cheap but not free.
export function buildElementCatalog(screenshots: ScreenshotNode[]): ElementCatalogEntry[] {
  const buckets = new Map<string, RawBucket>();

  function add(kind: ElementKind, rawName: string, shot: ScreenshotNode) {
    const trimmed = rawName.trim();
    if (!trimmed) return;
    const slug = slugifyElement(trimmed);
    if (!slug) return;
    const key = `${kind}:${slug}`;
    let entry = buckets.get(key);
    if (!entry) {
      entry = { kind, caseTallies: new Map(), screenshots: [] };
      buckets.set(key, entry);
    }
    entry.caseTallies.set(trimmed, (entry.caseTallies.get(trimmed) ?? 0) + 1);
    // De-dupe: a single screenshot can repeat the same tag — only
    // count it once per element.
    if (!entry.screenshots.includes(shot)) {
      entry.screenshots.push(shot);
    }
  }

  for (const shot of screenshots) {
    for (const value of getLabelArray(shot, ['identity', 'page_types'])) add('page', value, shot);
    for (const value of getLabelArray(shot, ['screen_analysis', 'ui_elements'])) add('ui', value, shot);
    for (const value of getLabelArray(shot, ['screen_analysis', 'ux_patterns'])) add('ux', value, shot);
  }

  const result: ElementCatalogEntry[] = [];
  for (const [, entry] of buckets) {
    // Most common casing of the name wins; ties broken by first-seen
    // (insertion order on the Map).
    let bestName = '';
    let bestCount = 0;
    for (const [name, count] of entry.caseTallies) {
      if (count > bestCount) {
        bestCount = count;
        bestName = name;
      }
    }
    const slug = slugifyElement(bestName);
    const groupKeys = new Set(entry.screenshots.map((s) => (s.group ?? '').trim().toLowerCase() || '__ungrouped'));
    result.push({
      kind: entry.kind,
      name: bestName,
      slug,
      screenshots: entry.screenshots,
      samples: pickDiverseByGroup(entry.screenshots, 4),
      groupCount: groupKeys.size,
    });
  }
  return result;
}

// Display labels for the kind chips / page headers.
export function elementKindLabel(kind: ElementKind): string {
  if (kind === 'ui') return 'UI Element';
  if (kind === 'ux') return 'UX Pattern';
  return 'Page Type';
}

// Route URL for the drill-in page.
export function elementDetailUrl(kind: ElementKind, slug: string): string {
  return `/elements/${kind}/${slug}`;
}

// Find a single entry by kind + slug — used by the detail page to
// resolve URL params back to the catalog entry.
export function findElementEntry(
  catalog: ElementCatalogEntry[],
  kind: ElementKind,
  slug: string,
): ElementCatalogEntry | null {
  return catalog.find((entry) => entry.kind === kind && entry.slug === slug) ?? null;
}
