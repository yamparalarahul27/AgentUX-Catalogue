import { useEffect, useMemo, useRef, useState } from 'react';

interface CatalogueBulkFlowDialogProps {
  allFlows: string[];
  selectedCount: number;
  value: string;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: (flow: string) => void;
  onRemove: () => void;
}

export function CatalogueBulkFlowDialog({
  allFlows,
  selectedCount,
  value,
  onValueChange,
  onCancel,
  onConfirm,
  onRemove,
}: CatalogueBulkFlowDialogProps) {
  const trimmed = value.trim();
  const [menuOpen, setMenuOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const { matches, exactMatch } = useMemo(() => {
    const query = trimmed.toLowerCase();
    const found = allFlows.find((flow) => flow.toLowerCase() === query);
    const subset = query
      ? allFlows.filter((flow) => flow.toLowerCase().includes(query))
      : allFlows;
    return { matches: subset.slice(0, 8), exactMatch: Boolean(found) };
  }, [allFlows, trimmed]);

  return (
    <div className="flow-assign-overlay" onClick={onCancel}>
      <div className="flow-assign-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Set flow for {selectedCount} famil{selectedCount === 1 ? 'y' : 'ies'}</h3>

        <div className="catalogue-flow-combobox" style={{ marginTop: 12 }}>
          <input
            ref={inputRef}
            className="catalogue-filter catalogue-quick-upload-flow-input"
            type="text"
            placeholder="Search or add flow (e.g. Onboarding)"
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
              {matches.map((flow) => (
                <button
                  key={flow}
                  type="button"
                  role="option"
                  aria-selected={flow === value}
                  className={`catalogue-flow-combobox__item ${flow === value ? 'is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onValueChange(flow);
                    setMenuOpen(false);
                  }}
                >
                  {flow}
                </button>
              ))}
              {trimmed && !exactMatch && (
                <div className="catalogue-flow-combobox__hint">
                  Press Enter to use new flow “{trimmed}”
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flow-assign-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-secondary" onClick={onRemove}>
            Remove flow from {selectedCount}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!trimmed}
            onClick={() => onConfirm(value)}
          >
            Set flow to "{trimmed || '...'}"
          </button>
        </div>
      </div>
    </div>
  );
}
