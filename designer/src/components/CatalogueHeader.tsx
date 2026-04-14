import { useEffect, useRef, useState } from 'react';

import agentuxLogo from '../assets/agentux-logo.svg';

type CatalogueSection =
  | 'catalogue'
  | 'feature-log'
  | 'videos'
  | 'figma'
  | 'team'
  | 'archive-flow-builder'
  | 'archive-projects';

interface CatalogueHeaderProps {
  activeSection: CatalogueSection;
  canViewTeam: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  onSectionChange: (section: CatalogueSection) => void;
}

function isPrimarySection(section: CatalogueSection): boolean {
  return section === 'catalogue' || section === 'feature-log' || section === 'videos';
}

export function CatalogueHeader({
  activeSection,
  canViewTeam,
  onBack,
  onOpenSettings,
  onSectionChange,
}: CatalogueHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        menuButtonRef.current && !menuButtonRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  function openSection(section: CatalogueSection) {
    onSectionChange(section);
    setMenuOpen(false);
  }

  function openSettings() {
    onOpenSettings();
    setMenuOpen(false);
  }

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
          className={`catalogue-header__tab ${activeSection === 'feature-log' ? 'is-active' : ''}`}
          aria-selected={activeSection === 'feature-log'}
          onClick={() => onSectionChange('feature-log')}
          data-short="F"
        >
          Feature Log
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
      </div>

      <button
        ref={menuButtonRef}
        type="button"
        className={`catalogue-header__settings catalogue-header__menu-trigger ${!isPrimarySection(activeSection) ? 'is-active' : ''}`}
        aria-label="Open catalogue menu"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((previous) => !previous)}
      >
        <span aria-hidden="true">☰</span>
      </button>

      {menuOpen && (
        <div ref={menuRef} className="catalogue-header-menu" role="menu" aria-label="Catalogue menu">
          <button type="button" className="catalogue-header-menu__item" role="menuitem" onClick={openSettings}>
            Settings
          </button>

          <button
            type="button"
            className={`catalogue-header-menu__item ${activeSection === 'figma' ? 'is-active' : ''}`}
            role="menuitem"
            onClick={() => openSection('figma')}
          >
            Figma
          </button>

          {canViewTeam && (
            <button
              type="button"
              className={`catalogue-header-menu__item ${activeSection === 'team' ? 'is-active' : ''}`}
              role="menuitem"
              onClick={() => openSection('team')}
            >
              Team
            </button>
          )}

          <div className="catalogue-header-menu__divider" />
          <div className="catalogue-header-menu__label">Archive</div>

          <button
            type="button"
            className={`catalogue-header-menu__item ${activeSection === 'archive-flow-builder' ? 'is-active' : ''}`}
            role="menuitem"
            onClick={() => openSection('archive-flow-builder')}
          >
            Flow Builder
          </button>

          <button
            type="button"
            className={`catalogue-header-menu__item ${activeSection === 'archive-projects' ? 'is-active' : ''}`}
            role="menuitem"
            onClick={() => openSection('archive-projects')}
          >
            Projects
          </button>
        </div>
      )}
    </header>
  );
}
