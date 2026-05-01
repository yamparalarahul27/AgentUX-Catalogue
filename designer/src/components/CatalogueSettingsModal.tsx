import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import type { WebPreset } from '../types';

interface CatalogueSettingsModalProps {
  isOpen: boolean;
  presetUsage: Record<string, number>;
  webPresets: WebPreset[];
  onClose: () => void;
  onSave: (webPresets: WebPreset[]) => Promise<void> | void;
}

function createPreset(): WebPreset {
  const key = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { key, label: 'New preset', width: 1440 };
}

export function CatalogueSettingsModal({
  isOpen,
  presetUsage,
  webPresets,
  onClose,
  onSave,
}: CatalogueSettingsModalProps) {
  const [draft, setDraft] = useState<WebPreset[]>(webPresets);

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

        <div className="flow-assign-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={() => void handleSave()}>Save presets</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
