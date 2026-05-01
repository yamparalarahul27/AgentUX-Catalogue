export interface CatalogueGroupStats {
  // Canonical (lowercase, trimmed) — used as stable identity for chips,
  // URL state, and active-state comparisons.
  groupKey: string;
  // Most-recently-added raw casing for display fallback when the appearance
  // map has no label set.
  displayKey: string;
  // Every raw casing that mapped to this canonical key. The catalogue
  // filter sets `filterGroup` to this list so all DB casings resolve under
  // one chip click.
  rawKeys: string[];
  count: number;
  lastAddedAt: string | null;
}

interface ScreenshotLike {
  group?: string | null;
  created_at?: string | null;
}

export function deriveGroupStats(screenshots: ScreenshotLike[]): CatalogueGroupStats[] {
  const map = new Map<string, { displayKey: string; rawKeys: Set<string>; count: number; lastAddedAt: string | null }>();
  for (const screenshot of screenshots) {
    const raw = screenshot.group?.trim();
    if (!raw) continue;
    const canonical = raw.toLowerCase();
    const created = screenshot.created_at ?? null;
    const existing = map.get(canonical);
    if (!existing) {
      map.set(canonical, {
        displayKey: raw,
        rawKeys: new Set([raw]),
        count: 1,
        lastAddedAt: created,
      });
      continue;
    }
    existing.count += 1;
    existing.rawKeys.add(raw);
    if (created && (!existing.lastAddedAt || created > existing.lastAddedAt)) {
      existing.lastAddedAt = created;
      existing.displayKey = raw;
    }
  }
  return [...map.entries()].map(([groupKey, value]) => ({
    groupKey,
    displayKey: value.displayKey,
    rawKeys: [...value.rawKeys],
    count: value.count,
    lastAddedAt: value.lastAddedAt,
  }));
}

export type CatalogueGroupSortMode = 'recent' | 'alpha' | 'count';

export const DEFAULT_GROUP_SORT_MODE: CatalogueGroupSortMode = 'recent';

const GROUP_SORT_KEY = 'catalogue:group-sort-mode';

export function parseGroupSortMode(value: string | null | undefined): CatalogueGroupSortMode {
  if (value === 'recent' || value === 'alpha' || value === 'count') return value;
  return DEFAULT_GROUP_SORT_MODE;
}

export function loadGroupSortMode(): CatalogueGroupSortMode {
  try {
    return parseGroupSortMode(window.localStorage.getItem(GROUP_SORT_KEY));
  } catch {
    return DEFAULT_GROUP_SORT_MODE;
  }
}

export function persistGroupSortMode(mode: CatalogueGroupSortMode): void {
  try {
    window.localStorage.setItem(GROUP_SORT_KEY, mode);
  } catch {
    // ignore write errors
  }
}

export function sortGroups(
  groups: CatalogueGroupStats[],
  mode: CatalogueGroupSortMode,
  getLabel: (groupKey: string) => string = (key) => key,
): CatalogueGroupStats[] {
  const next = [...groups];
  switch (mode) {
    case 'recent':
      return next.sort((a, b) => {
        if (!a.lastAddedAt && !b.lastAddedAt) {
          return getLabel(a.groupKey).localeCompare(getLabel(b.groupKey), undefined, { sensitivity: 'base' });
        }
        if (!a.lastAddedAt) return 1;
        if (!b.lastAddedAt) return -1;
        return b.lastAddedAt.localeCompare(a.lastAddedAt);
      });
    case 'alpha':
      return next.sort((a, b) =>
        getLabel(a.groupKey).localeCompare(getLabel(b.groupKey), undefined, { sensitivity: 'base' }),
      );
    case 'count':
      return next.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return getLabel(a.groupKey).localeCompare(getLabel(b.groupKey), undefined, { sensitivity: 'base' });
      });
  }
}
