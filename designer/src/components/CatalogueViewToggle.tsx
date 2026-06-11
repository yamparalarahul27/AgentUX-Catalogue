import { Image, LayoutGrid, Rows3 } from 'lucide-react';

import { IconTooltip, IconTooltipProvider } from './IconTooltip';
import type { CatalogueViewMode } from '../lib/catalogue-view';

interface CatalogueViewToggleProps {
  value: CatalogueViewMode;
  onChange: (view: CatalogueViewMode) => void;
  // Per-user toolbar prefs. Grid is always shown; Stack and Gallery
  // can be hidden individually from Settings → Toolbar.
  hideStack?: boolean;
  hideGallery?: boolean;
}

export function CatalogueViewToggle({
  value,
  onChange,
  hideStack = false,
  hideGallery = false,
}: CatalogueViewToggleProps) {
  // If the active view was hidden after a settings change, the user
  // sees nothing for that mode in the UI; the rest of the catalogue
  // still honors the value. Showing the Grid button always means
  // there's a way back to a visible state with one click.
  return (
    <IconTooltipProvider>
      <div className="catalogue-view-toggle" role="group" aria-label="Catalogue view mode">
        <IconTooltip label="Grid view">
          <button
            type="button"
            className={`catalogue-view-toggle__btn ${value === 'grid' ? 'is-active' : ''}`}
            onClick={() => onChange('grid')}
            aria-label="Grid view"
          >
            <LayoutGrid size={16} />
          </button>
        </IconTooltip>

        {!hideStack && (
          <IconTooltip label="Stack view — inline comments & annotations">
            <button
              type="button"
              className={`catalogue-view-toggle__btn ${value === 'stack' ? 'is-active' : ''}`}
              onClick={() => onChange('stack')}
              aria-label="Stack view — inline comments & annotations"
            >
              <Rows3 size={16} />
            </button>
          </IconTooltip>
        )}

        {!hideGallery && (
          <IconTooltip label="Gallery view">
            <button
              type="button"
              className={`catalogue-view-toggle__btn ${value === 'gallery' ? 'is-active' : ''}`}
              onClick={() => onChange('gallery')}
              aria-label="Gallery view"
            >
              <Image size={16} />
            </button>
          </IconTooltip>
        )}
      </div>
    </IconTooltipProvider>
  );
}
