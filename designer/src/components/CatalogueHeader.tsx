import { useEffect, useRef, useState } from 'react';

import agentuxLogo from '../assets/agentux-logo.svg';

type CatalogueSection =
  | 'catalogue'
  | 'videos'
  | 'links'
  | 'team';

interface CatalogueHeaderProps {
  activeSection: CatalogueSection;
  canViewTeam: boolean;
  onOpenSettings: () => void;
  onSectionChange: (section: CatalogueSection) => void;
}

export function CatalogueHeader({
  activeSection,
  canViewTeam,
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
          className={`catalogue-header__tab ${activeSection === 'links' ? 'is-active' : ''}`}
          aria-selected={activeSection === 'links'}
          onClick={() => onSectionChange('links')}
          data-short="L"
        >
          Links
        </button>
      </div>

      <button
        ref={menuButtonRef}
        type="button"
        className={`catalogue-header__settings catalogue-header__menu-trigger ${activeSection !== 'catalogue' && activeSection !== 'videos' && activeSection !== 'links' ? 'is-active' : ''}`}
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
        </div>
      )}
    </header>
  );
}
