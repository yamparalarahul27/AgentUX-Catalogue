import { useEffect, useMemo, useState } from 'react';

import type { User } from '@supabase/supabase-js';
import type { WebPreset } from '../types';
import { useCatalogueData } from '../hooks/use-catalogue-data';
import { useCatalogueFamilyActions } from '../hooks/use-catalogue-family-actions';
import { useCatalogueFilters } from '../hooks/use-catalogue-filters';
import { useCatalogueSettings } from '../hooks/use-catalogue-settings';
import { useCatalogueUpload } from '../hooks/use-catalogue-upload';
import { buildCatalogueFamilies } from '../lib/catalogue-families';
import { DEFAULT_CATALOGUE_VIEW_MODE, parseCatalogueViewMode, type CatalogueViewMode } from '../lib/catalogue-view';
import { CatalogueBulkBar } from './CatalogueBulkBar';
import { CatalogueBulkRenameModal } from './CatalogueBulkRenameModal';
import { CatalogueContent } from './CatalogueContent';
import { CatalogueEmailPromptModal } from './CatalogueEmailPromptModal';
import { CatalogueFamilyLightbox } from './CatalogueFamilyLightbox';
import { CatalogueHeader } from './CatalogueHeader';
import { CatalogueQuickUploadModal } from './CatalogueQuickUploadModal';
import { CatalogueSettingsModal } from './CatalogueSettingsModal';
import { CatalogueTeamSection } from './CatalogueTeamSection';
import { CatalogueToolbar } from './CatalogueToolbar';
import { CatalogueUploadModal } from './CatalogueUploadModal';
import { CatalogueVideosSection } from './CatalogueVideosSection';
import { ConfirmModal } from './ConfirmModal';
import { Toast } from './Toast';

interface CatalogueProps {
  user: User;
  isGuest?: boolean;
  onRequestLogin: (email: string) => void;
}

const CATALOGUE_VIEW_MODE_KEY = 'catalogue:view-mode';

type BulkAction = 'group' | null;
type CatalogueSection = 'catalogue' | 'videos' | 'team';

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

