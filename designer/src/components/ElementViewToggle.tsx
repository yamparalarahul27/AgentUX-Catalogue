import { Image as ImageIcon, Crop } from 'lucide-react';
import type { ElementViewMode } from '../hooks/use-element-view-mode';

interface ElementViewToggleProps {
  mode: ElementViewMode;
  onChange: (next: ElementViewMode) => void;
}

// Pill toggle between Full / Cropped views on Elements surfaces.
// Persisted per-page by the consuming useElementViewMode hook.
export function ElementViewToggle({ mode, onChange }: ElementViewToggleProps) {
  return (
    <div className="element-view-toggle" role="tablist" aria-label="View mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'full'}
        className={`element-view-toggle__btn${mode === 'full' ? ' is-active' : ''}`}
        onClick={() => onChange('full')}
        title="Show full screenshots"
      >
        <ImageIcon size={13} aria-hidden="true" />
        <span>Full</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'cropped'}
        className={`element-view-toggle__btn${mode === 'cropped' ? ' is-active' : ''}`}
        onClick={() => onChange('cropped')}
        title="Crop each screenshot to just the element's bounding box"
      >
        <Crop size={13} aria-hidden="true" />
        <span>Cropped</span>
      </button>
    </div>
  );
}
