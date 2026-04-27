import { useState } from 'react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';

interface UseCatalogueBulkActionsArgs {
  filteredFamilies: CatalogueFamilyView[];
  requireEditAccess: () => boolean;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onChangeFamilyGroup: (familyId: string, group: string | null) => Promise<void>;
  setToast: (toast: { message: string; type: 'error' | 'success' | 'info' }) => void;
}

export function useCatalogueBulkActions({
  filteredFamilies,
  requireEditAccess,
  onDeleteFamily,
  onChangeFamilyGroup,
  setToast,
}: UseCatalogueBulkActionsArgs) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'group' | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkRenameOpen, setBulkRenameOpen] = useState(false);
  const [bulkGroupValue, setBulkGroupValue] = useState('');

  function toggleFamilySelect(familyId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(familyId)) next.delete(familyId);
      else next.add(familyId);
      return next;
    });
  }

  function toggleGroupSelect(familyIds: string[]) {
    setSelected((previous) => {
      const next = new Set(previous);
      const allSelected = familyIds.every((id) => next.has(id));
      familyIds.forEach((id) => { if (allSelected) next.delete(id); else next.add(id); });
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((previous) => {
      const next = new Set(previous);
      const allVisibleSelected = filteredFamilies.length > 0 && filteredFamilies.every((family) => next.has(family.id));
      filteredFamilies.forEach((family) => { if (allVisibleSelected) next.delete(family.id); else next.add(family.id); });
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkAction(null);
    setBulkGroupValue('');
  }

  async function handleBulkDelete() {
    if (!requireEditAccess()) return;
    if (selected.size === 0) return;
    for (const familyId of selected) {
      await onDeleteFamily(familyId);
    }
    clearSelection();
  }

  async function handleBulkChangeGroup(group: string) {
    if (!requireEditAccess()) return;
    const trimmedGroup = group.trim();
    if (selected.size === 0 || !trimmedGroup) return;
    for (const familyId of selected) {
      await onChangeFamilyGroup(familyId, trimmedGroup);
    }
    setToast({ message: `${selected.size} families moved to "${trimmedGroup}"`, type: 'success' });
    clearSelection();
  }

  return {
    selected,
    bulkAction,
    confirmDeleteOpen,
    bulkRenameOpen,
    bulkGroupValue,
    toggleFamilySelect,
    toggleGroupSelect,
    selectAllVisible,
    clearSelection,
    handleBulkDelete,
    handleBulkChangeGroup,
    setBulkAction,
    setConfirmDeleteOpen,
    setBulkRenameOpen,
    setBulkGroupValue,
  };
}