export function Catalogue({
  user,
  isGuest = false,
  onRequestLogin,
}: CatalogueProps) {
  const {
    flowMap,
    loading,
    projects,
    screenFamilies,
    screenshots,
    setProjects,
    setScreenFamilies,
    setScreenshots,
  } = useCatalogueData();
  const { saveWebPresets, presetByKey, webPresets } = useCatalogueSettings(user.id);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareFlow, setCompareFlow] = useState<string | null>(null);
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );
  const scopedScreenshots = useMemo(
    () => (activeProjectId ? screenshots.filter((screenshot) => screenshot.project_id === activeProjectId) : screenshots),
    [activeProjectId, screenshots],
  );
  const scopedScreenFamilies = useMemo(
    () => (activeProjectId ? screenFamilies.filter((family) => family.project_id === activeProjectId) : screenFamilies),
    [activeProjectId, screenFamilies],
  );
  const orderedProjectsForUpload = useMemo(() => {
    if (!activeProject) return projects;
    return [activeProject, ...projects.filter((project) => project.id !== activeProject.id)];
  }, [activeProject, projects]);
  const projectOptions = useMemo(
    () => projects.map((project) => ({ id: project.id, name: project.name })),
    [projects],
  );

  const {
    allFlows,
    allGroups,
    allMobileOs,
    allWebPresets,
    filterFlow,
    filterGroup,
    filterMobileOs,
    filterPlatform,
    filterTheme,
    filterWebPreset,
    filteredFamilies,
    groupedFamilies,
    primaryGroup,
    searchQuery,
    setFilterFlow,
    setFilterGroup,
    setFilterMobileOs,
    setFilterPlatform,
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
    screenshots: scopedScreenshots,
    screenFamilies: scopedScreenFamilies,
    webPresets,
    primaryGroup: activeProject?.primary_group ?? projects[0]?.primary_group ?? null,
    vsGroups: activeProject?.vs_groups ?? projects[0]?.vs_groups ?? [],
    compareEnabled,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [previewFamilyId, setPreviewFamilyId] = useState<string | null>(null);
  const [previewStartInlineEdit, setPreviewStartInlineEdit] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkRenameOpen, setBulkRenameOpen] = useState(false);
  const [bulkGroupValue, setBulkGroupValue] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [viewMode, setViewMode] = useState<CatalogueViewMode>(defaultViewMode);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const canViewTeamSection = user.email?.trim().toLowerCase() === 'rahul@equicomtech.com';
  const [activeSection, setActiveSection] = useState<CatalogueSection>('catalogue');

  const allFamilies = useMemo(
    () => buildCatalogueFamilies(scopedScreenshots, scopedScreenFamilies, presetByKey),
    [presetByKey, scopedScreenFamilies, scopedScreenshots],
  );
  const familyById = useMemo(
    () => Object.fromEntries(allFamilies.map((family) => [family.id, family])),
    [allFamilies],
  );
  const presetUsage = useMemo(() => buildPresetUsage(scopedScreenshots), [scopedScreenshots]);
  const selectedVisibleCount = useMemo(
    () => filteredFamilies.filter((family) => selected.has(family.id)).length,
    [filteredFamilies, selected],
  );
  const previewFamily = previewFamilyId ? familyById[previewFamilyId] ?? null : null;

  const {
    handleAnnotationStateChange,
    handleChangeFamilyGroup,
    handleCommentCountChange,
    handleDeleteFamily,
    handlePrimaryGroupChange,
    handleRenameFamily,
    handleRemoveReference,
    handleReplaceImage,
    handleSetFlowLabel,
    handleUpdateVariantDetails,
    handleVsGroupsChange,
  } = useCatalogueFamilyActions({
    familyById,
    filterProject: activeProject?.id ?? projects[0]?.id ?? null,
    flowMap,
    onFamilyDeleted: (familyId) => {
      setPreviewFamilyId((previous) => (previous === familyId ? null : previous));
      setPreviewStartInlineEdit(false);
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(familyId);
        return next;
      });
    },
    projects,
    screenFamilies: scopedScreenFamilies,
    screenshots: scopedScreenshots,
    setProjects,
    setScreenFamilies,
    setScreenshots,
    setToast,
    userId: user.id,
    webPresets,
  });
  const upload = useCatalogueUpload({
    allFamilies,
    projects: orderedProjectsForUpload,
    setScreenshots,
    setToast,
    userEmail: user.email || null,
    userId: user.id,
    webPresets,
  });
  const isAnyModalOpen = Boolean(
    upload.showUpload ||
    upload.showQuickUpload ||
    showSettings ||
    previewFamily ||
    bulkAction ||
    confirmDeleteOpen ||
    showAuthPrompt,
  );

  function requireEditAccess() {
    if (!isGuest) return true;
    setShowAuthPrompt(true);
    return false;
  }

  async function guardMutation<T>(action: () => Promise<T>, fallback: T): Promise<T> {
    if (!requireEditAccess()) return fallback;
    return action();
  }

  function guardAction(action: () => void) {
    if (!requireEditAccess()) return;
    action();
  }

  async function handleGuestAwareDeleteFamily(familyId: string) {
    await guardMutation(() => handleDeleteFamily(familyId), undefined);
  }

  async function handleGuestAwareRenameFamily(familyId: string, name: string) {
    await guardMutation(() => handleRenameFamily(familyId, name), undefined);
  }

  async function handleGuestAwareChangeFamilyGroup(familyId: string, group: string | null) {
    await guardMutation(() => handleChangeFamilyGroup(familyId, group), undefined);
  }

  async function handleGuestAwareReplaceImage(screenshotId: string, file: File) {
    await guardMutation(() => handleReplaceImage(screenshotId, file), undefined);
  }

  async function handleGuestAwareSetFlowLabel(familyId: string, flowLabel: string | null) {
    return guardMutation(() => handleSetFlowLabel(familyId, flowLabel), false);
  }

  async function handleGuestAwareUpdateVariantDetails(
    screenshotId: string,
    patch: {
      mobile_os?: 'ios' | 'android' | null;
      platform?: 'mobile' | 'web' | null;
      theme?: 'light' | 'dark' | null;
      web_preset_key?: string | null;
    },
  ) {
    return guardMutation(() => handleUpdateVariantDetails(screenshotId, patch), false);
  }

  async function handleGuestAwareRemoveReference(screenshotId: string) {
    return guardMutation(() => handleRemoveReference(screenshotId), false);
  }

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
    if (!canViewTeamSection && activeSection === 'team') {
      setActiveSection('catalogue');
    }
  }, [activeSection, canViewTeamSection]);

  useEffect(() => {
    if (projects.length === 0) {
      setActiveProjectId(null);
      return;
    }

    setActiveProjectId((previous) => {
      if (previous === null) {
        return null;
      }
      if (previous && projects.some((project) => project.id === previous)) {
        return previous;
      }
      return projects[0].id;
    });
  }, [projects]);

  useEffect(() => {
    if (allFlows.length === 0) {
      setCompareFlow(null);
      setCompareEnabled(false);
      return;
    }

    setCompareFlow((previous) => {
      if (previous && allFlows.includes(previous)) {
        return previous;
      }
      return allFlows[0];
    });
  }, [allFlows]);

  useEffect(() => {
    setSelected(new Set());
    setPreviewFamilyId(null);
    setPreviewStartInlineEdit(false);
  }, [activeProjectId]);

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
    setPreviewStartInlineEdit(false);
    setPreviewFamilyId(familyId);
  }

  function openPreviewAndEdit(familyId: string) {
    setPreviewStartInlineEdit(true);
    setPreviewFamilyId(familyId);
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

  async function handleBulkDelete() {
    if (!requireEditAccess()) return;
    if (selected.size === 0) return;
    for (const familyId of selected) {
      await handleDeleteFamily(familyId);
    }
    clearSelection();
  }

  async function handleBulkChangeGroup(group: string) {
    if (!requireEditAccess()) return;
    const trimmedGroup = group.trim();
    if (selected.size === 0 || !trimmedGroup) return;
    for (const familyId of selected) {
      await handleChangeFamilyGroup(familyId, trimmedGroup);
    }
    setToast({ message: `${selected.size} families moved to "${trimmedGroup}"`, type: 'success' });
    clearSelection();
  }

  async function handleSavePresets(nextPresets: WebPreset[]) {
    if (!requireEditAccess()) return;
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
      ) : activeSection === 'videos' ? (
        <main className="catalogue-main">
          <div className="catalogue-shell catalogue-shell--team">
            <CatalogueVideosSection
              canEdit={!isGuest}
              userEmail={user.email || 'Designer'}
              onRequireAuth={() => setShowAuthPrompt(true)}
            />
          </div>
        </main>
      ) : (
        <main className="catalogue-main">
          <div className="catalogue-shell">
            <div className="catalogue-body">
              {isGuest && (
                <div className="catalogue-guest-banner">
                  <span>Read-only mode. Enter your email to upload, edit, or delete screenshots.</span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowAuthPrompt(true)}
                  >
                    Enter Email
                  </button>
                </div>
              )}
              <CatalogueToolbar
                activeProjectId={activeProjectId}
                allFlows={allFlows}
                allMobileOs={allMobileOs}
                allWebPresets={allWebPresets}
                compareEnabled={compareEnabled}
                compareFlow={compareFlow}
                filterFlow={filterFlow}
                filterGroup={filterGroup}
                filterMobileOs={filterMobileOs}
                filterPlatform={filterPlatform}
                filterTheme={filterTheme}
                filterWebPreset={filterWebPreset}
                groups={allGroups}
                isSortLocked={isSortLocked}
                onActiveProjectChange={setActiveProjectId}
                onCompareEnabledChange={setCompareEnabled}
                onCompareFlowChange={setCompareFlow}
                onFilterFlowChange={setFilterFlow}
                onFilterGroupChange={setFilterGroup}
                onFilterMobileOsChange={setFilterMobileOs}
                onFilterPlatformChange={setFilterPlatform}
                onFilterThemeChange={setFilterTheme}
                onFilterWebPresetChange={setFilterWebPreset}
                onPrimaryGroupChange={(value) => {
                  void guardMutation(() => handlePrimaryGroupChange(value), undefined);
                }}
                onQuickUploadClick={() => {
                  guardAction(() => {
                    upload.handleQuickUploadProjectChange(activeProjectId);
                    upload.setShowQuickUpload(true);
                  });
                }}
                onSearchChange={setSearchQuery}
                onSortByChange={setSortBy}
                onUploadClick={() => {
                  guardAction(() => {
                    upload.setUploadProjectId(activeProjectId);
                    upload.setShowUpload(true);
                  });
                }}
                onViewByChange={setViewBy}
                onViewModeChange={setViewMode}
                onVsGroupsChange={(groups) => {
                  void guardMutation(() => handleVsGroupsChange(groups), undefined);
                }}
                primaryGroup={primaryGroup}
                projectOptions={projectOptions}
                searchQuery={searchQuery}
                showGroupConfig={compareEnabled}
                sortBy={sortBy}
                viewBy={viewBy}
                viewMode={viewMode}
                vsGroups={vsGroups}
              />

              <CatalogueContent
                activeVariantKeys={upload.activeVariantKeys}
                allFamilies={allFamilies}
                compareEnabled={compareEnabled}
                compareFlow={compareFlow}
                filterFlow={filterFlow}
                filterGroup={filterGroup}
                filterMobileOs={filterMobileOs}
                filterPlatform={filterPlatform}
                filterTheme={filterTheme}
                filterWebPreset={filterWebPreset}
                filteredFamilies={filteredFamilies}
                groupedFamilies={groupedFamilies}
                loading={loading}
                primaryGroup={primaryGroup}
                searchQuery={searchQuery}
                selected={selected}
                viewMode={viewMode}
                vsGroups={vsGroups}
                onActiveVariantChange={upload.updateActiveVariant}
                onChangeFamilyGroup={handleGuestAwareChangeFamilyGroup}
                onDeleteFamily={handleGuestAwareDeleteFamily}
                onOpenPreview={openPreview}
                onOpenPreviewAndEdit={(familyId) => {
                  if (isGuest) {
                    openPreview(familyId);
                    setShowAuthPrompt(true);
                    return;
                  }
                  openPreviewAndEdit(familyId);
                }}
                onRenameFamily={handleGuestAwareRenameFamily}
                onRemoveReference={handleGuestAwareRemoveReference}
                onReplaceVariantImage={handleGuestAwareReplaceImage}
                onSetFlowLabel={handleGuestAwareSetFlowLabel}
                onToggleGroupSelect={toggleGroupSelection}
                onToggleSelect={toggleSelect}
                onUpdateVariantDetails={handleGuestAwareUpdateVariantDetails}
                webPresets={webPresets}
              />
            </div>
          </div>
        </main>
      )}

      <CatalogueUploadModal
        flowLabel={upload.uploadFlowLabel}
        isOpen={upload.showUpload}
        mobileOs={upload.uploadMobileOs}
        newFamilyGroup={upload.uploadNewFamilyGroup}
        newFamilyName={upload.uploadNewFamilyName}
        platform={upload.uploadPlatform}
        projectGroups={upload.uploadProjectGroups}
        projectId={upload.uploadProjectId}
        projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        referenceLabel={upload.uploadRefLabel}
        referencePreview={upload.uploadRefPreview}
        theme={upload.uploadTheme}
        uploading={upload.uploading}
        webPresetKey={upload.uploadWebPresetKey}
        webPresets={webPresets}
        onClose={upload.resetUploadState}
        onFilesSelected={(files) => void upload.handleFilesSelected(files)}
        onFlowLabelChange={upload.setUploadFlowLabel}
        onMobileOsChange={upload.setUploadMobileOs}
        onNewFamilyGroupChange={upload.setUploadNewFamilyGroup}
        onNewFamilyNameChange={upload.setUploadNewFamilyName}
        onPlatformChange={upload.setUploadPlatform}
        onProjectIdChange={(projectId) => {
          upload.setUploadProjectId(projectId);
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
        onThemeChange={upload.setUploadTheme}
        onWebPresetKeyChange={upload.setUploadWebPresetKey}
      />

      <CatalogueQuickUploadModal
        flowLabel={upload.quickUploadFlowLabel}
        isOpen={upload.showQuickUpload}
        projectId={upload.quickUploadProjectId}
        projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        quickUploadExistingGroup={upload.quickUploadExistingGroup}
        quickUploadGroupMode={upload.quickUploadGroupMode}
        quickUploadNewGroup={upload.quickUploadNewGroup}
        quickUploadProjectGroups={upload.quickUploadProjectGroups}
        quickUploadQueue={upload.quickUploadQueuePreview}
        uploading={upload.uploading}
        platform={upload.quickUploadPlatform}
        theme={upload.quickUploadTheme}
        webPresetKey={upload.quickUploadWebPresetKey}
        webPresets={webPresets}
        mobileOs={upload.quickUploadMobileOs}
        onClose={upload.resetQuickUploadState}
        onPlatformChange={upload.setQuickUploadPlatform}
        onThemeChange={upload.setQuickUploadTheme}
        onWebPresetKeyChange={upload.setQuickUploadWebPresetKey}
        onMobileOsChange={upload.setQuickUploadMobileOs}
        onQuickUploadClearQueue={upload.handleQuickUploadQueueClear}
        onQuickUploadExistingGroupChange={upload.setQuickUploadExistingGroup}
        onQuickUploadFilesSelected={upload.handleQuickUploadQueueAdd}
        onQuickUploadFlowLabelChange={upload.setQuickUploadFlowLabel}
        onQuickUploadGroupModeChange={upload.handleQuickUploadGroupModeChange}
        onQuickUploadNewGroupChange={upload.setQuickUploadNewGroup}
        onQuickUploadProjectChange={upload.handleQuickUploadProjectChange}
        onQuickUploadRemoveQueuedFile={upload.handleQuickUploadQueueRemove}
        onQuickUploadUploadAll={() => { void upload.handleQuickUploadUploadAll().then((inserted) => inserted.length > 0 && setSelected(new Set(inserted.map((item) => item.id)))); }}
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

      {previewFamily && (
        <CatalogueFamilyLightbox
          activeVariantKey={upload.activeVariantKeys[previewFamily.id] ?? null}
          canEdit={!isGuest}
          existingGroups={allGroups}
          family={previewFamily}
          flowName={previewFamily.flow_label}
          isOpen
          onRequireAuth={() => setShowAuthPrompt(true)}
          startInlineEdit={previewStartInlineEdit}
          webPresets={webPresets}
          userEmail={user.email || ''}
          onActiveVariantChange={upload.updateActiveVariant}
          onAnnotationStateChange={handleAnnotationStateChange}
          onChangeFamilyGroup={handleGuestAwareChangeFamilyGroup}
          onClose={() => {
            setPreviewFamilyId(null);
            setPreviewStartInlineEdit(false);
          }}
          onCommentCountChange={handleCommentCountChange}
          onDeleteFamily={handleGuestAwareDeleteFamily}
          onRenameFamily={handleGuestAwareRenameFamily}
          onReplaceVariantImage={handleGuestAwareReplaceImage}
          onSetFlowLabel={handleGuestAwareSetFlowLabel}
          onUpdateVariantDetails={handleGuestAwareUpdateVariantDetails}
        />
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
          onOpenDeleteConfirm={() => {
            guardAction(() => setConfirmDeleteOpen(true));
          }}
          onOpenGroupDialog={() => {
            guardAction(() => setBulkAction('group'));
          }}
          onOpenBulkRename={() => {
            guardAction(() => setBulkRenameOpen(true));
          }}
          onSelectAllVisible={selectAllVisible}
        />
      )}

      <CatalogueBulkRenameModal
        isOpen={bulkRenameOpen}
        families={filteredFamilies.filter((family) => selected.has(family.id))}
        onClose={() => setBulkRenameOpen(false)}
        onRenameFamily={handleRenameFamily}
      />

      <CatalogueEmailPromptModal
        isOpen={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
        onSubmit={(email) => {
          onRequestLogin(email);
          setShowAuthPrompt(false);
          setToast({ message: 'Editing enabled for this session.', type: 'success' });
        }}
      />
    </div>
  );
}
