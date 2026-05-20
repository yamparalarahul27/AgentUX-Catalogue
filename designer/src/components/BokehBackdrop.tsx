// BokehBackdrop
//
// Login-page backdrop: a scatter of group icons, heavily blurred at
// rest so the layer reads as ambient texture. On hover one icon
// becomes crisp and shows a name / count / category · region label.
// Click stores the group key in localStorage so the catalogue's
// filter-state hook can pick it up after sign-in.
//
// Anon-readable inputs:
//   - catalogue_group_appearance (group_key, display_label, icon_url,
//     category, region) — policy added in
//     20260516_share_page_group_appearance_anon
//   - screenshots (group_key) for the per-group screenshot count

import { useEffect, useMemo, useState } from 'react';

import { supabase } from '../lib/supabase';

export const PENDING_GROUP_FILTER_KEY = 'agentux:pending-group-filter';

// Per-page-load layout. `SCATTER_SEED` is captured once at module
// init so the layout stays stable across re-renders within the
// session, but changes every refresh — visitors see a different
// rotating sample of groups each visit.
const SCATTER_SEED = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
const TOAST_VISIBLE_MS = 2800;

// Cap how many bokeh icons render at once — the catalogue has 130+
// groups and the page got visually heavy showing them all. 50 fits
// the 10×5 placement grid below and reads as ambient texture.
const MAX_ICONS = 50;
const GRID_COLS = 10;
const GRID_ROWS = 5;

const SIZE_BUCKETS = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
type SizeBucket = (typeof SIZE_BUCKETS)[number];

// Hash-derived ring colour — gives each group its own focus glow
// without needing a brand-colour column on `catalogue_group_appearance`.
const RING_PALETTE = [
  '#f0b90b', '#0052ff', '#ff007a', '#5741d9', '#ffd700',
  '#54ffd7', '#22c55e', '#a855f7', '#f97316', '#06b6d4',
  '#ec4899', '#fbbf24', '#84cc16', '#38bdf8', '#fb7185',
];

interface BokehGroup {
  key: string;
  name: string;
  iconUrl: string;
  category: 'cex' | 'dex' | 'other' | null;
  region: 'india' | 'global' | null;
  count: number;
  // Layout (seeded once per mount)
  leftPct: number;
  topPct: number;
  size: SizeBucket;
  ring: string;
  driftDelaySec: number;
  flip: boolean; // label above (true) when icon is in the bottom half
}

interface AppearanceRow {
  category: string | null;
  display_label: string | null;
  group_key: string;
  icon_url: string | null;
  region: string | null;
}

// NOTE: `screenshots` uses the column name `group` (not `group_key` —
// that's only on `catalogue_group_appearance`). Keep these aligned.
interface ScreenshotKeyRow { group: string | null }

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (Math.imul(h, 31) + value.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickSize(rng: () => number): SizeBucket {
  // Skewed toward smaller — too many lg/xl icons turn the bokeh into
  // a wall of large blobs.
  const r = rng();
  if (r < 0.25) return 'xs';
  if (r < 0.55) return 'sm';
  if (r < 0.80) return 'md';
  if (r < 0.94) return 'lg';
  return 'xl';
}

function shuffleInPlace<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function buildLayout(rows: AppearanceRow[], counts: Map<string, number>): BokehGroup[] {
  const rng = mulberry32(SCATTER_SEED);

  // Pick up to MAX_ICONS groups from the full set, shuffled — each
  // refresh shows a different rotating sample.
  const candidates = rows.filter((row) => Boolean(row.icon_url) && Boolean(row.group_key));
  const picked = shuffleInPlace([...candidates], rng).slice(0, MAX_ICONS);

  // Generate a shuffled grid of cell coordinates so icons land
  // evenly across the viewport but in random cells. The grid gives
  // "no overlap"; a per-cell jitter keeps it from feeling rigid.
  const cells: { col: number; row: number }[] = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) cells.push({ col, row });
  }
  shuffleInPlace(cells, rng);

  const cellW = 100 / GRID_COLS;
  const cellH = 100 / GRID_ROWS;

  return picked.map((row, idx) => {
    const cell = cells[idx % cells.length];
    // Jitter ±25% of cell size keeps icons inside their cell (no
    // overlap with neighbours' centres) while reading as organic.
    const jitterX = (rng() - 0.5) * 0.5 * cellW;
    const jitterY = (rng() - 0.5) * 0.5 * cellH;
    const leftPct = (cell.col + 0.5) * cellW + jitterX;
    const topPct = (cell.row + 0.5) * cellH + jitterY;
    const key = row.group_key.trim().toLowerCase();
    return {
      key,
      name: (row.display_label?.trim() || key.replace(/-/g, ' ')).replace(/\b\w/g, (c) => c.toUpperCase()),
      iconUrl: row.icon_url as string,
      category: row.category === 'cex' || row.category === 'dex' || row.category === 'other' ? row.category : null,
      region: row.region === 'india' || row.region === 'global' ? row.region : null,
      count: counts.get(key) ?? 0,
      leftPct,
      topPct,
      size: pickSize(rng),
      ring: RING_PALETTE[hashString(key) % RING_PALETTE.length],
      driftDelaySec: -((hashString(key) % 1400) / 100),
      flip: topPct > 55,
    };
  });
}

