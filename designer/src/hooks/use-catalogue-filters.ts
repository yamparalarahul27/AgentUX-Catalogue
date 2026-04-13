import { useMemo } from 'react';

import { sortByAnnotationActivity, sortByCommentActivity, type CatalogueViewBy } from '../lib/catalogue-activity';
import { buildCatalogueFamilies, getScreenshotFamilyId, getScreenshotFlowLabel, type CatalogueFamilyView } from '../lib/catalogue-families';
import { sortCatalogueScreenshots, type CatalogueSortOption } from '../lib/catalogue-sort';
import type { ScreenFamily, ScreenshotNode, WebPreset } from '../types';

interface UseCatalogueFiltersArgs {
  screenshots: ScreenshotNode[];
  screenFamilies: ScreenFamily[];
  webPresets: WebPreset[];
  primaryGroup: string | null;
  vsGroups: string[];
  compareEnabled: boolean;
  sortBy: CatalogueSortOption;
  viewBy: CatalogueViewBy;
}

/**
 * Derivation hook for catalogue listings.
 *
 * After the infinite-scroll refactor (commit 3 of catalogue-infinite-scroll-plan.md),
 * filtering and sorting happen server-side in `useCatalogueData`. This hook no
 * longer filters screenshots in memory — it only:
 *
 *   - Builds families from the (already-filtered) loaded screenshots
 *   - Applies `viewBy` (comments-added / annotations-added) client-side because
 *     it depends on count fields that hydrate after the screenshot fetch
 *   - Groups families by section and applies compare-mode priority ordering
 *   - Derives the available filter options (`allGroups`, `allFlows`) from the
 *     currently-loaded project data
 *
 * Note: `allFlows` can be incomplete when the user has scrolled through only
 * part of the paginated list. Follow-up work may add a distinct-flow query
 * for complete filter options.
 */
export function useCatalogueFilters({
  screenshots,
  screenFamilies,
  webPresets,
  primaryGroup,
  vsGroups,
  compareEnabled,
  sortBy,
  viewBy,
}: UseCatalogueFiltersArgs) {
  const presetMap = useMemo(
    () => Object.fromEntries(webPresets.map((preset) => [preset.key, preset])),
    [webPresets],
  );

  // allGroups: complete (derived from screen_families, which the data hook
  // loads fully per project on every initial fetch).
  const allGroups = useMemo(
    () => [...new Set(screenFamilies.map((family) => family.group).filter(Boolean))] as string[],
    [screenFamilies],
  );

  // allFlows: currently derived from the loaded screenshots. Incomplete across
  // paginated pages. See note above.
  const allFlows = useMemo(
    () => [...new Set(
      screenshots
        .map((screenshot) => getScreenshotFlowLabel(screenshot))
        .filter((label): label is string => Boolean(label)),
    )].sort((left, right) => left.localeCompare(right)),
    [screenshots],
  );

  const allWebPresets = useMemo(
    () => webPresets.map((preset) => ({
      id: preset.key,
      label: `${preset.label} (${preset.width}px)`,
    })),
    [webPresets],
  );

  const allMobileOs = useMemo(
    () => [
      { id: 'ios', label: 'iOS' },
      { id: 'android', label: 'Android' },
    ],
    [],
  );

  // Apply viewBy filter client-side (requires hydrated counts).
  const viewByScreenshots = useMemo(() => {
    if (viewBy === 'comments-added') {
      return screenshots.filter((screenshot) => (screenshot.comment_count ?? 0) > 0);
    }
    if (viewBy === 'annotations-added') {
      return screenshots.filter((screenshot) => (screenshot.annotation_count ?? 0) > 0);
    }
    return screenshots;
  }, [screenshots, viewBy]);

  const baseFamilies = useMemo(
    () => buildCatalogueFamilies(viewByScreenshots, screenFamilies, presetMap),
    [presetMap, screenFamilies, viewByScreenshots],
  );

  const filteredScreenshots = useMemo(
    () => baseFamilies.flatMap((family) => family.variants.map((variant) => variant.screenshot)),
    [baseFamilies],
  );

  const isGlobalLatestSort = viewBy === 'all' && sortBy === 'date-desc-global';

  const sortedFamilies = useMemo(() => {
    // Server already returns in sort order; this re-sort is only meaningful
    // for viewBy overrides and compare-mode priority. JS stable sort preserves
    // existing order for equal keys otherwise.
    const sortedVariants = viewBy === 'comments-added'
      ? sortByCommentActivity(filteredScreenshots)
      : viewBy === 'annotations-added'
        ? sortByAnnotationActivity(filteredScreenshots)
        : sortCatalogueScreenshots(filteredScreenshots, sortBy);
    const order = new Map(sortedVariants.map((screenshot, index) => [getScreenshotFamilyId(screenshot), index]));

    return [...baseFamilies].sort((left, right) => {
      if (compareEnabled && !isGlobalLatestSort) {
        const leftIsPrimary = left.group === primaryGroup;
        const rightIsPrimary = right.group === primaryGroup;
        if (leftIsPrimary !== rightIsPrimary) return leftIsPrimary ? -1 : 1;

        const leftIsVs = vsGroups.includes(left.group || '');
        const rightIsVs = vsGroups.includes(right.group || '');
        if (leftIsVs !== rightIsVs) return leftIsVs ? -1 : 1;
      }

      return (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    });
  }, [baseFamilies, compareEnabled, filteredScreenshots, isGlobalLatestSort, primaryGroup, sortBy, viewBy, vsGroups]);

  const groupedFamilies = useMemo(() => {
    if (isGlobalLatestSort) {
      return { 'All groups': sortedFamilies };
    }

    const grouped = sortedFamilies.reduce<Record<string, CatalogueFamilyView[]>>((accumulator, family) => {
      const key = family.group || 'Ungrouped';
      (accumulator[key] ||= []).push(family);
      return accumulator;
    }, {});

    return Object.fromEntries(Object.entries(grouped).sort(([left], [right]) => {
      if (compareEnabled) {
        const leftIsPrimary = left === primaryGroup;
        const rightIsPrimary = right === primaryGroup;
        if (leftIsPrimary !== rightIsPrimary) return leftIsPrimary ? -1 : 1;

        const leftIsVs = vsGroups.includes(left);
        const rightIsVs = vsGroups.includes(right);
        if (leftIsVs !== rightIsVs) return leftIsVs ? -1 : 1;
      }

      return left.localeCompare(right);
    }));
  }, [compareEnabled, isGlobalLatestSort, primaryGroup, sortedFamilies, vsGroups]);

  const isSortLocked = viewBy !== 'all';

  return {
    allFlows,
    allGroups,
    allMobileOs,
    allWebPresets,
    filteredFamilies: sortedFamilies,
    filteredScreenshots,
    groupedFamilies,
    isSortLocked,
  };
}
