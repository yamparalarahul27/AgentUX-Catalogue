import { Image, LayoutGrid, Rows3 } from 'lucide-react';

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
    <div className="catalogue-view-toggle" role="group" aria-label="Catalogue view mode">
      <button
        type="button"
        className={`catalogue-view-toggle__btn ${value === 'grid' ? 'is-active' : ''}`}
        onClick={() => onChange('grid')}
        title="Grid view"
      >
        <LayoutGrid size={16} />
      </button>

      {!hideStack && (
        <button
          type="button"
          className={`catalogue-view-toggle__btn ${value === 'stack' ? 'is-active' : ''}`}
          onClick={() => onChange('stack')}
          title="Stack view — inline comments & annotations"
        >
          <Rows3 size={16} />
        </button>
      )}

      {!hideGallery && (
        <button
          type="button"
          className={`catalogue-view-toggle__btn ${value === 'gallery' ? 'is-active' : ''}`}
          onClick={() => onChange('gallery')}
          title="Gallery view"
        >
          <Image size={16} />
        </button>
      )}
    </div>
  );
}
