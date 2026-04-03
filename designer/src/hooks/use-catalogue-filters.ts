import { useEffect, useMemo, useState } from 'react';

import { DEFAULT_CATALOGUE_VIEW_BY, sortByAnnotationActivity, sortByCommentActivity, type CatalogueViewBy } from '../lib/catalogue-activity';
import { buildCatalogueFamilies, buildLegacyFamily, getScreenshotFamilyId, type CatalogueFamilyView } from '../lib/catalogue-families';
import { DEFAULT_CATALOGUE_SORT, sortCatalogueScreenshots, type CatalogueSortOption } from '../lib/catalogue-sort';
import type { Flow, Project, ScreenFamily, ScreenshotNode, WebPreset } from '../types';

export const FLOW_FILTER_ALL = '__catalogue_flow_all__';
export const FLOW_FILTER_UNASSIGNED = '__catalogue_flow_unassigned__';

export type CatalogueFlowFilter = typeof FLOW_FILTER_ALL | typeof FLOW_FILTER_UNASSIGNED | string;

export interface FlowSidebarItem {
  count: number;
  kind: 'all' | 'flow' | 'unassigned';
  label: string;
  projectName?: string;
  value: CatalogueFlowFilter;
}

interface UseCatalogueFiltersArgs {
  flows: Flow[];
  projects: Project[];
  screenshots: ScreenshotNode[];
  screenFamilies: ScreenFamily[];
  webPresets: WebPreset[];
}

function getFamilyForScreenshot(
  screenshot: ScreenshotNode,
  familyMap: Map<string, ScreenFamily>,
): ScreenFamily {
  return familyMap.get(getScreenshotFamilyId(screenshot)) || buildLegacyFamily(screenshot);
}

