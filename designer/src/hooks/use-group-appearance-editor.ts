import { useState } from 'react';

import {
  type CatalogueGroupCategory,
  type CatalogueGroupRegion,
  removeCatalogueGroupUploadedIconFromSupabase,
  resolveCatalogueGroupAppearance,
  saveCatalogueGroupAppearanceToSupabase,
  uploadCatalogueGroupIconToSupabase,
  readCatalogueGroupAppearanceMap,
} from '../lib/catalogue-group-appearance';
import type { ScreenshotNode } from '../types';

// Self-contained state + actions for the GroupAppearanceEditModal.
//
// Used in two places today: CatalogueTeamSection (Settings → Groups
// inline list) and CatalogueGroupDetail (Edit button on the detail
// page). The hook keeps the modal portable so future surfaces can open
// the editor without re-implementing the upload / rename / save dance.

export interface RenameConfirmState {
  group: string;
  newName: string;
  count: number;
  sourceCasings: string[];
}

interface UseGroupAppearanceEditorArgs {
  // Used by the rename confirm dialog to show how many screenshots are
  // about to be renamed and which casings will collapse.
  screenshots: ScreenshotNode[];
  // Optional rename callback — when omitted, save proceeds without
  // offering a rename even if the label differs from the canonical key.
  onRenameGroupKey?: (
    oldNames: string[],
    newName: string,
  ) => Promise<{ ok: boolean; updatedCount: number; error?: string }>;
}

export function useGroupAppearanceEditor({
  screenshots,
  onRenameGroupKey,
}: UseGroupAppearanceEditorArgs) {
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editingGroupOriginal, setEditingGroupOriginal] = useState<string>('');
  const [labelDraft, setLabelDraft] = useState('');
  const [iconStoragePathDraft, setIconStoragePathDraft] = useState('');
  const [iconUrlDraft, setIconUrlDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState<CatalogueGroupCategory | null>(null);
  const [regionDraft, setRegionDraft] = useState<CatalogueGroupRegion | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [renameConfirm, setRenameConfirm] = useState<RenameConfirmState | null>(null);

  function beginEdit(group: string) {
    const appearance = resolveCatalogueGroupAppearance(
      readCatalogueGroupAppearanceMap(),
      group,
      null,
    );
    setEditingGroupKey(group.toLowerCase());
    setEditingGroupOriginal(group);
    setLabelDraft(appearance.label || group);
    setIconStoragePathDraft(appearance.iconStoragePath || '');
    setIconUrlDraft(appearance.iconUrl || '');
    setCategoryDraft(appearance.category);
    setRegionDraft(appearance.region);
    setSaveMessage(null);
  }

  function cancelEdit() {
    setEditingGroupKey(null);
    setEditingGroupOriginal('');
    setLabelDraft('');
    setIconStoragePathDraft('');
    setIconUrlDraft('');
    setCategoryDraft(null);
    setRegionDraft(null);
  }

  async function saveAppearance(group: string) {
    return saveCatalogueGroupAppearanceToSupabase({
      category: categoryDraft,
      group,
      iconStoragePath: iconStoragePathDraft || null,
      iconUrl: iconUrlDraft || null,
      label: labelDraft,
      region: regionDraft,
    });
  }

  // Top-level save. If the label changed (case-insensitively) and a
  // rename callback is available, surface the rename confirm dialog
  // before committing. Otherwise save in place.
  async function save() {
    if (!editingGroupOriginal) return;
    setSaveMessage(null);

    const trimmedDraft = labelDraft.trim();
    const canonical = editingGroupOriginal.toLowerCase();
    const isRename = Boolean(onRenameGroupKey)
      && trimmedDraft.length > 0
      && trimmedDraft.toLowerCase() !== canonical;

    if (isRename) {
      const sourceCasings = [...new Set(
        screenshots
          .filter((s) => (s.group ?? '').toLowerCase() === canonical)
          .map((s) => s.group ?? '')
          .filter(Boolean),
      )];
      const sourceCount = screenshots.filter(
        (s) => (s.group ?? '').toLowerCase() === canonical,
      ).length;
      setRenameConfirm({
        group: editingGroupOriginal,
        newName: trimmedDraft,
        count: sourceCount,
        sourceCasings,
      });
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveAppearance(editingGroupOriginal);
      if (!result.ok) {
        setSaveMessage(result.error);
        return;
      }
      setSaveMessage('Group appearance saved.');
      cancelEdit();
    } finally {
      setIsSaving(false);
    }
  }

  async function performRename() {
    if (!renameConfirm || !onRenameGroupKey) return;
    const { group, newName, sourceCasings } = renameConfirm;
    setIsSaving(true);
    try {
      const renameResult = await onRenameGroupKey(sourceCasings, newName);
      if (!renameResult.ok) {
        setSaveMessage(renameResult.error || 'Rename failed');
        return;
      }
      const appearanceResult = await saveAppearance(newName);
      if (!appearanceResult.ok) {
        setSaveMessage(appearanceResult.error);
        return;
      }
      const variantNote = sourceCasings.length > 1
        ? ` (merged ${sourceCasings.length} casings: ${sourceCasings.join(', ')})`
        : '';
      setSaveMessage(
        `Renamed "${group}" → "${newName}". ${renameResult.updatedCount} screenshot${renameResult.updatedCount === 1 ? '' : 's'} updated${variantNote}.`,
      );
      setRenameConfirm(null);
      cancelEdit();
    } finally {
      setIsSaving(false);
    }
  }

  function cancelRename() {
    setRenameConfirm(null);
  }

  async function handleIconUpload(file: File | null) {
    if (!file || !editingGroupOriginal) return;
    setIsUploading(true);
    setSaveMessage(null);
    try {
      const result = await uploadCatalogueGroupIconToSupabase({
        category: categoryDraft,
        file,
        group: editingGroupOriginal,
        label: labelDraft,
        region: regionDraft,
      });
      if (!result.ok) {
        setSaveMessage(result.error);
        return;
      }
      setIconUrlDraft(result.iconUrl);
      setIconStoragePathDraft(result.iconStoragePath);
      setSaveMessage('Icon uploaded.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemoveIcon() {
    if (!editingGroupOriginal) return;
    setSaveMessage(null);
    const result = await removeCatalogueGroupUploadedIconFromSupabase({
      category: categoryDraft,
      group: editingGroupOriginal,
      label: labelDraft,
      region: regionDraft,
    });
    if (!result.ok) {
      setSaveMessage(result.error);
      return;
    }
    setIconUrlDraft('');
    setIconStoragePathDraft('');
    setSaveMessage('Uploaded icon removed.');
  }

  return {
    // Read state — consumers pass these to <GroupAppearanceEditModal>
    editingGroupKey,
    editingGroupOriginal,
    labelDraft,
    iconUrlDraft,
    iconStoragePathDraft,
    categoryDraft,
    regionDraft,
    saveMessage,
    isSaving,
    isUploading,
    renameConfirm,
    hasUploadedIcon: Boolean(iconStoragePathDraft),

    // Setters for controlled inputs
    setLabelDraft,
    setCategoryDraft,
    setRegionDraft,
    setSaveMessage,

    // Actions
    beginEdit,
    cancelEdit,
    save,
    handleIconUpload,
    handleRemoveIcon,
    performRename,
    cancelRename,
  };
}
