import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Flow, Project, ScreenFamily, ScreenshotNode } from '../types';
import { getAnnotationActivity } from '../lib/catalogue-activity';
import { supabase } from '../lib/supabase';

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function useCatalogueData() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [screenFamilies, setScreenFamilies] = useState<ScreenFamily[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [loading, setLoading] = useState(true);
  const loadVersionRef = useRef(0);

  const hydrateActivity = useCallback(async (loadVersion: number, screenshotIds: string[]) => {
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

    setScreenshots((previous) => previous.map((screenshot) => ({
      ...screenshot,
      version_count: versionCounts[screenshot.id] || 0,
      comment_count: commentCounts[screenshot.id] || 0,
      comment_last_added_at: commentLastAddedAt[screenshot.id] || null,
    })));
  }, []);

  const loadData = useCallback(async () => {
    const loadVersion = loadVersionRef.current + 1;
    loadVersionRef.current = loadVersion;
    setLoading(true);

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
        return;
      }

      const projectIds = projectData.map((project) => project.id);
      const [screenshotRes, flowRes, familyRes] = await Promise.all([
        supabase
          .from('screenshots')
          .select('*')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('flows')
          .select('*')
          .in('project_id', projectIds)
          .order('created_at'),
        supabase
          .from('screen_families')
          .select('*')
          .in('project_id', projectIds)
          .order('created_at'),
      ]);

      if (loadVersionRef.current !== loadVersion) return;

      setProjects(projectData);
      setFlows(flowRes.data ?? []);
      setScreenFamilies(familyRes.data ?? []);

      const baseScreenshots = (screenshotRes.data ?? []).map((screenshot) => {
        const metadata = screenshot.metadata && typeof screenshot.metadata === 'object'
          ? screenshot.metadata as Record<string, unknown>
          : {};
        const annotationActivity = getAnnotationActivity(metadata);

        return {
          ...screenshot,
          metadata,
          screen_family_id: screenshot.screen_family_id || null,
          web_preset_key: screenshot.web_preset_key || null,
          mobile_os: screenshot.mobile_os || null,
          image_url: screenshot.storage_path
            ? supabase.storage.from('screenshots').getPublicUrl(screenshot.storage_path).data.publicUrl
            : '',
          version_count: 0,
          comment_count: 0,
          comment_last_added_at: null,
          annotation_count: annotationActivity.count,
          annotation_last_added_at: annotationActivity.lastAddedAt,
        };
      });

      setScreenshots(baseScreenshots);

      const screenshotIds = (screenshotRes.data ?? []).map((screenshot) => screenshot.id);
      if (screenshotIds.length > 0) {
        void hydrateActivity(loadVersion, screenshotIds);
      }
    } finally {
      if (loadVersionRef.current === loadVersion) {
        setLoading(false);
      }
    }
  }, [hydrateActivity]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
    loadData,
    loading,
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
