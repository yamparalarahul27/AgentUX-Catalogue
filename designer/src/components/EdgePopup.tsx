import { useState, useEffect, useRef } from 'react';

export type ArrowDirection = 'forward' | 'backward' | 'both';

interface EdgePopupProps {
  x: number;
  y: number;
  label: string;
  arrowDirection: ArrowDirection;
  onChangeArrow: (dir: ArrowDirection) => void;
  onChangeLabel: (label: string) => void;
  onInsertPlaceholder?: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function EdgePopup({
  x,
  y,
  label,
  arrowDirection,
  onChangeArrow,
  onChangeLabel,
  onInsertPlaceholder,
  onDelete,
  onClose,
}: EdgePopupProps) {
  const [editLabel, setEditLabel] = useState(label);
  const [showLabelInput, setShowLabelInput] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    if (showLabelInput && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [showLabelInput]);

  function commitLabel() {
    onChangeLabel(editLabel.trim());
    setShowLabelInput(false);
  }

  return (
    <div
      ref={ref}
      className="edge-popup"
      style={{ left: x, top: y }}
    >
      <div className="edge-popup-section">
        <span className="edge-popup-label">Arrow</span>
        <div className="edge-popup-arrows">
          <button
            className={`edge-popup-arrow-btn ${arrowDirection === 'backward' ? 'active' : ''}`}
            onClick={() => onChangeArrow('backward')}
            title="Left arrow"
          >
            ←
          </button>
          <button
            className={`edge-popup-arrow-btn ${arrowDirection === 'forward' ? 'active' : ''}`}
            onClick={() => onChangeArrow('forward')}
            title="Right arrow"
          >
            →
          </button>
          <button
            className={`edge-popup-arrow-btn ${arrowDirection === 'both' ? 'active' : ''}`}
            onClick={() => onChangeArrow('both')}
            title="Both arrows"
          >
            ↔
          </button>
        </div>
      </div>

      <div className="edge-popup-section">
        {showLabelInput ? (
          <div className="edge-popup-label-input">
            <input
              ref={inputRef}
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitLabel();
                if (e.key === 'Escape') { setEditLabel(label); setShowLabelInput(false); }
              }}
              placeholder="Edge label..."
            />
          </div>
        ) : (
          <button
            className="edge-popup-text-btn"
            onClick={() => setShowLabelInput(true)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            {label ? `"${label}"` : 'Add label'}
          </button>
        )}
      </div>

      <div className="edge-popup-divider" />

      <button className="edge-popup-action-btn" onClick={onInsertPlaceholder} disabled={!onInsertPlaceholder}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 12h8" />
          <path d="M12 8v8" />
        </svg>
        Insert Placeholder
      </button>

      <div className="edge-popup-divider" />

      <button className="edge-popup-delete" onClick={onDelete}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
        Delete
      </button>
    </div>
  );
}
