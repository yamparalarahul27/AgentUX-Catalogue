import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { CornerDownLeft, Monitor, Moon, Smartphone, Sun } from 'lucide-react';

import androidLogo from '../assets/android-logo.svg';
import appleLogo from '../assets/apple-logo.svg';
import { REFERENCE_IMAGES_ENABLED } from '../lib/feature-flags';
import type { MobileOs, ScreenshotNode, WebPreset } from '../types';
import { Dropdown } from './Dropdown';

interface CatalogueFamilyLightboxInlineEditorProps {
  existingFlows: string[];
  existingGroups: string[];
  flowDraft: string;
  groupDraft: string;
  // Hint string set by the Marketing uploader at upload time —
  // suggests which catalogue group this screenshot should ultimately
  // live in. Rendered as a banner above the Group dropdown so Admin
  // sees it when reviewing the Marketing Bucket.
  suggestedGroup?: string | null;
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
  suggestedGroup,
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
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus + select the Name field when the editor mounts (it
  // remounts each time the lightbox flips into edit mode). Tab order
  // follows DOM order from here.
  useEffect(() => {
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, []);

  // Esc cancels, Enter saves — global window listeners so they work
  // regardless of which input has focus. Both bail out when a Dropdown
  // menu is open so the Dropdown component owns those keys for its
  // own selection / close behaviour.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isSaving) return;
      if (document.querySelector('.dropdown--open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      } else if (event.key === 'Enter') {
        // Skip when focus is on a textarea — Enter there should
        // insert a newline. None of the editor's current fields are
        // textareas, but this keeps us safe for future additions.
        const target = event.target;
        if (target instanceof HTMLElement && target.tagName === 'TEXTAREA') return;
        event.preventDefault();
        onSave();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isSaving, onCancel, onSave]);

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
          <input ref={nameInputRef} value={nameDraft} onChange={(event) => onNameChange(event.target.value)} />
        </label>

        <div className="catalogue-list-inline-editor__field">
          <span>Group</span>
          {suggestedGroup && (
            <div className="catalogue-list-inline-editor__hint" role="note">
              Marketing suggested: <strong>{suggestedGroup}</strong>
            </div>
          )}
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
                { value: 'light', label: 'Light', iconNode: <Sun size={16} aria-hidden /> },
                { value: 'dark', label: 'Dark', iconNode: <Moon size={16} aria-hidden /> },
              ]}
            />
          </div>
          <div className="catalogue-list-inline-editor__field">
            <span>Platform</span>
            <SegmentedControl
              value={platformDraft}
              onChange={onPlatformChange}
              options={[
                { value: 'web', label: 'Web', iconNode: <Monitor size={16} aria-hidden /> },
                { value: 'mobile', label: 'Mobile', iconNode: <Smartphone size={16} aria-hidden /> },
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
                { value: 'ios', label: 'iOS', iconNode: <img src={appleLogo} alt="" aria-hidden width={16} height={16} /> },
                { value: 'android', label: 'Android', iconNode: <img src={androidLogo} alt="" aria-hidden width={16} height={16} /> },
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
        <button type="button" className="catalogue-family-lightbox__action" onClick={onSave} disabled={isSaving} title="Save (Enter)">
          {isSaving ? 'Saving...' : (
            <>
              Save
              <CornerDownLeft size={14} aria-hidden style={{ marginLeft: 6, opacity: 0.7 }} />
            </>
          )}
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
// When `iconNode` is set on an option, the button renders icon-only
// with the label exposed via aria-label + title. iconNode accepts any
// ReactNode so callers can pass Lucide components or <img> tags for
// brand SVGs (Apple, Android).
interface SegmentedControlProps<T extends string> {
  value: T | null;
  onChange: (value: T | null) => void;
  options: { value: T; label: string; iconNode?: ReactNode }[];
}

function SegmentedControl<T extends string>({ value, onChange, options }: SegmentedControlProps<T>) {
  const isIconOnly = options.every((option) => option.iconNode);

  // Arrow Left/Right cycles through options (wrapping). Standard
  // ARIA radiogroup interaction — when the user lands inside the
  // control via Tab they can flip through choices without reaching
  // for the mouse.
  function handleArrowNav(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (options.length === 0) return;
    const currentIdx = options.findIndex((option) => option.value === value);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIdx = currentIdx === -1
      ? (delta === 1 ? 0 : options.length - 1)
      : (currentIdx + delta + options.length) % options.length;
    event.preventDefault();
    onChange(options[nextIdx].value);
  }

  return (
    <div
      className={`catalogue-segmented-control${isIconOnly ? ' catalogue-segmented-control--icon-only' : ''}`}
      role="radiogroup"
      onKeyDown={handleArrowNav}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          aria-label={option.iconNode ? option.label : undefined}
          title={option.iconNode ? option.label : undefined}
          className={`catalogue-segmented-control__btn${value === option.value ? ' is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.iconNode ?? option.label}
        </button>
      ))}
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
