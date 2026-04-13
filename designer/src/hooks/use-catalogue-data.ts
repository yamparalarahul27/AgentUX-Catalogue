import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Flow, Project, ScreenFamily, ScreenshotNode } from '../types';
import { getAnnotationActivity } from '../lib/catalogue-activity';
import { supabase } from '../lib/supabase';

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

// Pagination constants
const PAGE_SIZE = 50;

interface PaginationCursor {
  createdAt: string;
  id: string;
}

interface UseCatalogueDataArgs {
  activeProjectId: string | null;
}

/**
 * Cursor-paginated catalogue data hook.
 *
 * Cold start:
 *   - loads all user projects (small)
 *   - loads first PAGE_SIZE screenshots for the scoped project set
 *   - loads flows + screen_families for the scoped project set (not paginated;
 *     small bounded sets relative to screenshots)
 *   - hydrates version/comment counts for the first page only
 *
 * Scroll / explicit `loadMore()`:
 *   - fetches next PAGE_SIZE screenshots using cursor (created_at, id)
 *   - hydrates counts for just that page
 *
 * Project change:
 *   - `reset()` clears cursor and refetches from page 1
 *
 * NOTE (commit 2 of infinite-scroll plan): sort is hard-coded to
 * created_at DESC, id DESC. Filters still run client-side over loaded rows.
 * Commit 3 will move filters/sort to server predicates.
 */
export function useCatalogueData({ activeProjectId }: UseCatalogueDataArgs = { activeProjectId: null }) {
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

  // Map a raw screenshot row to our ScreenshotNode shape (with image_url, counts, etc.)
  const mapScreenshotRow = useCallback((row: Record<string, unknown>): ScreenshotNode => {
    const metadata = row.metadata && typeof row.metadata === 'object'
      ? row.metadata as Record<string, unknown>
      : {};
    const annotationActivity = getAnnotationActivity(metadata);
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
      version_count: 0,
      comment_count: 0,
      comment_last_added_at: null,
      annotation_count: annotationActivity.count,
      annotation_last_added_at: annotationActivity.lastAddedAt,
    };
  }, []);

  const hydrateActivity = useCallback(async (loadVersion: number, screenshotIds: string[]) => {
    if (screenshotIds.length === 0) return;
    const [versionRes, commentRes] = await Promise.all([
      supabase.from('screenshot_versions').select('screenshot_id').in('screenshot_id', screenshotIds),
      supabase.from('screenshot_comments').select('screenshot_id,created_at').in('screenshot_id', screenshotIds),
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

    // Only patch screenshots that were in the hydration batch (not all)
    const idSet = new Set(screenshotIds);
    setScreenshots((previous) => previous.map((screenshot) => {
      if (!idSet.has(screenshot.id)) return screenshot;
      return {
        ...screenshot,
        version_count: versionCounts[screenshot.id] || 0,
        comment_count: commentCounts[screenshot.id] || 0,
        comment_last_added_at: commentLastAddedAt[screenshot.id] || null,
      };
    }));
  }, []);

  // Core page fetch — scoped by project set, cursor, and page size.
  const fetchScreenshotsPage = useCallback(
    async (
      projectIds: string[],
      cursor: PaginationCursor | null,
    ): Promise<ScreenshotNode[]> => {
      if (projectIds.length === 0) return [];

      let query = supabase
        .from('screenshots')
        .select('*')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);

      if (cursor) {
        // Cursor pagination: fetch rows strictly older than the last one
        // `or` clause: created_at < cursor OR (created_at = cursor AND id < cursor.id)
        query = query.or(
          `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
        );
      }

      const { data, error } = await query;
      if (error || !data) return [];
      return data.map((row) => mapScreenshotRow(row as Record<string, unknown>));
    },
    [mapScreenshotRow],
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

      // Scope to the active project if one is picked, otherwise all user projects
      const scopedProjectIds = activeProjectId
        ? [activeProjectId]
        : projectData.map((project) => project.id);

      const [flowRes, familyRes, firstPage] = await Promise.all([
        supabase.from('flows').select('*').in('project_id', scopedProjectIds).order('created_at'),
        supabase.from('screen_families').select('*').in('project_id', scopedProjectIds).order('created_at'),
        fetchScreenshotsPage(scopedProjectIds, null),
      ]);

      if (loadVersionRef.current !== loadVersion) return;

      setFlows(flowRes.data ?? []);
      setScreenFamilies(familyRes.data ?? []);
      setScreenshots(firstPage);
      setHasMore(firstPage.length === PAGE_SIZE);

      if (firstPage.length > 0) {
        const last = firstPage[firstPage.length - 1];
        cursorRef.current = {
          createdAt: last.created_at ?? '',
          id: last.id,
        };
        void hydrateActivity(loadVersion, firstPage.map((screenshot) => screenshot.id));
      }
    } finally {
      if (loadVersionRef.current === loadVersion) {
        setLoading(false);
      }
    }
  }, [activeProjectId, fetchScreenshotsPage, hydrateActivity]);

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

      const nextPage = await fetchScreenshotsPage(scopedProjectIds, cursorRef.current);
      if (loadVersionRef.current !== loadVersion) return;

      if (nextPage.length === 0) {
        setHasMore(false);
        return;
      }

      setScreenshots((previous) => {
        // Deduplicate in case of concurrent inserts overlap
        const seen = new Set(previous.map((item) => item.id));
        const additions = nextPage.filter((item) => !seen.has(item.id));
        return [...previous, ...additions];
      });

      setHasMore(nextPage.length === PAGE_SIZE);
      const last = nextPage[nextPage.length - 1];
      cursorRef.current = {
        createdAt: last.created_at ?? '',
        id: last.id,
      };
      void hydrateActivity(loadVersion, nextPage.map((screenshot) => screenshot.id));
    } finally {
      loadingMoreRef.current = false;
      if (loadVersionRef.current === loadVersion) {
        setLoadingMore(false);
      }
    }
  }, [activeProjectId, fetchScreenshotsPage, hasMore, hydrateActivity, projects]);

  // Auto-reset on project change
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
