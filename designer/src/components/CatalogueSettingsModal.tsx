import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import type {
  ToolbarHideableKey,
  ToolbarPinnableKey,
  WebPreset,
} from '../types';

interface CatalogueSettingsModalProps {
  isOpen: boolean;
  presetUsage: Record<string, number>;
  webPresets: WebPreset[];
  toolbarHiddenKeys: ToolbarHideableKey[];
  toolbarPinnedKeys: ToolbarPinnableKey[];
  onClose: () => void;
  onSave: (webPresets: WebPreset[]) => Promise<void> | void;
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

function createPreset(): WebPreset {
  const key = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { key, label: 'New preset', width: 1440 };
}

export function CatalogueSettingsModal({
  isOpen,
  presetUsage,
  webPresets,
  toolbarHiddenKeys,
  toolbarPinnedKeys,
  onClose,
  onSave,
  onSaveToolbarPrefs,
}: CatalogueSettingsModalProps) {
  const [draft, setDraft] = useState<WebPreset[]>(webPresets);

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

  useEffect(() => {
    if (isOpen) {
      setDraft(webPresets);
    }
  }, [isOpen, webPresets]);

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

  const inUseKeys = useMemo(
    () => new Set(Object.entries(presetUsage).filter(([, count]) => count > 0).map(([key]) => key)),
    [presetUsage],
  );

  function updatePreset(key: string, patch: Partial<WebPreset>) {
    setDraft((previous) => previous.map((preset) => (
      preset.key === key
        ? {
          ...preset,
          ...patch,
          label: typeof patch.label === 'string' ? patch.label : preset.label,
          width: typeof patch.width === 'number' ? patch.width : preset.width,
        }
        : preset
    )));
  }

  function movePreset(key: string, direction: -1 | 1) {
    setDraft((previous) => {
      const index = previous.findIndex((preset) => preset.key === key);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= previous.length) return previous;
      const next = [...previous];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  }

  async function handleSave() {
    const normalized = draft.map((preset) => ({
      ...preset,
      label: preset.label.trim() || 'Preset',
      width: Math.max(1, Math.round(preset.width)),
    }));
    await onSave(normalized);
    onClose();
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
            <p className="catalogue-settings-modal__eyebrow">Catalogue settings</p>
            <h3 id="catalogue-settings-title">Variant presets</h3>
          </div>
          <button type="button" className="catalogue-settings-modal__close" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </div>

        <div className="catalogue-settings-chain">
          <span>Project</span>
          <span>Group</span>
          <span>Screen Family</span>
          <span>Theme</span>
          <span>Platform</span>
          <span>Web Preset or Mobile OS</span>
        </div>

        <div className="catalogue-settings-section">
          <div className="catalogue-settings-section__head">
            <div>
              <h4>Web presets</h4>
              <p>Reorder presets or add new ones. Presets already in use are locked from edits.</p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setDraft((previous) => [...previous, createPreset()])}>
              + Add preset
            </button>
          </div>

          <div className="catalogue-settings-preset-list">
            {draft.map((preset, index) => {
              const isLocked = inUseKeys.has(preset.key);
              const usageCount = presetUsage[preset.key] || 0;
              return (
                <div key={preset.key} className={`catalogue-settings-preset ${isLocked ? 'is-locked' : ''}`}>
                  <div className="catalogue-settings-preset__order">
                    <button type="button" className="catalogue-settings-preset__move" onClick={() => movePreset(preset.key, -1)} disabled={index === 0} aria-label={`Move ${preset.label} up`}>
                      ↑
                    </button>
                    <button type="button" className="catalogue-settings-preset__move" onClick={() => movePreset(preset.key, 1)} disabled={index === draft.length - 1} aria-label={`Move ${preset.label} down`}>
                      ↓
                    </button>
                  </div>
                  <div className="catalogue-settings-preset__fields">
                    <label>
                      <span>Label</span>
                      <input
                        type="text"
                        value={preset.label}
                        disabled={isLocked}
                        onChange={(event) => updatePreset(preset.key, { label: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Width</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={preset.width}
                        disabled={isLocked}
                        onChange={(event) => updatePreset(preset.key, { width: Number(event.target.value) || 1 })}
                      />
                    </label>
                  </div>
                  <div className="catalogue-settings-preset__meta">
                    {isLocked ? (
                      <span className="catalogue-settings-preset__status">Locked in use ({usageCount})</span>
                    ) : (
                      <button
                        type="button"
                        className="catalogue-settings-preset__remove"
                        onClick={() => setDraft((previous) => previous.filter((item) => item.key !== preset.key))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="catalogue-settings-section__note">
            Mobile variants stay fixed to iOS and Android in v1.
          </p>
        </div>

        <div className="catalogue-settings-section">
          <div className="catalogue-settings-section__head">
            <div>
              <h4>Toolbar</h4>
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

        <div className="flow-assign-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={() => void handleSave()}>Save presets</button>
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
