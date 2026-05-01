import { CheckSquare, FolderInput, MinusSquare, Pencil, Trash2, TrendingUp, X } from 'lucide-react';

interface CatalogueBulkBarProps {
  filteredFamiliesCount: number;
  selectedCount: number;
  selectedVisibleCount: number;
  onClearSelection: () => void;
  onOpenGroupDialog: () => void;
  onOpenFlowDialog: () => void;
  onOpenDeleteConfirm: () => void;
  onOpenBulkRename: () => void;
  onSelectAllVisible: () => void;
}

export function CatalogueBulkBar({
  filteredFamiliesCount,
  selectedCount,
  selectedVisibleCount,
  onClearSelection,
  onOpenGroupDialog,
  onOpenFlowDialog,
  onOpenDeleteConfirm,
  onOpenBulkRename,
  onSelectAllVisible,
}: CatalogueBulkBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  const allSelected = selectedVisibleCount === filteredFamiliesCount && filteredFamiliesCount > 0;

  return (
    <div className="catalogue-bulk-bar">
      <div className="catalogue-bulk-left">
        <button type="button" className="catalogue-bulk-check" onClick={onSelectAllVisible}>
          {allSelected ? <CheckSquare size={14} /> : <MinusSquare size={14} />}
        </button>
        <span className="catalogue-bulk-count">{selectedCount} families selected</span>
      </div>

      <div className="catalogue-bulk-actions">
        <button type="button" className="catalogue-bulk-btn" onClick={onOpenBulkRename}>
          <Pencil size={14} />
          Rename
        </button>
        <button type="button" className="catalogue-bulk-btn" onClick={onOpenGroupDialog}>
          <FolderInput size={14} />
          Change Group
        </button>
        <button type="button" className="catalogue-bulk-btn" onClick={onOpenFlowDialog}>
          <TrendingUp size={14} />
          Change Flow
        </button>
        <button type="button" className="catalogue-bulk-btn catalogue-bulk-btn-danger" onClick={onOpenDeleteConfirm}>
          <Trash2 size={14} />
          Delete
        </button>
        <button type="button" className="catalogue-bulk-btn-close" onClick={onClearSelection}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
