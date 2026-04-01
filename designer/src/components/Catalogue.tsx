import { useMemo, useState } from 'react';

import type { User } from '@supabase/supabase-js';
import type { Flow, ScreenshotNode } from '../types';
import { supabase } from '../lib/supabase';
import { parseScreenshotName } from '../lib/naming';
import { CatalogueBulkBar, CatalogueContent, CatalogueOverlays } from './CatalogueContent';
import { CatalogueFlowSidebar } from './CatalogueFlowSidebar';
import { CatalogueToolbar } from './CatalogueToolbar';
import { useCatalogueData } from '../hooks/use-catalogue-data';
import { useCatalogueFilters } from '../hooks/use-catalogue-filters';

interface CatalogueProps {
  user: User;
}

export function Catalogue({ user }: CatalogueProps) {
  const {
    flows,
    flowMap,
    loading,
    projectMap,
    projects,
    screenshots,
    setProjects,
    setScreenshots,
  } = useCatalogueData();
  const {
    activeFlowCount,
    activeFlowFilter,
    activeFlowLabel,
    allGroups,
    filterGroup,
    filterPlatform,
    filterProject,
    filterTheme,
    filteredScreenshots,
    flowItems,
    groupedScreenshots,
    primaryGroup,
    searchQuery,
    setActiveFlowFilter,
    setFilterGroup,
    setFilterPlatform,
    setFilterProject,
    setFilterTheme,
    setSearchQuery,
    vsGroups,
  } = useCatalogueFilters({ flows, projects, screenshots });

  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false), [uploadProjectId, setUploadProjectId] = useState<string | null>(null);
  const [uploadGroup, setUploadGroup] = useState(''), [newGroupName, setNewGroupName] = useState('');
  const [uploadTheme, setUploadTheme] = useState<'light' | 'dark' | null>(null), [uploadRefFile, setUploadRefFile] = useState<File | null>(null);
  const [uploadRefLabel, setUploadRefLabel] = useState(''), [uploadRefPreview, setUploadRefPreview] = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<string | null>(null), [showQuickUpload, setShowQuickUpload] = useState(false);
  const [quickUploadProjectId, setQuickUploadProjectId] = useState<string | null>(null), [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'assign' | 'group' | 'platform' | null>(null), [confirmDelete, setConfirmDelete] = useState<{ type: 'bulk' } | null>(null);
  const [bulkGroupValue, setBulkGroupValue] = useState(''), [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [isFlowSheetExpanded, setIsFlowSheetExpanded] = useState(false);

  const uploadProjectGroups = useMemo(() => !uploadProjectId ? [] : [...new Set(
    screenshots.filter((screenshot) => screenshot.project_id === uploadProjectId).map((screenshot) => screenshot.group).filter(Boolean),
  )] as string[], [screenshots, uploadProjectId]);
  const uploadProjectPrimary = useMemo(
    () => !uploadProjectId ? null : projects.find((project) => project.id === uploadProjectId)?.primary_group || null,
    [projects, uploadProjectId],
  );
  const selectedVisibleCount = useMemo(() => filteredScreenshots.filter((screenshot) => selected.has(screenshot.id)).length, [filteredScreenshots, selected]);
  const bulkFlows = useMemo(() => {
    if (selected.size === 0) return [];
    const projectIds = new Set(screenshots.filter((screenshot) => selected.has(screenshot.id)).map((screenshot) => screenshot.project_id));
    return flows.filter((flow) => projectIds.has(flow.project_id));
  }, [flows, screenshots, selected]);
  const assigningScreenshot = useMemo(
    () => assignModal ? screenshots.find((screenshot) => screenshot.id === assignModal) ?? null : null,
    [assignModal, screenshots],
  );

  function resetUploadState() {
    setShowUpload(false);
    setUploadProjectId(null);
    setUploadGroup('');
    setNewGroupName('');
    setUploadTheme(null);
    setUploadRefFile(null);
    setUploadRefLabel('');
    if (uploadRefPreview) {
      URL.revokeObjectURL(uploadRefPreview);
      setUploadRefPreview(null);
    }
  }

  function resetQuickUploadState() { setShowQuickUpload(false); setQuickUploadProjectId(null); }

  async function handlePrimaryGroupChange(group: string | null) {
    if (!filterProject) {
      return;
    }

    await supabase.from('projects').update({ primary_group: group }).eq('id', filterProject);
    setProjects((previous) => previous.map((project) => (
      project.id === filterProject ? { ...project, primary_group: group } : project
    )));
    setToast({ message: group ? `Primary group set to "${group}"` : 'Primary group cleared', type: 'success' });
  }

  async function handleVsGroupsChange(groups: string[]) {
    if (!filterProject) {
      return;
    }

    await supabase.from('projects').update({ vs_groups: groups }).eq('id', filterProject);
    setProjects((previous) => previous.map((project) => (
      project.id === filterProject ? { ...project, vs_groups: groups } : project
    )));
  }

  function handleCommentCountChange(screenshotId: string, delta: number) {
    setScreenshots((previous) => previous.map((screenshot) => screenshot.id === screenshotId
      ? { ...screenshot, comment_count: (screenshot.comment_count ?? 0) + delta }
      : screenshot));
  }

  async function handlePlatformChange(id: string, platform: 'mobile' | 'web' | null) {
    await supabase.from('screenshots').update({ platform }).eq('id', id);
    setScreenshots((previous) => previous.map((screenshot) => screenshot.id === id ? { ...screenshot, platform } : screenshot));
  }

  async function handleRename(id: string, name: string) {
    await supabase.from('screenshots').update({ name }).eq('id', id);
    setScreenshots((previous) => previous.map((screenshot) => screenshot.id === id ? { ...screenshot, name } : screenshot));
  }

  async function handleChangeGroup(id: string, group: string | null) {
    await supabase.from('screenshots').update({ group }).eq('id', id);
    setScreenshots((previous) => previous.map((screenshot) => screenshot.id === id ? { ...screenshot, group } : screenshot));
  }

  async function handleDelete(id: string) {
    const screenshot = screenshots.find((item) => item.id === id);
    if (!screenshot) {
      return;
    }

    await supabase
      .from('connections')
      .delete()
      .or(`source_id.eq.${id},target_id.eq.${id}`);

    await supabase.from('screenshots').delete().eq('id', id);

    if (screenshot.storage_path) {
      await supabase.storage.from('screenshots').remove([screenshot.storage_path]);
    }

    setScreenshots((previous) => previous.filter((item) => item.id !== id));
    setSelected((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setToast({ message: 'Screenshot deleted', type: 'success' });
  }

  async function handleReplaceImage(id: string, file: File) {
    const screenshot = screenshots.find((item) => item.id === id);
    if (!screenshot) {
      return;
    }

    const { count } = await supabase
      .from('screenshot_versions')
      .select('*', { count: 'exact', head: true })
      .eq('screenshot_id', id);
    const nextVersion = (count ?? 0) + 1;

    await supabase.from('screenshot_versions').insert({
      screenshot_id: id,
      version_number: nextVersion,
      storage_path: screenshot.storage_path,
      file_name: screenshot.file_name,
    });

    const compressed = await compressImage(file);
    const safeName = file.name.replace(/\s+/g, '-');
    const storagePath = `${user.id}/${screenshot.project_id}/${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('screenshots')
      .upload(storagePath, compressed, { upsert: true });

    if (uploadError) {
      setToast({ message: `Upload failed: ${uploadError.message}`, type: 'error' });
      return;
    }

    const imageUrl = supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl;

    await supabase.from('screenshots').update({
      storage_path: storagePath,
      file_name: file.name,
    }).eq('id', id);

    setScreenshots((previous) => previous.map((item) => (
      item.id === id
        ? {
          ...item,
          storage_path: storagePath,
          file_name: file.name,
          image_url: imageUrl,
          version_count: nextVersion,
        }
        : item
    )));
    setToast({ message: `Image replaced (v${nextVersion + 1})`, type: 'success' });
  }

  async function handleAssignFlow(screenshotId: string, flowId: string | null) {
    if (flowId) {
      const screenshot = screenshots.find((item) => item.id === screenshotId);
      if (screenshot && primaryGroup && screenshot.group !== primaryGroup) {
        setToast({ message: 'Only primary group screenshots can be assigned to flows', type: 'error' });
        setAssignModal(null);
        return;
      }
    }

    await supabase.from('screenshots').update({ flow_id: flowId }).eq('id', screenshotId);
    setScreenshots((previous) => previous.map((screenshot) => (
      screenshot.id === screenshotId ? { ...screenshot, flow_id: flowId } : screenshot
    )));
    setToast({
      message: flowId ? `Assigned to ${flowMap[flowId] || 'flow'}` : 'Unassigned from flow',
      type: 'success',
    });
  }

  function compressImage(file: File, maxWidth = 1600, quality = 0.82): Promise<File> {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        resolve(file);
        return;
      }

      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        if (img.width <= maxWidth && file.size < 300_000) {
          resolve(file);
          return;
        }

        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => resolve(blob ? new File([blob], file.name, { type: 'image/webp' }) : file),
          'image/webp',
          quality,
        );
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleFilesSelected(
    files: File[],
    groupOverride?: string,
    themeOverride?: 'light' | 'dark' | null,
  ) {
    const groupToAssign = groupOverride || uploadGroup;
    const themeToAssign = themeOverride !== undefined ? themeOverride : uploadTheme;
    if (!uploadProjectId || !groupToAssign) {
      return;
    }

    setUploading(true);
    resetUploadState();

    let refStoragePath: string | null = null;
    let refUrl: string | null = null;
    const refLabel = uploadRefLabel.trim() || null;

    if (uploadRefFile) {
      const refCompressed = await compressImage(uploadRefFile);
      const refSafeName = uploadRefFile.name.replace(/\s+/g, '-');
      refStoragePath = `${user.id}/${uploadProjectId}/references/${Date.now()}-${refSafeName}`;
      const { error: refError } = await supabase.storage
        .from('screenshots')
        .upload(refStoragePath, refCompressed, { upsert: true });

      if (!refError) {
        refUrl = supabase.storage.from('screenshots').getPublicUrl(refStoragePath).data.publicUrl;
      }
    }

    const results = await Promise.allSettled(
      files.map(async (file) => {
        const compressed = await compressImage(file);
        const parsed = parseScreenshotName(file.name);
        const safeName = file.name.replace(/\s+/g, '-');
        const storagePath = `${user.id}/${uploadProjectId}/${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('screenshots')
          .upload(storagePath, compressed, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }

        const imageUrl = supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl;

        const { data, error } = await supabase
          .from('screenshots')
          .insert({
            project_id: uploadProjectId,
            flow_id: null,
            name: parsed.name,
            file_name: file.name,
            storage_path: storagePath,
            sequence: parsed.sequence,
            group: groupToAssign,
            theme: themeToAssign,
            reference_url: refUrl,
            reference_storage_path: refStoragePath,
            reference_label: refLabel,
          })
          .select()
          .single();

        if (error || !data) {
          throw error;
        }

        return { ...data, image_url: imageUrl } as ScreenshotNode;
      }),
    );

    const newScreenshots = results
      .filter((result): result is PromiseFulfilledResult<ScreenshotNode> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failed = results.filter((result) => result.status === 'rejected').length;

    if (newScreenshots.length > 0) {
      setScreenshots((previous) => [...newScreenshots, ...previous]);
      setToast({
        message: `${newScreenshots.length} screenshot${newScreenshots.length > 1 ? 's' : ''} uploaded${failed ? `, ${failed} failed` : ''}`,
        type: failed ? 'info' : 'success',
      });
    } else if (failed) {
      setToast({ message: `Upload failed for ${failed} file${failed > 1 ? 's' : ''}`, type: 'error' });
    }

    setUploading(false);
  }

  function toggleSelect(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGroupSelection(items: ScreenshotNode[]) {
    setSelected((previous) => {
      const next = new Set(previous);
      const allSelected = items.every((item) => next.has(item.id));
      for (const item of items) {
        if (allSelected) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      }
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((previous) => {
      const next = new Set(previous);
      const allVisibleSelected = filteredScreenshots.length > 0 && filteredScreenshots.every((item) => next.has(item.id));
      for (const item of filteredScreenshots) {
        if (allVisibleSelected) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      }
      return next;
    });
  }

  function clearSelection() { setSelected(new Set()); setBulkAction(null); setBulkGroupValue(''); }

  async function handleBulkDelete() {
    if (selected.size === 0) {
      return;
    }

    const ids = Array.from(selected);
    const toDelete = screenshots.filter((screenshot) => ids.includes(screenshot.id));

    await supabase.from('connections').delete().or(
      ids.map((id) => `source_id.eq.${id},target_id.eq.${id}`).join(','),
    );
    await supabase.from('screenshots').delete().in('id', ids);

    const paths = toDelete.map((screenshot) => screenshot.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from('screenshots').remove(paths);
    }

    setScreenshots((previous) => previous.filter((screenshot) => !selected.has(screenshot.id)));
    setToast({
      message: `${selected.size} screenshot${selected.size > 1 ? 's' : ''} deleted`,
      type: 'success',
    });
    clearSelection();
  }

  async function handleBulkAssignFlow(flowId: string | null) {
    if (selected.size === 0) {
      return;
    }

    const ids = Array.from(selected);

    await supabase.from('screenshots').update({ flow_id: flowId }).in('id', ids);
    setScreenshots((previous) => previous.map((screenshot) => (
      selected.has(screenshot.id) ? { ...screenshot, flow_id: flowId } : screenshot
    )));
    setToast({
      message: flowId
        ? `${selected.size} assigned to ${flowMap[flowId] || 'flow'}`
        : `${selected.size} unassigned from flow`,
      type: 'success',
    });
    clearSelection();
  }

  async function handleBulkChangeGroup(group: string) {
    const trimmedGroup = group.trim();
    if (selected.size === 0 || !trimmedGroup) {
      return;
    }

    const ids = Array.from(selected);

    await supabase.from('screenshots').update({ group: trimmedGroup }).in('id', ids);
    setScreenshots((previous) => previous.map((screenshot) => (
      selected.has(screenshot.id) ? { ...screenshot, group: trimmedGroup } : screenshot
    )));
    setToast({ message: `${selected.size} moved to "${trimmedGroup}"`, type: 'success' });
    clearSelection();
  }

  async function handleBulkPlatform(platform: 'mobile' | 'web' | null) {
    if (selected.size === 0) {
      return;
    }

    const ids = Array.from(selected);

    await supabase.from('screenshots').update({ platform }).in('id', ids);
    setScreenshots((previous) => previous.map((screenshot) => (
      selected.has(screenshot.id) ? { ...screenshot, platform } : screenshot
    )));
    setToast({ message: `${selected.size} set to ${platform || 'no platform'}`, type: 'success' });
    clearSelection();
  }

  async function handleQuickUpload(files: File[]) {
    if (!quickUploadProjectId) {
      return;
    }

    setUploading(true);
    resetQuickUploadState();

    const results = await Promise.allSettled(
      files.map(async (file) => {
        const compressed = await compressImage(file);
        const parsed = parseScreenshotName(file.name);
        const safeName = file.name.replace(/\s+/g, '-');
        const storagePath = `${user.id}/${quickUploadProjectId}/${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('screenshots')
          .upload(storagePath, compressed, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }

        const imageUrl = supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl;

        const { data, error } = await supabase
          .from('screenshots')
          .insert({
            project_id: quickUploadProjectId,
            flow_id: null,
            name: parsed.name,
            file_name: file.name,
            storage_path: storagePath,
            sequence: parsed.sequence,
            group: parsed.group,
          })
          .select()
          .single();

        if (error || !data) {
          throw error;
        }

        return { ...data, image_url: imageUrl } as ScreenshotNode;
      }),
    );

    const newScreenshots = results
      .filter((result): result is PromiseFulfilledResult<ScreenshotNode> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failed = results.filter((result) => result.status === 'rejected').length;

    if (newScreenshots.length > 0) {
      setScreenshots((previous) => [...newScreenshots, ...previous]);
      setSelected(new Set(newScreenshots.map((screenshot) => screenshot.id)));
      setToast({
        message: `${newScreenshots.length} uploaded${failed ? `, ${failed} failed` : ''} — now assign them`,
        type: 'success',
      });
    } else if (failed) {
      setToast({ message: `Upload failed for ${failed} file${failed > 1 ? 's' : ''}`, type: 'error' });
    }

    setUploading(false);
  }

  function getProjectFlows(screenshotId: string): Flow[] {
    const screenshot = screenshots.find((item) => item.id === screenshotId);
    return screenshot ? flows.filter((flow) => flow.project_id === screenshot.project_id) : [];
  }

  return (
    <div className="catalogue-page">
      <header className="catalogue-header">
        <div className="header-left">
          <button
            className="catalogue-back"
            onClick={() => { window.location.href = '/designer/'; }}
            title="Back to projects"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
            <path d="M3 7l6-4 6 4 6-4v14l-6 4-6-4-6 4V7z" />
            <path d="M9 3v14" />
            <path d="M15 7v14" />
          </svg>
          <h1>Catalogue</h1>
        </div>
      </header>

      <main className="catalogue-main">
        <div className="catalogue-shell">
          <CatalogueFlowSidebar activeFlowCount={activeFlowCount} activeFlowFilter={activeFlowFilter} activeFlowLabel={activeFlowLabel} items={flowItems} mobileExpanded={isFlowSheetExpanded} onFlowFilterChange={setActiveFlowFilter} onMobileExpandedChange={setIsFlowSheetExpanded} />

          <div className="catalogue-body">
            <CatalogueToolbar searchQuery={searchQuery} onSearchChange={setSearchQuery} filterProject={filterProject} onFilterProjectChange={setFilterProject} projects={projects.map((project) => ({ id: project.id, name: project.name }))} filterGroup={filterGroup} onFilterGroupChange={setFilterGroup} groups={allGroups} filterPlatform={filterPlatform} onFilterPlatformChange={setFilterPlatform} filterTheme={filterTheme} onFilterThemeChange={setFilterTheme} primaryGroup={primaryGroup} vsGroups={vsGroups} onPrimaryGroupChange={handlePrimaryGroupChange} onVsGroupsChange={handleVsGroupsChange} showGroupConfig={Boolean(filterProject)} onUploadClick={() => setShowUpload(true)} onQuickUploadClick={() => setShowQuickUpload(true)} screenshotCount={filteredScreenshots.length} activeFlowCount={activeFlowCount} activeFlowLabel={activeFlowLabel} onToggleFlowSheet={() => setIsFlowSheetExpanded((previous) => !previous)} />

            <CatalogueContent activeFlowFilter={activeFlowFilter} filterGroup={filterGroup} filterPlatform={filterPlatform} filterProject={filterProject} filterTheme={filterTheme} filteredScreenshots={filteredScreenshots} flowMap={flowMap} groupedScreenshots={groupedScreenshots} loading={loading} primaryGroup={primaryGroup} projectMap={projectMap} projectsCount={projects.length} searchQuery={searchQuery} selected={selected} userEmail={user.email || ''} vsGroups={vsGroups} onAssignFlow={setAssignModal} onChangeGroup={handleChangeGroup} onCommentCountChange={handleCommentCountChange} onDelete={handleDelete} onRename={handleRename} onReplaceImage={handleReplaceImage} onToggleGroupSelect={toggleGroupSelection} onToggleSelect={toggleSelect} onPlatformChange={handlePlatformChange} />
          </div>
        </div>
      </main>

      <CatalogueOverlays allGroups={allGroups} assignModalOpen={Boolean(assignModal)} assigningFlows={assignModal ? getProjectFlows(assignModal) : []} assigningScreenshot={assigningScreenshot} bulkAction={bulkAction} bulkFlows={bulkFlows} bulkGroupValue={bulkGroupValue} confirmDeleteOpen={Boolean(confirmDelete)} newGroupName={newGroupName} primaryGroup={primaryGroup} projects={projects.map((project) => ({ id: project.id, name: project.name }))} quickUploadProjectId={quickUploadProjectId} selectedCount={selected.size} showQuickUpload={showQuickUpload} showUpload={showUpload} toast={toast} uploadGroup={uploadGroup} uploadProjectGroups={uploadProjectGroups} uploadProjectId={uploadProjectId} uploadProjectPrimary={uploadProjectPrimary} uploadRefLabel={uploadRefLabel} uploadRefPreview={uploadRefPreview} uploadTheme={uploadTheme} uploading={uploading} onAssignFlow={(flowId) => { if (assignModal) void handleAssignFlow(assignModal, flowId); }} onBulkActionChange={setBulkAction} onBulkAssignFlow={(flowId) => void handleBulkAssignFlow(flowId)} onBulkChangeGroup={(group) => void handleBulkChangeGroup(group)} onBulkGroupValueChange={setBulkGroupValue} onBulkPlatform={(platform) => void handleBulkPlatform(platform)} onCloseAssignModal={() => setAssignModal(null)} onCloseConfirmDelete={() => setConfirmDelete(null)} onCloseQuickUpload={resetQuickUploadState} onCloseToast={() => setToast(null)} onCloseUpload={resetUploadState} onConfirmBulkDelete={() => { setConfirmDelete(null); void handleBulkDelete(); }} onQuickUploadFilesSelected={(files) => void handleQuickUpload(files)} onQuickUploadProjectChange={setQuickUploadProjectId} onRemoveUploadReference={() => { if (uploadRefPreview) URL.revokeObjectURL(uploadRefPreview); setUploadRefFile(null); setUploadRefPreview(null); }} onSelectUploadReference={(file) => { if (uploadRefPreview) { URL.revokeObjectURL(uploadRefPreview); setUploadRefPreview(null); } if (file && file.type.startsWith('image/')) { setUploadRefFile(file); setUploadRefPreview(URL.createObjectURL(file)); } else { setUploadRefFile(null); } }} onUploadFilesSelected={(files, group, theme) => void handleFilesSelected(files, group, theme)} onUploadGroupChange={(value) => { setUploadGroup(value); if (value !== '__new__') setNewGroupName(''); }} onUploadProjectChange={(value) => { setUploadProjectId(value); setUploadGroup(''); setNewGroupName(''); }} onUploadRefLabelChange={setUploadRefLabel} onUploadThemeChange={setUploadTheme} onNewGroupNameChange={setNewGroupName} />

      <CatalogueBulkBar filteredScreenshotsCount={filteredScreenshots.length} selectedCount={selected.size} selectedVisibleCount={selectedVisibleCount} onClearSelection={clearSelection} onOpenDeleteConfirm={() => setConfirmDelete({ type: 'bulk' })} onSelectAllVisible={selectAllVisible} onSetBulkAction={setBulkAction} />
    </div>
  );
}
