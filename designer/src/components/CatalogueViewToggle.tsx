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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </button>

      <button
        type="button"
        className={`catalogue-view-toggle__btn ${value === 'list' ? 'is-active' : ''}`}
        onClick={() => onChange('list')}
        title="List view"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="4" cy="6" r="1.5" />
          <circle cx="4" cy="12" r="1.5" />
          <circle cx="4" cy="18" r="1.5" />
        </svg>
      </button>

      <button
        type="button"
        className={`catalogue-view-toggle__btn ${value === 'gallery' ? 'is-active' : ''}`}
        onClick={() => onChange('gallery')}
        title="Gallery view"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="14" rx="2" />
          <line x1="3" y1="21" x2="21" y2="21" />
          <line x1="8" y1="21" x2="8" y2="17" />
          <line x1="16" y1="21" x2="16" y2="17" />
        </svg>
      </button>
    </div>
  );
}
