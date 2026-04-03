import { Dropdown } from './Dropdown';
import { UploadZone } from './UploadZone';

interface QuickUploadQueueItem {
  id: string;
  fileName: string;
  parsedName: string;
  parsedGroup: string | null;
}

interface CatalogueQuickUploadPanelProps {
  flowLabel: string;
  uploading: boolean;
  quickUploadGroupMode: 'auto' | 'existing' | 'new';
  quickUploadExistingGroup: string | null;
  quickUploadNewGroup: string;
  quickUploadProjectGroups: string[];
  quickUploadQueue: QuickUploadQueueItem[];
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
  onQuickUploadFlowLabelChange,
  onQuickUploadFilesSelected,
  onQuickUploadGroupModeChange,
  onQuickUploadExistingGroupChange,
  onQuickUploadNewGroupChange,
  onQuickUploadRemoveQueuedFile,
  onQuickUploadClearQueue,
  onQuickUploadUploadAll,
}: CatalogueQuickUploadPanelProps) {
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

  return (
    <div className="catalogue-quick-upload-layout">
      <div className="catalogue-quick-upload-left">
        <label className="catalogue-upload-label">Flow</label>
        <input
          className="catalogue-filter catalogue-upload-project-select"
          type="text"
          placeholder="Flow name (e.g. Deposit)"
          value={flowLabel}
          onChange={(event) => onQuickUploadFlowLabelChange(event.target.value)}
        />

        <label className="catalogue-upload-label">Group assignment</label>
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
                      {item.parsedName} · Group: {getQueueGroupLabel(item)}
                    </span>
                  </span>
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
