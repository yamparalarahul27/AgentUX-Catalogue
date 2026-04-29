import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Flow, Project, ScreenFamily, ScreenshotNode } from '../types';
import { fetchAnnotationActivity, fetchScreenshotIdsWithAnnotationLabels } from '../lib/screenshot-annotations';
import type { CatalogueSortOption } from '../lib/catalogue-sort';
import { supabase } from '../lib/supabase';

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

// Pagination constants
const PAGE_SIZE = 50;

export interface CatalogueQueryFilters {
  group: string[];
  flow: string[];
  platform: 'web' | 'mobile' | null;
  theme: 'light' | 'dark' | null;
  webPreset: string | null;
  mobileOs: 'ios' | 'android' | null;
  annotation: string[];
}

export const EMPTY_CATALOGUE_FILTERS: CatalogueQueryFilters = {
  group: [],
  flow: [],
  platform: null,
  theme: null,
  webPreset: null,
  mobileOs: null,
  annotation: [],
};

type CursorColumn = 'created_at' | 'name';
interface PaginationCursor {
  column: CursorColumn;
  value: string;
  id: string;
}

interface SortConfig {
  column: CursorColumn;
  ascending: boolean;
}

function sortConfigFor(sortBy: CatalogueSortOption): SortConfig {
  switch (sortBy) {
    case 'date-asc':
      return { column: 'created_at', ascending: true };
    case 'name-asc':
      return { column: 'name', ascending: true };
    case 'date-desc':
    case 'date-desc-global':
    default:
      return { column: 'created_at', ascending: false };
  }
}

interface UseCatalogueDataArgs {
  activeProjectId: string | null;
  filters: CatalogueQueryFilters;
  sortBy: CatalogueSortOption;
  searchQuery: string;
}

/**
 * Cursor-paginated catalogue data hook with server-side filtering + sort + search.
 *
 * Sort options map to cursor columns:
 *   date-desc / date-desc-global → (created_at DESC, id DESC)
 *   date-asc                      → (created_at ASC, id ASC)
 *   name-asc                      → (name ASC, id ASC)
 *
 * Filters are applied as Supabase query predicates. Search is ilike on
 * name + file_name (requires pg_trgm indexes — see SQL migration).
 *
 * Any change to activeProjectId, filters, sortBy, or searchQuery resets
 * pagination and refetches page 1.
 *
 * Counts (comments, versions) are hydrated per-page.
 */
