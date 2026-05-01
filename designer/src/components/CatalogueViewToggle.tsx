import { Image, LayoutGrid, Rows3 } from 'lucide-react';

import type { CatalogueViewMode } from '../lib/catalogue-view';

interface CatalogueViewToggleProps {
  value: CatalogueViewMode;
  onChange: (view: CatalogueViewMode) => void;
}

export function CatalogueViewToggle({ value, onChange }: CatalogueViewToggleProps) {
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

      <button
        type="button"
        className={`catalogue-view-toggle__btn ${value === 'stack' ? 'is-active' : ''}`}
        onClick={() => onChange('stack')}
        title="Stack view — inline comments & annotations"
      >
        <Rows3 size={16} />
      </button>

      <button
        type="button"
        className={`catalogue-view-toggle__btn ${value === 'gallery' ? 'is-active' : ''}`}
        onClick={() => onChange('gallery')}
        title="Gallery view"
      >
        <Image size={16} />
      </button>
    </div>
  );
}
