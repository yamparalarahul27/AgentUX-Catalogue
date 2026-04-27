import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { CatalogueQuickUploadPanel } from './CatalogueQuickUploadPanel';

interface QuickUploadQueuePreviewItem {
  id: string;
  fileName: string;
  previewUrl: string;
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

function useIsMobile(breakpoint = 860) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    function handler(event: MediaQueryListEvent) {
      setIsMobile(event.matches);
    }
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

function QuickUploadContent({
  flowLabel,
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
  onQuickUploadFilesSelected,
  onQuickUploadGroupModeChange,
  onQuickUploadExistingGroupChange,
  onQuickUploadNewGroupChange,
  onQuickUploadRemoveQueuedFile,
  onQuickUploadClearQueue,
  onQuickUploadUploadAll,
  showCloseButton,
}: Omit<CatalogueQuickUploadModalProps, 'isOpen'> & { showCloseButton?: boolean }) {
  return (
    <>
      <div className="catalogue-quick-panel-header">
        <h3 id="catalogue-quick-upload-title">Quick Upload</h3>
        {showCloseButton && (
          <button
            type="button"
            className="catalogue-quick-panel-close"
            onClick={onClose}
            aria-label="Close upload panel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
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
    </>
  );
}

export function CatalogueQuickUploadModal(props: CatalogueQuickUploadModalProps) {
  const { isOpen, onClose } = props;
  const isMobile = useIsMobile();

  if (!isOpen) {
    return null;
  }

  // Mobile: bottom sheet via portal (existing behavior)
  if (isMobile) {
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
          <QuickUploadContent {...props} showCloseButton={false} />
        </div>
      </div>,
      document.body,
    );
  }

  // Desktop: inline side panel
  return (
    <aside className="catalogue-quick-panel" role="complementary" aria-label="Quick Upload">
      <div className="catalogue-quick-panel-inner">
        <QuickUploadContent {...props} showCloseButton />
      </div>
    </aside>
  );
}
