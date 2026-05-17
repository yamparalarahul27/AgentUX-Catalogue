import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid, Monitor, Smartphone } from 'lucide-react';

import { CATALOGUE_FLOW_LABEL_KEY } from '../lib/catalogue-families';
import {
  ensureCatalogueGroupAppearanceLoaded,
  readCatalogueGroupAppearanceMap,
  resolveCatalogueGroupAppearance,
  subscribeCatalogueGroupAppearance,
} from '../lib/catalogue-group-appearance';
import type { ScreenshotNode } from '../types';
import { ThumbHashImage } from './ThumbHashImage';

interface Props {
  // Full-scope screenshot set (already loaded for the chip strip / Settings).
  // Group View renders one card per group derived from this list — pagination
  // and the toolbar group filter do not apply here, by design: the point of
  // Group View is to browse every group at once.
  screenshots: ScreenshotNode[];
  // Active toolbar filters. Applied client-side here so Group View can stay
  // honest about "which groups have matches" without depending on paginated
  // server data. Toolbar group filter is deliberately ignored (see above).
  filterFlow: string[];
  filterPlatform: string | null;
  filterTheme: string | null;
  filterMobileOs: string | null;
  filterWebPreset: string | null;
  searchQuery: string;
}

// Cap the per-card hero rotation so we don't keep 100+ images per group
// in memory once the hover-cycle interaction lands. View-More takes over
// past this threshold (routes to the detail page, when shipped).
const HERO_ROTATION_CAP = 6;

interface GroupSummary {
  key: string;
  heroScreenshot: ScreenshotNode;
  recentScreenshots: ScreenshotNode[];
  screenshotCount: number;
  hasMoreThanCap: boolean;
  platforms: { web: boolean; mobile: boolean };
}

function parseTimestamp(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

interface ActiveFilters {
  flow: string[];
  platform: string | null;
  theme: string | null;
  mobileOs: string | null;
  webPreset: string | null;
  search: string;
}

function hasAnyFilter(f: ActiveFilters): boolean {
  return f.flow.length > 0
    || Boolean(f.platform)
    || Boolean(f.theme)
    || Boolean(f.mobileOs)
    || Boolean(f.webPreset)
    || f.search.length > 0;
}

function applyFilters(screenshots: ScreenshotNode[], f: ActiveFilters): ScreenshotNode[] {
  if (!hasAnyFilter(f)) return screenshots;
  const searchNeedle = f.search.trim().toLowerCase();
  return screenshots.filter((shot) => {
    if (f.platform && shot.platform !== f.platform) return false;
    if (f.theme && shot.theme !== f.theme) return false;
    if (f.mobileOs && shot.mobile_os !== f.mobileOs) return false;
    if (f.webPreset && shot.web_preset_key !== f.webPreset) return false;
    if (f.flow.length > 0) {
      const meta = shot.metadata as Record<string, unknown> | null | undefined;
      const label = typeof meta?.[CATALOGUE_FLOW_LABEL_KEY] === 'string'
        ? (meta?.[CATALOGUE_FLOW_LABEL_KEY] as string)
        : null;
      if (!label || !f.flow.includes(label)) return false;
    }
    if (searchNeedle) {
      const name = shot.name?.toLowerCase() || '';
      const fileName = shot.file_name?.toLowerCase() || '';
      if (!name.includes(searchNeedle) && !fileName.includes(searchNeedle)) return false;
    }
    return true;
  });
}

function summarizeGroups(screenshots: ScreenshotNode[]): GroupSummary[] {
  const buckets = new Map<string, ScreenshotNode[]>();
  for (const shot of screenshots) {
    const key = (shot.group || '').trim();
    if (!key) continue;
    const list = buckets.get(key);
    if (list) list.push(shot);
    else buckets.set(key, [shot]);
  }

  const summaries: GroupSummary[] = [];
  for (const [key, shots] of buckets) {
    const sorted = [...shots].sort(
      (a, b) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at),
    );
    let web = false;
    let mobile = false;
    for (const shot of shots) {
      if (shot.platform === 'web') web = true;
      else if (shot.platform === 'mobile') mobile = true;
    }
    summaries.push({
      key,
      heroScreenshot: sorted[0],
      recentScreenshots: sorted.slice(0, HERO_ROTATION_CAP),
      screenshotCount: shots.length,
      hasMoreThanCap: shots.length > HERO_ROTATION_CAP,
      platforms: { web, mobile },
    });
  }
  // Order by each group's most-recent screenshot — surfaces groups with
  // fresh activity at the top. Ties (or groups whose hero has no created_at)
  // fall back to alphabetical so order stays stable across renders.
  return summaries.sort((a, b) => {
    const aTs = parseTimestamp(a.heroScreenshot.created_at);
    const bTs = parseTimestamp(b.heroScreenshot.created_at);
    if (aTs !== bTs) return bTs - aTs;
    return a.key.localeCompare(b.key);
  });
}

