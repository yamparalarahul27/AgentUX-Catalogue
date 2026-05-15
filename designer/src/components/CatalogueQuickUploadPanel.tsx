import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Monitor, Moon, Smartphone, Sun, X } from 'lucide-react';

import androidLogo from '../assets/android-logo.svg';
import appleLogo from '../assets/apple-logo.svg';
import { buildConventionName } from '../lib/naming';
import { UploadZone, type FolderDropContext } from './UploadZone';

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
  existingFlows: string[];
  flowLabel: string;
  uploading: boolean;
  quickUploadGroup: string;
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
  onQuickUploadFilesSelected: (files: File[], context?: FolderDropContext) => void;
  onQuickUploadGroupChange: (value: string) => void;
  onQuickUploadRemoveQueuedFile: (id: string) => void;
  onQuickUploadClearQueue: () => void;
  onQuickUploadUploadAll: () => void;
}

export function CatalogueQuickUploadPanel({
  existingFlows,
  flowLabel,
  uploading,
  quickUploadGroup,
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
  onQuickUploadGroupChange,
  onQuickUploadRemoveQueuedFile,
  onQuickUploadClearQueue,
  onQuickUploadUploadAll,
}: CatalogueQuickUploadPanelProps) {
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const [flowMenuOpen, setFlowMenuOpen] = useState(false);
  const flowComboboxRef = useRef<HTMLDivElement>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupComboboxRef = useRef<HTMLDivElement>(null);

  const filteredFlowOptions = useMemo(() => {
    const query = flowLabel.trim().toLowerCase();
    const exactMatch = existingFlows.find((flow) => flow.toLowerCase() === query);
    const matches = query
      ? existingFlows.filter((flow) => flow.toLowerCase().includes(query))
      : existingFlows;
    return { matches: matches.slice(0, 8), exactMatch: Boolean(exactMatch) };
  }, [existingFlows, flowLabel]);

  const filteredGroupOptions = useMemo(() => {
    const query = quickUploadGroup.trim().toLowerCase();
    const exactMatch = quickUploadProjectGroups.find((group) => group.toLowerCase() === query);
    const matches = query
      ? quickUploadProjectGroups.filter((group) => group.toLowerCase().includes(query))
      : quickUploadProjectGroups;
    return { matches: matches.slice(0, 8), exactMatch: Boolean(exactMatch) };
  }, [quickUploadProjectGroups, quickUploadGroup]);

  useEffect(() => {
    if (!flowMenuOpen) return;
    function handlePointer(event: MouseEvent) {
      if (flowComboboxRef.current && !flowComboboxRef.current.contains(event.target as Node)) {
        setFlowMenuOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setFlowMenuOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [flowMenuOpen]);

  useEffect(() => {
    if (!groupMenuOpen) return;
    function handlePointer(event: MouseEvent) {
      if (groupComboboxRef.current && !groupComboboxRef.current.contains(event.target as Node)) {
        setGroupMenuOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setGroupMenuOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [groupMenuOpen]);

  const flowReady = Boolean(flowLabel.trim());
  const canUploadAllQuick = Boolean(
    quickUploadQueue.length > 0 && flowReady && !uploading,
  );

  function getQueueGroupLabel(item: { parsedGroup: string | null }) {
    return quickUploadGroup.trim() || item.parsedGroup || 'No group';
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
        <label className="catalogue-upload-label">
          Flow <span className="catalogue-upload-required" aria-hidden="true">*</span>
        </label>
        <div className="catalogue-flow-combobox" ref={flowComboboxRef}>
          <input
            className="catalogue-filter catalogue-upload-project-select catalogue-quick-upload-flow-input"
            type="text"
            placeholder="Flow name (e.g. Deposit)"
            value={flowLabel}
            onChange={(event) => {
              onQuickUploadFlowLabelChange(event.target.value);
              setFlowMenuOpen(true);
            }}
            onFocus={() => setFlowMenuOpen(true)}
            autoComplete="off"
          />
          {flowMenuOpen && filteredFlowOptions.matches.length > 0 && (
            <div className="catalogue-flow-combobox__menu" role="listbox">
              {filteredFlowOptions.matches.map((flow) => (
                <button
                  key={flow}
                  type="button"
                  role="option"
                  aria-selected={flow === flowLabel}
                  className={`catalogue-flow-combobox__item ${flow === flowLabel ? 'is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onQuickUploadFlowLabelChange(flow);
                    setFlowMenuOpen(false);
                  }}
                >
                  {flow}
                </button>
              ))}
              {flowLabel.trim() && !filteredFlowOptions.exactMatch && (
                <div className="catalogue-flow-combobox__hint">
                  Press Enter or click outside to use new flow “{flowLabel.trim()}”
                </div>
              )}
            </div>
          )}
        </div>

        <label className="catalogue-upload-label catalogue-upload-label--group-assignment">Group</label>
        <div className="catalogue-flow-combobox" ref={groupComboboxRef}>
          <input
            className="catalogue-filter catalogue-upload-project-select catalogue-quick-upload-flow-input"
            type="text"
            placeholder="Search or add group (blank = use filename)"
            value={quickUploadGroup}
            onChange={(event) => {
              onQuickUploadGroupChange(event.target.value);
              setGroupMenuOpen(true);
            }}
            onFocus={() => setGroupMenuOpen(true)}
            autoComplete="off"
          />
          {groupMenuOpen && (filteredGroupOptions.matches.length > 0 || quickUploadGroup.trim()) && (
            <div className="catalogue-flow-combobox__menu" role="listbox">
              {filteredGroupOptions.matches.map((group) => (
                <button
                  key={group}
                  type="button"
                  role="option"
                  aria-selected={group === quickUploadGroup}
                  className={`catalogue-flow-combobox__item ${group === quickUploadGroup ? 'is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onQuickUploadGroupChange(group);
                    setGroupMenuOpen(false);
                  }}
                >
                  {group}
                </button>
              ))}
              {quickUploadGroup.trim() && !filteredGroupOptions.exactMatch && (
                <div className="catalogue-flow-combobox__hint">
                  Press Enter or click outside to use new group “{quickUploadGroup.trim()}”
                </div>
              )}
            </div>
          )}
        </div>

        <div className="catalogue-upload-row">
          <div className="catalogue-upload-row__col">
            <label className="catalogue-upload-label">Theme</label>
            <div className="catalogue-upload-groups">
              {(['light', 'dark'] as const).map((item) => {
                const label = item === 'light' ? 'Light' : 'Dark';
                const Icon = item === 'light' ? Sun : Moon;
                return (
                  <button
                    key={item}
                    type="button"
                    className={`catalogue-upload-group-chip catalogue-upload-group-chip--icon ${theme === item ? 'active' : ''}`}
                    onClick={() => onThemeChange(theme === item ? null : item)}
                    aria-label={label}
                    title={label}
                  >
                    <Icon size={16} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="catalogue-upload-row__col">
            <label className="catalogue-upload-label">Platform</label>
            <div className="catalogue-upload-groups">
              {(['web', 'mobile'] as const).map((item) => {
                const label = item === 'web' ? 'Web' : 'Mobile';
                const Icon = item === 'web' ? Monitor : Smartphone;
                return (
                  <button
                    key={item}
                    type="button"
                    className={`catalogue-upload-group-chip catalogue-upload-group-chip--icon ${platform === item ? 'active' : ''}`}
                    onClick={() => onPlatformChange(platform === item ? null : item)}
                    aria-label={label}
                    title={label}
                  >
                    <Icon size={16} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
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
              {(['ios', 'android'] as const).map((item) => {
                const label = item === 'ios' ? 'iOS' : 'Android';
                const src = item === 'ios' ? appleLogo : androidLogo;
                return (
                  <button
                    key={item}
                    type="button"
                    className={`catalogue-upload-group-chip catalogue-upload-group-chip--icon ${mobileOs === item ? 'active' : ''}`}
                    onClick={() => onMobileOsChange(mobileOs === item ? null : item)}
                    aria-label={label}
                    title={label}
                  >
                    <img src={src} alt="" aria-hidden="true" width={16} height={16} />
                  </button>
                );
              })}
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
                    <Eye size={12} />
                  </button>
                  <button
                    type="button"
                    className="catalogue-quick-queue-remove"
                    title="Remove from queue"
                    onClick={() => onQuickUploadRemoveQueuedFile(item.id)}
                  >
                    <X size={12} />
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

          {quickUploadQueue.length > 0 && !flowReady && (
            <p className="catalogue-upload-hint catalogue-upload-hint--required">
              Flow name is required.
            </p>
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
