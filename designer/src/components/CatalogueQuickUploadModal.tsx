import { createPortal } from 'react-dom';

import { CatalogueQuickUploadPanel } from './CatalogueQuickUploadPanel';
import { Dropdown } from './Dropdown';

interface QuickUploadQueuePreviewItem {
  id: string;
  fileName: string;
  parsedName: string;
  parsedGroup: string | null;
  parsedSequence: number | null;
}

interface WebPresetOption {
  key: string;
  label: string;
  width: number;
}

interface CatalogueQuickUploadModalProps {
  flowLabel: string;
  isOpen: boolean;
  projects: { id: string; name: string }[];
  projectId: string | null;
  quickUploadGroupMode: 'auto' | 'existing' | 'new';
  quickUploadExistingGroup: string | null;
  quickUploadNewGroup: string;
  quickUploadProjectGroups: string[];
  quickUploadQueue: QuickUploadQueuePreviewItem[];
  uploading: boolean;
  platform: 'web' | 'mobile' | null;
  theme: 'light' | 'dark' | null;
  webPresetKey: string | null;
  webPresets: WebPresetOption[];
  mobileOs: 'ios' | 'android' | null;
  onClose: () => void;
  onPlatformChange: (value: 'web' | 'mobile' | null) => void;
  onThemeChange: (value: 'light' | 'dark' | null) => void;
  onWebPresetKeyChange: (value: string | null) => void;
  onMobileOsChange: (value: 'ios' | 'android' | null) => void;
  onQuickUploadFlowLabelChange: (value: string) => void;
  onQuickUploadProjectChange: (value: string | null) => void;
  onQuickUploadFilesSelected: (files: File[]) => void;
  onQuickUploadGroupModeChange: (mode: 'auto' | 'existing' | 'new') => void;
  onQuickUploadExistingGroupChange: (value: string | null) => void;
  onQuickUploadNewGroupChange: (value: string) => void;
  onQuickUploadRemoveQueuedFile: (id: string) => void;
  onQuickUploadClearQueue: () => void;
  onQuickUploadUploadAll: () => void;
}

export function CatalogueQuickUploadModal({
  flowLabel,
  isOpen,
  projects,
  projectId,
  quickUploadGroupMode,
  quickUploadExistingGroup,
  quickUploadNewGroup,
  quickUploadProjectGroups,
  quickUploadQueue,
  uploading,
  platform,
  theme,
  webPresetKey,
  webPresets,
  mobileOs,
  onClose,
  onPlatformChange,
  onThemeChange,
  onWebPresetKeyChange,
  onMobileOsChange,
  onQuickUploadFlowLabelChange,
  onQuickUploadProjectChange,
  onQuickUploadFilesSelected,
  onQuickUploadGroupModeChange,
  onQuickUploadExistingGroupChange,
  onQuickUploadNewGroupChange,
  onQuickUploadRemoveQueuedFile,
  onQuickUploadClearQueue,
  onQuickUploadUploadAll,
}: CatalogueQuickUploadModalProps) {
  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="catalogue-upload-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1300 }}
    >
      <div
        className="catalogue-upload-modal catalogue-upload-modal-quick"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalogue-quick-upload-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="catalogue-quick-upload-title">Quick Upload</h3>
        <p className="catalogue-upload-subtitle">
          Name files as <code>{'{sequence}-{flow}-{screen-name}.png'}</code> (e.g. <code>01-deposit-select-coin.png</code>). Queue files, then upload all.
        </p>

        <Dropdown
          className="catalogue-upload-project-dropdown"
          value={projectId}
          placeholder="Project (optional)"
          options={projects.map((project) => ({ value: project.id, label: project.name }))}
          onChange={onQuickUploadProjectChange}
        />

        <CatalogueQuickUploadPanel
          flowLabel={flowLabel}
          uploading={uploading}
          quickUploadGroupMode={quickUploadGroupMode}
          quickUploadExistingGroup={quickUploadExistingGroup}
          quickUploadNewGroup={quickUploadNewGroup}
          quickUploadProjectGroups={quickUploadProjectGroups}
          quickUploadQueue={quickUploadQueue}
          platform={platform}
          theme={theme}
          webPresetKey={webPresetKey}
          webPresets={webPresets}
          mobileOs={mobileOs}
          onPlatformChange={onPlatformChange}
          onThemeChange={onThemeChange}
          onWebPresetKeyChange={onWebPresetKeyChange}
          onMobileOsChange={onMobileOsChange}
          onQuickUploadFlowLabelChange={onQuickUploadFlowLabelChange}
          onQuickUploadFilesSelected={onQuickUploadFilesSelected}
          onQuickUploadGroupModeChange={onQuickUploadGroupModeChange}
          onQuickUploadExistingGroupChange={onQuickUploadExistingGroupChange}
          onQuickUploadNewGroupChange={onQuickUploadNewGroupChange}
          onQuickUploadRemoveQueuedFile={onQuickUploadRemoveQueuedFile}
          onQuickUploadClearQueue={onQuickUploadClearQueue}
          onQuickUploadUploadAll={onQuickUploadUploadAll}
        />
      </div>
    </div>,
    document.body,
  );
}