export function useCatalogueFilters({
  flows,
  projects,
  screenshots,
  screenFamilies,
  webPresets,
}: UseCatalogueFiltersArgs) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [filterScreenFamily, setFilterScreenFamily] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [filterTheme, setFilterTheme] = useState<string | null>(null);
  const [filterWebPreset, setFilterWebPreset] = useState<string | null>(null);
  const [filterMobileOs, setFilterMobileOs] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<CatalogueSortOption>(DEFAULT_CATALOGUE_SORT);
  const [viewBy, setViewBy] = useState<CatalogueViewBy>(DEFAULT_CATALOGUE_VIEW_BY);
  const [activeFlowFilter, setActiveFlowFilter] = useState<CatalogueFlowFilter>(FLOW_FILTER_ALL);

  const familyMap = useMemo(() => new Map(screenFamilies.map((family) => [family.id, family])), [screenFamilies]);
  const presetMap = useMemo(() => Object.fromEntries(webPresets.map((preset) => [preset.key, preset])), [webPresets]);

  const currentProject = useMemo(() => {
    if (!filterProject) return null;
    return projects.find((project) => project.id === filterProject) ?? null;
  }, [filterProject, projects]);

  const primaryGroup = currentProject?.primary_group ?? null;
  const vsGroups = currentProject?.vs_groups ?? [];

  const allGroups = useMemo(() => {
    const groupSource = filterProject
      ? screenshots.filter((screenshot) => screenshot.project_id === filterProject)
      : screenshots;

    return [...new Set(groupSource.map((screenshot) => getFamilyForScreenshot(screenshot, familyMap).group).filter(Boolean))] as string[];
  }, [familyMap, filterProject, screenshots]);

  const allScreenFamilies = useMemo(() => {
    const familySource = filterProject
      ? screenshots.filter((screenshot) => screenshot.project_id === filterProject)
      : screenshots;

    const seen = new Map<string, string>();
    for (const screenshot of familySource) {
      const family = getFamilyForScreenshot(screenshot, familyMap);
      seen.set(family.id, family.name);
    }

    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [familyMap, filterProject, screenshots]);

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
    if (filterScreenFamily && !allScreenFamilies.some((family) => family.id === filterScreenFamily)) {
      setFilterScreenFamily(null);
    }
  }, [allScreenFamilies, filterScreenFamily]);

  useEffect(() => {
    if (filterPlatform !== 'web' && filterWebPreset) setFilterWebPreset(null);
    if (filterPlatform !== 'mobile' && filterMobileOs) setFilterMobileOs(null);
  }, [filterMobileOs, filterPlatform, filterWebPreset]);

  const scopedFlows = useMemo(() => {
    const filtered = filterProject
      ? flows.filter((flow) => flow.project_id === filterProject)
      : flows;

    return [...filtered].sort((left, right) => {
      const leftProject = projects.find((project) => project.id === left.project_id)?.name ?? '';
      const rightProject = projects.find((project) => project.id === right.project_id)?.name ?? '';
      const projectNameCompare = leftProject.localeCompare(rightProject);
      return projectNameCompare !== 0 ? projectNameCompare : left.name.localeCompare(right.name);
    });
  }, [filterProject, flows, projects]);

  useEffect(() => {
    if (
      activeFlowFilter !== FLOW_FILTER_ALL &&
      activeFlowFilter !== FLOW_FILTER_UNASSIGNED &&
      !scopedFlows.some((flow) => flow.id === activeFlowFilter)
    ) {
      setActiveFlowFilter(FLOW_FILTER_ALL);
    }
  }, [activeFlowFilter, scopedFlows]);

  const baseScreenshots = useMemo(() => screenshots.filter((screenshot) => {
    const family = getFamilyForScreenshot(screenshot, familyMap);
    const query = searchQuery.trim().toLowerCase();
    const presetLabel = screenshot.web_preset_key ? presetMap[screenshot.web_preset_key]?.label.toLowerCase() || '' : '';
    const mobileOs = screenshot.mobile_os || '';
    const group = family.group || '';
    const matchesSearch = !query
      || screenshot.name.toLowerCase().includes(query)
      || family.name.toLowerCase().includes(query)
      || group.toLowerCase().includes(query)
      || screenshot.file_name.toLowerCase().includes(query)
      || presetLabel.includes(query)
      || mobileOs.toLowerCase().includes(query);
    const matchesProject = !filterProject || screenshot.project_id === filterProject;
    const matchesGroup = !filterGroup || family.group === filterGroup;
    const matchesFamily = !filterScreenFamily || family.id === filterScreenFamily;
    const matchesPlatform = !filterPlatform || screenshot.platform === filterPlatform;
    const matchesTheme = !filterTheme || screenshot.theme === filterTheme;
    const matchesWebPreset = !filterWebPreset || screenshot.web_preset_key === filterWebPreset;
    const matchesMobileOs = !filterMobileOs || screenshot.mobile_os === filterMobileOs;

    return matchesSearch
      && matchesProject
      && matchesGroup
      && matchesFamily
      && matchesPlatform
      && matchesTheme
      && matchesWebPreset
      && matchesMobileOs;
  }), [
    familyMap,
    filterGroup,
    filterMobileOs,
    filterPlatform,
    filterProject,
    filterScreenFamily,
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

  const flowCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const family of baseFamilies) {
      if (family.flow_id) counts[family.flow_id] = (counts[family.flow_id] || 0) + 1;
    }

    return counts;
  }, [baseFamilies]);

  const unassignedCount = useMemo(
    () => baseFamilies.filter((family) => !family.flow_id).length,
    [baseFamilies],
  );

  const flowItems = useMemo<FlowSidebarItem[]>(() => {
    const defaultItems: FlowSidebarItem[] = [
      { count: baseFamilies.length, kind: 'all', label: 'All Screens', value: FLOW_FILTER_ALL },
      { count: unassignedCount, kind: 'unassigned', label: 'Unassigned', value: FLOW_FILTER_UNASSIGNED },
    ];

    const flowEntries = scopedFlows.map((flow) => ({
      count: flowCounts[flow.id] || 0,
      kind: 'flow' as const,
      label: flow.name,
      projectName: filterProject
        ? undefined
        : projects.find((project) => project.id === flow.project_id)?.name ?? 'Unknown project',
      value: flow.id,
    }));

    return [...defaultItems, ...flowEntries];
  }, [baseFamilies.length, filterProject, flowCounts, projects, scopedFlows, unassignedCount]);

  const filteredFamilies = useMemo(() => baseFamilies.filter((family) => {
    if (activeFlowFilter === FLOW_FILTER_ALL) return true;
    if (activeFlowFilter === FLOW_FILTER_UNASSIGNED) return !family.flow_id;
    return family.flow_id === activeFlowFilter;
  }), [activeFlowFilter, baseFamilies]);

  const filteredScreenshots = useMemo(
    () => filteredFamilies.flatMap((family) => family.variants.map((variant) => variant.screenshot)),
    [filteredFamilies],
  );

  const sortedFamilies = useMemo(() => {
    const sortedVariants = viewBy === 'comments-added'
      ? sortByCommentActivity(filteredScreenshots)
      : viewBy === 'annotations-added'
        ? sortByAnnotationActivity(filteredScreenshots)
        : sortCatalogueScreenshots(filteredScreenshots, sortBy);
    const order = new Map(sortedVariants.map((screenshot, index) => [getScreenshotFamilyId(screenshot), index]));

    return [...filteredFamilies].sort((left, right) => {
      const leftIsPrimary = left.group === primaryGroup;
      const rightIsPrimary = right.group === primaryGroup;
      if (leftIsPrimary !== rightIsPrimary) return leftIsPrimary ? -1 : 1;

      const leftIsVs = vsGroups.includes(left.group || '');
      const rightIsVs = vsGroups.includes(right.group || '');
      if (leftIsVs !== rightIsVs) return leftIsVs ? -1 : 1;

      return (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    });
  }, [filteredFamilies, filteredScreenshots, primaryGroup, sortBy, viewBy, vsGroups]);

  const groupedFamilies = useMemo(() => {
    const grouped = sortedFamilies.reduce<Record<string, CatalogueFamilyView[]>>((accumulator, family) => {
      const key = family.group || 'Ungrouped';
      (accumulator[key] ||= []).push(family);
      return accumulator;
    }, {});

    return Object.fromEntries(Object.entries(grouped).sort(([left], [right]) => {
      const leftIsPrimary = left === primaryGroup;
      const rightIsPrimary = right === primaryGroup;
      if (leftIsPrimary !== rightIsPrimary) return leftIsPrimary ? -1 : 1;

      const leftIsVs = vsGroups.includes(left);
      const rightIsVs = vsGroups.includes(right);
      if (leftIsVs !== rightIsVs) return leftIsVs ? -1 : 1;

      return left.localeCompare(right);
    }));
  }, [primaryGroup, sortedFamilies, vsGroups]);

  const activeFlowItem = flowItems.find((item) => item.value === activeFlowFilter) ?? flowItems[0];
  const isSortLocked = viewBy !== 'all';

  return {
    activeFlowCount: activeFlowItem?.count ?? 0,
    activeFlowFilter,
    activeFlowLabel: activeFlowItem?.label ?? 'All Screens',
    allGroups,
    allMobileOs,
    allScreenFamilies,
    allWebPresets,
    currentProject,
    filterGroup,
    filterMobileOs,
    filterPlatform,
    filterProject,
    filterScreenFamily,
    filterTheme,
    filterWebPreset,
    filteredFamilies,
    filteredScreenshots,
    flowItems,
    groupedFamilies,
    primaryGroup,
    searchQuery,
    setActiveFlowFilter,
    setFilterGroup,
    setFilterMobileOs,
    setFilterPlatform,
    setFilterProject,
    setFilterScreenFamily,
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