function formatTypeMeta(category: string | null, region: string | null): string | null {
  const parts: string[] = [];
  if (category) parts.push(category.toUpperCase());
  if (region) parts.push(region === 'india' ? 'India' : 'Global');
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function CatalogueGroupView({
  screenshots,
  filterFlow,
  filterPlatform,
  filterTheme,
  filterMobileOs,
  filterWebPreset,
  searchQuery,
}: Props) {
  const [appearanceMap, setAppearanceMap] = useState(readCatalogueGroupAppearanceMap);

  useEffect(() => {
    void ensureCatalogueGroupAppearanceLoaded(null);
    return subscribeCatalogueGroupAppearance(() => {
      setAppearanceMap(readCatalogueGroupAppearanceMap());
    });
  }, []);

  const activeFilters = useMemo<ActiveFilters>(() => ({
    flow: filterFlow,
    platform: filterPlatform,
    theme: filterTheme,
    mobileOs: filterMobileOs,
    webPreset: filterWebPreset,
    search: searchQuery,
  }), [filterFlow, filterPlatform, filterTheme, filterMobileOs, filterWebPreset, searchQuery]);

  const filtered = useMemo(
    () => applyFilters(screenshots, activeFilters),
    [screenshots, activeFilters],
  );

  const summaries = useMemo(() => summarizeGroups(filtered), [filtered]);
  const isFiltering = hasAnyFilter(activeFilters);

  if (summaries.length === 0) {
    return (
      <div className="catalogue-group-view__empty">
        {isFiltering
          ? 'No groups match this filter.'
          : 'No groups yet. Upload a few screenshots and assign them to a group to populate this view.'}
      </div>
    );
  }

  return (
    <div className="catalogue-group-view">
      {summaries.map((summary) => {
        const appearance = resolveCatalogueGroupAppearance(appearanceMap, summary.key, null);
        const label = appearance.label || summary.key;
        const typeMeta = formatTypeMeta(appearance.category, appearance.region);
        const heroIsMobile = summary.heroScreenshot.platform !== 'web';
        const platformsTitle = summary.platforms.web && summary.platforms.mobile
          ? 'Available on web and mobile'
          : summary.platforms.web
            ? 'Web only'
            : summary.platforms.mobile
              ? 'Mobile only'
              : null;

        return (
          <article key={summary.key} className="catalogue-group-cell">
            <div className="catalogue-group-card">
              {(summary.platforms.web || summary.platforms.mobile) && (
                <div className="catalogue-group-card__platforms" title={platformsTitle ?? undefined}>
                  {summary.platforms.web && <Monitor size={14} aria-hidden="true" />}
                  {summary.platforms.mobile && <Smartphone size={14} aria-hidden="true" />}
                </div>
              )}

              <div className="catalogue-group-card__count">{summary.screenshotCount}</div>

              <div className={`catalogue-group-card__hero${heroIsMobile ? ' is-mobile' : ' is-web'}`}>
                {summary.heroScreenshot.image_url ? (
                  <ThumbHashImage
                    src={summary.heroScreenshot.image_url}
                    thumbHash={summary.heroScreenshot.thumb_hash ?? null}
                    alt={label}
                  />
                ) : (
                  <div className="catalogue-group-card__hero-empty">No preview</div>
                )}
              </div>

              <button
                type="button"
                className="catalogue-group-card__nav is-prev"
                aria-label="Previous screenshot"
                tabIndex={-1}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="catalogue-group-card__nav is-next"
                aria-label="Next screenshot"
                tabIndex={-1}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="catalogue-group-card__footer">
              <div className="catalogue-group-card__icon">
                {appearance.iconUrl ? (
                  <img src={appearance.iconUrl} alt="" aria-hidden="true" />
                ) : (
                  <LayoutGrid size={20} aria-hidden="true" />
                )}
              </div>
              <div className="catalogue-group-card__text">
                <div className="catalogue-group-card__name">{label}</div>
                {typeMeta && <div className="catalogue-group-card__meta">{typeMeta}</div>}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
