import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Flow, Project, ScreenshotNode } from '../types';
import { supabase } from '../lib/supabase';

export function useCatalogueData() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data: projectData } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!projectData || projectData.length === 0) {
      setProjects([]);
      setScreenshots([]);
      setFlows([]);
      setLoading(false);
      return;
    }

    setProjects(projectData);
    const projectIds = projectData.map((project) => project.id);

    const [screenshotRes, flowRes] = await Promise.all([
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
    ]);

    if (screenshotRes.data) {
      const screenshotIds = screenshotRes.data.map((screenshot) => screenshot.id);
      const versionCounts: Record<string, number> = {};
      const commentCounts: Record<string, number> = {};

      if (screenshotIds.length > 0) {
        const [versionRes, commentRes] = await Promise.all([
          supabase.from('screenshot_versions').select('screenshot_id').in('screenshot_id', screenshotIds),
          supabase.from('screenshot_comments').select('screenshot_id').in('screenshot_id', screenshotIds),
        ]);

        if (versionRes.data) {
          for (const version of versionRes.data) {
            versionCounts[version.screenshot_id] = (versionCounts[version.screenshot_id] || 0) + 1;
          }
        }

        if (commentRes.data) {
          for (const comment of commentRes.data) {
            commentCounts[comment.screenshot_id] = (commentCounts[comment.screenshot_id] || 0) + 1;
          }
        }
      }

      setScreenshots(
        screenshotRes.data.map((screenshot) => ({
          ...screenshot,
          image_url: screenshot.storage_path
            ? supabase.storage.from('screenshots').getPublicUrl(screenshot.storage_path).data.publicUrl
            : '',
          version_count: versionCounts[screenshot.id] || 0,
          comment_count: commentCounts[screenshot.id] || 0,
        })),
      );
    } else {
      setScreenshots([]);
    }

    setFlows(flowRes.data ?? []);
    setLoading(false);
  }, []);

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

  return {
    flows,
    flowMap,
    loadData,
    loading,
    projectMap,
    projects,
    screenshots,
    setFlows,
    setProjects,
    setScreenshots,
  };
}
