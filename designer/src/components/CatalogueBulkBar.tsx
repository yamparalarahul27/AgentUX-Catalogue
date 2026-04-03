interface CatalogueBulkBarProps {
  filteredFamiliesCount: number;
  selectedCount: number;
  selectedVisibleCount: number;
  onClearSelection: () => void;
  onOpenGroupDialog: () => void;
  onOpenDeleteConfirm: () => void;
  onSelectAllVisible: () => void;
}

export function CatalogueBulkBar({
  filteredFamiliesCount,
  selectedCount,
  selectedVisibleCount,
  onClearSelection,
  onOpenGroupDialog,
  onOpenDeleteConfirm,
  onSelectAllVisible,
}: CatalogueBulkBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="catalogue-bulk-bar">
      <div className="catalogue-bulk-left">
        <button type="button" className="catalogue-bulk-check" onClick={onSelectAllVisible}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {selectedVisibleCount === filteredFamiliesCount && filteredFamiliesCount > 0
              ? <><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" /><polyline points="9 11 12 14 20 6" stroke="#0f0f10" strokeWidth="3" /></>
              : <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="12" x2="16" y2="12" /></>}
          </svg>
        </button>
        <span className="catalogue-bulk-count">{selectedCount} families selected</span>
      </div>

      <div className="catalogue-bulk-actions">
        <button type="button" className="catalogue-bulk-btn" onClick={onOpenGroupDialog}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
          Change Group
        </button>
        <button type="button" className="catalogue-bulk-btn catalogue-bulk-btn-danger" onClick={onOpenDeleteConfirm}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
          Delete
        </button>
        <button type="button" className="catalogue-bulk-btn-close" onClick={onClearSelection}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
