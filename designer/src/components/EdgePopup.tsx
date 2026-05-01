import { useState, useEffect, useRef } from 'react';
import { Pencil, SquarePlus, Trash2 } from 'lucide-react';

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
            <Pencil size={12} />
            {label ? `"${label}"` : 'Add label'}
          </button>
        )}
      </div>

      <div className="edge-popup-divider" />

      <button className="edge-popup-action-btn" onClick={onInsertPlaceholder} disabled={!onInsertPlaceholder}>
        <SquarePlus size={12} />
        Insert Placeholder
      </button>

      <div className="edge-popup-divider" />

      <button className="edge-popup-delete" onClick={onDelete}>
        <Trash2 size={12} />
        Delete
      </button>
    </div>
  );
}
