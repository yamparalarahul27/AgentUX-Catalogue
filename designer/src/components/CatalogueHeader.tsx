import { useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronDown, LogIn } from 'lucide-react';

import agentuxLogo from '../assets/agentux-logo.svg';
import { LABELING_STUDIO_ENABLED, LABELING_STUDIO_MIN_VIEWPORT_PX } from '../lib/feature-flags';
import { useViewportWidth } from '../hooks/use-viewport-width';

type CatalogueSection =
  | 'catalogue'
  | 'videos'
  | 'links'
  | 'team'
  | 'studio';

interface CatalogueHeaderProps {
  activeSection: CatalogueSection;
  canAdmin: boolean;
  onOpenSettings: () => void;
  onSectionChange: (section: CatalogueSection) => void;
  userEmail: string | null;
  onSignIn: () => void;
  onLogout: () => void;
  myBookmarksActive: boolean;
  onToggleMyBookmarks: () => void;
}

function usernameOf(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

export function CatalogueHeader({
  activeSection,
  canAdmin,
  onOpenSettings,
  onSectionChange,
  userEmail,
  onSignIn,
  onLogout,
  myBookmarksActive,
  onToggleMyBookmarks,
}: CatalogueHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const viewportWidth = useViewportWidth();
  const showStudioEntry =
    canAdmin && LABELING_STUDIO_ENABLED && viewportWidth >= LABELING_STUDIO_MIN_VIEWPORT_PX;

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        pillRef.current && !pillRef.current.contains(target)
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

  function toggleMyBookmarks() {
    onToggleMyBookmarks();
    setMenuOpen(false);
  }

  function handleLogout() {
    onLogout();
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

      {userEmail ? (
        <button
          ref={pillRef}
          type="button"
          className={`catalogue-identity-pill ${canAdmin ? 'is-admin' : ''} ${menuOpen ? 'is-open' : ''}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((previous) => !previous)}
          title={userEmail}
        >
          <span className="catalogue-identity-pill__name">{usernameOf(userEmail)}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          className="catalogue-identity-pill catalogue-identity-pill--signin"
          onClick={onSignIn}
        >
          <LogIn size={14} aria-hidden="true" />
          <span>Sign in</span>
        </button>
      )}

      {menuOpen && userEmail && (
        <div ref={menuRef} className="catalogue-header-menu" role="menu" aria-label="Account menu">
          <div className="catalogue-header-menu__meta" role="presentation">
            Signed in as
            <span className="catalogue-header-menu__meta-value">{userEmail}</span>
          </div>

          <div className="catalogue-header-menu__divider" role="presentation" />

          <button
            type="button"
            className={`catalogue-header-menu__item catalogue-header-menu__item--row ${myBookmarksActive ? 'is-active' : ''}`}
            role="menuitemcheckbox"
            aria-checked={myBookmarksActive}
            onClick={toggleMyBookmarks}
          >
            <Bookmark size={14} aria-hidden="true" />
            My bookmarks
          </button>

          <div className="catalogue-header-menu__divider" role="presentation" />

          <button type="button" className="catalogue-header-menu__item" role="menuitem" onClick={openSettings}>
            Web Breakpoints Settings
          </button>

          {canAdmin && (
            <button
              type="button"
              className={`catalogue-header-menu__item ${activeSection === 'team' ? 'is-active' : ''}`}
              role="menuitem"
              onClick={() => openSection('team')}
            >
              Settings
            </button>
          )}

          {showStudioEntry && (
            <button
              type="button"
              className={`catalogue-header-menu__item catalogue-header-menu__item--row ${activeSection === 'studio' ? 'is-active' : ''}`}
              role="menuitem"
              onClick={() => openSection('studio')}
            >
              <span>Labelling Studio</span>
              <span className="catalogue-header-menu__tag">For AI</span>
            </button>
          )}

          <div className="catalogue-header-menu__divider" role="presentation" />

          <button
            type="button"
            className="catalogue-header-menu__item catalogue-header-menu__item--danger"
            role="menuitem"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      )}
    </header>
  );
}
