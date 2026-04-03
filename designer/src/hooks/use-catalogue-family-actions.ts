import { useCallback } from 'react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getScreenshotFamilyId } from '../lib/catalogue-families';
import { getAnnotationActivity } from '../lib/catalogue-activity';
import { compressImage } from '../lib/catalogue-image';
import { supabase } from '../lib/supabase';
import type { MobileOs, Project, ScreenFamily, ScreenshotNode } from '../types';

interface ToastState {
  message: string;
  type: 'error' | 'success' | 'info';
}

interface UseCatalogueFamilyActionsArgs {
  familyById: Record<string, CatalogueFamilyView>;
  filterProject: string | null;
  flowMap: Record<string, string>;
  onFamilyDeleted?: (familyId: string) => void;
  projects: Project[];
  screenFamilies: ScreenFamily[];
  screenshots: ScreenshotNode[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  setScreenFamilies: React.Dispatch<React.SetStateAction<ScreenFamily[]>>;
  setScreenshots: React.Dispatch<React.SetStateAction<ScreenshotNode[]>>;
  setToast: React.Dispatch<React.SetStateAction<ToastState | null>>;
  userId: string;
  webPresets: { key: string }[];
}

function sameVariantIdentity(left: ScreenshotNode, right: ScreenshotNode): boolean {
  if (left.theme !== right.theme) return false;
  if (left.platform !== right.platform) return false;

  if (left.platform === 'web') {
    return left.web_preset_key !== null
      && right.web_preset_key !== null
      && left.web_preset_key === right.web_preset_key;
  }

  if (left.platform === 'mobile') {
    return left.mobile_os !== null
      && right.mobile_os !== null
      && left.mobile_os === right.mobile_os;
  }

  return false;
}

export function useCatalogueFamilyActions({
  familyById,
  filterProject,
  flowMap,
  onFamilyDeleted,
  projects,
  screenFamilies,
  screenshots,
  setProjects,
  setScreenFamilies,
  setScreenshots,
  setToast,
  userId,
  webPresets,
}: UseCatalogueFamilyActionsArgs) {
  const projectById = useCallback(
    (projectId: string) => projects.find((project) => project.id === projectId) ?? null,
    [projects],
  );

  const setFamilyScreenshotsPatch = useCallback((familyId: string, patch: Partial<ScreenshotNode>) => {
    setScreenshots((previous) => previous.map((screenshot) => (
      getScreenshotFamilyId(screenshot) === familyId ? { ...screenshot, ...patch } : screenshot
    )));
  }, [setScreenshots]);

  const syncFamilyPatch = useCallback(async (
    familyId: string,
    patch: { flow_id?: string | null; group?: string | null; name?: string },
  ) => {
    const family = familyById[familyId];
    if (!family) return;

    const screenshotIds = screenshots
      .filter((screenshot) => getScreenshotFamilyId(screenshot) === familyId)
      .map((screenshot) => screenshot.id);

    if (screenFamilies.some((item) => item.id === familyId)) {
      await supabase.from('screen_families').update(patch).eq('id', familyId);
      setScreenFamilies((previous) => previous.map((item) => (
        item.id === familyId ? { ...item, ...patch } : item
      )));
    }

    if (screenshotIds.length > 0) {
      await supabase.from('screenshots').update(patch).in('id', screenshotIds);
      setFamilyScreenshotsPatch(familyId, patch);
    }
  }, [familyById, screenFamilies, screenshots, setFamilyScreenshotsPatch, setScreenFamilies]);

  const handlePrimaryGroupChange = useCallback(async (group: string | null) => {
    if (!filterProject) return;
    await supabase.from('projects').update({ primary_group: group }).eq('id', filterProject);
    setProjects((previous) => previous.map((project) => (
      project.id === filterProject ? { ...project, primary_group: group } : project
    )));
    setToast({ message: group ? `Primary group set to "${group}"` : 'Primary group cleared', type: 'success' });
  }, [filterProject, setProjects, setToast]);

  const handleVsGroupsChange = useCallback(async (groups: string[]) => {
    if (!filterProject) return;
    await supabase.from('projects').update({ vs_groups: groups }).eq('id', filterProject);
    setProjects((previous) => previous.map((project) => (
      project.id === filterProject ? { ...project, vs_groups: groups } : project
    )));
  }, [filterProject, setProjects]);

  const handleCommentCountChange = useCallback((screenshotId: string, delta: number) => {
    setScreenshots((previous) => previous.map((screenshot) => {
      if (screenshot.id !== screenshotId) return screenshot;
      const nextCount = Math.max(0, (screenshot.comment_count ?? 0) + delta);
      return {
        ...screenshot,
        comment_count: nextCount,
        comment_last_added_at: delta > 0 ? new Date().toISOString() : (nextCount > 0 ? screenshot.comment_last_added_at : null),
      };
    }));
  }, [setScreenshots]);

  const handleAnnotationStateChange = useCallback((
    screenshotId: string,
    metadata: Record<string, unknown>,
  ) => {
    const activity = getAnnotationActivity(metadata);
    setScreenshots((previous) => previous.map((screenshot) => (
      screenshot.id === screenshotId
        ? {
          ...screenshot,
          metadata,
          annotation_count: activity.count,
          annotation_last_added_at: activity.lastAddedAt,
        }
        : screenshot
    )));
  }, [setScreenshots]);

  const findVariantConflict = useCallback((current: ScreenshotNode, next: ScreenshotNode) => screenshots.find((item) => (
    item.id !== current.id
    && getScreenshotFamilyId(item) === getScreenshotFamilyId(current)
    && sameVariantIdentity(item, next)
  )) ?? null, [screenshots]);

  const buildNextVariant = useCallback((
    screenshot: ScreenshotNode,
    patch: {
      platform?: 'mobile' | 'web' | null;
      mobile_os?: MobileOs | null;
      theme?: 'light' | 'dark' | null;
      web_preset_key?: string | null;
    },
  ): ScreenshotNode => {
    const next: ScreenshotNode = { ...screenshot, ...patch };

    if (Object.prototype.hasOwnProperty.call(patch, 'platform')) {
      if (patch.platform === 'web') {
        next.web_preset_key = patch.web_preset_key ?? screenshot.web_preset_key ?? webPresets[0]?.key ?? null;
        next.mobile_os = null;
      } else if (patch.platform === 'mobile') {
        next.mobile_os = patch.mobile_os ?? screenshot.mobile_os ?? 'ios';
        next.web_preset_key = null;
      } else {
        next.web_preset_key = null;
        next.mobile_os = null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'web_preset_key')) {
      next.web_preset_key = patch.web_preset_key ?? null;
      next.mobile_os = null;
      if (next.platform === null) next.platform = 'web';
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'mobile_os')) {
      next.mobile_os = patch.mobile_os ?? null;
      next.web_preset_key = null;
      if (next.platform === null) next.platform = 'mobile';
    }

    if (next.platform === 'web') {
      next.mobile_os = null;
    }

    if (next.platform === 'mobile') {
      next.web_preset_key = null;
    }

    return next;
  }, [webPresets]);