async function fetchBokehData(): Promise<{
  appearances: AppearanceRow[];
  counts: Map<string, number>;
}> {
  // Both reads use anon RLS — no session needed.
  const [appearanceRes, countsRes] = await Promise.all([
    supabase
      .from('catalogue_group_appearance')
      .select('group_key, display_label, icon_url, category, region'),
    supabase
      .from('screenshots')
      .select('group')
      .is('deleted_at', null)
      .range(0, 49999),
  ]);

  const appearances = ((appearanceRes.data ?? []) as AppearanceRow[]).filter(
    (row) => Boolean(row.group_key),
  );

  const counts = new Map<string, number>();
  for (const row of (countsRes.data ?? []) as ScreenshotKeyRow[]) {
    const key = row.group?.trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { appearances, counts };
}

export function BokehBackdrop() {
  const [groups, setGroups] = useState<BokehGroup[]>([]);
  const [toastGroup, setToastGroup] = useState<BokehGroup | null>(null);

  // Fetch is async + external — useEffect is the right tool here
  // (synchronising React state with a remote system). The lazy-init
  // pattern wouldn't work since reads are async.
  useEffect(() => {
    let cancelled = false;
    fetchBokehData().then(({ appearances, counts }) => {
      if (cancelled) return;
      setGroups(buildLayout(appearances, counts));
    }).catch(() => {
      // Silent failure — the login form still works without the backdrop.
    });
    return () => { cancelled = true; };
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toastGroup) return;
    const id = window.setTimeout(() => setToastGroup(null), TOAST_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [toastGroup]);

  const formattedGroups = useMemo(() => groups, [groups]);

  function handleIconClick(group: BokehGroup) {
    try {
      localStorage.setItem(PENDING_GROUP_FILTER_KEY, group.key);
    } catch {
      // ignore — quota / disabled storage
    }
    setToastGroup(group);
  }

  return (
    <>
      <div className="auth-bokeh-layer" aria-hidden="true">
        {formattedGroups.map((group) => (
          <button
            key={group.key}
            type="button"
            className={`auth-bokeh-icon auth-bokeh-icon--${group.size}${group.flip ? ' auth-bokeh-icon--flip' : ''}`}
            style={{
              left: `${group.leftPct}%`,
              top: `${group.topPct}%`,
              ['--ring' as string]: group.ring,
              ['--drift-delay' as string]: `${group.driftDelaySec}s`,
            }}
            onClick={() => handleIconClick(group)}
            aria-label={`${group.name} — log in to view`}
          >
            <img src={group.iconUrl} alt="" draggable={false} />
            <span className="auth-bokeh-label">
              <span className="auth-bokeh-label__name">{group.name}</span>
              {group.count > 0 && (
                <span className="auth-bokeh-label__count">
                  <strong>{group.count}</strong> screenshot{group.count === 1 ? '' : 's'}
                </span>
              )}
              {(group.category || group.region) && (
                <span className="auth-bokeh-label__meta">
                  {group.category && <span>{group.category}</span>}
                  {group.category && group.region && <span className="auth-bokeh-label__meta-sep">·</span>}
                  {group.region && <span>{group.region}</span>}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      <div
        className={`auth-bokeh-toast${toastGroup ? ' is-visible' : ''}`}
        role="status"
        aria-live="polite"
      >
        Log in to check out <em>·</em> <strong>{toastGroup?.name ?? ''}</strong>
      </div>
    </>
  );
}
