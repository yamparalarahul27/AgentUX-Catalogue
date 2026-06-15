import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, LayoutGrid, Lock, Monitor, Moon, Smartphone, Sun, X } from 'lucide-react';

import androidLogo from '../assets/android-logo.svg';
import appleLogo from '../assets/apple-logo.svg';
import { useOnlineStatus } from '../hooks/use-online-status';
import {
  type CatalogueGroupAppearanceMap,
  resolveCatalogueGroupAppearance,
} from '../lib/catalogue-group-appearance';
import { MARKETING_BUCKET_GROUP } from '../lib/marketing-bucket';
import { buildConventionName } from '../lib/naming';
import { IconTooltip, IconTooltipProvider } from './IconTooltip';
import { UploadZone, type FolderDropContext } from './UploadZone';
import { PasteFromClipboardButton } from './PasteFromClipboardButton';

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
  // Marketing-role uploads: group selector becomes a locked Marketing
  // Bucket pill, plus a free-text "suggested catalogue group" hint.
  isMarketingRole: boolean;
  quickUploadSuggestedGroup: string;
  platform: 'web' | 'mobile' | null;
  theme: 'light' | 'dark' | null;
  webPresetKey: string | null;
  webPresets: WebPresetOption[];
  mobileOs: 'ios' | 'android' | null;
  // Drives the group icons shown next to each option in the group
  // combobox menu — mirrors the toolbar Group dropdown.
  groupAppearanceMap: CatalogueGroupAppearanceMap;
  onPlatformChange: (value: 'web' | 'mobile' | null) => void;
  onThemeChange: (value: 'light' | 'dark' | null) => void;
  onWebPresetKeyChange: (value: string | null) => void;
  onMobileOsChange: (value: 'ios' | 'android' | null) => void;
  onQuickUploadFlowLabelChange: (value: string) => void;
  onQuickUploadFilesSelected: (files: File[], context?: FolderDropContext) => void;
  onQuickUploadGroupChange: (value: string) => void;
  onQuickUploadSuggestedGroupChange: (value: string) => void;
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
  isMarketingRole,
  quickUploadSuggestedGroup,
  platform,
  theme,
  webPresetKey,
  webPresets,
  mobileOs,
  groupAppearanceMap,
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
  // Uploads need a live connection — disable the trigger while offline /
  // unstable so the user doesn't kick off a multi-file upload that will
  // half-fail. PR 3 of the offline program will queue uploads properly;
  // until then this is the safe gate.
  const onlineStatus = useOnlineStatus();
  const networkBlocked = onlineStatus !== 'online';
  const canUploadAllQuick = Boolean(
    quickUploadQueue.length > 0 && flowReady && !uploading && !networkBlocked,
  );

  // Enter to submit when the Upload All button is enabled. Skipped while a
  // text field has focus so the in-progress Flow/Group commit (which also
  // uses Enter) isn't intercepted; also skipped while a combobox is open.
  useEffect(() => {
    if (!canUploadAllQuick) return;
    function handleEnter(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.isComposing) return;
      if (flowMenuOpen || groupMenuOpen) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      event.preventDefault();
      onQuickUploadUploadAll();
    }
    document.addEventListener('keydown', handleEnter);
    return () => document.removeEventListener('keydown', handleEnter);
  }, [canUploadAllQuick, flowMenuOpen, groupMenuOpen, onQuickUploadUploadAll]);

  function getQueueGroupLabel(item: { parsedGroup: string | null }) {
    return quickUploadGroup.trim() || item.parsedGroup || 'No group';
  }

  // Auto-select the newest-added file for preview. Tracks the prior
  // queue length so we can detect a "grew by N" event and jump to the
  // latest tail item. Falls back to the tail if the current selection
  // got removed. Manual clicks on a Quick view button still win — we
  // only touch selection when something changed.
  const prevQueueLengthRef = useRef(0);
  useEffect(() => {
    if (quickUploadQueue.length === 0) {
      setSelectedPreviewId(null);
      prevQueueLengthRef.current = 0;
      return;
    }
    const last = quickUploadQueue[quickUploadQueue.length - 1];
    const grew = quickUploadQueue.length > prevQueueLengthRef.current;
    const selectionStale = !selectedPreviewId
      || !quickUploadQueue.some((item) => item.id === selectedPreviewId);
    if (grew || selectionStale) {
      setSelectedPreviewId(last.id);
    }
    prevQueueLengthRef.current = quickUploadQueue.length;
  }, [quickUploadQueue, selectedPreviewId]);

  const selectedPreviewItem = useMemo(
    () => quickUploadQueue.find((item) => item.id === selectedPreviewId) ?? null,
    [quickUploadQueue, selectedPreviewId],
  );

  return (
    <IconTooltipProvider>
    <div className="catalogue-quick-upload-layout">
      <div className="catalogue-quick-upload-left">
        <div className="catalogue-quick-upload-fields-row">
          <div className="catalogue-quick-upload-field">
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
          </div>

          <div className="catalogue-quick-upload-field">
            <label className="catalogue-upload-label">Group</label>
            {isMarketingRole ? (
              <div className="catalogue-upload-group-locked" title="Marketing role uploads land in the Marketing Bucket. Admin promotes via the lightbox.">
                <Lock size={14} aria-hidden="true" />
                <span>{MARKETING_BUCKET_GROUP}</span>
              </div>
            ) : (
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
                    {filteredGroupOptions.matches.map((group) => {
                      const appearance = resolveCatalogueGroupAppearance(groupAppearanceMap, group, null);
                      return (
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
                          <span className="catalogue-flow-combobox__item-icon" aria-hidden="true">
                            {appearance.iconUrl ? (
                              <img src={appearance.iconUrl} alt="" />
                            ) : (
                              <LayoutGrid size={13} />
                            )}
                          </span>
                          <span>{group}</span>
                        </button>
                      );
                    })}
                    {quickUploadGroup.trim() && !filteredGroupOptions.exactMatch && (
                      <div className="catalogue-flow-combobox__hint">
                        Press Enter or click outside to use new group “{quickUploadGroup.trim()}”
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {isMarketingRole && (
          <>
            <label className="catalogue-upload-label catalogue-upload-label--group-assignment">
              Suggested catalogue group (optional)
            </label>
            <input
              className="catalogue-filter catalogue-upload-project-select catalogue-quick-upload-flow-input"
              type="text"
              placeholder="e.g. Apex Promos — Admin sees this hint when reviewing"
              value={quickUploadSuggestedGroup}
              onChange={(event) => onQuickUploadSuggestedGroupChange(event.target.value)}
              autoComplete="off"
            />
          </>
        )}

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

        <div className="catalogue-quick-upload-drop-row">
          <UploadZone onFilesSelected={onQuickUploadFilesSelected} disabled={uploading} />
          <PasteFromClipboardButton onFilesSelected={onQuickUploadFilesSelected} disabled={uploading} />
        </div>
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
                  <IconTooltip label="Quick view">
                    <button
                      type="button"
                      className={`catalogue-quick-queue-preview${selectedPreviewId === item.id ? ' is-active' : ''}`}
                      aria-label={`Quick view ${item.fileName}`}
                      aria-pressed={selectedPreviewId === item.id}
                      onClick={() => setSelectedPreviewId(item.id)}
                    >
                      <Eye size={12} />
                    </button>
                  </IconTooltip>
                  <IconTooltip label="Remove from queue">
                    <button
                      type="button"
                      className="catalogue-quick-queue-remove"
                      onClick={() => onQuickUploadRemoveQueuedFile(item.id)}
                    >
                      <X size={12} />
                    </button>
                  </IconTooltip>
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
            title={networkBlocked ? "You're offline — uploads need a live connection" : undefined}
          >
            Upload All ({quickUploadQueue.length})
          </button>
        </div>
      </div>
    </div>
    </IconTooltipProvider>
  );
}
