import { useEffect, useMemo, useState } from 'react';
import { buildConventionName } from '../lib/naming';
import { Dropdown } from './Dropdown';
import { UploadZone } from './UploadZone';

interface QuickUploadQueueItem {
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

interface CatalogueQuickUploadPanelProps {
  flowLabel: string;
  uploading: boolean;
  quickUploadGroupMode: 'auto' | 'existing' | 'new';
  quickUploadExistingGroup: string | null;
  quickUploadNewGroup: string;
  quickUploadProjectGroups: string[];
  quickUploadQueue: QuickUploadQueueItem[];
  platform: 'web' | 'mobile' | null;
  theme: 'light' | 'dark' | null;
  webPresetKey: string | null;
  webPresets: WebPresetOption[];
  mobileOs: 'ios' | 'android' | null;
  onPlatformChange: (value: 'web' | 'mobile' | null) => void;
  onThemeChange: (value: 'light' | 'dark' | null) => void;
  onWebPresetKeyChange: (value: string | null) => void;
  onMobileOsChange: (value: 'ios' | 'android' | null) => void;
  onQuickUploadFlowLabelChange: (value: string) => void;
  onQuickUploadFilesSelected: (files: File[]) => void;
  onQuickUploadGroupModeChange: (mode: 'auto' | 'existing' | 'new') => void;
  onQuickUploadExistingGroupChange: (value: string | null) => void;
  onQuickUploadNewGroupChange: (value: string) => void;
  onQuickUploadRemoveQueuedFile: (id: string) => void;
  onQuickUploadClearQueue: () => void;
  onQuickUploadUploadAll: () => void;
}

export function CatalogueQuickUploadPanel({
  flowLabel,
  uploading,
  quickUploadGroupMode,
  quickUploadExistingGroup,
  quickUploadNewGroup,
  quickUploadProjectGroups,
  quickUploadQueue,
  platform,
  theme,
  webPresetKey,
  webPresets,
  mobileOs,
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
}: CatalogueQuickUploadPanelProps) {
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const quickUploadGroupReady = quickUploadGroupMode === 'auto'
    || (quickUploadGroupMode === 'existing'
      ? Boolean(quickUploadExistingGroup)
      : Boolean(quickUploadNewGroup.trim()));
  const canUploadAllQuick = Boolean(
    quickUploadQueue.length > 0 && quickUploadGroupReady && !uploading,
  );

  function getQueueGroupLabel(item: { parsedGroup: string | null }) {
    if (quickUploadGroupMode === 'existing') return quickUploadExistingGroup || 'Select group';
    if (quickUploadGroupMode === 'new') return quickUploadNewGroup.trim() || 'Enter new group';
    return item.parsedGroup || 'No group';
  }

  useEffect(() => {
    if (quickUploadQueue.length === 0) {
      setSelectedPreviewId(null);
      return;
    }
    if (!selectedPreviewId || !quickUploadQueue.some((item) => item.id === selectedPreviewId)) {
      setSelectedPreviewId(quickUploadQueue[0].id);
    }
  }, [quickUploadQueue, selectedPreviewId]);

  const selectedPreviewItem = useMemo(
    () => quickUploadQueue.find((item) => item.id === selectedPreviewId) ?? null,
    [quickUploadQueue, selectedPreviewId],
  );

  return (
    <div className="catalogue-quick-upload-layout">
      <div className="catalogue-quick-upload-left">
        <label className="catalogue-upload-label">Flow</label>
        <input
          className="catalogue-filter catalogue-upload-project-select catalogue-quick-upload-flow-input"
          type="text"
          placeholder="Flow name (e.g. Deposit)"
          value={flowLabel}
          onChange={(event) => onQuickUploadFlowLabelChange(event.target.value)}
        />

        <div className="catalogue-upload-row">
          <div className="catalogue-upload-row__col">
            <label className="catalogue-upload-label catalogue-upload-label--group-assignment">Group assignment</label>
            <div className="catalogue-upload-groups">
              <button
                type="button"
                className={`catalogue-upload-group-chip ${quickUploadGroupMode === 'auto' ? 'active' : ''}`}
                onClick={() => onQuickUploadGroupModeChange('auto')}
              >
                Auto from filename
              </button>
              <button
                type="button"
                className={`catalogue-upload-group-chip ${quickUploadGroupMode === 'existing' ? 'active' : ''}`}
                onClick={() => onQuickUploadGroupModeChange('existing')}
              >
                Existing group
              </button>
              <button
                type="button"
                className={`catalogue-upload-group-chip ${quickUploadGroupMode === 'new' ? 'active' : ''}`}
                onClick={() => onQuickUploadGroupModeChange('new')}
              >
                New group
              </button>
            </div>
          </div>

          <div className="catalogue-upload-row__col catalogue-upload-row__col--theme">
            <label className="catalogue-upload-label catalogue-upload-label--group-assignment">Theme</label>
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
          </div>
        </div>

        {quickUploadGroupMode === 'existing' && (
          quickUploadProjectGroups.length > 0 ? (
            <Dropdown
              className="catalogue-upload-project-dropdown"
              value={quickUploadExistingGroup}
              placeholder="Select an existing group..."
              options={quickUploadProjectGroups.map((group) => ({ value: group, label: group }))}
              onChange={onQuickUploadExistingGroupChange}
            />
          ) : (
            <p className="catalogue-upload-hint">No groups found for this project yet. Create one instead.</p>
          )
        )}

        {quickUploadGroupMode === 'new' && (
          <input
            className="catalogue-filter catalogue-upload-project-select"
            type="text"
            placeholder="Enter new group name..."
            value={quickUploadNewGroup}
            onChange={(event) => onQuickUploadNewGroupChange(event.target.value)}
          />
        )}

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

        <p className="catalogue-upload-hint" style={{ textAlign: 'left', padding: '8px 0' }}>
          Naming format: <code>01-deposit-select-coin.png</code>
        </p>
        <UploadZone onFilesSelected={onQuickUploadFilesSelected} disabled={uploading} />
      </div>

      <div className="catalogue-quick-upload-right">
        <div className="catalogue-quick-queue">
          <div className="catalogue-quick-queue-header">
            <span>Queued screenshots ({quickUploadQueue.length})</span>
            <button
              type="button"
              className="catalogue-quick-queue-clear"
              onClick={onQuickUploadClearQueue}
              disabled={quickUploadQueue.length === 0}
            >
              Clear all
            </button>
          </div>

          {quickUploadQueue.length > 0 ? (
            <ul className="catalogue-quick-queue-list">
              {quickUploadQueue.map((item) => (
                <li key={item.id} className="catalogue-quick-queue-item">
                  <span className="catalogue-quick-queue-copy">
                    <span className="catalogue-quick-queue-file">{item.fileName}</span>
                    <span className="catalogue-quick-queue-meta">
                      {buildConventionName(item.parsedSequence, flowLabel || item.parsedGroup, item.parsedName)} · Group: {getQueueGroupLabel(item)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="catalogue-quick-queue-remove"
                    title="Quick view"
                    aria-label={`Quick view ${item.fileName}`}
                    onClick={() => setSelectedPreviewId(item.id)}
                    style={{
                      borderColor: selectedPreviewId === item.id ? 'rgba(99,102,241,0.55)' : undefined,
                      color: selectedPreviewId === item.id ? '#c7d2fe' : undefined,
                      background: selectedPreviewId === item.id ? 'rgba(99,102,241,0.12)' : undefined,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="catalogue-quick-queue-remove"
                    title="Remove from queue"
                    onClick={() => onQuickUploadRemoveQueuedFile(item.id)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="catalogue-upload-hint">Add one or more files to create an upload queue.</p>
          )}

          {selectedPreviewItem && (
            <div
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                background: 'rgba(9,9,11,0.9)',
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: '#d4d4d8',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={selectedPreviewItem.fileName}
              >
                Preview: {selectedPreviewItem.fileName}
              </div>
              <img
                src={selectedPreviewItem.previewUrl}
                alt={selectedPreviewItem.fileName}
                style={{
                  width: '100%',
                  maxHeight: 240,
                  objectFit: 'contain',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: '#09090b',
                }}
              />
            </div>
          )}

          <button
            type="button"
            className="btn-primary catalogue-quick-upload-all"
            disabled={!canUploadAllQuick}
            onClick={onQuickUploadUploadAll}
          >
            Upload All ({quickUploadQueue.length})
          </button>
        </div>
      </div>
    </div>
  );
}
