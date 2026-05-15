import type { ComponentType } from 'react';
import { useMemo, useRef } from 'react';
import { Apple, Bot, Monitor, Moon, Smartphone, Sun } from 'lucide-react';

import { REFERENCE_IMAGES_ENABLED } from '../lib/feature-flags';
import type { MobileOs, ScreenshotNode, WebPreset } from '../types';
import { Dropdown } from './Dropdown';

type LucideIcon = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;

interface CatalogueFamilyLightboxInlineEditorProps {
  existingFlows: string[];
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
  existingFlows,
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

  // Merge the current draft into the option list so a freshly-typed value
  // renders as the selected label, not as the placeholder.
  const groupOptions = useMemo(() => {
    const all = new Set(existingGroups);
    if (groupDraft.trim()) all.add(groupDraft.trim());
    return [...all].sort().map((name) => ({ value: name, label: name }));
  }, [existingGroups, groupDraft]);

  const flowOptions = useMemo(() => {
    const all = new Set(existingFlows);
    if (flowDraft.trim()) all.add(flowDraft.trim());
    return [...all].sort().map((name) => ({ value: name, label: name }));
  }, [existingFlows, flowDraft]);

  const webPresetOptions = useMemo(
    () => webPresets.map((preset) => ({
      value: preset.key,
      label: `${preset.label} (${preset.width}px)`,
    })),
    [webPresets],
  );

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

        <div className="catalogue-list-inline-editor__field">
          <span>Group</span>
          <Dropdown
            options={groupOptions}
            value={groupDraft.trim() || null}
            onChange={(value) => onGroupChange(value ?? '')}
            placeholder="Select or create…"
            searchable
            searchPlaceholder="Search or type to create…"
            creatable
            className="catalogue-list-inline-editor__dropdown"
          />
        </div>

        <div className="catalogue-list-inline-editor__field">
          <span>Flow</span>
          <Dropdown
            options={flowOptions}
            value={flowDraft.trim() || null}
            onChange={(value) => onFlowChange(value ?? '')}
            placeholder="Select or create…"
            searchable
            searchPlaceholder="Search or type to create…"
            creatable
            className="catalogue-list-inline-editor__dropdown"
          />
        </div>

        <div className="catalogue-list-inline-editor__row-2col">
          <div className="catalogue-list-inline-editor__field">
            <span>Theme</span>
            <SegmentedControl
              value={themeDraft}
              onChange={onThemeChange}
              options={[
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
              ]}
            />
          </div>
          <div className="catalogue-list-inline-editor__field">
            <span>Platform</span>
            <SegmentedControl
              value={platformDraft}
              onChange={onPlatformChange}
              options={[
                { value: 'web', label: 'Web', icon: Monitor },
                { value: 'mobile', label: 'Mobile', icon: Smartphone },
              ]}
            />
          </div>
        </div>

        {platformDraft === 'web' && (
          <div className="catalogue-list-inline-editor__field">
            <span>Web preset</span>
            <Dropdown
              options={webPresetOptions}
              value={webPresetDraft}
              onChange={onWebPresetChange}
              placeholder="Select preset"
              searchable
              searchPlaceholder="Search presets…"
              className="catalogue-list-inline-editor__dropdown"
            />
          </div>
        )}

        {platformDraft === 'mobile' && (
          <div className="catalogue-list-inline-editor__field">
            <span>Mobile OS</span>
            <SegmentedControl
              value={mobileOsDraft}
              onChange={onMobileOsChange}
              options={[
                { value: 'ios', label: 'iOS', icon: Apple },
                { value: 'android', label: 'Android', icon: Bot },
              ]}
            />
          </div>
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

// Local segmented control. 1-tap selection for 2-option fields (Theme,
// Platform, Mobile OS). The "×" button clears the selection back to null,
// matching the old "Select theme" / "Select platform" placeholder semantics.
// When `icon` is set on an option, the button renders icon-only with the
// label exposed via aria-label + title for accessibility.
interface SegmentedControlProps<T extends string> {
  value: T | null;
  onChange: (value: T | null) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
}

function SegmentedControl<T extends string>({ value, onChange, options }: SegmentedControlProps<T>) {
  const isIconOnly = options.every((option) => option.icon);
  return (
    <div
      className={`catalogue-segmented-control${isIconOnly ? ' catalogue-segmented-control--icon-only' : ''}`}
      role="radiogroup"
    >
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            aria-label={Icon ? option.label : undefined}
            title={Icon ? option.label : undefined}
            className={`catalogue-segmented-control__btn${value === option.value ? ' is-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {Icon ? <Icon size={16} aria-hidden /> : option.label}
          </button>
        );
      })}
      <button
        type="button"
        className="catalogue-segmented-control__clear"
        onClick={() => onChange(null)}
        disabled={value === null}
        aria-label="Clear selection"
        title="Clear selection"
      >
        ×
      </button>
    </div>
  );
}
