import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Component,
  Frame,
  History,
  Keyboard,
  LogIn,
  LogOut,
  SlidersHorizontal,
  MoreHorizontal,
  MousePointerClick,
  Power,
  Save,
  Settings,
  Sparkles,
  Vibrate,
  Volume2,
} from 'lucide-react';

import agentuxMark from '../assets/agentux-mark.svg';
import { LABELING_STUDIO_ENABLED, LABELING_STUDIO_MIN_VIEWPORT_PX } from '../lib/feature-flags';
import { useViewportWidth } from '../hooks/use-viewport-width';
import { useCanvasGalleryEnabled } from '../lib/canvas-gallery-prefs';
import {
  useBootSoundEnabled,
  useClickSoundEnabled,
  useHapticsEnabled,
  useSoundEnabled,
} from '../lib/feedback-prefs';
import { IconTooltip, IconTooltipProvider } from './IconTooltip';
import { NotificationBell } from './NotificationBell';
import { useTypingKeycapEnabled } from './TypingKeycap';

type CatalogueSection =
  | 'catalogue'
  | 'elements'
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
  const [typingKeycapEnabled, setTypingKeycapEnabled] = useTypingKeycapEnabled();
  const [canvasGalleryEnabled, setCanvasGalleryEnabled] = useCanvasGalleryEnabled();
  const [soundEnabled, setSoundEnabled] = useSoundEnabled();
  const [clickSoundEnabled, setClickSoundEnabled] = useClickSoundEnabled();
  const [bootSoundEnabled, setBootSoundEnabled] = useBootSoundEnabled();
  const [hapticsEnabled, setHapticsEnabled] = useHapticsEnabled();
  const menuRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const viewportWidth = useViewportWidth();
  // Studio entry: open to anyone with the labeling_studio capability (admins
  // and ResearcherAI), not just admins. The viewport gate stays — the Studio
  // is a desktop-only surface.
  const showStudioEntry =
    canLabelingStudio && LABELING_STUDIO_ENABLED && viewportWidth >= LABELING_STUDIO_MIN_VIEWPORT_PX;
  // Elements browse view isn't responsive-ready yet — drill-in grid +
  // sub-tabs + drilldown filters all assume desktop widths. Hide the
  // entry on mobile so users can't land somewhere broken.
  const showElementsEntry = viewportWidth >= 768;

  // Sliding tab indicator. Each tab button registers its ref into
  // `tabRefs`; on activeSection change (or container resize), we
  // measure the active tab's bounding box relative to the strip and
  // update `tabIndicator`, which CSS transitions render as a smooth
  // slide. The static background on `.is-active` is gone — the
  // indicator span owns it now.
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const [tabIndicator, setTabIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    function measure() {
      const container = tabsRef.current;
      const activeBtn = tabRefs.current.get(activeSection);
      if (!container || !activeBtn) {
        setTabIndicator(null);
        return;
      }
      // Use offsetLeft / offsetWidth (not getBoundingClientRect) so the
      // measurement is in the same coordinate space as the indicator's
      // `left: 0` rule. Absolute-positioned children resolve `left: 0`
      // relative to the parent's PADDING box (inside the 1px border),
      // while getBoundingClientRect reports the BORDER box — that 1px
      // mismatch made the indicator sit one pixel to the right of the
      // active tab, visible as a slight asymmetry around "Catalogue".
      setTabIndicator({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      });
    }
    measure();
    // Recompute when the strip resizes (window resize, conditional
    // tabs becoming visible/hidden, font swap, etc.).
    const container = tabsRef.current;
    if (!container) return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeSection, showStudioEntry, showElementsEntry]);

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
    <IconTooltipProvider>
    <header className="catalogue-header catalogue-header--centered">
      <div className="catalogue-header__title">
        <img
          src={agentuxMark}
          alt="AgentUX"
          title="AgentUX"
          className="catalogue-header-logo"
        />
      </div>

      <div className="catalogue-header__tabs" role="tablist" aria-label="Catalogue sections" ref={tabsRef}>
        {tabIndicator && (
          <span
            className="catalogue-header__tab-indicator"
            aria-hidden="true"
            style={{
              transform: `translateX(${tabIndicator.left}px)`,
              width: `${tabIndicator.width}px`,
            }}
          />
        )}
        <button
          type="button"
          role="tab"
          ref={(el) => { tabRefs.current.set('catalogue', el); }}
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
          ref={(el) => { tabRefs.current.set('videos', el); }}
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
          ref={(el) => { tabRefs.current.set('links', el); }}
          className={`catalogue-header__tab ${activeSection === 'links' ? 'is-active' : ''}`}
          aria-selected={activeSection === 'links'}
          onClick={() => onSectionChange('links')}
          data-short="L"
        >
          Links
        </button>
        {showElementsEntry && (
          <IconTooltip label="Elements">
            <button
              type="button"
              role="tab"
              ref={(el) => { tabRefs.current.set('elements', el); }}
              className={`catalogue-header__tab catalogue-header__tab--icon ${activeSection === 'elements' ? 'is-active' : ''}`}
              aria-selected={activeSection === 'elements'}
              aria-label="Elements"
              onClick={() => onSectionChange('elements')}
            >
              <Component size={15} aria-hidden="true" />
            </button>
          </IconTooltip>
        )}
        {showStudioEntry && (
          <IconTooltip label="Labelling Studio · for AI">
            <button
              type="button"
              role="tab"
              ref={(el) => { tabRefs.current.set('studio', el); }}
              className={`catalogue-header__tab catalogue-header__tab--icon ${activeSection === 'studio' ? 'is-active' : ''}`}
              aria-selected={activeSection === 'studio'}
              aria-label="Labelling Studio (for AI)"
              onClick={() => onSectionChange('studio')}
            >
              <Sparkles size={15} aria-hidden="true" />
            </button>
          </IconTooltip>
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

        {userEmail && <NotificationBell userEmail={userEmail} />}

        {userEmail && (
          <IconTooltip label={whatsNewUnseenCount > 0 ? `Changelog · ${whatsNewUnseenCount} new` : 'Changelog'}>
            <button
              type="button"
              className="catalogue-header__icon-btn catalogue-header__sparkles-btn"
              aria-label={whatsNewUnseenCount > 0 ? `Changelog (${whatsNewUnseenCount} new)` : 'Changelog'}
              onClick={onOpenWhatsNew}
            >
              <History size={15} aria-hidden="true" />
              {whatsNewUnseenCount > 0 && (
                <span className="catalogue-header__sparkles-dot" aria-hidden="true" />
              )}
            </button>
          </IconTooltip>
        )}

        {userEmail && canAdmin && !isNarrowHeader && (
          <IconTooltip label="Settings">
            <button
              type="button"
              className={`catalogue-header__icon-btn ${activeSection === 'team' ? 'is-active' : ''}`}
              aria-label="Settings"
              onClick={() => onSectionChange('team')}
            >
              <Settings size={15} aria-hidden="true" />
            </button>
          </IconTooltip>
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

          <button
            type="button"
            className="catalogue-header-menu__item catalogue-header-menu__item--row catalogue-header-menu__item--toggle"
            role="menuitemcheckbox"
            aria-checked={typingKeycapEnabled}
            onClick={() => setTypingKeycapEnabled(!typingKeycapEnabled)}
          >
            <Keyboard size={14} aria-hidden="true" />
            <span>Typing key feedback</span>
            <span className={`catalogue-header-menu__switch${typingKeycapEnabled ? ' is-on' : ''}`} aria-hidden="true">
              <span className="catalogue-header-menu__switch-thumb" />
            </span>
          </button>

          <button
            type="button"
            className="catalogue-header-menu__item catalogue-header-menu__item--row catalogue-header-menu__item--toggle"
            role="menuitemcheckbox"
            aria-checked={soundEnabled}
            onClick={() => setSoundEnabled(!soundEnabled)}
            title="Master switch for all audio feedback (save, delete, restore, upload, click, boot)"
          >
            <Volume2 size={14} aria-hidden="true" />
            <span>Sound effects</span>
            <span className={`catalogue-header-menu__switch${soundEnabled ? ' is-on' : ''}`} aria-hidden="true">
              <span className="catalogue-header-menu__switch-thumb" />
            </span>
          </button>

          <button
            type="button"
            className="catalogue-header-menu__item catalogue-header-menu__item--row catalogue-header-menu__item--toggle"
            role="menuitemcheckbox"
            aria-checked={clickSoundEnabled}
            onClick={() => setClickSoundEnabled(!clickSoundEnabled)}
            disabled={!soundEnabled}
            title="Soft click sound on tabs, buttons, and links (requires Sound effects on)"
          >
            <MousePointerClick size={14} aria-hidden="true" />
            <span>Click sound</span>
            <span className={`catalogue-header-menu__switch${clickSoundEnabled && soundEnabled ? ' is-on' : ''}`} aria-hidden="true">
              <span className="catalogue-header-menu__switch-thumb" />
            </span>
          </button>

          <button
            type="button"
            className="catalogue-header-menu__item catalogue-header-menu__item--row catalogue-header-menu__item--toggle"
            role="menuitemcheckbox"
            aria-checked={bootSoundEnabled}
            onClick={() => setBootSoundEnabled(!bootSoundEnabled)}
            disabled={!soundEnabled}
            title="Welcome chime once when the app opens (requires Sound effects on)"
          >
            <Power size={14} aria-hidden="true" />
            <span>Boot sound</span>
            <span className={`catalogue-header-menu__switch${bootSoundEnabled && soundEnabled ? ' is-on' : ''}`} aria-hidden="true">
              <span className="catalogue-header-menu__switch-thumb" />
            </span>
          </button>

          <button
            type="button"
            className="catalogue-header-menu__item catalogue-header-menu__item--row catalogue-header-menu__item--toggle"
            role="menuitemcheckbox"
            aria-checked={hapticsEnabled}
            onClick={() => setHapticsEnabled(!hapticsEnabled)}
            title="Vibrate on save, delete, restore and upload (supported devices)"
          >
            <Vibrate size={14} aria-hidden="true" />
            <span>Haptic feedback</span>
            <span className={`catalogue-header-menu__switch${hapticsEnabled ? ' is-on' : ''}`} aria-hidden="true">
              <span className="catalogue-header-menu__switch-thumb" />
            </span>
          </button>

          <button
            type="button"
            className="catalogue-header-menu__item catalogue-header-menu__item--row catalogue-header-menu__item--toggle"
            role="menuitemcheckbox"
            aria-checked={canvasGalleryEnabled}
            onClick={() => setCanvasGalleryEnabled(!canvasGalleryEnabled)}
            title="Use the infinite pannable canvas when Gallery view is active"
          >
            <Frame size={14} aria-hidden="true" />
            <span>Canvas view</span>
            <span className={`catalogue-header-menu__switch${canvasGalleryEnabled ? ' is-on' : ''}`} aria-hidden="true">
              <span className="catalogue-header-menu__switch-thumb" />
            </span>
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
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span>Toolbar settings</span>
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
    </IconTooltipProvider>
  );
}
