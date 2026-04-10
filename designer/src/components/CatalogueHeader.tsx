import agentuxLogo from '../assets/agentux-logo.svg';

type CatalogueSection = 'catalogue' | 'videos' | 'figma' | 'team';

interface CatalogueHeaderProps {
  activeSection: CatalogueSection;
  canViewTeam: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  onSectionChange: (section: CatalogueSection) => void;
}

export function CatalogueHeader({
  activeSection,
  canViewTeam,
  onBack,
  onOpenSettings,
  onSectionChange,
}: CatalogueHeaderProps) {
  return (
    <header className="catalogue-header catalogue-header--centered">
      <button className="catalogue-back" onClick={onBack} title="Back to projects">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="catalogue-header__title">
        <img src={agentuxLogo} alt="AgentUX logo" className="catalogue-header-logo" />
      </div>

      <div className="catalogue-header__tabs" role="tablist" aria-label="Catalogue sections">
        <button
          type="button"
          role="tab"
          className={`catalogue-header__tab ${activeSection === 'catalogue' ? 'is-active' : ''}`}
          aria-selected={activeSection === 'catalogue'}
          onClick={() => onSectionChange('catalogue')}
          data-short="C"
        >
          Catalogue
        </button>
        <button
          type="button"
          role="tab"
          className={`catalogue-header__tab ${activeSection === 'videos' ? 'is-active' : ''}`}
          aria-selected={activeSection === 'videos'}
          onClick={() => onSectionChange('videos')}
          data-short="V"
        >
          Videos
        </button>
        <button
          type="button"
          role="tab"
          className={`catalogue-header__tab ${activeSection === 'figma' ? 'is-active' : ''}`}
          aria-selected={activeSection === 'figma'}
          onClick={() => onSectionChange('figma')}
          data-short="F"
        >
          Figma
        </button>
        {canViewTeam && (
          <button
            type="button"
            role="tab"
            className={`catalogue-header__tab ${activeSection === 'team' ? 'is-active' : ''}`}
            aria-selected={activeSection === 'team'}
            onClick={() => onSectionChange('team')}
            data-short="T"
          >
            Team
          </button>
        )}
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
