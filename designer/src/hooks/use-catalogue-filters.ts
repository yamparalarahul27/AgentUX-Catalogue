import { useEffect, useMemo, useState } from 'react';

import type { Flow, Project, ScreenshotNode } from '../types';
import {
  DEFAULT_CATALOGUE_SORT,
  sortCatalogueScreenshots,
  type CatalogueSortOption,
} from '../lib/catalogue-sort';

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
}

export function useCatalogueFilters({ flows, projects, screenshots }: UseCatalogueFiltersArgs) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [filterTheme, setFilterTheme] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<CatalogueSortOption>(DEFAULT_CATALOGUE_SORT);
  const [activeFlowFilter, setActiveFlowFilter] = useState<CatalogueFlowFilter>(FLOW_FILTER_ALL);

  const currentProject = useMemo(() => {
    if (!filterProject) {
      return null;
    }

    return projects.find((project) => project.id === filterProject) ?? null;
  }, [filterProject, projects]);

  const primaryGroup = currentProject?.primary_group ?? null;
  const vsGroups = currentProject?.vs_groups ?? [];

  const allGroups = useMemo(() => {
    const groupSource = filterProject
      ? screenshots.filter((screenshot) => screenshot.project_id === filterProject)
      : screenshots;

    return [...new Set(groupSource.map((screenshot) => screenshot.group).filter(Boolean))] as string[];
  }, [filterProject, screenshots]);

  useEffect(() => {
    if (filterGroup && !allGroups.includes(filterGroup)) {
      setFilterGroup(null);
    }
  }, [allGroups, filterGroup]);

  const scopedFlows = useMemo(() => {
    const filtered = filterProject
      ? flows.filter((flow) => flow.project_id === filterProject)
      : flows;

    return [...filtered].sort((left, right) => {
      const projectNameCompare = (projects.find((project) => project.id === left.project_id)?.name ?? '').localeCompare(
        projects.find((project) => project.id === right.project_id)?.name ?? '',
      );

      if (projectNameCompare !== 0) {
        return projectNameCompare;
      }

      return left.name.localeCompare(right.name);
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
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query ||
      screenshot.name.toLowerCase().includes(query) ||
      (screenshot.group || '').toLowerCase().includes(query) ||
      screenshot.file_name.toLowerCase().includes(query);
    const matchesProject = !filterProject || screenshot.project_id === filterProject;
    const matchesGroup = !filterGroup || screenshot.group === filterGroup;
    const matchesPlatform = !filterPlatform || screenshot.platform === filterPlatform;
    const matchesTheme = !filterTheme || screenshot.theme === filterTheme;

    return matchesSearch && matchesProject && matchesGroup && matchesPlatform && matchesTheme;
  }), [filterGroup, filterPlatform, filterProject, filterTheme, screenshots, searchQuery]);

  const flowCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const screenshot of baseScreenshots) {
      if (screenshot.flow_id) {
        counts[screenshot.flow_id] = (counts[screenshot.flow_id] || 0) + 1;
      }
    }

    return counts;
  }, [baseScreenshots]);

  const unassignedCount = useMemo(() => baseScreenshots.filter((screenshot) => !screenshot.flow_id).length, [baseScreenshots]);

  const flowItems = useMemo<FlowSidebarItem[]>(() => {
    const defaultItems: FlowSidebarItem[] = [
      { count: baseScreenshots.length, kind: 'all', label: 'All Screens', value: FLOW_FILTER_ALL },
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
  }, [baseScreenshots.length, filterProject, flowCounts, projects, scopedFlows, unassignedCount]);

  const filteredScreenshots = useMemo(() => baseScreenshots.filter((screenshot) => {
    if (activeFlowFilter === FLOW_FILTER_ALL) {
      return true;
    }

    if (activeFlowFilter === FLOW_FILTER_UNASSIGNED) {
      return !screenshot.flow_id;
    }

    return screenshot.flow_id === activeFlowFilter;
  }), [activeFlowFilter, baseScreenshots]);

  const groupedScreenshots = useMemo(() => {
    const sortedScreenshots = sortCatalogueScreenshots(filteredScreenshots, sortBy);
    const grouped = sortedScreenshots.reduce<Record<string, ScreenshotNode[]>>((accumulator, screenshot) => {
      const key = screenshot.group || 'Ungrouped';
      (accumulator[key] ||= []).push(screenshot);
      return accumulator;
    }, {});

    const sortedEntries = Object.entries(grouped).sort(([left], [right]) => {
      const leftIsPrimary = left === primaryGroup;
      const rightIsPrimary = right === primaryGroup;
      if (leftIsPrimary !== rightIsPrimary) {
        return leftIsPrimary ? -1 : 1;
      }

      const leftIsVs = vsGroups.includes(left);
      const rightIsVs = vsGroups.includes(right);
      if (leftIsVs !== rightIsVs) {
        return leftIsVs ? -1 : 1;
      }

      return left.localeCompare(right);
    });

    return Object.fromEntries(sortedEntries);
  }, [filteredScreenshots, primaryGroup, sortBy, vsGroups]);

  const activeFlowItem = flowItems.find((item) => item.value === activeFlowFilter) ?? flowItems[0];

  return {
    activeFlowCount: activeFlowItem?.count ?? 0,
    activeFlowFilter,
    activeFlowLabel: activeFlowItem?.label ?? 'All Screens',
    allGroups,
    currentProject,
    filterGroup,
    filterPlatform,
    filterProject,
    filterTheme,
    filteredScreenshots,
    flowItems,
    groupedScreenshots,
    primaryGroup,
    searchQuery,
    setActiveFlowFilter,
    setFilterGroup,
    setFilterPlatform,
    setFilterProject,
    setFilterTheme,
    setSortBy,
    setSearchQuery,
    sortBy,
    vsGroups,
  };
}
