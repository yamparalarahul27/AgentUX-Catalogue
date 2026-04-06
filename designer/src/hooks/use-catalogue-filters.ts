import { useEffect, useMemo, useState } from 'react';

import { DEFAULT_CATALOGUE_VIEW_BY, sortByAnnotationActivity, sortByCommentActivity, type CatalogueViewBy } from '../lib/catalogue-activity';
import { buildCatalogueFamilies, buildLegacyFamily, getScreenshotFamilyId, getScreenshotFlowLabel, type CatalogueFamilyView } from '../lib/catalogue-families';
import { DEFAULT_CATALOGUE_SORT, sortCatalogueScreenshots, type CatalogueSortOption } from '../lib/catalogue-sort';
import type { ScreenFamily, ScreenshotNode, WebPreset } from '../types';

interface UseCatalogueFiltersArgs {
  screenshots: ScreenshotNode[];
  screenFamilies: ScreenFamily[];
  webPresets: WebPreset[];
  primaryGroup: string | null;
  vsGroups: string[];
  compareEnabled: boolean;
}

function getFamilyForScreenshot(
  screenshot: ScreenshotNode,
  familyMap: Map<string, ScreenFamily>,
): ScreenFamily {
  return familyMap.get(getScreenshotFamilyId(screenshot)) || buildLegacyFamily(screenshot);
}

export function useCatalogueFilters({
  screenshots,
  screenFamilies,
  webPresets,
  primaryGroup,
  vsGroups,
  compareEnabled,
}: UseCatalogueFiltersArgs) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [filterFlow, setFilterFlow] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [filterTheme, setFilterTheme] = useState<string | null>(null);
  const [filterWebPreset, setFilterWebPreset] = useState<string | null>(null);
  const [filterMobileOs, setFilterMobileOs] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<CatalogueSortOption>(DEFAULT_CATALOGUE_SORT);
  const [viewBy, setViewBy] = useState<CatalogueViewBy>(DEFAULT_CATALOGUE_VIEW_BY);

  const familyMap = useMemo(() => new Map(screenFamilies.map((family) => [family.id, family])), [screenFamilies]);
  const presetMap = useMemo(() => Object.fromEntries(webPresets.map((preset) => [preset.key, preset])), [webPresets]);


  const allGroups = useMemo(() => {
    return [...new Set(screenshots.map((screenshot) => getFamilyForScreenshot(screenshot, familyMap).group).filter(Boolean))] as string[];
  }, [familyMap, screenshots]);

  const allFlows = useMemo(() => (
    [...new Set(
      screenshots
        .map((screenshot) => getScreenshotFlowLabel(screenshot))
        .filter((label): label is string => Boolean(label)),
    )].sort((left, right) => left.localeCompare(right))
  ), [screenshots]);

  const allWebPresets = useMemo(() => webPresets.map((preset) => ({
    id: preset.key,
    label: `${preset.label} (${preset.width}px)`,
  })), [webPresets]);

  const allMobileOs = useMemo(() => [
    { id: 'ios', label: 'iOS' },
    { id: 'android', label: 'Android' },
  ], []);

  useEffect(() => {
    if (filterGroup && !allGroups.includes(filterGroup)) setFilterGroup(null);
  }, [allGroups, filterGroup]);

  useEffect(() => {
    if (filterFlow && !allFlows.includes(filterFlow)) {
      setFilterFlow(null);
    }
  }, [allFlows, filterFlow]);

  useEffect(() => {
    if (filterPlatform !== 'web' && filterWebPreset) setFilterWebPreset(null);
    if (filterPlatform !== 'mobile' && filterMobileOs) setFilterMobileOs(null);
  }, [filterMobileOs, filterPlatform, filterWebPreset]);

  const baseScreenshots = useMemo(() => screenshots.filter((screenshot) => {
    const family = getFamilyForScreenshot(screenshot, familyMap);
    const flowLabel = getScreenshotFlowLabel(screenshot) || '';
    const query = searchQuery.trim().toLowerCase();
    const presetLabel = screenshot.web_preset_key ? presetMap[screenshot.web_preset_key]?.label.toLowerCase() || '' : '';
    const mobileOs = screenshot.mobile_os || '';
    const group = family.group || '';
    const matchesSearch = !query
      || screenshot.name.toLowerCase().includes(query)
      || family.name.toLowerCase().includes(query)
      || flowLabel.toLowerCase().includes(query)
      || group.toLowerCase().includes(query)
      || screenshot.file_name.toLowerCase().includes(query)
      || presetLabel.includes(query)
      || mobileOs.toLowerCase().includes(query);
    const matchesGroup = !filterGroup || family.group === filterGroup;
    const matchesFlow = !filterFlow || flowLabel === filterFlow;
    const matchesPlatform = !filterPlatform || screenshot.platform === filterPlatform;
    const matchesTheme = !filterTheme || screenshot.theme === filterTheme;
    const matchesWebPreset = !filterWebPreset || screenshot.web_preset_key === filterWebPreset;
    const matchesMobileOs = !filterMobileOs || screenshot.mobile_os === filterMobileOs;

    return matchesSearch
      && matchesGroup
      && matchesFlow
      && matchesPlatform
      && matchesTheme
      && matchesWebPreset
      && matchesMobileOs;
  }), [
    familyMap,
    filterFlow,
    filterGroup,
    filterMobileOs,
    filterPlatform,
    filterTheme,
    filterWebPreset,
    presetMap,
    screenshots,
    searchQuery,
  ]);

  const viewByScreenshots = useMemo(() => {
    if (viewBy === 'comments-added') {
      return baseScreenshots.filter((screenshot) => (screenshot.comment_count ?? 0) > 0);
    }

    if (viewBy === 'annotations-added') {
      return baseScreenshots.filter((screenshot) => (screenshot.annotation_count ?? 0) > 0);
    }

    return baseScreenshots;
  }, [baseScreenshots, viewBy]);

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
    filterFlow,
    filterGroup,
    filterMobileOs,
    filterPlatform,
    filterTheme,
    filterWebPreset,
    filteredFamilies: sortedFamilies,
    filteredScreenshots,
    groupedFamilies,
    primaryGroup,
    searchQuery,
    setFilterFlow,
    setFilterGroup,
    setFilterMobileOs,
    setFilterPlatform,
    setFilterTheme,
    setFilterWebPreset,
    setSortBy,
    setViewBy,
    setSearchQuery,
    sortBy,
    isSortLocked,
    viewBy,
    vsGroups,
  };
}
