import { useEffect, useMemo, useRef, useState } from 'react';

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
  const [menuOpen, setMenuOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const { matches, exactMatch } = useMemo(() => {
    const query = trimmed.toLowerCase();
    const found = allGroups.find((group) => group.toLowerCase() === query);
    const subset = query
      ? allGroups.filter((group) => group.toLowerCase().includes(query))
      : allGroups;
    return { matches: subset.slice(0, 8), exactMatch: Boolean(found) };
  }, [allGroups, trimmed]);

  return (
    <div className="flow-assign-overlay" onClick={onCancel}>
      <div className="flow-assign-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Move {selectedCount} famil{selectedCount === 1 ? 'y' : 'ies'} to Group</h3>

        <div className="catalogue-flow-combobox" style={{ marginTop: 12 }}>
          <input
            ref={inputRef}
            className="catalogue-filter catalogue-quick-upload-flow-input"
            type="text"
            placeholder="Search or add group (e.g. Coinbase)"
            value={value}
            onChange={(event) => {
              onValueChange(event.target.value);
              setMenuOpen(true);
            }}
            onFocus={() => setMenuOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && trimmed) {
                event.preventDefault();
                onConfirm(value);
              }
            }}
            autoComplete="off"
          />
          {menuOpen && (matches.length > 0 || trimmed) && (
            <div className="catalogue-flow-combobox__menu" role="listbox">
              {matches.map((group) => (
                <button
                  key={group}
                  type="button"
                  role="option"
                  aria-selected={group === value}
                  className={`catalogue-flow-combobox__item ${group === value ? 'is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onValueChange(group);
                    setMenuOpen(false);
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {group}
                  </span>
                  {primaryGroup === group && (
                    <span className="catalogue-upload-group-primary">Primary</span>
                  )}
                </button>
              ))}
              {trimmed && !exactMatch && (
                <div className="catalogue-flow-combobox__hint">
                  Press Enter to use new group “{trimmed}”
                </div>
              )}
            </div>
          )}
        </div>

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
