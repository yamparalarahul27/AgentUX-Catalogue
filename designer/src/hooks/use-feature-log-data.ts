import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getAnnotationActivity } from '../lib/catalogue-activity';
import { supabase } from '../lib/supabase';
import type { FeatureLogLinkType, MobileOs } from '../types';

const SCREENSHOT_QUERY_LIMIT = 120;

interface FeatureLogLinkRow {
  id: string;
  feature_id: string;
  screenshot_id: string;
  link_type: FeatureLogLinkType;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface FeatureLogScreenshotRow {
  id: string;
  project_id: string;
  flow_id: string | null;
  name: string;
  file_name: string;
  storage_path: string;
  group: string | null;
  platform: 'mobile' | 'web' | null;
  theme: 'light' | 'dark' | null;
  web_preset_key: string | null;
  mobile_os: MobileOs | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

interface FlowNameRow {
  id: string;
  name: string;
}

interface CommentRow {
  screenshot_id: string;
  created_at: string;
}

export interface FeatureLogLinkedScreenshot {
  id: string;
  project_id: string;
  flow_id: string | null;
  flow_label: string | null;
  name: string;
  file_name: string;
  storage_path: string;
  image_url: string;
  group: string | null;
  platform: 'mobile' | 'web' | null;
  theme: 'light' | 'dark' | null;
  web_preset_key: string | null;
  mobile_os: MobileOs | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
  comment_count: number;
  comment_last_added_at: string | null;
  annotation_count: number;
  annotation_last_added_at: string | null;
}

export interface FeatureLogLinkedScreenshotItem {
  id: string;
  feature_id: string;
  screenshot_id: string;
  link_type: FeatureLogLinkType;
  note: string | null;
  created_at: string;
  updated_at: string;
  screenshot: FeatureLogLinkedScreenshot | null;
}

export interface FeatureLogScreenshotCandidate {
  id: string;
  project_id: string;
  name: string;
  file_name: string;
  image_url: string;
  group: string | null;
  flow_label: string | null;
  platform: 'mobile' | 'web' | null;
  theme: 'light' | 'dark' | null;
  created_at: string | null;
  alreadyLinked: boolean;
}

export interface FeatureLogScreenshotSearchFilters {
  flowQuery: string;
  groupQuery: string;
  platform: 'all' | 'mobile' | 'web';
  searchQuery: string;
  theme: 'all' | 'light' | 'dark';
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

function sanitizeQuery(value: string): string {
  return value.trim().replace(/[,%]/g, ' ');
}

function resolveFlowLabel(
  metadata: Record<string, unknown>,
  flowId: string | null,
  flowNameById: Map<string, string>,
): string | null {
  const metadataFlow = metadata.catalogue_flow_label;
  if (typeof metadataFlow === 'string' && metadataFlow.trim()) {
    return metadataFlow.trim();
  }

  if (!flowId) {
    return null;
  }

  return flowNameById.get(flowId) ?? null;
}

async function loadFlowNameMap(rows: FeatureLogScreenshotRow[]): Promise<Map<string, string>> {
  const flowIds = [...new Set(rows.map((row) => row.flow_id).filter((value): value is string => Boolean(value)))];
  if (flowIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('flows')
    .select('id,name')
    .in('id', flowIds);

  if (error || !data) {
    return new Map();
  }

  return new Map((data as FlowNameRow[]).map((flow) => [flow.id, flow.name]));
}

async function loadCommentStats(ids: string[]): Promise<Map<string, { count: number; lastAddedAt: string | null }>> {
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('screenshot_comments')
    .select('screenshot_id,created_at')
    .in('screenshot_id', ids);

  if (error || !data) {
    return new Map();
  }

  const stats = new Map<string, { count: number; lastAddedAt: string | null }>();
  for (const row of data as CommentRow[]) {
    const existing = stats.get(row.screenshot_id) ?? { count: 0, lastAddedAt: null };
    existing.count += 1;

    const nextTimestamp = Date.parse(row.created_at);
    const existingTimestamp = existing.lastAddedAt ? Date.parse(existing.lastAddedAt) : Number.NaN;
    if (!Number.isNaN(nextTimestamp) && (Number.isNaN(existingTimestamp) || nextTimestamp > existingTimestamp)) {
      existing.lastAddedAt = row.created_at;
    }

    stats.set(row.screenshot_id, existing);
  }

  return stats;
}

function toLinkedScreenshot(
  row: FeatureLogScreenshotRow,
  flowNameById: Map<string, string>,
  commentStatsById: Map<string, { count: number; lastAddedAt: string | null }>,
): FeatureLogLinkedScreenshot {
  const metadata = normalizeMetadata(row.metadata);
  const annotationActivity = getAnnotationActivity(metadata);
  const commentStats = commentStatsById.get(row.id) ?? { count: 0, lastAddedAt: null };

  return {
    id: row.id,
    project_id: row.project_id,
    flow_id: row.flow_id,
    flow_label: resolveFlowLabel(metadata, row.flow_id, flowNameById),
    name: row.name,
    file_name: row.file_name,
    storage_path: row.storage_path,
    image_url: row.storage_path
      ? supabase.storage.from('screenshots').getPublicUrl(row.storage_path).data.publicUrl
      : '',
    group: row.group,
    platform: row.platform,
    theme: row.theme,
    web_preset_key: row.web_preset_key,
    mobile_os: row.mobile_os,
    metadata,
    created_at: row.created_at,
    comment_count: commentStats.count,
    comment_last_added_at: commentStats.lastAddedAt,
    annotation_count: annotationActivity.count,
    annotation_last_added_at: annotationActivity.lastAddedAt,
  };
}

interface UseFeatureLogDataResult {
  linkedScreenshots: FeatureLogLinkedScreenshotItem[];
  linksError: string | null;
  loadingLinks: boolean;
  loadCandidates: (
    filters: FeatureLogScreenshotSearchFilters,
    linkedScreenshotIds: string[],
  ) => Promise<FeatureLogScreenshotCandidate[]>;
  refreshLinks: () => Promise<void>;
}

export function useFeatureLogData(featureId: string | null): UseFeatureLogDataResult {
  const [linkedScreenshots, setLinkedScreenshots] = useState<FeatureLogLinkedScreenshotItem[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);

  const loadVersionRef = useRef(0);

  const refreshLinks = useCallback(async () => {
    const nextLoadVersion = loadVersionRef.current + 1;
    loadVersionRef.current = nextLoadVersion;

    if (!featureId) {
      setLinkedScreenshots([]);
      setLoadingLinks(false);
      setLinksError(null);
      return;
    }

    setLoadingLinks(true);
    setLinksError(null);

    try {
      const { data: linkRows, error: linksLoadError } = await supabase
        .from('feature_log_links')
        .select('id,feature_id,screenshot_id,link_type,note,created_at,updated_at')
        .eq('feature_id', featureId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

      if (loadVersionRef.current !== nextLoadVersion) {
        return;
      }

      if (linksLoadError) {
        throw linksLoadError;
      }

      const links = (linkRows ?? []) as FeatureLogLinkRow[];
      const screenshotIds = [...new Set(links.map((link) => link.screenshot_id))];

      if (screenshotIds.length === 0) {
        setLinkedScreenshots([]);
        return;
      }

      const { data: screenshotRows, error: screenshotsLoadError } = await supabase
        .from('screenshots')
        .select('id,project_id,flow_id,name,file_name,storage_path,group,platform,theme,web_preset_key,mobile_os,metadata,created_at')
        .in('id', screenshotIds);

      if (loadVersionRef.current !== nextLoadVersion) {
        return;
      }

      if (screenshotsLoadError) {
        throw screenshotsLoadError;
      }

      const screenshots = (screenshotRows ?? []) as FeatureLogScreenshotRow[];
      const [flowNameById, commentStatsById] = await Promise.all([
        loadFlowNameMap(screenshots),
        loadCommentStats(screenshots.map((row) => row.id)),
      ]);

      if (loadVersionRef.current !== nextLoadVersion) {
        return;
      }

      const screenshotById = new Map(
        screenshots.map((row) => [
          row.id,
          toLinkedScreenshot(row, flowNameById, commentStatsById),
        ]),
      );

      setLinkedScreenshots(
        links.map((link) => ({
          id: link.id,
          feature_id: link.feature_id,
          screenshot_id: link.screenshot_id,
          link_type: link.link_type,
          note: link.note,
          created_at: link.created_at,
          updated_at: link.updated_at,
          screenshot: screenshotById.get(link.screenshot_id) ?? null,
        })),
      );
    } catch (loadError) {
      if (loadVersionRef.current !== nextLoadVersion) {
        return;
      }

      const message = loadError instanceof Error ? loadError.message : 'Unable to load linked screenshots.';
      setLinkedScreenshots([]);
      setLinksError(message);
    } finally {
      if (loadVersionRef.current === nextLoadVersion) {
        setLoadingLinks(false);
      }
    }
  }, [featureId]);

  useEffect(() => {
    void refreshLinks();
  }, [refreshLinks]);

  const loadCandidates = useCallback(async (
    filters: FeatureLogScreenshotSearchFilters,
    linkedScreenshotIds: string[],
  ): Promise<FeatureLogScreenshotCandidate[]> => {
    let query = supabase
      .from('screenshots')
      .select('id,project_id,flow_id,name,file_name,storage_path,group,platform,theme,web_preset_key,mobile_os,metadata,created_at')
      .order('created_at', { ascending: false })
      .limit(SCREENSHOT_QUERY_LIMIT);

    if (filters.platform !== 'all') {
      query = query.eq('platform', filters.platform);
    }

    if (filters.theme !== 'all') {
      query = query.eq('theme', filters.theme);
    }

    const groupQuery = sanitizeQuery(filters.groupQuery);
    if (groupQuery) {
      query = query.ilike('group', `%${groupQuery}%`);
    }

    const searchQuery = sanitizeQuery(filters.searchQuery);
    if (searchQuery) {
      query = query.or(`name.ilike.%${searchQuery}%,file_name.ilike.%${searchQuery}%,group.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const rows = (data ?? []) as FeatureLogScreenshotRow[];
    const flowNameById = await loadFlowNameMap(rows);
    const linkedIdSet = new Set(linkedScreenshotIds);

    const flowQuery = filters.flowQuery.trim().toLowerCase();
    const candidates = rows
      .map((row) => {
        const metadata = normalizeMetadata(row.metadata);
        const flowLabel = resolveFlowLabel(metadata, row.flow_id, flowNameById);
        return {
          id: row.id,
          project_id: row.project_id,
          name: row.name,
          file_name: row.file_name,
          image_url: row.storage_path
            ? supabase.storage.from('screenshots').getPublicUrl(row.storage_path).data.publicUrl
            : '',
          group: row.group,
          flow_label: flowLabel,
          platform: row.platform,
          theme: row.theme,
          created_at: row.created_at,
          alreadyLinked: linkedIdSet.has(row.id),
        } as FeatureLogScreenshotCandidate;
      })
      .filter((candidate) => {
        if (!flowQuery) {
          return true;
        }

        const flowLabel = candidate.flow_label?.toLowerCase() ?? '';
        return flowLabel.includes(flowQuery);
      });

    return candidates;
  }, []);

  return useMemo(() => ({
    linkedScreenshots,
    linksError,
    loadingLinks,
    loadCandidates,
    refreshLinks,
  }), [linkedScreenshots, linksError, loadingLinks, loadCandidates, refreshLinks]);
}
