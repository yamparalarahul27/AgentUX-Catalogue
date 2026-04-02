import type { Flow, ScreenshotNode } from '../types';
import {
  FLOW_FILTER_ALL,
  type CatalogueFlowFilter,
} from '../hooks/use-catalogue-filters';
import { CatalogueCard } from './CatalogueCard';
import { ConfirmModal } from './ConfirmModal';
import { Dropdown } from './Dropdown';
import { FlowAssignModal } from './FlowAssignModal';
import { CatalogueQuickUploadPanel } from './CatalogueQuickUploadPanel';
import { Toast } from './Toast';
import { UploadZone } from './UploadZone';

interface CatalogueContentProps {
  activeFlowFilter: CatalogueFlowFilter;
  filterGroup: string | null;
  filterPlatform: string | null;
  filterProject: string | null;
  filterTheme: string | null;
  filteredScreenshots: ScreenshotNode[];
  flowMap: Record<string, string>;
  groupedScreenshots: Record<string, ScreenshotNode[]>;
  loading: boolean;
  primaryGroup: string | null;
  projectMap: Record<string, string>;
  projectsCount: number;
  searchQuery: string;
  selected: Set<string>;
  userEmail: string;
  vsGroups: string[];
  onAssignFlow: (id: string) => void;
  onChangeGroup: (id: string, group: string | null) => Promise<void>;
  onCommentCountChange: (screenshotId: string, delta: number) => void;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onReplaceImage: (id: string, file: File) => Promise<void>;
  onToggleGroupSelect: (items: ScreenshotNode[]) => void;
  onToggleSelect: (id: string) => void;
  onPlatformChange: (id: string, platform: 'mobile' | 'web' | null) => Promise<void>;
}

