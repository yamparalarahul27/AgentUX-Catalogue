import { createPortal } from 'react-dom';

import { Dropdown } from './Dropdown';
import { UploadZone } from './UploadZone';
import type { MobileOs, WebPreset } from '../types';

interface CatalogueUploadModalProps {
  flowLabel: string;
  isOpen: boolean;
  newFamilyGroup: string;
  newFamilyName: string;
  platform: 'mobile' | 'web' | null;
  projectGroups: string[];
  projectId: string | null;
  projects: { id: string; name: string }[];
  referenceLabel: string;
  referencePreview: string | null;
  theme: 'light' | 'dark' | null;
  uploading: boolean;
  webPresetKey: string | null;
  webPresets: WebPreset[];
  mobileOs: MobileOs | null;
  onClose: () => void;
  onFilesSelected: (files: File[]) => void;
  onFlowLabelChange: (value: string) => void;
  onNewFamilyGroupChange: (value: string) => void;
  onNewFamilyNameChange: (value: string) => void;
  onProjectIdChange: (value: string | null) => void;
  onReferenceLabelChange: (value: string) => void;
  onReferenceRemove: () => void;
  onReferenceSelect: (file: File | null) => void;
  onThemeChange: (value: 'light' | 'dark' | null) => void;
  onPlatformChange: (value: 'mobile' | 'web' | null) => void;
  onWebPresetKeyChange: (value: string | null) => void;
  onMobileOsChange: (value: MobileOs | null) => void;
}

function isReadyToUpload({
  newFamilyGroup,
  newFamilyName,
  platform,
  theme,
  webPresetKey,
  mobileOs,
}: Pick<
  CatalogueUploadModalProps,
  'newFamilyGroup' | 'newFamilyName' | 'platform' | 'theme' | 'webPresetKey' | 'mobileOs'
>) {
  if (!newFamilyName.trim() || !newFamilyGroup.trim()) return false;
  if (!theme) return false;

  if (platform === 'web') return Boolean(webPresetKey);
  if (platform === 'mobile') return Boolean(mobileOs);
  return false;
}

export function CatalogueUploadModal({
  flowLabel,
  isOpen,
  mobileOs,
  newFamilyGroup,
  newFamilyName,
  platform,
  projectGroups,
  projectId,
  projects,
  referenceLabel,
  referencePreview,
  theme,
  uploading,
  webPresetKey,
  webPresets,
  onClose,
  onFilesSelected,
  onFlowLabelChange,
  onMobileOsChange,
  onNewFamilyGroupChange,
  onNewFamilyNameChange,
  onPlatformChange,
  onProjectIdChange,
  onReferenceLabelChange,
  onReferenceRemove,
  onReferenceSelect,
  onThemeChange,
  onWebPresetKeyChange,
}: CatalogueUploadModalProps) {
  if (!isOpen) {
    return null;
  }

  const uploadReady = isReadyToUpload({
    mobileOs,
    newFamilyGroup,
    newFamilyName,
    platform,
    theme,
    webPresetKey,
  });

  return createPortal(
    <div
      className="catalogue-upload-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1300 }}
    >
      <div
        className="catalogue-upload-modal catalogue-upload-modal--family"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalogue-upload-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="catalogue-upload-title">Upload Screenshot</h3>
        <p className="catalogue-upload-subtitle">Name the screenshot, classify it, then upload. Project selection is optional.</p>

        <Dropdown
          className="catalogue-upload-project-dropdown"
          value={projectId}
          placeholder="Project (optional)"
          options={projects.map((project) => ({ value: project.id, label: project.name }))}
          onChange={onProjectIdChange}
        />

        <label className="catalogue-upload-label">Flow</label>
        <input
          className="catalogue-filter catalogue-upload-project-select"
          type="text"
          placeholder="Flow name (e.g. Deposit)"
          value={flowLabel}
          onChange={(event) => onFlowLabelChange(event.target.value)}
        />

        <label className="catalogue-upload-label">Screenshot</label>
        <div className="catalogue-upload-stack">
          <input
            className="catalogue-filter catalogue-upload-project-select"
            type="text"
            placeholder="Screenshot name"
            value={newFamilyName}
            onChange={(event) => onNewFamilyNameChange(event.target.value)}
          />
          <input
            className="catalogue-filter catalogue-upload-project-select"
            type="text"
            placeholder={projectGroups.length > 0 ? `Group (for example: ${projectGroups[0]})` : 'Group'}
            value={newFamilyGroup}
            onChange={(event) => onNewFamilyGroupChange(event.target.value)}
          />
        </div>

        <label className="catalogue-upload-label">Theme</label>
        <div className="catalogue-upload-groups">
          {(['light', 'dark'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`catalogue-upload-group-chip ${theme === item ? 'active' : ''}`}
              onClick={() => onThemeChange(theme === item ? null : item)}
            >
              {item === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>

        <label className="catalogue-upload-label">Platform</label>
        <div className="catalogue-upload-groups">
          {(['web', 'mobile'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`catalogue-upload-group-chip ${platform === item ? 'active' : ''}`}
              onClick={() => onPlatformChange(platform === item ? null : item)}
            >
              {item === 'web' ? 'Web' : 'Mobile'}
            </button>
          ))}
        </div>

        {platform === 'web' && (
          <>
            <label className="catalogue-upload-label">Web preset</label>
            <div className="catalogue-upload-groups">
              {webPresets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={`catalogue-upload-group-chip ${webPresetKey === preset.key ? 'active' : ''}`}
                  onClick={() => onWebPresetKeyChange(webPresetKey === preset.key ? null : preset.key)}
                >
                  {preset.label}
                  <span className="catalogue-upload-group-primary">{preset.width}px</span>
                </button>
              ))}
            </div>
          </>
        )}

        {platform === 'mobile' && (
          <>
            <label className="catalogue-upload-label">Mobile OS</label>
            <div className="catalogue-upload-groups">
              {(['ios', 'android'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`catalogue-upload-group-chip ${mobileOs === item ? 'active' : ''}`}
                  onClick={() => onMobileOsChange(mobileOs === item ? null : item)}
                >
                  {item === 'ios' ? 'iOS' : 'Android'}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="catalogue-upload-label">Reference (optional)</label>
        <div className="catalogue-upload-ref">
          {referencePreview ? (
            <div className="catalogue-upload-ref-preview">
              <img src={referencePreview} alt="Reference" />
              <button type="button" className="catalogue-upload-ref-remove" onClick={onReferenceRemove}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ) : (
            <label className="catalogue-upload-ref-picker">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Add reference image</span>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(event) => {
                  onReferenceSelect(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />
            </label>
          )}
          <input
            className="catalogue-upload-ref-label"
            type="text"
            placeholder="Label (e.g. Binance Web)"
            value={referenceLabel}
            onChange={(event) => onReferenceLabelChange(event.target.value)}
          />
        </div>

        <UploadZone onFilesSelected={onFilesSelected} disabled={uploading || !uploadReady || projects.length === 0} />
        {projects.length === 0 ? (
          <p className="catalogue-upload-hint">Create a project first to start uploading screenshots.</p>
        ) : !uploadReady ? (
          <p className="catalogue-upload-hint">Fill screenshot details and classification to enable upload.</p>
        ) : !projectId ? (
          <p className="catalogue-upload-hint">No project selected. Upload will use your default project.</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
