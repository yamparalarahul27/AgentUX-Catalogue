import { useEffect, useMemo, useState } from 'react';

import type { WebPreset } from '../types';

interface CatalogueWebPresetsSectionProps {
  webPresets: WebPreset[];
  presetUsage: Record<string, number>;
  onSave: (webPresets: WebPreset[]) => Promise<void> | void;
}

function createPreset(): WebPreset {
  const key = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { key, label: 'New preset', width: 1440 };
}

// Settings → Team → Web Presets. Same form the old gear-icon modal
// used to host, lifted out as its own component so the Toolbar
// modal stays focused and admins manage variant presets alongside
// Groups, Flows, and Roles.
//
// Edits are buffered into local `draft` state and persisted via the
// explicit Save button at the bottom — matches the existing flow.
// (Width / label changes are too granular to auto-save per keystroke.)
export function CatalogueWebPresetsSection({
  webPresets,
  presetUsage,
  onSave,
}: CatalogueWebPresetsSectionProps) {
  const [draft, setDraft] = useState<WebPreset[]>(webPresets);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Re-sync the local draft whenever the canonical settings load /
  // change from outside (e.g. cross-device sync). The user's in-flight
  // edits would be wiped if we always overwrite, so only re-sync when
  // the incoming list looks different from what we last saw.
  useEffect(() => {
    setDraft(webPresets);
  }, [webPresets]);

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
    setSaving(true);
    try {
      await onSave(normalized);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="catalogue-settings-embedded">
      <div className="catalogue-settings-chain">
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

      <div className="catalogue-settings-embedded__actions">
        {savedAt && (
          <span className="catalogue-settings-embedded__saved" aria-live="polite">
            Saved.
          </span>
        )}
        <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save presets'}
        </button>
      </div>
    </div>
  );
}
