import { createPortal } from 'react-dom';

import { CatalogueQuickUploadPanel } from './CatalogueQuickUploadPanel';
import { Dropdown } from './Dropdown';

interface QuickUploadQueuePreviewItem {
  id: string;
  fileName: string;
  parsedName: string;
  parsedGroup: string | null;
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
  onClose: () => void;
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
  onClose,
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
        <p className="catalogue-upload-subtitle">Project selection is optional. Queue files first, then upload all.</p>

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