export function useCatalogueData({
  activeProjectId,
  filters,
  sortBy,
  searchQuery,
}: UseCatalogueDataArgs) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [screenFamilies, setScreenFamilies] = useState<ScreenFamily[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const cursorRef = useRef<PaginationCursor | null>(null);
  const loadVersionRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const sortConfig = useMemo(() => sortConfigFor(sortBy), [sortBy]);

  // Map a raw screenshot row to our ScreenshotNode shape (with image_url, counts, etc.)
  const mapScreenshotRow = useCallback((row: Record<string, unknown>): ScreenshotNode => {
    const metadata = row.metadata && typeof row.metadata === 'object'
      ? row.metadata as Record<string, unknown>
      : {};
    const storagePath = (row.storage_path as string | null) ?? '';

    return {
      ...(row as unknown as ScreenshotNode),
      metadata,
      screen_family_id: (row.screen_family_id as string | null) || null,
      web_preset_key: (row.web_preset_key as string | null) || null,
      mobile_os: (row.mobile_os as ScreenshotNode['mobile_os']) || null,
      image_url: storagePath
        ? supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl
        : '',
      thumb_hash: (row.thumb_hash as string | null) || null,
      version_count: 0,
      comment_count: 0,
      comment_last_added_at: null,
      annotation_count: 0,
      annotation_last_added_at: null,
    };
  }, []);

  const hydrateActivity = useCallback(async (loadVersion: number, screenshotIds: string[]) => {
    if (screenshotIds.length === 0) return;
    const [versionRes, commentRes, annotationActivity] = await Promise.all([
      supabase.from('screenshot_versions').select('screenshot_id').in('screenshot_id', screenshotIds),
      supabase.from('screenshot_comments').select('screenshot_id,created_at').in('screenshot_id', screenshotIds),
      fetchAnnotationActivity(screenshotIds),
    ]);

    if (loadVersionRef.current !== loadVersion) return;

    const versionCounts: Record<string, number> = {};
    const commentCounts: Record<string, number> = {};
    const commentLastAddedAt: Record<string, string | null> = {};

    if (versionRes.data) {
      for (const version of versionRes.data) {
        versionCounts[version.screenshot_id] = (versionCounts[version.screenshot_id] || 0) + 1;
      }
    }

    if (commentRes.data) {
      for (const comment of commentRes.data) {
        commentCounts[comment.screenshot_id] = (commentCounts[comment.screenshot_id] || 0) + 1;
        const nextTimestamp = parseTimestamp(comment.created_at);
        if (nextTimestamp === null) continue;
        const currentTimestamp = parseTimestamp(commentLastAddedAt[comment.screenshot_id]);
        if (currentTimestamp === null || nextTimestamp > currentTimestamp) {
          commentLastAddedAt[comment.screenshot_id] = comment.created_at;
        }
      }
    }

    const idSet = new Set(screenshotIds);
    setScreenshots((previous) => previous.map((screenshot) => {
      if (!idSet.has(screenshot.id)) return screenshot;
      return {
        ...screenshot,
        version_count: versionCounts[screenshot.id] || 0,
        comment_count: commentCounts[screenshot.id] || 0,
        comment_last_added_at: commentLastAddedAt[screenshot.id] || null,
        annotation_count: annotationActivity.counts[screenshot.id] || 0,
        annotation_last_added_at: annotationActivity.lastAddedAt[screenshot.id] || null,
      };
    }));
  }, []);

  /**
   * Core page fetch — applies filters + sort + cursor + search to the Supabase query.
   * Returns [] on error.
   */
  const fetchScreenshotsPage = useCallback(
    async (
      projectIds: string[],
      cursor: PaginationCursor | null,
    ): Promise<ScreenshotNode[]> => {
      if (projectIds.length === 0) return [];

      // Annotation label filter resolves to a set of screenshot ids via RPC
      // (the labels live in screenshot_annotations, not screenshots).
      let annotationMatchedIds: string[] | null = null;
      if (filters.annotation.length > 0) {
        annotationMatchedIds = await fetchScreenshotIdsWithAnnotationLabels(projectIds, filters.annotation);
        if (annotationMatchedIds.length === 0) return [];
      }

      let query = supabase
        .from('screenshots')
        .select('*')
        .in('project_id', projectIds);

      if (annotationMatchedIds) {
        query = query.in('id', annotationMatchedIds);
      }

      // Group filter is sourced from screenshots.group so the dropdown reflects
      // what users expect to see in the catalogue results.
      if (filters.group.length > 0) {
        query = query.in('group', filters.group);
      }

      if (filters.flow.length > 0) {
        // PostgREST .or() needs double-quoted values to safely embed commas,
        // periods, parens, etc. that can appear in flow labels.
        const flowOr = filters.flow
          .map((flow) => `metadata->>catalogue_flow_label.eq."${flow.replace(/"/g, '\\"')}"`)
          .join(',');
        query = query.or(flowOr);
      }
      if (filters.platform) {
        query = query.eq('platform', filters.platform);
      }
      if (filters.theme) {
        query = query.eq('theme', filters.theme);
      }
      if (filters.webPreset) {
        query = query.eq('web_preset_key', filters.webPreset);
      }
      if (filters.mobileOs) {
        query = query.eq('mobile_os', filters.mobileOs);
      }

      const trimmedSearch = searchQuery.trim();
      if (trimmedSearch) {
        // Escape commas and percent signs which have special meaning in Supabase or-clauses
        const safe = trimmedSearch.replace(/[,%]/g, ' ');
        query = query.or(`name.ilike.%${safe}%,file_name.ilike.%${safe}%,group.ilike.%${safe}%`);
      }

      query = query
        .order(sortConfig.column, { ascending: sortConfig.ascending })
        .order('id', { ascending: sortConfig.ascending })
        .limit(PAGE_SIZE);

      if (cursor) {
        // Cursor pagination for sort order
        if (sortConfig.ascending) {
          query = query.or(
            `${cursor.column}.gt.${cursor.value},and(${cursor.column}.eq.${cursor.value},id.gt.${cursor.id})`,
          );
        } else {
          query = query.or(
            `${cursor.column}.lt.${cursor.value},and(${cursor.column}.eq.${cursor.value},id.lt.${cursor.id})`,
          );
        }
      }

      const { data, error } = await query;
      if (error || !data) return [];
      return data.map((row) => mapScreenshotRow(row as Record<string, unknown>));
    },
    [filters, mapScreenshotRow, searchQuery, sortConfig],
  );

  const loadInitial = useCallback(async () => {
    const loadVersion = loadVersionRef.current + 1;
    loadVersionRef.current = loadVersion;
    setLoading(true);
    setLoadingMore(false);
    loadingMoreRef.current = false;
    cursorRef.current = null;

    try {
      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (loadVersionRef.current !== loadVersion) return;

      if (!projectData || projectData.length === 0) {
        setProjects([]);
        setScreenFamilies([]);
        setScreenshots([]);
        setFlows([]);
        setHasMore(false);
        return;
      }

      setProjects(projectData);

      const scopedProjectIds = activeProjectId
        ? [activeProjectId]
        : projectData.map((project) => project.id);

      const [flowRes, familyRes] = await Promise.all([
        supabase.from('flows').select('*').in('project_id', scopedProjectIds).order('created_at'),
        supabase.from('screen_families').select('*').in('project_id', scopedProjectIds).order('created_at'),
      ]);

      if (loadVersionRef.current !== loadVersion) return;

      const loadedFamilies = familyRes.data ?? [];
      setFlows(flowRes.data ?? []);
      setScreenFamilies(loadedFamilies);

      const firstPage = await fetchScreenshotsPage(scopedProjectIds, null);

      if (loadVersionRef.current !== loadVersion) return;

      setScreenshots(firstPage);
      setHasMore(firstPage.length === PAGE_SIZE);

      if (firstPage.length > 0) {
        const last = firstPage[firstPage.length - 1];
        cursorRef.current = {
          column: sortConfig.column,
          value: sortConfig.column === 'name' ? last.name : (last.created_at ?? ''),
          id: last.id,
        };
        void hydrateActivity(loadVersion, firstPage.map((screenshot) => screenshot.id));
      }
    } finally {
      if (loadVersionRef.current === loadVersion) {
        setLoading(false);
      }
    }
  }, [activeProjectId, fetchScreenshotsPage, hydrateActivity, sortConfig.column]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    if (!hasMore) return;
    if (cursorRef.current === null) return;

    const loadVersion = loadVersionRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const scopedProjectIds = activeProjectId
        ? [activeProjectId]
        : projects.map((project) => project.id);
      if (scopedProjectIds.length === 0) return;

      const nextPage = await fetchScreenshotsPage(
        scopedProjectIds,
        cursorRef.current,
      );
      if (loadVersionRef.current !== loadVersion) return;

      if (nextPage.length === 0) {
        setHasMore(false);
        return;
      }

      setScreenshots((previous) => {
        const seen = new Set(previous.map((item) => item.id));
        const additions = nextPage.filter((item) => !seen.has(item.id));
        return [...previous, ...additions];
      });

      setHasMore(nextPage.length === PAGE_SIZE);
      const last = nextPage[nextPage.length - 1];
      cursorRef.current = {
        column: sortConfig.column,
        value: sortConfig.column === 'name' ? last.name : (last.created_at ?? ''),
        id: last.id,
      };
      void hydrateActivity(loadVersion, nextPage.map((screenshot) => screenshot.id));
    } finally {
      loadingMoreRef.current = false;
      if (loadVersionRef.current === loadVersion) {
        setLoadingMore(false);
      }
    }
  }, [
    activeProjectId,
    fetchScreenshotsPage,
    hasMore,
    hydrateActivity,
    projects,
    sortConfig.column,
  ]);

  // Auto-reset on any query-shaping param change
  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const projectMap = useMemo(() => {
    const entries = projects.map((project) => [project.id, project.name] as const);
    return Object.fromEntries(entries);
  }, [projects]);

  const flowMap = useMemo(() => {
    const entries = flows.map((flow) => [flow.id, flow.name] as const);
    return Object.fromEntries(entries);
  }, [flows]);

  const screenFamilyMap = useMemo(() => {
    const entries = screenFamilies.map((family) => [family.id, family] as const);
    return Object.fromEntries(entries);
  }, [screenFamilies]);

  return {
    flows,
    flowMap,
    hasMore,
    loadData: loadInitial,
    loadMore,
    loading,
    loadingMore,
    projectMap,
    projects,
    screenFamilies,
    screenFamilyMap,
    screenshots,
    setFlows,
    setProjects,
    setScreenFamilies,
    setScreenshots,
  };
}
