import { useRef } from 'react';

import { REFERENCE_IMAGES_ENABLED } from '../lib/feature-flags';
import type { MobileOs, ScreenshotNode, WebPreset } from '../types';

interface CatalogueFamilyLightboxInlineEditorProps {
  existingGroups: string[];
  flowDraft: string;
  groupDraft: string;
  hasReference: boolean;
  isSaving: boolean;
  mobileOsDraft: MobileOs | null;
  nameDraft: string;
  platformDraft: 'mobile' | 'web' | null;
  referenceFileName: string | null;
  referenceLabelDraft: string;
  themeDraft: 'light' | 'dark' | null;
  webPresetDraft: string | null;
  webPresets: WebPreset[];
  onFlowChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onCancel: () => void;
  onMobileOsChange: (value: MobileOs | null) => void;
  onNameChange: (value: string) => void;
  onPlatformChange: (value: 'mobile' | 'web' | null) => void;
  onReferenceFileSelect: (file: File | null) => void;
  onReferenceLabelChange: (value: string) => void;
  onSave: () => void;
  onThemeChange: (value: 'light' | 'dark' | null) => void;
  onWebPresetChange: (value: string | null) => void;
}

export function buildLightboxDraftVariant(
  screenshot: ScreenshotNode,
  draft: {
    mobileOs: MobileOs | null;
    platform: 'mobile' | 'web' | null;
    theme: 'light' | 'dark' | null;
    webPresetKey: string | null;
  },
): ScreenshotNode {
  if (draft.platform === 'web') {
    return {
      ...screenshot,
      theme: draft.theme,
      platform: 'web',
      web_preset_key: draft.webPresetKey,
      mobile_os: null,
    };
  }
  if (draft.platform === 'mobile') {
    return {
      ...screenshot,
      theme: draft.theme,
      platform: 'mobile',
      web_preset_key: null,
      mobile_os: draft.mobileOs,
    };
  }
  return {
    ...screenshot,
    theme: draft.theme,
    platform: null,
    web_preset_key: null,
    mobile_os: null,
  };
}

export function CatalogueFamilyLightboxInlineEditor({
  existingGroups,
  flowDraft,
  groupDraft,
  hasReference,
  isSaving,
  mobileOsDraft,
  nameDraft,
  platformDraft,
  referenceFileName,
  referenceLabelDraft,
  themeDraft,
  webPresetDraft,
  webPresets,
  onFlowChange,
  onGroupChange,
  onCancel,
  onMobileOsChange,
  onNameChange,
  onPlatformChange,
  onReferenceFileSelect,
  onReferenceLabelChange,
  onSave,
  onThemeChange,
  onWebPresetChange,
}: CatalogueFamilyLightboxInlineEditorProps) {
  const referenceInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="catalogue-lightbox-inline-editor">
      <div className="catalogue-list-inline-editor__head">
        <strong>Edit Screenshot</strong>
        <span>Changes apply to this screenshot.</span>
      </div>
      <div className="catalogue-list-inline-editor__grid">
        <label className="catalogue-list-inline-editor__field">
          <span>Screenshot name</span>
          <input value={nameDraft} onChange={(event) => onNameChange(event.target.value)} />
        </label>
        <label className="catalogue-list-inline-editor__field">
          <span>Group</span>
          {existingGroups.length > 0 && (
            <select
              value={existingGroups.includes(groupDraft) ? groupDraft : ''}
              onChange={(event) => onGroupChange(event.target.value)}
            >
              <option value="">Select existing group...</option>
              {existingGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          )}
          <input
            value={groupDraft}
            placeholder="Type a new group..."
            onChange={(event) => onGroupChange(event.target.value)}
          />
        </label>
        <label className="catalogue-list-inline-editor__field">
          <span>Flow</span>
          <input value={flowDraft} onChange={(event) => onFlowChange(event.target.value)} />
        </label>
        <label className="catalogue-list-inline-editor__field">
          <span>Theme</span>
          <select value={themeDraft || ''} onChange={(event) => onThemeChange((event.target.value || null) as 'light' | 'dark' | null)}>
            <option value="">Select theme</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="catalogue-list-inline-editor__field">
          <span>Platform</span>
          <select value={platformDraft || ''} onChange={(event) => onPlatformChange((event.target.value || null) as 'mobile' | 'web' | null)}>
            <option value="">Select platform</option>
            <option value="web">Web</option>
            <option value="mobile">Mobile</option>
          </select>
        </label>
        {platformDraft === 'web' && (
          <label className="catalogue-list-inline-editor__field">
            <span>Web preset</span>
            <select value={webPresetDraft || ''} onChange={(event) => onWebPresetChange(event.target.value || null)}>
              <option value="">Select preset</option>
              {webPresets.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label} ({preset.width}px)
                </option>
              ))}
            </select>
          </label>
        )}
        {platformDraft === 'mobile' && (
          <label className="catalogue-list-inline-editor__field">
            <span>Mobile OS</span>
            <select value={mobileOsDraft || ''} onChange={(event) => onMobileOsChange((event.target.value || null) as MobileOs | null)}>
              <option value="">Select OS</option>
              <option value="ios">iOS</option>
              <option value="android">Android</option>
            </select>
          </label>
        )}
        {REFERENCE_IMAGES_ENABLED && (
          <label className="catalogue-list-inline-editor__field catalogue-list-inline-editor__field--full">
            <span>Reference image</span>
            <div className="catalogue-list-inline-editor__chips">
              <button
                type="button"
                className="catalogue-list-action"
                onClick={() => referenceInputRef.current?.click()}
              >
                {hasReference || referenceFileName ? 'Replace reference image' : 'Add reference image'}
              </button>
              {referenceFileName
                ? <span>{referenceFileName}</span>
                : <span>{hasReference ? 'Current reference attached' : 'No reference image'}</span>}
              {referenceFileName && (
                <button
                  type="button"
                  className="catalogue-list-action"
                  onClick={() => onReferenceFileSelect(null)}
                >
                  Clear
                </button>
              )}
            </div>
            <input
              ref={referenceInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                onReferenceFileSelect(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />
            <input
              value={referenceLabelDraft}
              placeholder="Reference label (optional)"
              onChange={(event) => onReferenceLabelChange(event.target.value)}
            />
          </label>
        )}
      </div>
      <div className="catalogue-lightbox-inline-editor__actions">
        <button type="button" className="catalogue-family-lightbox__action" onClick={onSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="catalogue-family-lightbox__action" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
      </div>
    </div>
  );
}
