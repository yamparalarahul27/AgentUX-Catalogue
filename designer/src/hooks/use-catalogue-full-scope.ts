import { useEffect, useMemo, useRef, useState } from 'react';

import type { Project, ScreenshotNode } from '../types';
import { supabase } from '../lib/supabase';

const SCREENSHOT_PAGE_SIZE = 1000;
const COMMENT_SCREENSHOT_CHUNK_SIZE = 200;

interface ScopeScreenshotRow {
  id: string;
  project_id: string;
  group: string | null;
  platform: 'web' | 'mobile' | null;
  theme: 'light' | 'dark' | null;
  web_preset_key: string | null;
  mobile_os: 'ios' | 'android' | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  uploader_email: string | null;
}

interface UseCatalogueFullScopeArgs {
  projects: Project[];
  includeCommentedScreenshots?: boolean;
}

function toScopeScreenshot(row: ScopeScreenshotRow): ScreenshotNode {
  return {
    id: row.id,
    project_id: row.project_id,
    flow_id: null,
    screen_family_id: null,
    name: '',
    file_name: '',
    storage_path: '',
    sequence: null,
    group: row.group,
    platform: row.platform,
    web_preset_key: row.web_preset_key,
    mobile_os: row.mobile_os,
    theme: row.theme,
    reference_url: null,
    reference_storage_path: null,
    reference_label: null,
    position_x: null,
    position_y: null,
    metadata: row.metadata ?? {},
    uploader_email: row.uploader_email,
    created_at: row.created_at ?? undefined,
  };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export function useCatalogueFullScope({
  projects,
  includeCommentedScreenshots = false,
}: UseCatalogueFullScopeArgs) {
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [commentedScreenshotIds, setCommentedScreenshotIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const loadVersionRef = useRef(0);

  const projectIds = useMemo(
    () => [...new Set(projects.map((project) => project.id))].sort(),
    [projects],
  );

  useEffect(() => {
    const loadVersion = loadVersionRef.current + 1;
    loadVersionRef.current = loadVersion;

    if (projectIds.length === 0) {
      setScreenshots([]);
      setCommentedScreenshotIds(new Set());
      setLoading(false);
      return;
    }

    async function loadScope() {
      setLoading(true);

      const loadedRows: ScopeScreenshotRow[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('screenshots')
          .select('id,project_id,group,platform,theme,web_preset_key,mobile_os,metadata,created_at,uploader_email')
          .in('project_id', projectIds)
          .order('id', { ascending: true })
          .range(from, from + SCREENSHOT_PAGE_SIZE - 1);

        if (loadVersionRef.current !== loadVersion) return;
        if (error || !data || data.length === 0) break;

        loadedRows.push(...(data as unknown as ScopeScreenshotRow[]));
        if (data.length < SCREENSHOT_PAGE_SIZE) break;
        from += data.length;
      }

      if (loadVersionRef.current !== loadVersion) return;

      const mapped = loadedRows.map(toScopeScreenshot);
      setScreenshots(mapped);

      if (!includeCommentedScreenshots || mapped.length === 0) {
        setCommentedScreenshotIds(new Set());
        setLoading(false);
        return;
      }

      const nextCommentedIds = new Set<string>();
      const idChunks = chunkArray(mapped.map((screenshot) => screenshot.id), COMMENT_SCREENSHOT_CHUNK_SIZE);

      for (const ids of idChunks) {
        const { data } = await supabase
          .from('screenshot_comments')
          .select('screenshot_id')
          .in('screenshot_id', ids);

        if (loadVersionRef.current !== loadVersion) return;

        for (const row of data ?? []) {
          if (row.screenshot_id) {
            nextCommentedIds.add(row.screenshot_id);
          }
        }
      }

      if (loadVersionRef.current !== loadVersion) return;
      setCommentedScreenshotIds(nextCommentedIds);
      setLoading(false);
    }

    void loadScope().catch(() => {
      if (loadVersionRef.current === loadVersion) {
        setScreenshots([]);
        setCommentedScreenshotIds(new Set());
        setLoading(false);
      }
    });
  }, [includeCommentedScreenshots, projectIds]);

  return {
    commentedScreenshotIds,
    loading,
    screenshots,
  };
}