  const handleVariantPlatformChange = useCallback(async (id: string, platform: 'mobile' | 'web' | null) => {
    const screenshot = screenshots.find((item) => item.id === id);
    if (!screenshot) return;

    const next = buildNextVariant(screenshot, { platform });
    const conflict = findVariantConflict(screenshot, next);
    if (conflict) {
      setToast({ message: 'Another variant already uses this theme and platform slot.', type: 'error' });
      return;
    }

    const patch = {
      platform: next.platform,
      web_preset_key: next.web_preset_key,
      mobile_os: next.mobile_os,
    };
    const { error } = await supabase.from('screenshots').update(patch).eq('id', id);

    if (error) {
      setToast({ message: `Could not update variant platform: ${error.message}`, type: 'error' });
      return;
    }

    setScreenshots((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, [buildNextVariant, findVariantConflict, screenshots, setScreenshots, setToast]);

  const handleUpdateVariantDetails = useCallback(async (
    id: string,
    patch: {
      platform?: 'mobile' | 'web' | null;
      mobile_os?: 'ios' | 'android' | null;
      theme?: 'light' | 'dark' | null;
      web_preset_key?: string | null;
    },
  ) => {
    const screenshot = screenshots.find((item) => item.id === id);
    if (!screenshot) return false;

    const next = buildNextVariant(screenshot, patch);
    const conflict = findVariantConflict(screenshot, next);
    if (conflict) {
      setToast({ message: 'Another variant already exists with these details.', type: 'error' });
      return false;
    }

    const nextPatch: Partial<ScreenshotNode> = {
      platform: next.platform,
      mobile_os: next.mobile_os,
      theme: next.theme,
      web_preset_key: next.web_preset_key,
    };

    const { error } = await supabase.from('screenshots').update(nextPatch).eq('id', id);
    if (error) {
      setToast({ message: `Could not update variant details: ${error.message}`, type: 'error' });
      return false;
    }

    setScreenshots((previous) => previous.map((item) => item.id === id ? { ...item, ...nextPatch } : item));
    return true;
  }, [buildNextVariant, findVariantConflict, screenshots, setScreenshots, setToast]);

  const handleRenameFamily = useCallback(async (id: string, name: string) => {
    await syncFamilyPatch(id, { name });
  }, [syncFamilyPatch]);

  const handleChangeFamilyGroup = useCallback(async (id: string, group: string | null) => {
    const family = familyById[id];
    if (!family) return;

    const projectPrimaryGroup = projectById(family.project_id)?.primary_group ?? null;
    const shouldClearFlow = Boolean(family.flow_id && projectPrimaryGroup && group !== projectPrimaryGroup);
    await syncFamilyPatch(id, shouldClearFlow ? { group, flow_id: null } : { group });

    setToast({
      message: shouldClearFlow
        ? `Moved family to "${group || 'No group'}" and cleared its flow assignment`
        : (group ? `Moved family to "${group}"` : 'Group cleared'),
      type: 'success',
    });
  }, [familyById, projectById, setToast, syncFamilyPatch]);

  const handleDeleteFamily = useCallback(async (id: string) => {
    const familyScreenshots = screenshots.filter((screenshot) => getScreenshotFamilyId(screenshot) === id);
    const screenshotIds = familyScreenshots.map((screenshot) => screenshot.id);
    const storagePaths = familyScreenshots.map((screenshot) => screenshot.storage_path).filter(Boolean);

    if (screenshotIds.length > 0) {
      await supabase.from('connections').delete().or(
        screenshotIds.map((screenshotId) => `source_id.eq.${screenshotId},target_id.eq.${screenshotId}`).join(','),
      );
      await supabase.from('screenshots').delete().in('id', screenshotIds);
      if (storagePaths.length > 0) {
        await supabase.storage.from('screenshots').remove(storagePaths);
      }
    }

    if (screenFamilies.some((family) => family.id === id)) {
      await supabase.from('screen_families').delete().eq('id', id);
      setScreenFamilies((previous) => previous.filter((family) => family.id !== id));
    }

    setScreenshots((previous) => previous.filter((screenshot) => getScreenshotFamilyId(screenshot) !== id));
    onFamilyDeleted?.(id);
    setToast({ message: 'Screen family deleted', type: 'success' });
  }, [onFamilyDeleted, screenFamilies, screenshots, setScreenFamilies, setScreenshots, setToast]);

  const handleReplaceImage = useCallback(async (id: string, file: File) => {
    const screenshot = screenshots.find((item) => item.id === id);
    if (!screenshot) return;

    const { count } = await supabase
      .from('screenshot_versions')
      .select('*', { count: 'exact', head: true })
      .eq('screenshot_id', id);
    const nextVersion = (count ?? 0) + 1;

    await supabase.from('screenshot_versions').insert({
      screenshot_id: id,
      version_number: nextVersion,
      storage_path: screenshot.storage_path,
      file_name: screenshot.file_name,
    });

    const compressed = await compressImage(file);
    const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const storagePath = `${userId}/${screenshot.project_id}/${safeName}`;
    const { error } = await supabase.storage.from('screenshots').upload(storagePath, compressed, { upsert: true });

    if (error) {
      setToast({ message: `Upload failed: ${error.message}`, type: 'error' });
      return;
    }

    const imageUrl = supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl;
    await supabase.from('screenshots').update({ storage_path: storagePath, file_name: file.name }).eq('id', id);

    setScreenshots((previous) => previous.map((item) => (
      item.id === id
        ? { ...item, storage_path: storagePath, file_name: file.name, image_url: imageUrl, version_count: nextVersion }
        : item
    )));
    setToast({ message: 'Variant image replaced', type: 'success' });
  }, [screenshots, setScreenshots, setToast, userId]);

  const handleAssignFlow = useCallback(async (familyId: string, flowId: string | null) => {
    const family = familyById[familyId];
    if (!family) return;

    const projectPrimaryGroup = projectById(family.project_id)?.primary_group ?? null;
    if (flowId && projectPrimaryGroup && family.group !== projectPrimaryGroup) {
      setToast({ message: 'Only primary group screen families can be assigned to flows', type: 'error' });
      return;
    }

    await syncFamilyPatch(familyId, { flow_id: flowId });
    setToast({
      message: flowId ? `Assigned to ${flowMap[flowId] || 'flow'}` : 'Unassigned from flow',
      type: 'success',
    });
  }, [familyById, flowMap, projectById, setToast, syncFamilyPatch]);

  return {
    currentProject: projects.find((project) => project.id === filterProject) ?? null,
    handleAnnotationStateChange,
    handleAssignFlow,
    handleChangeFamilyGroup,
    handleCommentCountChange,
    handleDeleteFamily,
    handlePrimaryGroupChange,
    handleRenameFamily,
    handleReplaceImage,
    handleUpdateVariantDetails,
    handleVariantPlatformChange,
    handleVsGroupsChange,
  };
}
