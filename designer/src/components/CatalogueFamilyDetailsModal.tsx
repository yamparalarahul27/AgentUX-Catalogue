import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant, getVariantKey } from '../lib/catalogue-families';
import type { MobileOs, ScreenshotNode, WebPreset } from '../types';
import { Dropdown } from './Dropdown';

interface CatalogueFamilyDetailsModalProps {
  activeVariantKey: string | null;
  family: CatalogueFamilyView | null;
  flowName: string | null;
  isOpen: boolean;
  projectName: string;
  webPresets: WebPreset[];
  onActiveVariantChange: (familyId: string, variantKey: string) => void;
  onAssignFlow: (familyId: string) => void;
  onChangeFamilyGroup: (familyId: string, group: string | null) => Promise<void>;
  onClose: () => void;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onRenameFamily: (familyId: string, name: string) => Promise<void>;
  onReplaceVariantImage: (screenshotId: string, file: File) => Promise<void>;
  onUpdateVariantDetails: (
    screenshotId: string,
    patch: {
      mobile_os?: MobileOs | null;
      platform?: 'mobile' | 'web' | null;
      theme?: 'light' | 'dark' | null;
      web_preset_key?: string | null;
    },
  ) => Promise<boolean>;
}

function buildDraftVariant(
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

export function CatalogueFamilyDetailsModal({
  activeVariantKey,
  family,
  flowName,
  isOpen,
  projectName,
  webPresets,
  onActiveVariantChange,
  onAssignFlow,
  onChangeFamilyGroup,
  onClose,
  onDeleteFamily,
  onRenameFamily,
  onReplaceVariantImage,
  onUpdateVariantDetails,
}: CatalogueFamilyDetailsModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const activeVariant = useMemo(
    () => (family ? getActiveFamilyVariant(family, activeVariantKey) : null),
    [activeVariantKey, family],
  );
  const screenshot = activeVariant?.screenshot ?? null;
  const [familyName, setFamilyName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  const [platform, setPlatform] = useState<'mobile' | 'web' | null>(null);
  const [webPresetKey, setWebPresetKey] = useState<string | null>(null);
  const [mobileOs, setMobileOs] = useState<MobileOs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !family || !screenshot) return;
    setFamilyName(family.name);
    setGroupName(family.group || '');
    setTheme(screenshot.theme || null);
    setPlatform(screenshot.platform || null);
    setWebPresetKey(screenshot.web_preset_key || null);
    setMobileOs(screenshot.mobile_os || null);
    setSaving(false);
  }, [family, isOpen, screenshot]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !family || !screenshot || !activeVariant) {
    return null;
  }

  const currentFamily = family;
  const currentScreenshot = screenshot;
  const currentVariant = activeVariant;

  async function handleSave() {
    const trimmedName = familyName.trim();
    const trimmedGroup = groupName.trim();
    const nextVariant = buildDraftVariant(currentScreenshot, {
      mobileOs,
      platform,
      theme,
      webPresetKey,
    });

    setSaving(true);
    try {
      if (trimmedName && trimmedName !== currentFamily.name) {
        await onRenameFamily(currentFamily.id, trimmedName);
      }

      if (trimmedGroup !== (currentFamily.group || '')) {
        await onChangeFamilyGroup(currentFamily.id, trimmedGroup || null);
      }

      const variantChanged = (
        nextVariant.theme !== currentScreenshot.theme
        || nextVariant.platform !== currentScreenshot.platform
        || nextVariant.web_preset_key !== currentScreenshot.web_preset_key
        || nextVariant.mobile_os !== currentScreenshot.mobile_os
      );

      if (variantChanged) {
        const updated = await onUpdateVariantDetails(currentScreenshot.id, {
          theme: nextVariant.theme,
          platform: nextVariant.platform,
          web_preset_key: nextVariant.web_preset_key,
          mobile_os: nextVariant.mobile_os,
        });
        if (!updated) {
          return;
        }
        onActiveVariantChange(currentFamily.id, getVariantKey(nextVariant));
      }

      onClose();
    } finally {
      setSaving(false);
    }
  }

  function handlePlatformChange(value: string | null) {
    const nextPlatform = (value || null) as 'mobile' | 'web' | null;
    setPlatform(nextPlatform);
    if (nextPlatform === 'web') {
      setWebPresetKey((current) => current || webPresets[0]?.key || null);
      setMobileOs(null);
      return;
    }
    if (nextPlatform === 'mobile') {
      setMobileOs((current) => current || 'ios');
      setWebPresetKey(null);
      return;
    }
    setWebPresetKey(null);
    setMobileOs(null);
  }

  async function requestDelete() {
    const shouldDelete = window.confirm(`Delete "${currentFamily.name}" and all of its variants?`);
    if (!shouldDelete) return;
    await onDeleteFamily(currentFamily.id);
    onClose();
  }

  return createPortal(
    <div className="catalogue-family-details-overlay" onClick={onClose}>
      <div
        className="catalogue-family-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalogue-family-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="catalogue-family-details-modal__head">
          <div>
            <p className="catalogue-family-details-modal__eyebrow">Edit screenshot</p>
            <h3 id="catalogue-family-details-title">{currentFamily.name}</h3>
            <p className="catalogue-family-details-modal__subhead">Variant: {currentVariant.label}</p>
          </div>
          <button type="button" className="catalogue-family-details-modal__close" onClick={onClose} aria-label="Close details">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="catalogue-family-details-modal__body">
          <div className="catalogue-family-details-preview">
            <div className="catalogue-family-details-preview__media">
              {currentScreenshot.image_url ? (
                <img src={currentScreenshot.image_url} alt={`${currentFamily.name} ${currentVariant.label}`} draggable={false} />
              ) : (
                <div className="catalogue-family-details-preview__placeholder">No image available</div>
              )}
            </div>

            <div className="catalogue-family-details-preview__meta">
              <div className="catalogue-family-details-preview__title">
                <span>{projectName}</span>
                <span className="catalogue-family-details-preview__count">{currentFamily.variants.length} variants</span>
              </div>

              <div className="catalogue-family-details-preview__chips">
                <span className="catalogue-family-details-chip">{currentFamily.group || 'No group'}</span>
                <span className="catalogue-family-details-chip">{currentScreenshot.comment_count ?? 0} comments</span>
                <span className="catalogue-family-details-chip">{currentScreenshot.annotation_count ?? 0} pins</span>
              </div>

              <button
                type="button"
                className="catalogue-family-details-flow"
                onClick={() => {
                  onAssignFlow(currentFamily.id);
                  onClose();
                }}
              >
                {flowName || 'Unassigned flow'}
              </button>

              <div className="catalogue-family-details-preview__actions">
                <button type="button" className="catalogue-family-details-action" onClick={() => fileRef.current?.click()}>
                  Reupload image
                </button>
                <button type="button" className="catalogue-family-details-action is-danger" onClick={() => void requestDelete()}>
                  Delete family
                </button>
              </div>
            </div>

            <div className="catalogue-family-details-variants">
              <p className="catalogue-family-details-section-title">Variants</p>
              <div className="catalogue-family-details-variants__strip">
                {currentFamily.variants.map((variant) => (
                  <button
                    key={variant.key}
                    type="button"
                    className={`catalogue-family-details-variant ${variant.key === currentVariant.key ? 'is-active' : ''}`}
                    onClick={() => onActiveVariantChange(currentFamily.id, variant.key)}
                  >
                    {variant.label}
                  </button>
                ))}
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void onReplaceVariantImage(currentScreenshot.id, file);
                }
                event.target.value = '';
              }}
            />
          </div>

          <div className="catalogue-family-details-form">
            <p className="catalogue-family-details-section-title">Edit family and variant</p>
            <div className="catalogue-family-details-grid">
              <label className="catalogue-family-details-field">
                <span>Screen family</span>
                <input
                  type="text"
                  value={familyName}
                  onChange={(event) => setFamilyName(event.target.value)}
                  placeholder="Screen family name"
                />
              </label>

              <label className="catalogue-family-details-field">
                <span>Group</span>
                <input
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Group"
                />
              </label>

              <label className="catalogue-family-details-field">
                <span>Theme</span>
                <Dropdown
                  value={theme}
                  placeholder="Select theme"
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                  onChange={(value) => setTheme((value || null) as 'light' | 'dark' | null)}
                />
              </label>

              <label className="catalogue-family-details-field">
                <span>Platform</span>
                <Dropdown
                  value={platform}
                  placeholder="Select platform"
                  options={[
                    { value: 'web', label: 'Web' },
                    { value: 'mobile', label: 'Mobile' },
                  ]}
                  onChange={handlePlatformChange}
                />
              </label>

              {platform === 'web' && (
                <label className="catalogue-family-details-field">
                  <span>Web preset</span>
                  <Dropdown
                    value={webPresetKey}
                    placeholder="Select preset"
                    options={webPresets.map((preset) => ({
                      value: preset.key,
                      label: `${preset.label} (${preset.width}px)`,
                    }))}
                    onChange={setWebPresetKey}
                  />
                </label>
              )}

              {platform === 'mobile' && (
                <label className="catalogue-family-details-field">
                  <span>Mobile OS</span>
                  <Dropdown
                    value={mobileOs}
                    placeholder="Select OS"
                    options={[
                      { value: 'ios', label: 'iOS' },
                      { value: 'android', label: 'Android' },
                    ]}
                    onChange={(value) => setMobileOs((value || null) as MobileOs | null)}
                  />
                </label>
              )}
            </div>

            <p className="catalogue-family-details-note">
              Flow ownership stays at the family level. Variant comments and annotations stay attached to the currently selected screenshot variant.
            </p>

            <div className="catalogue-family-details-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving...' : 'Save details'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
