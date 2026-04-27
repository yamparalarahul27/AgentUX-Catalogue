import type { Dispatch, SetStateAction } from 'react';

import type { MobileOs, WebPreset } from '../types';

export interface CatalogueGalleryInlineDraft {
  familyName: string;
  groupName: string;
  flowLabel: string;
  screenshotId: string;
  theme: 'light' | 'dark' | null;
  platform: 'mobile' | 'web' | null;
  webPresetKey: string | null;
  mobileOs: MobileOs | null;
}

interface CatalogueGalleryInlineEditorProps {
  inlineDraft: CatalogueGalleryInlineDraft;
  webPresets: WebPreset[];
  onInlineDraftChange: Dispatch<SetStateAction<CatalogueGalleryInlineDraft | null>>;
  onPlatformDraftChange: (platform: 'mobile' | 'web' | null) => void;
}

export function CatalogueGalleryInlineEditor({
  inlineDraft,
  webPresets,
  onInlineDraftChange,
  onPlatformDraftChange,
}: CatalogueGalleryInlineEditorProps) {
  return (
    <div className="catalogue-gallery-inline-editor">
      <div className="catalogue-list-inline-editor__head">
        <strong>Editing current variant</strong>
        <span>Changes apply to this screenshot.</span>
      </div>
      <div className="catalogue-list-inline-editor__grid">
        <label className="catalogue-list-inline-editor__field">
          <span>Screenshot name</span>
          <input
            type="text"
            value={inlineDraft.familyName}
            onChange={(event) => onInlineDraftChange((previous) => (previous ? { ...previous, familyName: event.target.value } : previous))}
          />
        </label>
        <label className="catalogue-list-inline-editor__field">
          <span>Group</span>
          <input
            type="text"
            value={inlineDraft.groupName}
            onChange={(event) => onInlineDraftChange((previous) => (previous ? { ...previous, groupName: event.target.value } : previous))}
          />
        </label>
        <label className="catalogue-list-inline-editor__field">
          <span>Flow</span>
          <input
            type="text"
            value={inlineDraft.flowLabel}
            onChange={(event) => onInlineDraftChange((previous) => (previous ? { ...previous, flowLabel: event.target.value } : previous))}
            placeholder="Type a flow label"
          />
        </label>
        <div className="catalogue-list-inline-editor__field">
          <span>Theme</span>
          <div className="catalogue-list-inline-editor__chips">
            {(['light', 'dark'] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={`catalogue-family-card__variant ${inlineDraft.theme === item ? 'is-active' : ''}`}
                onClick={() => onInlineDraftChange((previous) => (previous ? { ...previous, theme: item } : previous))}
              >
                {item === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
        <div className="catalogue-list-inline-editor__field">
          <span>Platform</span>
          <div className="catalogue-list-inline-editor__chips">
            {(['web', 'mobile'] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={`catalogue-family-card__variant ${inlineDraft.platform === item ? 'is-active' : ''}`}
                onClick={() => onPlatformDraftChange(item)}
              >
                {item === 'web' ? 'Web' : 'Mobile'}
              </button>
            ))}
          </div>
        </div>
        {inlineDraft.platform === 'web' ? (
          <label className="catalogue-list-inline-editor__field">
            <span>Web preset</span>
            <select
              value={inlineDraft.webPresetKey || ''}
              onChange={(event) => onInlineDraftChange((previous) => (
                previous
                  ? {
                    ...previous,
                    webPresetKey: event.target.value || null,
                    mobileOs: null,
                  }
                  : previous
              ))}
            >
              <option value="">Select web preset</option>
              {webPresets.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label} ({preset.width}px)
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {inlineDraft.platform === 'mobile' ? (
          <div className="catalogue-list-inline-editor__field">
            <span>Mobile OS</span>
            <div className="catalogue-list-inline-editor__chips">
              {(['ios', 'android'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`catalogue-family-card__variant ${inlineDraft.mobileOs === item ? 'is-active' : ''}`}
                  onClick={() => onInlineDraftChange((previous) => (previous
                    ? { ...previous, mobileOs: item as MobileOs, webPresetKey: null }
                    : previous))}
                >
                  {item === 'ios' ? 'iOS' : 'Android'}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
