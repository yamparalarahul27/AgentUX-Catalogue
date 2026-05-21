import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Link as LinkIcon,
  LogIn,
  LogOut,
  MonitorCog,
  MoreHorizontal,
  Save,
  Settings,
  Sparkles,
  Star,
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
  canLabelingStudio: boolean;
  onOpenSettings: () => void;
  onSectionChange: (section: CatalogueSection) => void;
  userEmail: string | null;
  onSignIn: () => void;
  onLogout: () => void;
  onLogoutEverywhere: () => void;
  myBookmarksActive: boolean;
  onToggleMyBookmarks: () => void;
  // What's New panel trigger — pulsing dot when there are unseen releases.
  onOpenWhatsNew: () => void;
  whatsNewUnseenCount: number;
}

function usernameOf(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

export function CatalogueHeader({
  activeSection,
  canAdmin,
  canLabelingStudio,
  onOpenSettings,
  onSectionChange,
  userEmail,
  onSignIn,
  onLogout,
  onLogoutEverywhere,
  myBookmarksActive,
  onToggleMyBookmarks,
  onOpenWhatsNew,
  whatsNewUnseenCount,
}: CatalogueHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutMoreOpen, setLogoutMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const viewportWidth = useViewportWidth();
  // Studio entry: open to anyone with the labeling_studio capability (admins
  // and ResearcherAI), not just admins. The viewport gate stays — the Studio
  // is a desktop-only surface.
  const showStudioEntry =
    canLabelingStudio && LABELING_STUDIO_ENABLED && viewportWidth >= LABELING_STUDIO_MIN_VIEWPORT_PX;
  // Mobile header: shorten the identity pill to the first letter of the
  // username so the absolute-centered tabs pill has room on the right and
  // doesn't overlap. Threshold matches the tab-collapse rule (900px).
  const isNarrowHeader = viewportWidth < 900;
  const username = userEmail ? usernameOf(userEmail) : '';
  const visibleUsername = isNarrowHeader && username ? username.charAt(0).toUpperCase() : username;

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

  function openSettings() {
    onOpenSettings();
    setMenuOpen(false);
  }

  function goToTeamSettings() {
    onSectionChange('team');
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
          className={`catalogue-header__tab catalogue-header__tab--icon ${activeSection === 'links' ? 'is-active' : ''}`}
          aria-selected={activeSection === 'links'}
          aria-label="Links"
          title="Links"
          onClick={() => onSectionChange('links')}
        >
          <LinkIcon size={15} aria-hidden="true" />
        </button>
        {showStudioEntry && (
          <button
            type="button"
            role="tab"
            className={`catalogue-header__tab catalogue-header__tab--icon ${activeSection === 'studio' ? 'is-active' : ''}`}
            aria-selected={activeSection === 'studio'}
            aria-label="Labelling Studio (for AI)"
            title="Labelling Studio · for AI"
            onClick={() => onSectionChange('studio')}
          >
            <Sparkles size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="catalogue-header__right">
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
            <span className="catalogue-identity-pill__name">{visibleUsername}</span>
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

        {userEmail && (
          <button
            type="button"
            className="catalogue-header__icon-btn catalogue-header__sparkles-btn"
            aria-label={whatsNewUnseenCount > 0 ? `What's new (${whatsNewUnseenCount} new)` : "What's new"}
            title={whatsNewUnseenCount > 0 ? `What's new · ${whatsNewUnseenCount} new` : "What's new"}
            onClick={onOpenWhatsNew}
          >
            <Star size={15} aria-hidden="true" />
            {whatsNewUnseenCount > 0 && (
              <span className="catalogue-header__sparkles-dot" aria-hidden="true" />
            )}
          </button>
        )}

        {userEmail && canAdmin && !isNarrowHeader && (
          <button
            type="button"
            className={`catalogue-header__icon-btn ${activeSection === 'team' ? 'is-active' : ''}`}
            aria-label="Settings"
            title="Settings"
            onClick={() => onSectionChange('team')}
          >
            <Settings size={15} aria-hidden="true" />
          </button>
        )}
      </div>

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
            <Save size={14} aria-hidden="true" />
            Saved
          </button>

          <div className="catalogue-header-menu__divider" role="presentation" />

          {canAdmin && (
            <button
              type="button"
              className={`catalogue-header-menu__item catalogue-header-menu__item--row ${activeSection === 'team' ? 'is-active' : ''}`}
              role="menuitem"
              onClick={goToTeamSettings}
            >
              <Settings size={14} aria-hidden="true" />
              <span>Settings</span>
            </button>
          )}

          <button
            type="button"
            className="catalogue-header-menu__item catalogue-header-menu__item--row"
            role="menuitem"
            onClick={openSettings}
          >
            <MonitorCog size={14} aria-hidden="true" />
            <span>Web Breakpoints Settings</span>
          </button>

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