export function CatalogueContent({
  activeFlowFilter,
  filterGroup,
  filterPlatform,
  filterProject,
  filterTheme,
  filteredScreenshots,
  flowMap,
  groupedScreenshots,
  loading,
  primaryGroup,
  projectMap,
  projectsCount,
  searchQuery,
  selected,
  userEmail,
  vsGroups,
  onAssignFlow,
  onChangeGroup,
  onCommentCountChange,
  onDelete,
  onRename,
  onReplaceImage,
  onToggleGroupSelect,
  onToggleSelect,
  onPlatformChange,
}: CatalogueContentProps) {
  const hasActiveFilters = Boolean(
    searchQuery ||
    filterProject ||
    filterGroup ||
    filterPlatform ||
    filterTheme ||
    activeFlowFilter !== FLOW_FILTER_ALL,
  );

  if (loading) {
    return (
      <div className="empty-state">
        <div className="loading-spinner" />
        <p>Loading catalogue...</p>
      </div>
    );
  }

  if (projectsCount === 0) {
    return (
      <div className="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <h2>No projects yet</h2>
        <p>Create a project first to start uploading screenshots.</p>
        <button className="btn-primary" onClick={() => { window.location.href = '/designer/'; }}>Go to Projects</button>
      </div>
    );
  }

  if (filteredScreenshots.length === 0) {
    return (
      <div className="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <h2>{hasActiveFilters ? 'No matching screenshots' : 'No screenshots yet'}</h2>
        <p>{hasActiveFilters ? 'Try adjusting your search, filters, or selected flow.' : 'Upload screenshots to get started.'}</p>
      </div>
    );
  }

  return (
    <div className="catalogue-content">
      {Object.entries(groupedScreenshots).map(([groupName, items]) => {
        const allSelected = items.every((screenshot) => selected.has(screenshot.id));

        return (
          <section key={groupName} className="catalogue-section">
            <h3 className="catalogue-section-title">
              <button
                type="button"
                className="catalogue-section-select"
                title={allSelected ? 'Deselect group' : 'Select group'}
                onClick={() => onToggleGroupSelect(items)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {allSelected
                    ? <><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" /><polyline points="9 11 12 14 20 6" stroke="#0f0f10" strokeWidth="3" /></>
                    : <rect x="3" y="3" width="18" height="18" rx="2" />}
                </svg>
              </button>
              {groupName}
              <span className="catalogue-section-count">{items.length}</span>
              {primaryGroup === groupName && <span className="catalogue-badge catalogue-badge-primary">Primary</span>}
              {vsGroups.includes(groupName) && <span className="catalogue-badge catalogue-badge-vs">Vs</span>}
            </h3>
            <div className="catalogue-grid">
              {items.map((screenshot) => (
                <CatalogueCard
                  key={screenshot.id}
                  screenshot={screenshot}
                  projectName={projectMap[screenshot.project_id] || 'Unknown'}
                  flowName={screenshot.flow_id ? (flowMap[screenshot.flow_id] || null) : null}
                  isPrimary={Boolean(primaryGroup && screenshot.group === primaryGroup)}
                  isVs={vsGroups.includes(screenshot.group || '')}
                  isSelected={selected.has(screenshot.id)}
                  onToggleSelect={onToggleSelect}
                  onRename={onRename}
                  onChangeGroup={onChangeGroup}
                  onDelete={onDelete}
                  onReplaceImage={onReplaceImage}
                  onAssignFlow={onAssignFlow}
                  onPlatformChange={onPlatformChange}
                  userEmail={userEmail}
                  onCommentCountChange={onCommentCountChange}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface CatalogueOverlaysProps {
  allGroups: string[];
  assignModalOpen: boolean;
  assigningFlows: Flow[];
  assigningScreenshot: ScreenshotNode | null;
  bulkAction: 'assign' | 'group' | 'platform' | null;
  bulkFlows: Flow[];
  bulkGroupValue: string;
  confirmDeleteOpen: boolean;
  newGroupName: string;
  primaryGroup: string | null;
  projects: { id: string; name: string }[];
  quickUploadProjectId: string | null;
  quickUploadGroupMode: 'auto' | 'existing' | 'new';
  quickUploadExistingGroup: string | null;
  quickUploadNewGroup: string;
  quickUploadProjectGroups: string[];
  quickUploadQueue: {
    id: string;
    fileName: string;
    parsedName: string;
    parsedGroup: string | null;
  }[];
  selectedCount: number;
  showQuickUpload: boolean;
  showUpload: boolean;
  toast: { message: string; type: 'error' | 'success' | 'info' } | null;
  uploadGroup: string;
  uploadProjectGroups: string[];
  uploadProjectId: string | null;
  uploadProjectPrimary: string | null;
  uploadRefLabel: string;
  uploadRefPreview: string | null;
  uploadTheme: 'light' | 'dark' | null;
  uploading: boolean;
  onAssignFlow: (flowId: string | null) => void;
  onBulkActionChange: (action: 'assign' | 'group' | 'platform' | null) => void;
  onBulkAssignFlow: (flowId: string | null) => void;
  onBulkChangeGroup: (group: string) => void;
  onBulkGroupValueChange: (value: string) => void;
  onBulkPlatform: (platform: 'mobile' | 'web' | null) => void;
  onCloseAssignModal: () => void;
  onCloseConfirmDelete: () => void;
  onCloseQuickUpload: () => void;
  onCloseToast: () => void;
  onCloseUpload: () => void;
  onConfirmBulkDelete: () => void;
  onQuickUploadFilesSelected: (files: File[]) => void;
  onQuickUploadProjectChange: (value: string | null) => void;
  onQuickUploadGroupModeChange: (mode: 'auto' | 'existing' | 'new') => void;
  onQuickUploadExistingGroupChange: (value: string | null) => void;
  onQuickUploadNewGroupChange: (value: string) => void;
  onQuickUploadRemoveQueuedFile: (id: string) => void;
  onQuickUploadClearQueue: () => void;
  onQuickUploadUploadAll: () => void;
  onRemoveUploadReference: () => void;
  onSelectUploadReference: (file: File | null) => void;
  onUploadFilesSelected: (files: File[], group: string, theme: 'light' | 'dark' | null) => void;
  onUploadGroupChange: (value: string) => void;
  onUploadProjectChange: (value: string | null) => void;
  onUploadRefLabelChange: (value: string) => void;
  onUploadThemeChange: (value: 'light' | 'dark' | null) => void;
  onNewGroupNameChange: (value: string) => void;
}

export function CatalogueOverlays({
  allGroups,
  assignModalOpen,
  assigningFlows,
  assigningScreenshot,
  bulkAction,
  bulkFlows,
  bulkGroupValue,
  confirmDeleteOpen,
  newGroupName,
  primaryGroup,
  projects,
  quickUploadProjectId,
  quickUploadGroupMode,
  quickUploadExistingGroup,
  quickUploadNewGroup,
  quickUploadProjectGroups,
  quickUploadQueue,
  selectedCount,
  showQuickUpload,
  showUpload,
  toast,
  uploadGroup,
  uploadProjectGroups,
  uploadProjectId,
  uploadProjectPrimary,
  uploadRefLabel,
  uploadRefPreview,
  uploadTheme,
  uploading,
  onAssignFlow,
  onBulkActionChange,
  onBulkAssignFlow,
  onBulkChangeGroup,
  onBulkGroupValueChange,
  onBulkPlatform,
  onCloseAssignModal,
  onCloseConfirmDelete,
  onCloseQuickUpload,
  onCloseToast,
  onCloseUpload,
  onConfirmBulkDelete,
  onQuickUploadFilesSelected,
  onQuickUploadProjectChange,
  onQuickUploadGroupModeChange,
  onQuickUploadExistingGroupChange,
  onQuickUploadNewGroupChange,
  onQuickUploadRemoveQueuedFile,
  onQuickUploadClearQueue,
  onQuickUploadUploadAll,
  onRemoveUploadReference,
  onSelectUploadReference,
  onUploadFilesSelected,
  onUploadGroupChange,
  onUploadProjectChange,
  onUploadRefLabelChange,
  onUploadThemeChange,
  onNewGroupNameChange,
}: CatalogueOverlaysProps) {
  return (
    <>
      {showUpload && (
        <div className="catalogue-upload-overlay" onClick={onCloseUpload}>
          <div className="catalogue-upload-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Upload Screenshots</h3>
            <p className="catalogue-upload-subtitle">Choose a project and group, then upload your screenshots.</p>

            <Dropdown
              className="catalogue-upload-project-dropdown"
              value={uploadProjectId}
              placeholder="Select a project..."
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              onChange={onUploadProjectChange}
            />

            {uploadProjectId ? (
              <>
                <label className="catalogue-upload-label">Select or create a group</label>
                <div className="catalogue-upload-groups">
                  {uploadProjectGroups.map((group) => (
                    <button
                      key={group}
                      type="button"
                      className={`catalogue-upload-group-chip ${uploadGroup === group ? 'active' : ''}`}
                      onClick={() => onUploadGroupChange(group)}
                    >
                      {group}
                      {uploadProjectPrimary === group && <span className="catalogue-upload-group-primary">Primary</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`catalogue-upload-group-chip catalogue-upload-group-new ${uploadGroup === '__new__' ? 'active' : ''}`}
                    onClick={() => onUploadGroupChange('__new__')}
                  >
                    + New Group
                  </button>
                </div>

                {uploadGroup === '__new__' && (
                  <input
                    className="catalogue-filter catalogue-upload-project-select"
                    type="text"
                    placeholder="Enter group name..."
                    value={newGroupName}
                    onChange={(event) => onNewGroupNameChange(event.target.value)}
                    autoFocus
                  />
                )}

                <label className="catalogue-upload-label">Theme</label>
                <div className="catalogue-upload-groups">
                  {(['light', 'dark'] as const).map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      className={`catalogue-upload-group-chip ${uploadTheme === theme ? 'active' : ''}`}
                      onClick={() => onUploadThemeChange(uploadTheme === theme ? null : theme)}
                    >
                      {theme === 'light' ? '☀ Light' : '☾ Dark'}
                    </button>
                  ))}
                </div>

                <label className="catalogue-upload-label">Reference (optional)</label>
                <div className="catalogue-upload-ref">
                  {uploadRefPreview ? (
                    <div className="catalogue-upload-ref-preview">
                      <img src={uploadRefPreview} alt="Reference" />
                      <button type="button" className="catalogue-upload-ref-remove" onClick={onRemoveUploadReference}>
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
                          onSelectUploadReference(event.target.files?.[0] ?? null);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  )}
                  <input
                    className="catalogue-upload-ref-label"
                    type="text"
                    placeholder="Label (e.g., Binance, Dribbble)"
                    value={uploadRefLabel}
                    onChange={(event) => onUploadRefLabelChange(event.target.value)}
                  />
                </div>

                {(uploadGroup && uploadGroup !== '__new__') || (uploadGroup === '__new__' && newGroupName.trim()) ? (
                  <UploadZone
                    onFilesSelected={(files) => {
                      const finalGroup = uploadGroup === '__new__' ? newGroupName.trim() : uploadGroup;
                      onUploadFilesSelected(files, finalGroup, uploadTheme);
                    }}
                    disabled={uploading}
                  />
                ) : (
                  <p className="catalogue-upload-hint">
                    {!uploadGroup ? 'Select a group above to enable upload.' : 'Enter a group name to continue.'}
                  </p>
                )}
              </>
            ) : (
              <p className="catalogue-upload-hint">Select a project above to enable upload.</p>
            )}
          </div>
        </div>
      )}

      {showQuickUpload && (
        <div className="catalogue-upload-overlay" onClick={onCloseQuickUpload}>
          <div className="catalogue-upload-modal catalogue-upload-modal-quick" onClick={(event) => event.stopPropagation()}>
            <h3>Quick Upload</h3>
            <p className="catalogue-upload-subtitle">Select a project, configure group assignment, queue files, then upload all.</p>

            <Dropdown
              className="catalogue-upload-project-dropdown"
              value={quickUploadProjectId}
              placeholder="Select a project..."
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              onChange={onQuickUploadProjectChange}
            />

            {quickUploadProjectId ? (
              <CatalogueQuickUploadPanel
                uploading={uploading}
                quickUploadGroupMode={quickUploadGroupMode}
                quickUploadExistingGroup={quickUploadExistingGroup}
                quickUploadNewGroup={quickUploadNewGroup}
                quickUploadProjectGroups={quickUploadProjectGroups}
                quickUploadQueue={quickUploadQueue}
                onQuickUploadFilesSelected={onQuickUploadFilesSelected}
                onQuickUploadGroupModeChange={onQuickUploadGroupModeChange}
                onQuickUploadExistingGroupChange={onQuickUploadExistingGroupChange}
                onQuickUploadNewGroupChange={onQuickUploadNewGroupChange}
                onQuickUploadRemoveQueuedFile={onQuickUploadRemoveQueuedFile}
                onQuickUploadClearQueue={onQuickUploadClearQueue}
                onQuickUploadUploadAll={onQuickUploadUploadAll}
              />
            ) : (
              <p className="catalogue-upload-hint">Select a project above to enable upload.</p>
            )}
          </div>
        </div>
      )}

      {uploading && (
        <div className="canvas-uploading">
          <div className="loading-spinner" />
          Uploading screenshots...
        </div>
      )}

      {assignModalOpen && assigningScreenshot && (
        <FlowAssignModal
          screenshotName={assigningScreenshot.name}
          currentFlowId={assigningScreenshot.flow_id}
          flows={assigningFlows}
          primaryGroup={primaryGroup}
          screenshotGroup={assigningScreenshot.group}
          onAssign={onAssignFlow}
          onClose={onCloseAssignModal}
        />
      )}

      {bulkAction === 'assign' && (
        <div className="flow-assign-overlay" onClick={() => onBulkActionChange(null)}>
          <div className="flow-assign-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Assign {selectedCount} to Flow</h3>
            <div className="flow-assign-options">
              <label className="flow-assign-option">
                <input type="radio" name="bulk-flow" defaultChecked onChange={() => undefined} />
                <span>Unassigned</span>
              </label>
              {bulkFlows.map((flow) => (
                <label key={flow.id} className="flow-assign-option">
                  <input type="radio" name="bulk-flow" onChange={() => onBulkAssignFlow(flow.id)} />
                  <span>{flow.name}</span>
                </label>
              ))}
            </div>
            {bulkFlows.length === 0 && (
              <p className="flow-assign-empty">No flows available for selected screenshots.</p>
            )}
            <div className="flow-assign-actions">
              <button type="button" className="btn-secondary" onClick={() => onBulkActionChange(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => onBulkAssignFlow(null)}>Unassign All</button>
            </div>
          </div>
        </div>
      )}

      {bulkAction === 'platform' && (
        <div className="flow-assign-overlay" onClick={() => onBulkActionChange(null)}>
          <div className="flow-assign-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Set Platform for {selectedCount}</h3>
            <div className="flow-assign-options">
              <label className="flow-assign-option">
                <input type="radio" name="bulk-platform" onChange={() => onBulkPlatform('mobile')} />
                <span>Mobile</span>
              </label>
              <label className="flow-assign-option">
                <input type="radio" name="bulk-platform" onChange={() => onBulkPlatform('web')} />
                <span>Web</span>
              </label>
              <label className="flow-assign-option">
                <input type="radio" name="bulk-platform" onChange={() => onBulkPlatform(null)} />
                <span>No platform</span>
              </label>
            </div>
            <div className="flow-assign-actions">
              <button type="button" className="btn-secondary" onClick={() => onBulkActionChange(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {bulkAction === 'group' && (
        <div className="flow-assign-overlay" onClick={() => onBulkActionChange(null)}>
          <div className="flow-assign-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Move {selectedCount} to Group</h3>
            <div className="catalogue-upload-groups" style={{ marginTop: 12 }}>
              {allGroups.map((group) => (
                <button
                  key={group}
                  type="button"
                  className={`catalogue-upload-group-chip ${bulkGroupValue === group ? 'active' : ''}`}
                  onClick={() => onBulkGroupValueChange(group)}
                >
                  {group}
                  {primaryGroup === group && <span className="catalogue-upload-group-primary">Primary</span>}
                </button>
              ))}
            </div>
            <input
              className="catalogue-filter"
              style={{ width: '100%', marginTop: 12 }}
              type="text"
              placeholder="Or type a new group name..."
              value={bulkGroupValue}
              onChange={(event) => onBulkGroupValueChange(event.target.value)}
            />
            <div className="flow-assign-actions">
              <button type="button" className="btn-secondary" onClick={() => onBulkActionChange(null)}>Cancel</button>
              <button
                type="button"
                className="btn-primary"
                disabled={!bulkGroupValue.trim()}
                onClick={() => onBulkChangeGroup(bulkGroupValue)}
              >
                Move to "{bulkGroupValue.trim() || '...'}"
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteOpen && (
        <ConfirmModal
          title={`Delete ${selectedCount} Screenshot${selectedCount !== 1 ? 's' : ''}`}
          message={`This will permanently delete ${selectedCount} screenshot${selectedCount !== 1 ? 's' : ''} and remove them from any flows. This cannot be undone.`}
          onConfirm={onConfirmBulkDelete}
          onCancel={onCloseConfirmDelete}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={onCloseToast}
        />
      )}
    </>
  );
}

interface CatalogueBulkBarProps {
  filteredScreenshotsCount: number;
  selectedCount: number;
  selectedVisibleCount: number;
  onClearSelection: () => void;
  onOpenDeleteConfirm: () => void;
  onSelectAllVisible: () => void;
  onSetBulkAction: (action: 'assign' | 'group' | 'platform') => void;
}

export function CatalogueBulkBar({
  filteredScreenshotsCount,
  selectedCount,
  selectedVisibleCount,
  onClearSelection,
  onOpenDeleteConfirm,
  onSelectAllVisible,
  onSetBulkAction,
}: CatalogueBulkBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="catalogue-bulk-bar">
      <div className="catalogue-bulk-left">
        <button type="button" className="catalogue-bulk-check" onClick={onSelectAllVisible}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {selectedVisibleCount === filteredScreenshotsCount && filteredScreenshotsCount > 0
              ? <><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" /><polyline points="9 11 12 14 20 6" stroke="#0f0f10" strokeWidth="3" /></>
              : <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="12" x2="16" y2="12" /></>}
          </svg>
        </button>
        <span className="catalogue-bulk-count">{selectedCount} selected</span>
      </div>

      <div className="catalogue-bulk-actions">
        <button type="button" className="catalogue-bulk-btn" onClick={() => onSetBulkAction('group')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
          Change Group
        </button>
        <button type="button" className="catalogue-bulk-btn" onClick={() => onSetBulkAction('platform')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
          Set Platform
        </button>
        <button type="button" className="catalogue-bulk-btn" onClick={() => onSetBulkAction('assign')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 3 21 3 21 8" />
            <line x1="4" y1="20" x2="21" y2="3" />
          </svg>
          Assign to Flow
        </button>
        <button type="button" className="catalogue-bulk-btn catalogue-bulk-btn-danger" onClick={onOpenDeleteConfirm}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
          Delete
        </button>
        <button type="button" className="catalogue-bulk-btn-close" onClick={onClearSelection}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
