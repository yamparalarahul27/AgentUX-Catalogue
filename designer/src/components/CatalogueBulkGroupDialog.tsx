interface CatalogueBulkGroupDialogProps {
  allGroups: string[];
  primaryGroup: string | null;
  selectedCount: number;
  value: string;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: (group: string) => void;
}

export function CatalogueBulkGroupDialog({
  allGroups,
  primaryGroup,
  selectedCount,
  value,
  onValueChange,
  onCancel,
  onConfirm,
}: CatalogueBulkGroupDialogProps) {
  const trimmed = value.trim();
  return (
    <div className="flow-assign-overlay" onClick={onCancel}>
      <div className="flow-assign-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Move {selectedCount} families to Group</h3>
        <div className="catalogue-upload-groups" style={{ marginTop: 12 }}>
          {allGroups.map((group) => (
            <button
              key={group}
              type="button"
              className={`catalogue-upload-group-chip ${value === group ? 'active' : ''}`}
              onClick={() => onValueChange(group)}
            >
              {group}
              {primaryGroup === group && <span className="catalogue-upload-group-primary">Primary</span>}
            </button>
          ))}
        </div>
        <input
          className="catalogue-filter"
          style={{ width: '100%', marginTop: 12 }}
          type="text"
          placeholder="Or type a new group name..."
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <div className="flow-assign-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!trimmed}
            onClick={() => onConfirm(value)}
          >
            Move to "{trimmed || '...'}"
          </button>
        </div>
      </div>
    </div>
  );
}
