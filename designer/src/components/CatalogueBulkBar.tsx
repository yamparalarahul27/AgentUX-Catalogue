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
  const countLabel = `${selectedCount} ${selectedCount === 1 ? 'family' : 'families'} selected`;

  return (
    <div className="catalogue-bulk-bar">
      <div className="catalogue-bulk-left">
        <button type="button" className="catalogue-bulk-check" onClick={onSelectAllVisible}>
          {allSelected ? <CheckSquare size={14} /> : <MinusSquare size={14} />}
        </button>
        <span className="catalogue-bulk-count">{countLabel}</span>
      </div>

      <div className="catalogue-bulk-actions">
        <button type="button" className="catalogue-bulk-btn" onClick={onOpenBulkRename} aria-label="Rename" title="Rename">
          <Pencil size={14} />
          <span className="catalogue-bulk-btn__label">Rename</span>
        </button>
        <button type="button" className="catalogue-bulk-btn" onClick={onOpenGroupDialog} aria-label="Change group" title="Change group">
          <FolderInput size={14} />
          <span className="catalogue-bulk-btn__label">Change Group</span>
        </button>
        <button type="button" className="catalogue-bulk-btn" onClick={onOpenFlowDialog} aria-label="Change flow" title="Change flow">
          <TrendingUp size={14} />
          <span className="catalogue-bulk-btn__label">Change Flow</span>
        </button>
        <button type="button" className="catalogue-bulk-btn catalogue-bulk-btn-danger" onClick={onOpenDeleteConfirm} aria-label="Delete" title="Delete">
          <Trash2 size={14} />
          <span className="catalogue-bulk-btn__label">Delete</span>
        </button>
      </div>

      <button type="button" className="catalogue-bulk-btn-close" onClick={onClearSelection} aria-label="Clear selection" title="Clear selection">
        <X size={16} />
      </button>
    </div>
  );
}
