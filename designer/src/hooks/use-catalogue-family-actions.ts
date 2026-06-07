import { useCallback } from 'react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { CATALOGUE_FLOW_LABEL_KEY, getScreenshotFamilyId } from '../lib/catalogue-families';
import { enqueueMutation } from '../lib/mutation-queue';
import { supabase } from '../lib/supabase';
import type { MobileOs, ScreenFamily, ScreenshotNode } from '../types';
import { invalidateCatalogueFullScopeCache } from './use-catalogue-full-scope';
import { useCatalogueImageActions } from './use-catalogue-image-actions';
import { useFeedback } from './use-feedback';

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
  const { fire } = useFeedback();

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

    // Optimistic local state — apply the patch immediately so the UI
    // feels instant regardless of network conditions. The mutation
    // queue handles the durable replay to Supabase.
    if (screenFamilies.some((item) => item.id === familyId)) {
      setScreenFamilies((previous) => previous.map((item) => (
        item.id === familyId ? { ...item, ...patch } : item
      )));
    }
    if (screenshotIds.length > 0) {
      setFamilyScreenshotsPatch(familyId, patch);
    }

    // Enqueue for durable, offline-tolerant replay. When online, the
    // queue drains immediately (one round trip). When offline, the
    // patch persists in IndexedDB and replays on reconnect.
    await enqueueMutation({
      op: 'family-patch',
      familyId,
      screenshotIds,
      patch,
    });
  }, [familyById, screenFamilies, screenshots, setFamilyScreenshotsPatch, setScreenFamilies]);

  // Image manipulation handlers (replace / crop / set+remove reference)
  // live in a dedicated sub-hook to keep this file focused on family,
  // group, flow, and variant orchestration.
  const imageActions = useCatalogueImageActions({
    screenshots,
    setScreenshots,
    setFullScopeScreenshots,
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
    const patchHasPlatform = Object.prototype.hasOwnProperty.call(patch, 'platform');

    // When platform is in the patch it drives the variant identity —
    // it picks one of web_preset_key / mobile_os and clears the other.
    // The lightbox save sends all four fields together, so without this
    // mutual-exclusion the mobile_os branch below would clobber the
    // web_preset_key we just set (and vice versa).
    if (patchHasPlatform) {
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
    } else {
      // Platform absent — caller is patching just one of the
      // variant-identity fields. Infer platform if it's currently null.
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
    // Optimistic local update first so the variant change reflects
    // immediately, including offline.
    setScreenshots((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item));
    await enqueueMutation({
      op: 'screenshots-patch',
      updates: [{
        screenshotId: id,
        columnPatch: patch as Record<string, unknown>,
      }],
    });
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

    // Optimistic local update first — UI reflects the variant change
    // even offline.
    setScreenshots((previous) => previous.map((item) => item.id === id ? { ...item, ...nextPatch } : item));
    // Cross-route consumers (Group View card platforms, Group detail
    // tab counts, etc.) read from the full-scope cache — refresh so a
    // Web → Mobile flip propagates everywhere, not just the lightbox.
    invalidateCatalogueFullScopeCache();

    await enqueueMutation({
      op: 'screenshots-patch',
      updates: [{
        screenshotId: id,
        columnPatch: nextPatch as Record<string, unknown>,
      }],
    });
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

    // Build the per-screenshot metadata snapshot the optimistic update
    // applies AND that the queue replay merges on the server side.
    // CATALOGUE_FLOW_LABEL_KEY may be deleted (null flow) or set to the
    // normalized label.
    const updates = familyScreenshots.map((screenshot) => {
      const nextMetadata: Record<string, unknown> = {
        ...(screenshot.metadata && typeof screenshot.metadata === 'object' ? screenshot.metadata : {}),
      };
      if (normalized) {
        nextMetadata[CATALOGUE_FLOW_LABEL_KEY] = normalized;
      } else {
        delete nextMetadata[CATALOGUE_FLOW_LABEL_KEY];
      }
      return { id: screenshot.id, metadata: nextMetadata };
    });

    // Optimistic: apply to local state immediately so the UI reflects
    // the flow change even while offline.
    const metadataById = new Map(updates.map((item) => [item.id, item.metadata] as const));
    setScreenshots((previous) => previous.map((screenshot) => {
      const nextMetadata = metadataById.get(screenshot.id);
      if (!nextMetadata) return screenshot;
      return { ...screenshot, metadata: nextMetadata };
    }));

    // Queue for durable replay. Each screenshot writes the full
    // computed metadata via columnPatch — matches the pre-queue
    // behaviour where the entire metadata object was overwritten on
    // every flow change. metadataMerge would have the wrong semantics
    // for the null-flow case (we need to DELETE the key, not set it
    // to null).
    await enqueueMutation({
      op: 'screenshots-patch',
      updates: updates.map((u) => ({
        screenshotId: u.id,
        columnPatch: { metadata: u.metadata },
      })),
    });

    // Flow filter pools (toolbar dropdown, Settings → Flows checklist,
    // search modal flow results) all read from the full-scope cache —
    // refresh so re-labelled flows propagate immediately.
    invalidateCatalogueFullScopeCache();

    setToast({ message: normalized ? `Flow set to "${normalized}"` : 'Flow cleared', type: 'success' });
    return true;
  }, [familyById, screenshots, setScreenshots, setToast]);

  const handleDeleteFamily = useCallback(async (id: string) => {
    const familyScreenshots = screenshots.filter((screenshot) => getScreenshotFamilyId(screenshot) === id);
    const screenshotIds = familyScreenshots.map((screenshot) => screenshot.id);

    if (screenshotIds.length === 0) return;

    // Optimistic local update so the family disappears instantly. The
    // mutation queue handles the durable Supabase write — drains
    // immediately when online, persists across reloads when offline.
    //
    // Trade-off: PR #98 used .select() on the update to surface RLS
    // denials ("You don't have permission to delete this"). With the
    // queue, RLS denials only surface on replay and are silently
    // dropped — the family will reappear after the next full-scope
    // refresh. Acceptable for v1 since (a) RLS is admin-only on this
    // surface, (b) the bulk of users have permission, and (c) the
    // refresh restores correct state without user action.
    setScreenshots((previous) => previous.filter((screenshot) => getScreenshotFamilyId(screenshot) !== id));
    invalidateCatalogueFullScopeCache();
    onFamilyDeleted?.(id);

    await enqueueMutation({
      op: 'soft-delete-family',
      familyId: id,
      screenshotIds,
      deletedByEmail: userEmail || null,
    });

    // Different toast wording based on whether the caller can reach the
    // Trash section to restore. Admin gets the "Moved to Trash" copy;
    // non-admin roles get a simpler "Deleted." since the Trash UI is
    // currently admin-only (see parked_delete_ui_gating_and_trash.md
    // for the C2 option of giving non-admins their own Trash view).
    const message = canSeeTrash
      ? 'Moved to Trash. Recoverable for 15 days.'
      : 'Deleted.';
    setToast({ message, type: 'success' });
    fire('delete');
  }, [canSeeTrash, fire, onFamilyDeleted, screenshots, setScreenshots, setToast, userEmail]);

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
    fire('restore');
    return { ok: true as const };
  }, [fire, setToast]);

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
