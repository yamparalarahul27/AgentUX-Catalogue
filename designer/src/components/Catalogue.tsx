import { useEffect, useMemo, useState } from 'react';

import type { User } from '@supabase/supabase-js';
import type { Flow, WebPreset } from '../types';
import { useCatalogueData } from '../hooks/use-catalogue-data';
import { useCatalogueFamilyActions } from '../hooks/use-catalogue-family-actions';
import { useCatalogueFilters } from '../hooks/use-catalogue-filters';
import { useCatalogueSettings } from '../hooks/use-catalogue-settings';
import { useCatalogueUpload } from '../hooks/use-catalogue-upload';
import { buildCatalogueFamilies } from '../lib/catalogue-families';
import { DEFAULT_CATALOGUE_VIEW_MODE, parseCatalogueViewMode, type CatalogueViewMode } from '../lib/catalogue-view';
import { CatalogueBulkBar } from './CatalogueBulkBar';
import { CatalogueContent } from './CatalogueContent';
import { CatalogueDuplicateVariantModal } from './CatalogueDuplicateVariantModal';
import { CatalogueFamilyDetailsModal } from './CatalogueFamilyDetailsModal';
import { CatalogueFamilyLightbox } from './CatalogueFamilyLightbox';
import { CatalogueFlowSidebar } from './CatalogueFlowSidebar';
import { CatalogueHeader } from './CatalogueHeader';
import { CatalogueSettingsModal } from './CatalogueSettingsModal';
import { CatalogueTeamSection } from './CatalogueTeamSection';
import { CatalogueToolbar } from './CatalogueToolbar';
import { CatalogueUploadModal } from './CatalogueUploadModal';
import { ConfirmModal } from './ConfirmModal';
import { FlowAssignModal } from './FlowAssignModal';
import { Toast } from './Toast';

interface CatalogueProps {
  user: User;
}

const CATALOGUE_VIEW_MODE_KEY = 'catalogue:view-mode';

type BulkAction = 'assign' | 'group' | null;
type CatalogueSection = 'catalogue' | 'team';

function defaultViewMode() {
  try {
    return parseCatalogueViewMode(window.localStorage.getItem(CATALOGUE_VIEW_MODE_KEY));
  } catch {
    return DEFAULT_CATALOGUE_VIEW_MODE;
  }
}

function buildPresetUsage(screenshots: { web_preset_key: string | null }[]) {
  return screenshots.reduce<Record<string, number>>((accumulator, screenshot) => {
    if (!screenshot.web_preset_key) return accumulator;
    accumulator[screenshot.web_preset_key] = (accumulator[screenshot.web_preset_key] || 0) + 1;
    return accumulator;
  }, {});
}

