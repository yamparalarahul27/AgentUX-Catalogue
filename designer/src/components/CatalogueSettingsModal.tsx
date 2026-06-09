import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import type {
  ToolbarHideableKey,
  ToolbarPinnableKey,
} from '../types';

interface CatalogueSettingsModalProps {
  isOpen: boolean;
  toolbarHiddenKeys: ToolbarHideableKey[];
  toolbarPinnedKeys: ToolbarPinnableKey[];
  onClose: () => void;
  onSaveToolbarPrefs: (next: {
    toolbar_hidden_keys: ToolbarHideableKey[];
    toolbar_pinned_keys: ToolbarPinnableKey[];
  }) => Promise<unknown> | void;
}

// Display order + labels for the show/hide toggles. Keep in sync with
// the toolbar render code.
const HIDE_TOGGLES: Array<{ key: ToolbarHideableKey; label: string; hint?: string }> = [
  { key: 'sort', label: 'Sort dropdown', hint: 'Latest / A-Z / Group' },
  { key: 'density_stack', label: 'Density: Stack' },
  { key: 'density_gallery', label: 'Density: Gallery' },
  { key: 'share', label: 'Share this view' },
  { key: 'save', label: 'Saved (bookmark filter)' },
];

const PIN_TOGGLES: Array<{ key: ToolbarPinnableKey; label: string; hint: string }> = [
  { key: 'platform', label: 'Platform', hint: 'Mobile / Web' },
  { key: 'theme', label: 'Theme', hint: 'Light / Dark' },
];

// Per-user toolbar customization modal opened from the header gear
// icon. Toggles save immediately on click — matches the sound /
// haptics pattern from the header menu — so there's no Save / Cancel
// row; the X close button is the only chrome.
//
// Web presets used to live in this modal but moved to Settings →
// Team → Web Presets (admin-only). See CatalogueWebPresetsSection.
export function CatalogueSettingsModal({
  isOpen,
  toolbarHiddenKeys,
  toolbarPinnedKeys,
  onClose,
  onSaveToolbarPrefs,
}: CatalogueSettingsModalProps) {
  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  function isHidden(key: ToolbarHideableKey): boolean {
    return toolbarHiddenKeys.includes(key);
  }

  function isPinned(key: ToolbarPinnableKey): boolean {
    return toolbarPinnedKeys.includes(key);
  }

  function toggleHidden(key: ToolbarHideableKey) {
    const next = isHidden(key)
      ? toolbarHiddenKeys.filter((k) => k !== key)
      : [...toolbarHiddenKeys, key];
    void onSaveToolbarPrefs({
      toolbar_hidden_keys: next,
      toolbar_pinned_keys: toolbarPinnedKeys,
    });
  }

  function togglePinned(key: ToolbarPinnableKey) {
    const next = isPinned(key)
      ? toolbarPinnedKeys.filter((k) => k !== key)
      : [...toolbarPinnedKeys, key];
    void onSaveToolbarPrefs({
      toolbar_hidden_keys: toolbarHiddenKeys,
      toolbar_pinned_keys: next,
    });
  }

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="catalogue-settings-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1300 }}
    >
      <div
        className="catalogue-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalogue-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="catalogue-settings-modal__head">
          <div>
            <p className="catalogue-settings-modal__eyebrow">Personal settings</p>
            <h3 id="catalogue-settings-title">Toolbar customization</h3>
          </div>
          <button type="button" className="catalogue-settings-modal__close" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </div>

        <div className="catalogue-settings-section">
          <div className="catalogue-settings-section__head">
            <div>
              <p>Hide controls you don&rsquo;t use, or pin filters to the toolbar as tab switches. Changes save automatically and only affect your view.</p>
            </div>
          </div>

          <div className="catalogue-settings-toggle-group" role="group" aria-label="Show or hide toolbar controls">
            <p className="catalogue-settings-toggle-group__title">Show / hide</p>
            <ul className="catalogue-settings-toggle-list">
              <li className="catalogue-settings-toggle is-fixed" aria-disabled="true">
                <div className="catalogue-settings-toggle__label">
                  <span>Upload</span>
                  <em>Always shown</em>
                </div>
              </li>
              {HIDE_TOGGLES.slice(0, 1).map((item) => (
                <SettingsToggle
                  key={item.key}
                  label={item.label}
                  hint={item.hint}
                  checked={!isHidden(item.key)}
                  onChange={() => toggleHidden(item.key)}
                />
              ))}
              <li className="catalogue-settings-toggle is-fixed" aria-disabled="true">
                <div className="catalogue-settings-toggle__label">
                  <span>Density: Grid</span>
                  <em>Always shown</em>
                </div>
              </li>
              {HIDE_TOGGLES.slice(1, 3).map((item) => (
                <SettingsToggle
                  key={item.key}
                  label={item.label}
                  hint={item.hint}
                  checked={!isHidden(item.key)}
                  onChange={() => toggleHidden(item.key)}
                />
              ))}
              <li className="catalogue-settings-toggle is-fixed" aria-disabled="true">
                <div className="catalogue-settings-toggle__label">
                  <span>Search</span>
                  <em>Always shown</em>
                </div>
              </li>
              {HIDE_TOGGLES.slice(3).map((item) => (
                <SettingsToggle
                  key={item.key}
                  label={item.label}
                  hint={item.hint}
                  checked={!isHidden(item.key)}
                  onChange={() => toggleHidden(item.key)}
                />
              ))}
            </ul>
          </div>

          <div className="catalogue-settings-toggle-group" role="group" aria-label="Pin filters to the toolbar">
            <p className="catalogue-settings-toggle-group__title">Pin filters</p>
            <p className="catalogue-settings-toggle-group__hint">
              Pinning pulls the filter out of the Filters dropdown and shows it as a tab switch inline in the toolbar.
            </p>
            <ul className="catalogue-settings-toggle-list">
              {PIN_TOGGLES.map((item) => (
                <SettingsToggle
                  key={item.key}
                  label={item.label}
                  hint={item.hint}
                  checked={isPinned(item.key)}
                  onChange={() => togglePinned(item.key)}
                />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface SettingsToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}

function SettingsToggle({ label, hint, checked, onChange }: SettingsToggleProps) {
  return (
    <li className="catalogue-settings-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`catalogue-settings-toggle__btn${checked ? ' is-on' : ''}`}
        onClick={onChange}
      >
        <span className="catalogue-settings-toggle__label">
          <span>{label}</span>
          {hint && <em>{hint}</em>}
        </span>
        <span className="catalogue-settings-toggle__switch" aria-hidden="true">
          <span className="catalogue-settings-toggle__switch-thumb" />
        </span>
      </button>
    </li>
  );
}
