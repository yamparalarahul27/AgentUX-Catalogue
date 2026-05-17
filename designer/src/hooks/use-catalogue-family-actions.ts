import { useCallback } from 'react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { CATALOGUE_FLOW_LABEL_KEY, getScreenshotFamilyId } from '../lib/catalogue-families';
import { supabase } from '../lib/supabase';
import type { MobileOs, ScreenFamily, ScreenshotNode } from '../types';
import { useCatalogueImageActions } from './use-catalogue-image-actions';

interface ToastState {
  message: string;
  type: 'error' | 'success' | 'info';
}

interface UseCatalogueFamilyActionsArgs {
  familyById: Record<string, CatalogueFamilyView>;
  flowMap: Record<string, string>;
  onFamilyDeleted?: (familyId: string) => void;
  screenFamilies: ScreenFamily[];
  screenshots: ScreenshotNode[];
  setFullScopeScreenshots?: React.Dispatch<React.SetStateAction<ScreenshotNode[]>>;
  setScreenFamilies: React.Dispatch<React.SetStateAction<ScreenFamily[]>>;
  setScreenshots: React.Dispatch<React.SetStateAction<ScreenshotNode[]>>;
  setToast: React.Dispatch<React.SetStateAction<ToastState | null>>;
  userEmail?: string | null;
  userId: string;
  webPresets: { key: string }[];
  // Drives the soft-delete success toast wording. When true ("Moved to
  // Trash. Recoverable for 15 days."), the caller can reach the Trash
  // section to restore. When false ("Deleted."), they can't — currently
  // only Admins reach Trash, so non-admin roles see the simpler message.
  canSeeTrash?: boolean;
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
  flowMap,
  onFamilyDeleted,
  screenFamilies,
  screenshots,
  setFullScopeScreenshots,
  setScreenFamilies,
  setScreenshots,
  setToast,
  userEmail,
  userId,
  webPresets,
  canSeeTrash = true,
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

  // Image manipulation handlers (replace / crop / set+remove reference)
  // live in a dedicated sub-hook to keep this file focused on family,
  // group, flow, and variant orchestration.
  const imageActions = useCatalogueImageActions({
    screenshots,
    setScreenshots,
    setToast,
    userId,
  });

  // Rename every screenshot's `group` value across all the supplied raw
  // casings (e.g. ["Coinbase", "coinbase"]) to `newName` within the
  // project. Caller passes the full list of casings so a single UPDATE
  // sweeps every variant. Returns the count of rows updated.
  const handleRenameGroupKey = useCallback(async (
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

    // Rename applies cross-project — every screenshot with a matching group
    // name (case-sensitive against `sources`) gets the new name regardless of
    // which project it lives in. RLS gates this to screenshots the caller can
    // edit via the `edit_metadata` capability.
    const { data, error } = await supabase
      .from('screenshots')
      .update({ group: trimmedNew })
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

    if (screenshotIds.length === 0) return;

    // Server-side soft-delete. .select() returns the rows that actually
    // updated — under RLS, a caller without `delete_any` who tries to
    // delete a screenshot they don't own gets back zero rows (no error,
    // no exception). The previous version blindly removed the family
    // from local state and showed a "Moved to Trash" toast in that case,
    // creating the silent-fail-then-reappear-on-refresh bug.
    const { data: updatedRows, error } = await supabase
      .from('screenshots')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_email: userEmail || null,
      })
      .in('id', screenshotIds)
      .select('id');

    if (error) {
      setToast({ message: `Couldn't delete: ${error.message}`, type: 'error' });
      return;
    }

    const updatedCount = updatedRows?.length ?? 0;
    if (updatedCount === 0) {
      setToast({
        message: "You don't have permission to delete this — refresh and try again.",
        type: 'error',
      });
      return;
    }

    // Screen_families rows stay put; the UI filters them out by their
    // screenshot count (a family with zero live screenshots doesn't render).
    setScreenshots((previous) => previous.filter((screenshot) => getScreenshotFamilyId(screenshot) !== id));
    onFamilyDeleted?.(id);

    // Different toast wording based on whether the caller can reach the
    // Trash section to restore. Admin gets the "Moved to Trash" copy;
    // non-admin roles get a simpler "Deleted." since the Trash UI is
    // currently admin-only (see parked_delete_ui_gating_and_trash.md
    // for the C2 option of giving non-admins their own Trash view).
    const message = canSeeTrash
      ? 'Moved to Trash. Recoverable for 15 days.'
      : 'Deleted.';
    setToast({ message, type: 'success' });
  }, [canSeeTrash, onFamilyDeleted, screenshots, setScreenshots, setToast, userEmail]);

  // Trash → Restore: clears deleted_at on every screenshot in the family.
  // The screenshots reappear in the catalogue once their rows refetch.
  const handleRestoreFamily = useCallback(async (screenshotIds: string[]) => {
    if (screenshotIds.length === 0) return { ok: false as const };
    const { error } = await supabase
      .from('screenshots')
      .update({ deleted_at: null, deleted_by_email: null })
      .in('id', screenshotIds);
    if (error) {
      setToast({ message: `Restore failed: ${error.message}`, type: 'error' });
      return { ok: false as const, error: error.message };
    }
    setToast({ message: 'Restored from Trash.', type: 'success' });
    return { ok: true as const };
  }, [setToast]);

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
    handleAnnotationStateChange,
    handleAssignFlow,
    handleChangeFamilyGroup,
    handleCommentCountChange,
    handleDeleteFamily,
    handleRenameFamily,
    handleRenameGroupKey,
    handleRestoreFamily,
    handleSetFlowLabel,
    handleUpdateVariantDetails,
    handleVariantPlatformChange,
    ...imageActions,
  };
}