export function Catalogue({ user }: CatalogueProps) {
  const {
    flows,
    flowMap,
    loading,
    projectMap,
    projects,
    screenFamilies,
    screenshots,
    setProjects,
    setScreenFamilies,
    setScreenshots,
  } = useCatalogueData();
  const { saveWebPresets, presetByKey, webPresets } = useCatalogueSettings(user.id);
  const {
    activeFlowCount,
    activeFlowFilter,
    activeFlowLabel,
    allGroups,
    allMobileOs,
    allScreenFamilies,
    allWebPresets,
    filterGroup,
    filterMobileOs,
    filterPlatform,
    filterProject,
    filterScreenFamily,
    filterTheme,
    filterWebPreset,
    filteredFamilies,
    flowItems,
    groupedFamilies,
    primaryGroup,
    searchQuery,
    setActiveFlowFilter,
    setFilterGroup,
    setFilterMobileOs,
    setFilterPlatform,
    setFilterProject,
    setFilterScreenFamily,
    setFilterTheme,
    setFilterWebPreset,
    setSortBy,
    setViewBy,
    setSearchQuery,
    sortBy,
    isSortLocked,
    viewBy,
    vsGroups,
  } = useCatalogueFilters({
    flows,
    projects,
    screenshots,
    screenFamilies,
    webPresets,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [detailsFamilyId, setDetailsFamilyId] = useState<string | null>(null);
  const [previewFamilyId, setPreviewFamilyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkGroupValue, setBulkGroupValue] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [viewMode, setViewMode] = useState<CatalogueViewMode>(defaultViewMode);
  const [isFlowSheetExpanded, setIsFlowSheetExpanded] = useState(false);
  const canViewTeamSection = user.email?.trim().toLowerCase() === 'rahul@equicomtech.com';
  const [activeSection, setActiveSection] = useState<CatalogueSection>('catalogue');

  const allFamilies = useMemo(
    () => buildCatalogueFamilies(screenshots, screenFamilies, presetByKey),
    [presetByKey, screenFamilies, screenshots],
  );
  const familyById = useMemo(
    () => Object.fromEntries(allFamilies.map((family) => [family.id, family])),
    [allFamilies],
  );
  const presetUsage = useMemo(() => buildPresetUsage(screenshots), [screenshots]);
  const selectedVisibleCount = useMemo(
    () => filteredFamilies.filter((family) => selected.has(family.id)).length,
    [filteredFamilies, selected],
  );
  const bulkFlows = useMemo(() => {
    if (selected.size === 0) return [] as Flow[];
    const projectIds = new Set(Array.from(selected).map((familyId) => familyById[familyId]?.project_id).filter(Boolean));
    return flows.filter((flow) => projectIds.has(flow.project_id));
  }, [familyById, flows, selected]);
  const assigningFamily = assignModal ? familyById[assignModal] ?? null : null;
  const assigningProject = assigningFamily ? projects.find((project) => project.id === assigningFamily.project_id) ?? null : null;
  const detailsFamily = detailsFamilyId ? familyById[detailsFamilyId] ?? null : null;
  const previewFamily = previewFamilyId ? familyById[previewFamilyId] ?? null : null;

  const {
    handleAnnotationStateChange,
    handleAssignFlow,
    handleChangeFamilyGroup,
    handleCommentCountChange,
    handleDeleteFamily,
    handlePrimaryGroupChange,
    handleRenameFamily,
    handleReplaceImage,
    handleUpdateVariantDetails,
    handleVsGroupsChange,
  } = useCatalogueFamilyActions({
    familyById,
    filterProject,
    flowMap,
    onFamilyDeleted: (familyId) => {
      setAssignModal((previous) => (previous === familyId ? null : previous));
      setDetailsFamilyId((previous) => (previous === familyId ? null : previous));
      setPreviewFamilyId((previous) => (previous === familyId ? null : previous));
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(familyId);
        return next;
      });
    },
    projects,
    screenFamilies,
    screenshots,
    setProjects,
    setScreenFamilies,
    setScreenshots,
    setToast,
    userId: user.id,
    webPresets,
  });
  const upload = useCatalogueUpload({
    allFamilies,
    handleReplaceImage,
    presetByKey,
    screenFamilies,
    screenshots,
    setScreenFamilies,
    setScreenshots,
    setToast,
    userEmail: user.email || null,
    userId: user.id,
    webPresets,
  });
  const isAnyModalOpen = Boolean(
    upload.showUpload ||
    showSettings ||
    assigningFamily ||
    previewFamily ||
    detailsFamily ||
    bulkAction ||
    confirmDeleteOpen ||
    upload.duplicateState,
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(CATALOGUE_VIEW_MODE_KEY, viewMode);
    } catch {
      // ignore write errors
    }
  }, [viewMode]);

  useEffect(() => {
    if (previewFamilyId && !familyById[previewFamilyId]) {
      setPreviewFamilyId(null);
    }
  }, [familyById, previewFamilyId]);

  useEffect(() => {
    if (detailsFamilyId && !familyById[detailsFamilyId]) {
      setDetailsFamilyId(null);
    }
  }, [detailsFamilyId, familyById]);

  useEffect(() => {
    if (!canViewTeamSection && activeSection === 'team') {
      setActiveSection('catalogue');
    }
  }, [activeSection, canViewTeamSection]);

  useEffect(() => {
    if (!isAnyModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [isAnyModalOpen]);

  function openPreview(familyId: string) {
    setDetailsFamilyId(null);
    setPreviewFamilyId(familyId);
  }

  function openDetails(familyId: string) {
    setPreviewFamilyId(null);
    setDetailsFamilyId(familyId);
  }

  function toggleSelect(familyId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(familyId)) next.delete(familyId);
      else next.add(familyId);
      return next;
    });
  }

  function toggleGroupSelection(familyIds: string[]) {
    setSelected((previous) => {
      const next = new Set(previous);
      const allSelected = familyIds.every((familyId) => next.has(familyId));
      familyIds.forEach((familyId) => {
        if (allSelected) next.delete(familyId);
        else next.add(familyId);
      });
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((previous) => {
      const next = new Set(previous);
      const allVisibleSelected = filteredFamilies.length > 0 && filteredFamilies.every((family) => next.has(family.id));
      filteredFamilies.forEach((family) => {
        if (allVisibleSelected) next.delete(family.id);
        else next.add(family.id);
      });
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkAction(null);
    setBulkGroupValue('');
  }

  function getProjectFlows(familyId: string): Flow[] {
    const family = familyById[familyId];
    return family ? flows.filter((flow) => flow.project_id === family.project_id) : [];
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    for (const familyId of selected) {
      await handleDeleteFamily(familyId);
    }
    clearSelection();
  }

  async function handleBulkAssignFlow(flowId: string | null) {
    if (selected.size === 0) return;
    for (const familyId of selected) {
      await handleAssignFlow(familyId, flowId);
    }
    clearSelection();
  }

  async function handleBulkChangeGroup(group: string) {
    const trimmedGroup = group.trim();
    if (selected.size === 0 || !trimmedGroup) return;
    for (const familyId of selected) {
      await handleChangeFamilyGroup(familyId, trimmedGroup);
    }
    setToast({ message: `${selected.size} families moved to "${trimmedGroup}"`, type: 'success' });
    clearSelection();
  }

  async function handleSavePresets(nextPresets: WebPreset[]) {
    const result = await saveWebPresets(nextPresets);
    setToast({
      message: result.ok ? 'Catalogue presets updated' : 'Using local preset changes until the database is ready',
      type: result.ok ? 'success' : 'info',
    });
  }

  return (
    <div className={`catalogue-page ${canViewTeamSection ? 'catalogue-page--team-enabled' : ''}`}>
      <CatalogueHeader
        activeSection={activeSection}
        canViewTeam={canViewTeamSection}
        onBack={() => { window.location.href = '/designer/'; }}
        onOpenSettings={() => setShowSettings(true)}
        onSectionChange={setActiveSection}
      />
      {activeSection === 'team' && canViewTeamSection ? (
        <main className="catalogue-main">
          <div className="catalogue-shell catalogue-shell--team">
            <CatalogueTeamSection projects={projects} screenshots={screenshots} />
          </div>
        </main>
      ) : (
        <main className="catalogue-main">
          <div className="catalogue-shell">
            <CatalogueFlowSidebar
              activeFlowCount={activeFlowCount}
              activeFlowFilter={activeFlowFilter}
              activeFlowLabel={activeFlowLabel}
              items={flowItems}
              mobileExpanded={isFlowSheetExpanded}
              onFlowFilterChange={setActiveFlowFilter}
              onMobileExpandedChange={setIsFlowSheetExpanded}
            />

            <div className="catalogue-body">
              <CatalogueToolbar
                activeFlowCount={activeFlowCount}
                activeFlowLabel={activeFlowLabel}
                allMobileOs={allMobileOs}
                allScreenFamilies={allScreenFamilies}
                allWebPresets={allWebPresets}
                filterGroup={filterGroup}
                filterMobileOs={filterMobileOs}
                filterPlatform={filterPlatform}
                filterProject={filterProject}
                filterScreenFamily={filterScreenFamily}
                filterTheme={filterTheme}
                filterWebPreset={filterWebPreset}
                groups={allGroups}
                isSortLocked={isSortLocked}
                onFilterGroupChange={setFilterGroup}
                onFilterMobileOsChange={setFilterMobileOs}
                onFilterPlatformChange={setFilterPlatform}
                onFilterProjectChange={setFilterProject}
                onFilterScreenFamilyChange={setFilterScreenFamily}
                onFilterThemeChange={setFilterTheme}
                onFilterWebPresetChange={setFilterWebPreset}
                onPrimaryGroupChange={handlePrimaryGroupChange}
                onQuickUploadClick={() => upload.setShowUpload(true)}
                onSearchChange={setSearchQuery}
                onSortByChange={setSortBy}
                onToggleFlowSheet={() => setIsFlowSheetExpanded((previous) => !previous)}
                onUploadClick={() => upload.setShowUpload(true)}
                onViewByChange={setViewBy}
                onViewModeChange={setViewMode}
                onVsGroupsChange={handleVsGroupsChange}
                primaryGroup={primaryGroup}
                projects={projects.map((project) => ({ id: project.id, name: project.name }))}
                searchQuery={searchQuery}
                showGroupConfig={Boolean(filterProject)}
                sortBy={sortBy}
                viewBy={viewBy}
                viewMode={viewMode}
                vsGroups={vsGroups}
              />

              <CatalogueContent
                activeFlowFilter={activeFlowFilter}
                activeVariantKeys={upload.activeVariantKeys}
                filterGroup={filterGroup}
                filterMobileOs={filterMobileOs}
                filterPlatform={filterPlatform}
                filterProject={filterProject}
                filterScreenFamily={filterScreenFamily}
                filterTheme={filterTheme}
                filterWebPreset={filterWebPreset}
                filteredFamilies={filteredFamilies}
                flowMap={flowMap}
                groupedFamilies={groupedFamilies}
                loading={loading}
                primaryGroup={primaryGroup}
                projectMap={projectMap}
                projectsCount={projects.length}
                searchQuery={searchQuery}
                selected={selected}
                viewMode={viewMode}
                vsGroups={vsGroups}
                onActiveVariantChange={upload.updateActiveVariant}
                onAssignFlow={setAssignModal}
                onChangeFamilyGroup={handleChangeFamilyGroup}
                onDeleteFamily={handleDeleteFamily}
                onOpenDetails={openDetails}
                onOpenPreview={openPreview}
                onRenameFamily={handleRenameFamily}
                onReplaceVariantImage={handleReplaceImage}
                onToggleGroupSelect={toggleGroupSelection}
                onToggleSelect={toggleSelect}
                onUpdateVariantDetails={handleUpdateVariantDetails}
                webPresets={webPresets}
              />
            </div>
          </div>
        </main>
      )}

      <CatalogueUploadModal
        existingFamilies={upload.uploadProjectFamilies}
        isOpen={upload.showUpload}
        mobileOs={upload.uploadMobileOs}
        newFamilyGroup={upload.uploadNewFamilyGroup}
        newFamilyMode={upload.uploadNewFamilyMode}
        newFamilyName={upload.uploadNewFamilyName}
        platform={upload.uploadPlatform}
        projectGroups={upload.uploadProjectGroups}
        projectId={upload.uploadProjectId}
        projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        referenceLabel={upload.uploadRefLabel}
        referencePreview={upload.uploadRefPreview}
        selectedFamilyId={upload.uploadFamilyId}
        theme={upload.uploadTheme}
        uploading={upload.uploading}
        webPresetKey={upload.uploadWebPresetKey}
        webPresets={webPresets}
        onClose={upload.resetUploadState}
        onFilesSelected={(files) => void upload.handleFilesSelected(files)}
        onMobileOsChange={upload.setUploadMobileOs}
        onNewFamilyGroupChange={upload.setUploadNewFamilyGroup}
        onNewFamilyModeChange={upload.setUploadNewFamilyMode}
        onNewFamilyNameChange={upload.setUploadNewFamilyName}
        onPlatformChange={upload.setUploadPlatform}
        onProjectIdChange={(projectId) => {
          upload.setUploadProjectId(projectId);
          upload.setUploadFamilyId(null);
          upload.setUploadNewFamilyName('');
          upload.setUploadNewFamilyGroup('');
        }}
        onReferenceLabelChange={upload.setUploadRefLabel}
        onReferenceRemove={() => {
          if (upload.uploadRefPreview) URL.revokeObjectURL(upload.uploadRefPreview);
          upload.setUploadRefFile(null);
          upload.setUploadRefPreview(null);
        }}
        onReferenceSelect={(file) => {
          if (upload.uploadRefPreview) URL.revokeObjectURL(upload.uploadRefPreview);
          if (file && file.type.startsWith('image/')) {
            upload.setUploadRefFile(file);
            upload.setUploadRefPreview(URL.createObjectURL(file));
            return;
          }
          upload.setUploadRefFile(null);
          upload.setUploadRefPreview(null);
        }}
        onSelectedFamilyIdChange={upload.setUploadFamilyId}
        onThemeChange={upload.setUploadTheme}
        onWebPresetKeyChange={upload.setUploadWebPresetKey}
      />

      <CatalogueSettingsModal
        isOpen={showSettings}
        presetUsage={presetUsage}
        webPresets={webPresets}
        onClose={() => setShowSettings(false)}
        onSave={handleSavePresets}
      />

      {upload.uploading && (
        <div className="canvas-uploading">
          <div className="loading-spinner" />
          Uploading screenshots...
        </div>
      )}

      {assigningFamily && (
        <FlowAssignModal
          screenshotName={assigningFamily.name}
          currentFlowId={assigningFamily.flow_id}
          flows={getProjectFlows(assigningFamily.id)}
          primaryGroup={assigningProject?.primary_group}
          screenshotGroup={assigningFamily.group}
          onAssign={(flowId) => { void handleAssignFlow(assigningFamily.id, flowId); }}
          onClose={() => setAssignModal(null)}
        />
      )}

      {previewFamily && (
        <CatalogueFamilyLightbox
          activeVariantKey={upload.activeVariantKeys[previewFamily.id] ?? null}
          family={previewFamily}
          flowName={previewFamily.flow_id ? flowMap[previewFamily.flow_id] || null : null}
          isOpen
          projectName={projectMap[previewFamily.project_id] || 'Unknown'}
          userEmail={user.email || ''}
          onActiveVariantChange={upload.updateActiveVariant}
          onAnnotationStateChange={handleAnnotationStateChange}
          onAssignFlow={setAssignModal}
          onClose={() => setPreviewFamilyId(null)}
          onCommentCountChange={handleCommentCountChange}
          onDeleteFamily={handleDeleteFamily}
          onOpenDetails={openDetails}
          onRenameFamily={handleRenameFamily}
          onReplaceVariantImage={handleReplaceImage}
        />
      )}

      <CatalogueFamilyDetailsModal
        activeVariantKey={detailsFamily ? upload.activeVariantKeys[detailsFamily.id] ?? null : null}
        family={detailsFamily}
        flowName={detailsFamily?.flow_id ? flowMap[detailsFamily.flow_id] || null : null}
        isOpen={Boolean(detailsFamily)}
        projectName={detailsFamily ? projectMap[detailsFamily.project_id] || 'Unknown' : 'Unknown'}
        webPresets={webPresets}
        onActiveVariantChange={upload.updateActiveVariant}
        onAssignFlow={setAssignModal}
        onChangeFamilyGroup={handleChangeFamilyGroup}
        onClose={() => setDetailsFamilyId(null)}
        onDeleteFamily={handleDeleteFamily}
        onRenameFamily={handleRenameFamily}
        onReplaceVariantImage={handleReplaceImage}
        onUpdateVariantDetails={handleUpdateVariantDetails}
      />

      {bulkAction === 'assign' && (
        <div className="flow-assign-overlay" onClick={() => setBulkAction(null)}>
          <div className="flow-assign-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Assign {selected.size} families to Flow</h3>
            <div className="flow-assign-options">
              <label className="flow-assign-option">
                <input type="radio" name="bulk-flow" defaultChecked onChange={() => undefined} />
                <span>Unassigned</span>
              </label>
              {bulkFlows.map((flow) => (
                <label key={flow.id} className="flow-assign-option">
                  <input type="radio" name="bulk-flow" onChange={() => void handleBulkAssignFlow(flow.id)} />
                  <span>{flow.name}</span>
                </label>
              ))}
            </div>
            {bulkFlows.length === 0 && (
              <p className="flow-assign-empty">No flows available for selected screen families.</p>
            )}
            <div className="flow-assign-actions">
              <button type="button" className="btn-secondary" onClick={() => setBulkAction(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => void handleBulkAssignFlow(null)}>Unassign All</button>
            </div>
          </div>
        </div>
      )}

      {bulkAction === 'group' && (
        <div className="flow-assign-overlay" onClick={() => setBulkAction(null)}>
          <div className="flow-assign-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Move {selected.size} families to Group</h3>
            <div className="catalogue-upload-groups" style={{ marginTop: 12 }}>
              {allGroups.map((group) => (
                <button
                  key={group}
                  type="button"
                  className={`catalogue-upload-group-chip ${bulkGroupValue === group ? 'active' : ''}`}
                  onClick={() => setBulkGroupValue(group)}
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
              onChange={(event) => setBulkGroupValue(event.target.value)}
            />
            <div className="flow-assign-actions">
              <button type="button" className="btn-secondary" onClick={() => setBulkAction(null)}>Cancel</button>
              <button
                type="button"
                className="btn-primary"
                disabled={!bulkGroupValue.trim()}
                onClick={() => void handleBulkChangeGroup(bulkGroupValue)}
              >
                Move to "{bulkGroupValue.trim() || '...'}"
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteOpen && (
        <ConfirmModal
          title={`Delete ${selected.size} Screen Famil${selected.size === 1 ? 'y' : 'ies'}`}
          message={`This will permanently delete ${selected.size} screen famil${selected.size === 1 ? 'y' : 'ies'} and all attached variants. This cannot be undone.`}
          onConfirm={() => {
            setConfirmDeleteOpen(false);
            void handleBulkDelete();
          }}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      )}

      <CatalogueDuplicateVariantModal
        familyName={upload.duplicateState?.familyName || ''}
        fileName={upload.duplicateState?.fileName || ''}
        isOpen={Boolean(upload.duplicateState)}
        variantLabel={upload.duplicateState?.variantLabel || ''}
        onAddVersion={() => upload.resolveDuplicateResolution('add-version')}
        onCancel={() => upload.resolveDuplicateResolution('cancel')}
        onReplace={() => upload.resolveDuplicateResolution('replace')}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {activeSection === 'catalogue' && (
        <CatalogueBulkBar
          filteredFamiliesCount={filteredFamilies.length}
          selectedCount={selected.size}
          selectedVisibleCount={selectedVisibleCount}
          onClearSelection={clearSelection}
          onOpenDeleteConfirm={() => setConfirmDeleteOpen(true)}
          onSelectAllVisible={selectAllVisible}
          onSetBulkAction={setBulkAction}
        />
      )}
    </div>
  );
}
