import { useCallback } from 'react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { CATALOGUE_FLOW_LABEL_KEY, getScreenshotFamilyId } from '../lib/catalogue-families';
import { compressImage } from '../lib/catalogue-image';
import {
  deleteAnnotation,
  fetchAnnotationsForScreenshot,
  updateAnnotationGeometry,
} from '../lib/screenshot-annotations';
import { cropImageBox } from '../lib/screenshot-crop';
import { supabase } from '../lib/supabase';
import { generateThumbHash } from '../lib/thumbhash';
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
  setFullScopeScreenshots?: React.Dispatch<React.SetStateAction<ScreenshotNode[]>>;
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
  setFullScopeScreenshots,
  setProjects,
  setScreenFamilies,
  setScreenshots,
  setToast,
  userId,
  webPresets,
}: UseCatalogueFamilyActionsArgs) {
  const setFamilyScreenshotsPatch = useCallback((familyId: string, patch: Partial<ScreenshotNode>) => {
    setScreenshots((previous) => previous.map((screenshot) => (
      getScreenshotFamilyId(screenshot) === familyId ? { ...screenshot, ...patch } : screenshot
    )));
    // Mirror into fullScopeScreenshots so derived UIs (chip strip, group
    // facets) reflect the change immediately.
    if (setFullScopeScreenshots) {
      setFullScopeScreenshots((previous) => previous.map((screenshot) => (
        getScreenshotFamilyId(screenshot) === familyId ? { ...screenshot, ...patch } : screenshot
      )));
    }
  }, [setFullScopeScreenshots, setScreenshots]);

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
  }, [filterProject, setProjects]);

  const handleVsGroupsChange = useCallback(async (groups: string[]) => {
    if (!filterProject) return;
    await supabase.from('projects').update({ vs_groups: groups }).eq('id', filterProject);
    setProjects((previous) => previous.map((project) => (
      project.id === filterProject ? { ...project, vs_groups: groups } : project
    )));
  }, [filterProject, setProjects]);

  // Rename every screenshot's `group` value across all the supplied raw
  // casings (e.g. ["Coinbase", "coinbase"]) to `newName` within the
  // project. Caller passes the full list of casings so a single UPDATE
  // sweeps every variant. Returns the count of rows updated.
  const handleRenameGroupKey = useCallback(async (
    projectId: string,
    oldNames: string[],
    newName: string,
  ): Promise<{ ok: boolean; updatedCount: number; error?: string }> => {
    const trimmedNew = newName.trim();
    const sources = [...new Set(oldNames.map((name) => name.trim()).filter(Boolean))];
    if (sources.length === 0 || !trimmedNew) {
      return { ok: false, updatedCount: 0, error: 'Group name cannot be empty' };
    }
    // Skip if every source is already exactly the new name.
    if (sources.length === 1 && sources[0] === trimmedNew) {
      return { ok: true, updatedCount: 0 };
    }

    const { data, error } = await supabase
      .from('screenshots')
      .update({ group: trimmedNew })
      .eq('project_id', projectId)
      .in('group', sources)
      .select('id');

    if (error) {
      return { ok: false, updatedCount: 0, error: error.message };
    }

    const updatedIds = new Set((data || []).map((row) => (row as { id: string }).id));

    setScreenshots((previous) => previous.map((screenshot) => (
      updatedIds.has(screenshot.id) ? { ...screenshot, group: trimmedNew } : screenshot
    )));
    if (setFullScopeScreenshots) {
      setFullScopeScreenshots((previous) => previous.map((screenshot) => (
        updatedIds.has(screenshot.id) ? { ...screenshot, group: trimmedNew } : screenshot
      )));
    }

    return { ok: true, updatedCount: updatedIds.size };
  }, [setFullScopeScreenshots, setScreenshots]);

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
    activity: { count: number; lastAddedAt: string | null },
  ) => {
    setScreenshots((previous) => previous.map((screenshot) => (
      screenshot.id === screenshotId
        ? {
          ...screenshot,
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

    await syncFamilyPatch(id, { group });
    setToast({ message: group ? `Moved screenshot to "${group}"` : 'Group cleared', type: 'success' });
  }, [familyById, setToast, syncFamilyPatch]);

  const handleSetFlowLabel = useCallback(async (id: string, flowLabel: string | null) => {
    const family = familyById[id];
    if (!family) return false;

    const normalized = flowLabel?.trim() || null;
    const familyScreenshots = screenshots.filter((screenshot) => getScreenshotFamilyId(screenshot) === id);
    if (familyScreenshots.length === 0) return false;

    const updates = await Promise.all(familyScreenshots.map(async (screenshot) => {
      const nextMetadata: Record<string, unknown> = {
        ...(screenshot.metadata && typeof screenshot.metadata === 'object' ? screenshot.metadata : {}),
      };
      if (normalized) {
        nextMetadata[CATALOGUE_FLOW_LABEL_KEY] = normalized;
      } else {
        delete nextMetadata[CATALOGUE_FLOW_LABEL_KEY];
      }

      const { error } = await supabase
        .from('screenshots')
        .update({ metadata: nextMetadata })
        .eq('id', screenshot.id);

      return { error, id: screenshot.id, metadata: nextMetadata };
    }));

    const failed = updates.find((item) => item.error);
    if (failed) {
      setToast({ message: `Could not update flow: ${failed.error?.message || 'Unknown error'}`, type: 'error' });
      return false;
    }

    const metadataById = new Map(updates.map((item) => [item.id, item.metadata] as const));
    setScreenshots((previous) => previous.map((screenshot) => {
      const nextMetadata = metadataById.get(screenshot.id);
      if (!nextMetadata) return screenshot;
      return { ...screenshot, metadata: nextMetadata };
    }));

    setToast({ message: normalized ? `Flow set to "${normalized}"` : 'Flow cleared', type: 'success' });
    return true;
  }, [familyById, screenshots, setScreenshots, setToast]);

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
    setToast({ message: 'Screenshot deleted', type: 'success' });
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

  // Crop replaces the existing storage object — no version row is added
  // (saves space). Annotations are shifted/clipped relative to the new
  // dimensions; ones outside the kept area are deleted. Old storage object
  // is removed best-effort after the DB swap.
  const handleCropFamilyImage = useCallback(async (
    screenshotId: string,
    topTrim: number,
    bottomTrim: number,
    leftTrim: number,
    rightTrim: number,
  ): Promise<{ ok: boolean }> => {
    const screenshot = screenshots.find((item) => item.id === screenshotId);
    if (!screenshot) return { ok: false };
    if (topTrim === 0 && bottomTrim === 0 && leftTrim === 0 && rightTrim === 0) return { ok: false };

    if (!screenshot.image_url) return { ok: false };

    try {
      const cropResult = await cropImageBox({
        imageUrl: screenshot.image_url,
        topTrim,
        bottomTrim,
        leftTrim,
        rightTrim,
        fileName: screenshot.file_name || 'cropped.png',
      });

      const oldWidth = cropResult.originalWidth;
      const oldHeight = cropResult.originalHeight;
      const newWidth = cropResult.width;
      const newHeight = cropResult.height;

      const thumbHash = await generateThumbHash(cropResult.file);

      const safeName = `cropped-${Date.now()}-${(screenshot.file_name || 'screenshot').replace(/\s+/g, '-')}`;
      const newStoragePath = `${userId}/${screenshot.project_id}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(newStoragePath, cropResult.file);

      if (uploadError) {
        setToast({ message: `Crop failed: ${uploadError.message}`, type: 'error' });
        return { ok: false };
      }

      const oldStoragePath = screenshot.storage_path;
      let dbError = (await supabase
        .from('screenshots')
        .update({ storage_path: newStoragePath, thumb_hash: thumbHash })
        .eq('id', screenshotId)).error;

      // Fall back without thumb_hash when PostgREST's schema cache hasn't
      // picked up the column yet (resolved by `NOTIFY pgrst, 'reload schema'`).
      if (dbError && /thumb_hash/i.test(dbError.message || '')) {
        dbError = (await supabase
          .from('screenshots')
          .update({ storage_path: newStoragePath })
          .eq('id', screenshotId)).error;
      }

      if (dbError) {
        // Roll back the just-uploaded file so we don't leave an orphan.
        await supabase.storage.from('screenshots').remove([newStoragePath]);
        setToast({ message: `Crop failed: ${dbError.message}`, type: 'error' });
        return { ok: false };
      }

      // Shift / clip annotations to the new image bounds. Coordinates are
      // stored as percentages of the image, so a re-percent over the new
      // width / height is required.
      const annotations = await fetchAnnotationsForScreenshot(screenshotId);
      for (const annotation of annotations) {
        const xPx = (annotation.x / 100) * oldWidth;
        const yPx = (annotation.y / 100) * oldHeight;
        const widthPx = annotation.width !== null
          ? (annotation.width / 100) * oldWidth
          : 0;
        const heightPx = annotation.height !== null
          ? (annotation.height / 100) * oldHeight
          : 0;
        const newXPx = xPx - leftTrim;
        const newYPx = yPx - topTrim;
        const isPin = annotation.shape === 'pin' || annotation.height === null;

        if (isPin) {
          if (newXPx < 0 || newXPx >= newWidth || newYPx < 0 || newYPx >= newHeight) {
            await deleteAnnotation(annotation.id);
          } else {
            await updateAnnotationGeometry(annotation.id, {
              x: (newXPx / newWidth) * 100,
              y: (newYPx / newHeight) * 100,
              width: null,
              height: null,
            });
          }
          continue;
        }

        // area
        const annotationRightPx = xPx + widthPx;
        const annotationBottomPx = yPx + heightPx;
        if (annotationBottomPx <= topTrim) {
          await deleteAnnotation(annotation.id);
          continue;
        }
        if (yPx >= oldHeight - bottomTrim) {
          await deleteAnnotation(annotation.id);
          continue;
        }
        if (annotationRightPx <= leftTrim) {
          await deleteAnnotation(annotation.id);
          continue;
        }
        if (xPx >= oldWidth - rightTrim) {
          await deleteAnnotation(annotation.id);
          continue;
        }

        const clippedLeftPx = Math.max(0, newXPx);
        const clippedRightPx = Math.min(newWidth, newXPx + widthPx);
        const clippedWidthPx = Math.max(0, clippedRightPx - clippedLeftPx);
        const clippedTopPx = Math.max(0, newYPx);
        const clippedBottomPx = Math.min(newHeight, newYPx + heightPx);
        const clippedHeightPx = Math.max(0, clippedBottomPx - clippedTopPx);

        await updateAnnotationGeometry(annotation.id, {
          x: (clippedLeftPx / newWidth) * 100,
          y: (clippedTopPx / newHeight) * 100,
          width: (clippedWidthPx / newWidth) * 100,
          height: (clippedHeightPx / newHeight) * 100,
        });
      }

      // Cache-bust the public URL so the new bytes load even if a CDN
      // briefly serves the old object before deletion propagates.
      const baseUrl = supabase.storage.from('screenshots').getPublicUrl(newStoragePath).data.publicUrl;
      const newImageUrl = `${baseUrl}?v=${Date.now()}`;

      setScreenshots((previous) => previous.map((item) => (
        item.id === screenshotId
          ? { ...item, storage_path: newStoragePath, thumb_hash: thumbHash, image_url: newImageUrl }
          : item
      )));

      // Best-effort cleanup of the old object. Failure here is non-fatal.
      if (oldStoragePath) {
        void supabase.storage.from('screenshots').remove([oldStoragePath]);
      }

      setToast({ message: 'Image cropped', type: 'success' });
      return { ok: true };
    } catch (error) {
      setToast({
        message: `Crop failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        type: 'error',
      });
      return { ok: false };
    }
  }, [screenshots, setScreenshots, setToast, userId]);

  const handleSetReference = useCallback(async (
    screenshotId: string,
    input: { file: File | null; label: string | null },
  ) => {
    const screenshot = screenshots.find((item) => item.id === screenshotId);
    if (!screenshot) return false;

    const normalizedLabel = input.label?.trim() || null;
    let nextStoragePath = screenshot.reference_storage_path;
    let nextUrl = screenshot.reference_url;

    if (input.file) {
      const compressed = await compressImage(input.file);
      const safeName = input.file.name.replace(/\s+/g, '-');
      nextStoragePath = `${userId}/${screenshot.project_id}/references/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(nextStoragePath, compressed, { upsert: true });

      if (uploadError) {
        setToast({ message: `Reference upload failed: ${uploadError.message}`, type: 'error' });
        return false;
      }

      nextUrl = supabase.storage.from('screenshots').getPublicUrl(nextStoragePath).data.publicUrl;
    }

    const patch: Pick<ScreenshotNode, 'reference_label' | 'reference_storage_path' | 'reference_url'> = {
      reference_label: normalizedLabel,
      reference_storage_path: nextStoragePath,
      reference_url: nextUrl,
    };

    const { error } = await supabase.from('screenshots').update(patch).eq('id', screenshotId);
    if (error) {
      setToast({ message: `Could not update reference details: ${error.message}`, type: 'error' });
      return false;
    }

    setScreenshots((previous) => previous.map((item) => (
      item.id === screenshotId ? { ...item, ...patch } : item
    )));

    if (input.file && screenshot.reference_storage_path && screenshot.reference_storage_path !== nextStoragePath) {
      const { error: cleanupError } = await supabase.storage
        .from('screenshots')
        .remove([screenshot.reference_storage_path]);
      if (cleanupError) {
        setToast({
          message: `Reference updated, but old file cleanup failed: ${cleanupError.message}`,
          type: 'info',
        });
        return true;
      }
    }

    setToast({ message: input.file ? 'Reference updated' : 'Reference label updated', type: 'success' });
    return true;
  }, [screenshots, setScreenshots, setToast, userId]);

  const handleRemoveReference = useCallback(async (screenshotId: string) => {
    const screenshot = screenshots.find((item) => item.id === screenshotId);
    if (!screenshot) return false;

    const patch: Pick<ScreenshotNode, 'reference_label' | 'reference_storage_path' | 'reference_url'> = {
      reference_label: null,
      reference_storage_path: null,
      reference_url: null,
    };

    const { error } = await supabase.from('screenshots').update(patch).eq('id', screenshotId);
    if (error) {
      setToast({ message: `Could not remove reference image: ${error.message}`, type: 'error' });
      return false;
    }

    let cleanupError: string | null = null;
    if (screenshot.reference_storage_path) {
      const { error: storageError } = await supabase.storage
        .from('screenshots')
        .remove([screenshot.reference_storage_path]);
      if (storageError) cleanupError = storageError.message;
    }

    setScreenshots((previous) => previous.map((item) => (
      item.id === screenshotId ? { ...item, ...patch } : item
    )));

    setToast({
      message: cleanupError
        ? `Reference removed, but cleanup failed: ${cleanupError}`
        : 'Reference image removed',
      type: cleanupError ? 'info' : 'success',
    });
    return true;
  }, [screenshots, setScreenshots, setToast]);

  const handleAssignFlow = useCallback(async (familyId: string, flowId: string | null) => {
    const family = familyById[familyId];
    if (!family) return;

    await syncFamilyPatch(familyId, { flow_id: flowId });
    setToast({
      message: flowId ? `Assigned to ${flowMap[flowId] || 'flow'}` : 'Unassigned from flow',
      type: 'success',
    });
  }, [familyById, flowMap, setToast, syncFamilyPatch]);

  return {
    currentProject: projects.find((project) => project.id === filterProject) ?? null,
    handleAnnotationStateChange,
    handleAssignFlow,
    handleChangeFamilyGroup,
    handleCommentCountChange,
    handleCropFamilyImage,
    handleDeleteFamily,
    handlePrimaryGroupChange,
    handleRenameFamily,
    handleRenameGroupKey,
    handleRemoveReference,
    handleSetReference,
    handleReplaceImage,
    handleSetFlowLabel,
    handleUpdateVariantDetails,
    handleVariantPlatformChange,
    handleVsGroupsChange,
  };
}
