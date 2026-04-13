import { useEffect, useMemo, useRef, useState } from 'react';

import { getAnnotationActivity } from '../lib/catalogue-activity';
import { buildCatalogueFamilies, type CatalogueFamilyView } from '../lib/catalogue-families';
import { supabase } from '../lib/supabase';
import type { Project, ScreenFamily, ScreenshotNode, WebPreset } from '../types';

interface UseCatalogueCompareDataArgs {
  activeProjectId: string | null;
  projects: Project[];
  screenFamilies: ScreenFamily[];
  webPresets: WebPreset[];
  compareEnabled: boolean;
  compareFlow: string | null;
}

interface CompareDataResult {
  compareFamilies: CatalogueFamilyView[];
  compareLoading: boolean;
}

/**
 * Compare mode bypasses pagination — it needs every screenshot matching a
 * specific flow label across the scoped project set, regardless of how far
 * the user has scrolled in the main paginated list.
 *
 * This hook fetches only when `compareEnabled && compareFlow` is truthy;
 * otherwise it returns empty state. The fetch is scoped to the given flow
 * via a JSONB query on metadata.catalogue_flow_label.
 *
 * See docs/catalogue-infinite-scroll-plan.md §9.
 */
export function useCatalogueCompareData({
  activeProjectId,
  projects,
  screenFamilies,
  webPresets,
  compareEnabled,
  compareFlow,
}: UseCatalogueCompareDataArgs): CompareDataResult {
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [loading, setLoading] = useState(false);
  const versionRef = useRef(0);

  const presetMap = useMemo(
    () => Object.fromEntries(webPresets.map((preset) => [preset.key, preset])),
    [webPresets],
  );

  useEffect(() => {
    if (!compareEnabled || !compareFlow) {
      setScreenshots([]);
      setLoading(false);
      return;
    }
    const scopedProjectIds = activeProjectId ? [activeProjectId] : projects.map((project) => project.id);
    if (scopedProjectIds.length === 0) {
      setScreenshots([]);
      return;
    }

    const version = versionRef.current + 1;
    versionRef.current = version;
    setLoading(true);

    let cancelled = false;
    supabase
      .from('screenshots')
      .select('*')
      .in('project_id', scopedProjectIds)
      .filter('metadata->>catalogue_flow_label', 'eq', compareFlow)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (versionRef.current !== version) return;
        setLoading(false);
        if (error || !data) {
          setScreenshots([]);
          return;
        }
        const mapped = data.map((row) => {
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
          } satisfies ScreenshotNode;
        });
        setScreenshots(mapped);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, compareEnabled, compareFlow, projects]);

  const compareFamilies = useMemo(
    () => (compareEnabled && screenshots.length > 0
      ? buildCatalogueFamilies(screenshots, screenFamilies, presetMap)
      : []),
    [compareEnabled, presetMap, screenFamilies, screenshots],
  );

  return {
    compareFamilies,
    compareLoading: loading,
  };
}
