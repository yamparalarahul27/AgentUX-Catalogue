import { useMemo } from 'react';

import { sortByAnnotationActivity, sortByCommentActivity, type CatalogueViewBy } from '../lib/catalogue-activity';
import { buildCatalogueFamilies, getScreenshotFamilyId, getScreenshotFlowLabel, type CatalogueFamilyView } from '../lib/catalogue-families';
import { sortCatalogueScreenshots, type CatalogueSortOption } from '../lib/catalogue-sort';
import type { ScreenFamily, ScreenshotNode, WebPreset } from '../types';

interface UseCatalogueFiltersArgs {
  screenshots: ScreenshotNode[];
  facetScreenshots: ScreenshotNode[];
  screenFamilies: ScreenFamily[];
  webPresets: WebPreset[];
  sortBy: CatalogueSortOption;
  viewBy: CatalogueViewBy;
  // When provided, controls the order of `groupedFamilies` keys. Keys not in
  // the list fall back to localeCompare. Used by the chip strip so between-
  // section ordering matches the chip order.
  groupOrder?: string[];
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
 *   - Groups families by section for rendering
 *   - Derives the available filter options (`allGroups`, `allFlows`) from a
 *     full DB-scoped screenshot set passed via `facetScreenshots`
 */
export function useCatalogueFilters({
  screenshots,
  facetScreenshots,
  screenFamilies,
  webPresets,
  sortBy,
  viewBy,
  groupOrder,
}: UseCatalogueFiltersArgs) {
  const presetMap = useMemo(
    () => Object.fromEntries(webPresets.map((preset) => [preset.key, preset])),
    [webPresets],
  );

  // allGroups/allFlows are sourced from full-scope screenshots for the active
  // project selection (not from the currently paginated card slice).
  const allGroups = useMemo(() => {
    const seen = new Map<string, string>();
    for (const screenshot of facetScreenshots) {
      const group = screenshot.group?.trim();
      if (!group) continue;
      const key = group.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, group);
      }
    }

    return [...seen.values()].sort((left, right) => left.localeCompare(right));
  }, [facetScreenshots]);

  const allFlows = useMemo(() => {
    const seen = new Set<string>();
    for (const screenshot of facetScreenshots) {
      const flow = getScreenshotFlowLabel(screenshot);
      if (!flow) continue;
      seen.add(flow);
    }
    return [...seen].sort((left, right) => left.localeCompare(right));
  }, [facetScreenshots]);

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
    // for viewBy overrides. JS stable sort preserves existing order for equal
    // keys otherwise.
    const sortedVariants = viewBy === 'comments-added'
      ? sortByCommentActivity(filteredScreenshots)
      : viewBy === 'annotations-added'
        ? sortByAnnotationActivity(filteredScreenshots)
        : sortCatalogueScreenshots(filteredScreenshots, sortBy);
    const order = new Map(sortedVariants.map((screenshot, index) => [getScreenshotFamilyId(screenshot), index]));

    return [...baseFamilies].sort(
      (left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [baseFamilies, filteredScreenshots, sortBy, viewBy]);

  const groupedFamilies = useMemo(() => {
    if (isGlobalLatestSort) {
      return { 'All groups': sortedFamilies };
    }

    const grouped = sortedFamilies.reduce<Record<string, CatalogueFamilyView[]>>((accumulator, family) => {
      const key = family.group || 'Ungrouped';
      (accumulator[key] ||= []).push(family);
      return accumulator;
    }, {});

    if (groupOrder && groupOrder.length > 0) {
      const indexOf = new Map(groupOrder.map((key, index) => [key, index] as const));
      return Object.fromEntries(
        Object.entries(grouped).sort(([left], [right]) => {
          const leftIdx = indexOf.has(left) ? indexOf.get(left)! : Number.MAX_SAFE_INTEGER;
          const rightIdx = indexOf.has(right) ? indexOf.get(right)! : Number.MAX_SAFE_INTEGER;
          if (leftIdx !== rightIdx) return leftIdx - rightIdx;
          return left.localeCompare(right);
        }),
      );
    }

    return Object.fromEntries(Object.entries(grouped).sort(([left], [right]) => left.localeCompare(right)));
  }, [groupOrder, isGlobalLatestSort, sortedFamilies]);

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
