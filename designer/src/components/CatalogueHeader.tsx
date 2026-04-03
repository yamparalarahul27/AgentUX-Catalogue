interface CatalogueHeaderProps {
  onBack: () => void;
  onOpenSettings: () => void;
}

export function CatalogueHeader({ onBack, onOpenSettings }: CatalogueHeaderProps) {
  return (
    <header className="catalogue-header catalogue-header--centered">
      <button className="catalogue-back" onClick={onBack} title="Back to projects">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="catalogue-header__title">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
          <path d="M3 7l6-4 6 4 6-4v14l-6 4-6-4-6 4V7z" />
          <path d="M9 3v14" />
          <path d="M15 7v14" />
        </svg>
        <h1>Catalogue</h1>
      </div>

      <button
        type="button"
        className="catalogue-header__settings"
        onClick={onOpenSettings}
        aria-label="Open catalogue settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82 2 2 0 1 1-2.83 2.83 1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51 2 2 0 1 1-4 0 1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33 2 2 0 1 1-2.83-2.83 1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1 2 2 0 1 1 0-4 1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82 2 2 0 1 1 2.83-2.83 1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 .92-1.51 2 2 0 1 1 4 0 1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33 2 2 0 1 1 2.83 2.83 1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51.92 2 2 0 1 1 0 4 1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </header>
  );
}
