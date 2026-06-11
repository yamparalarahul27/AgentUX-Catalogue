import { Image as ImageIcon, Crop } from 'lucide-react';

import { IconTooltip, IconTooltipProvider } from './IconTooltip';
import type { ElementViewMode } from '../hooks/use-element-view-mode';

interface ElementViewToggleProps {
  mode: ElementViewMode;
  onChange: (next: ElementViewMode) => void;
}

// Pill toggle between Full / Cropped views on Elements surfaces.
// Persisted per-page by the consuming useElementViewMode hook.
export function ElementViewToggle({ mode, onChange }: ElementViewToggleProps) {
  return (
    <IconTooltipProvider>
      <div className="element-view-toggle" role="tablist" aria-label="View mode">
        <IconTooltip label="Show full screenshots">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'full'}
            className={`element-view-toggle__btn${mode === 'full' ? ' is-active' : ''}`}
            onClick={() => onChange('full')}
          >
            <ImageIcon size={13} aria-hidden="true" />
            <span>Full</span>
          </button>
        </IconTooltip>
        <IconTooltip label="Crop each screenshot to just the element's bounding box">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'cropped'}
            className={`element-view-toggle__btn${mode === 'cropped' ? ' is-active' : ''}`}
            onClick={() => onChange('cropped')}
          >
            <Crop size={13} aria-hidden="true" />
            <span>Cropped</span>
          </button>
        </IconTooltip>
      </div>
    </IconTooltipProvider>
  );
}
