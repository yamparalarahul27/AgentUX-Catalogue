import { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  LogIn,
  LogOut,
  MonitorCog,
  MoreHorizontal,
  Settings,
  Tags,
} from 'lucide-react';

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
  onLogoutEverywhere: () => void;
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
  onLogoutEverywhere,
  myBookmarksActive,
  onToggleMyBookmarks,
}: CatalogueHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutMoreOpen, setLogoutMoreOpen] = useState(false);
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
    setLogoutMoreOpen(false);
  }

  function handleLogoutEverywhere() {
    onLogoutEverywhere();
    setMenuOpen(false);
    setLogoutMoreOpen(false);
  }

  // Reset the inline "Logout everywhere" sub-menu whenever the parent
  // account menu closes so it doesn't auto-expand next time.
  useEffect(() => {
    if (!menuOpen) setLogoutMoreOpen(false);
  }, [menuOpen]);

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

          <button
            type="button"
            className="catalogue-header-menu__item catalogue-header-menu__item--row"
            role="menuitem"
            onClick={openSettings}
          >
            <MonitorCog size={14} aria-hidden="true" />
            <span>Web Breakpoints Settings</span>
          </button>

          {canAdmin && (
            <button
              type="button"
              className={`catalogue-header-menu__item catalogue-header-menu__item--row ${activeSection === 'team' ? 'is-active' : ''}`}
              role="menuitem"
              onClick={() => openSection('team')}
            >
              <Settings size={14} aria-hidden="true" />
              <span>Settings</span>
            </button>
          )}

          {showStudioEntry && (
            <button
              type="button"
              className={`catalogue-header-menu__item catalogue-header-menu__item--row ${activeSection === 'studio' ? 'is-active' : ''}`}
              role="menuitem"
              onClick={() => openSection('studio')}
            >
              <Tags size={14} aria-hidden="true" />
              <span>Labelling Studio</span>
              <span className="catalogue-header-menu__tag">For AI</span>
            </button>
          )}

          <div className="catalogue-header-menu__divider" role="presentation" />

          <div className="catalogue-header-menu__logout-row">
            <button
              type="button"
              className="catalogue-header-menu__item catalogue-header-menu__item--row catalogue-header-menu__item--danger catalogue-header-menu__logout-main"
              role="menuitem"
              onClick={handleLogout}
            >
              <LogOut size={14} aria-hidden="true" />
              <span>Logout</span>
            </button>
            <button
              type="button"
              className={`catalogue-header-menu__logout-more${logoutMoreOpen ? ' is-open' : ''}`}
              aria-label="More logout options"
              aria-expanded={logoutMoreOpen}
              aria-haspopup="menu"
              onClick={() => setLogoutMoreOpen((previous) => !previous)}
            >
              <MoreHorizontal size={14} aria-hidden="true" />
            </button>
          </div>

          {logoutMoreOpen && (
            <button
              type="button"
              className="catalogue-header-menu__item catalogue-header-menu__item--row catalogue-header-menu__item--danger catalogue-header-menu__item--nested"
              role="menuitem"
              onClick={handleLogoutEverywhere}
            >
              <LogOut size={14} aria-hidden="true" />
              <span>Logout everywhere</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
}
