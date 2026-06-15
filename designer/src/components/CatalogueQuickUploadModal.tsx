import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { CatalogueQuickUploadPanel } from './CatalogueQuickUploadPanel';
import type { FolderDropContext } from './UploadZone';
import type { CatalogueGroupAppearanceMap } from '../lib/catalogue-group-appearance';

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
  existingFlows: string[];
  flowLabel: string;
  isOpen: boolean;
  projects: { id: string; name: string }[];
  projectId: string | null;
  quickUploadGroup: string;
  quickUploadProjectGroups: string[];
  quickUploadQueue: QuickUploadQueuePreviewItem[];
  isMarketingRole: boolean;
  quickUploadSuggestedGroup: string;
  uploading: boolean;
  platform: 'web' | 'mobile' | null;
  theme: 'light' | 'dark' | null;
  webPresetKey: string | null;
  webPresets: WebPresetOption[];
  mobileOs: 'ios' | 'android' | null;
  // Used to render each group's icon next to its name in the group
  // combobox menu. Mirrors the toolbar Group dropdown's behaviour.
  groupAppearanceMap: CatalogueGroupAppearanceMap;
  onClose: () => void;
  onPlatformChange: (value: 'web' | 'mobile' | null) => void;
  onThemeChange: (value: 'light' | 'dark' | null) => void;
  onWebPresetKeyChange: (value: string | null) => void;
  onMobileOsChange: (value: 'ios' | 'android' | null) => void;
  onQuickUploadFlowLabelChange: (value: string) => void;
  onQuickUploadProjectChange: (value: string | null) => void;
  onQuickUploadFilesSelected: (files: File[], context?: FolderDropContext) => void;
  onQuickUploadGroupChange: (value: string) => void;
  onQuickUploadSuggestedGroupChange: (value: string) => void;
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
  existingFlows,
  flowLabel,
  quickUploadGroup,
  quickUploadProjectGroups,
  quickUploadQueue,
  isMarketingRole,
  quickUploadSuggestedGroup,
  uploading,
  platform,
  theme,
  webPresetKey,
  webPresets,
  mobileOs,
  groupAppearanceMap,
  onClose,
  onPlatformChange,
  onThemeChange,
  onWebPresetKeyChange,
  onMobileOsChange,
  onQuickUploadFlowLabelChange,
  onQuickUploadFilesSelected,
  onQuickUploadGroupChange,
  onQuickUploadSuggestedGroupChange,
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
            <X size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
      <CatalogueQuickUploadPanel
        existingFlows={existingFlows}
        flowLabel={flowLabel}
        uploading={uploading}
        quickUploadGroup={quickUploadGroup}
        quickUploadProjectGroups={quickUploadProjectGroups}
        quickUploadQueue={quickUploadQueue}
        isMarketingRole={isMarketingRole}
        quickUploadSuggestedGroup={quickUploadSuggestedGroup}
        platform={platform}
        theme={theme}
        webPresetKey={webPresetKey}
        webPresets={webPresets}
        mobileOs={mobileOs}
        groupAppearanceMap={groupAppearanceMap}
        onPlatformChange={onPlatformChange}
        onThemeChange={onThemeChange}
        onWebPresetKeyChange={onWebPresetKeyChange}
        onMobileOsChange={onMobileOsChange}
        onQuickUploadFlowLabelChange={onQuickUploadFlowLabelChange}
        onQuickUploadFilesSelected={onQuickUploadFilesSelected}
        onQuickUploadGroupChange={onQuickUploadGroupChange}
        onQuickUploadSuggestedGroupChange={onQuickUploadSuggestedGroupChange}
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
