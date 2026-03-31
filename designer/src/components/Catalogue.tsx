import { useEffect, useMemo, useState } from 'react';

import type { User } from '@supabase/supabase-js';
import type { Project, Flow, ScreenshotNode } from '../types';
import { supabase } from '../lib/supabase';
import { parseScreenshotName } from '../lib/naming';
import { CatalogueCard } from './CatalogueCard';
import { CatalogueToolbar } from './CatalogueToolbar';
import { FlowAssignModal } from './FlowAssignModal';
import { UploadZone } from './UploadZone';
import { Dropdown } from './Dropdown';
import { ConfirmModal } from './ConfirmModal';
import { Toast } from './Toast';

interface CatalogueProps {
  user: User;
}

export function Catalogue({ user }: CatalogueProps) {

  const [projects, setProjects] = useState<Project[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadProjectId, setUploadProjectId] = useState<string | null>(null);
  const [uploadGroup, setUploadGroup] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState('');
  const [uploadTheme, setUploadTheme] = useState<'light' | 'dark' | null>(null);
  const [uploadRefFile, setUploadRefFile] = useState<File | null>(null);
  const [uploadRefLabel, setUploadRefLabel] = useState('');
  const [uploadRefPreview, setUploadRefPreview] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [filterTheme, setFilterTheme] = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [showQuickUpload, setShowQuickUpload] = useState(false);
  const [quickUploadProjectId, setQuickUploadProjectId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'assign' | 'group' | 'platform' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'bulk' } | null>(null);
  const [bulkGroupValue, setBulkGroupValue] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const { data: projectData } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (!projectData || projectData.length === 0) {
      setProjects([]);
      setScreenshots([]);
      setFlows([]);
      setLoading(false);
      return;
    }

    setProjects(projectData);
    const projectIds = projectData.map((p: Project) => p.id);

    const [screenshotRes, flowRes] = await Promise.all([
      supabase
        .from('screenshots')
        .select('*')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('flows')
        .select('*')
        .in('project_id', projectIds)
        .order('created_at'),
    ]);

    if (screenshotRes.data) {
      // Load version counts
      const screenshotIds = screenshotRes.data.map((s: ScreenshotNode) => s.id);
      const versionCounts: Record<string, number> = {};
      if (screenshotIds.length > 0) {
        const { data: versionData } = await supabase
          .from('screenshot_versions')
          .select('screenshot_id')
          .in('screenshot_id', screenshotIds);
        if (versionData) {
          for (const v of versionData) {
            versionCounts[v.screenshot_id] = (versionCounts[v.screenshot_id] || 0) + 1;
          }
        }
      }

      const withUrls = screenshotRes.data.map((s: ScreenshotNode) => ({
        ...s,
        image_url: s.storage_path
          ? supabase.storage.from('screenshots').getPublicUrl(s.storage_path).data.publicUrl
          : '',
        version_count: versionCounts[s.id] || 0,
      }));
      setScreenshots(withUrls);
    }

    if (flowRes.data) setFlows(flowRes.data);
    setLoading(false);
  }

  // Current filtered project
  const currentProject = useMemo(() => {
    if (!filterProject) return null;
    return projects.find((p) => p.id === filterProject) || null;
  }, [projects, filterProject]);

  const primaryGroup = currentProject?.primary_group || null;
  const vsGroups = currentProject?.vs_groups || [];

  // Derived data
  const allGroups = useMemo(() => {
    const filtered = filterProject
      ? screenshots.filter((s) => s.project_id === filterProject)
      : screenshots;
    return [...new Set(filtered.map((s) => s.group).filter(Boolean))] as string[];
  }, [screenshots, filterProject]);

  const uploadProjectGroups = useMemo(() => {
    if (!uploadProjectId) return [];
    return [...new Set(screenshots.filter((s) => s.project_id === uploadProjectId).map((s) => s.group).filter(Boolean))] as string[];
  }, [screenshots, uploadProjectId]);

  const uploadProjectPrimary = useMemo(() => {
    if (!uploadProjectId) return null;
    return projects.find((p) => p.id === uploadProjectId)?.primary_group || null;
  }, [projects, uploadProjectId]);

  const filteredScreenshots = useMemo(() => {
    return screenshots.filter((s) => {
      const matchesSearch = !searchQuery ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.group || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.file_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesProject = !filterProject || s.project_id === filterProject;
      const matchesGroup = !filterGroup || s.group === filterGroup;
      const matchesPlatform = !filterPlatform || s.platform === filterPlatform;
      const matchesTheme = !filterTheme || s.theme === filterTheme;
      return matchesSearch && matchesProject && matchesGroup && matchesPlatform && matchesTheme;
    });
  }, [screenshots, searchQuery, filterProject, filterGroup, filterPlatform, filterTheme]);

  const groupedScreenshots = useMemo(() => {
    const groups: Record<string, ScreenshotNode[]> = {};
    for (const s of filteredScreenshots) {
      const key = s.group || 'Ungrouped';
      (groups[key] ||= []).push(s);
    }
    // Sort: primary first, then vs groups, then the rest
    const sorted: [string, ScreenshotNode[]][] = Object.entries(groups).sort(([a], [b]) => {
      const aIsPrimary = a === primaryGroup;
      const bIsPrimary = b === primaryGroup;
      if (aIsPrimary && !bIsPrimary) return -1;
      if (!aIsPrimary && bIsPrimary) return 1;
      const aIsVs = vsGroups.includes(a);
      const bIsVs = vsGroups.includes(b);
      if (aIsVs && !bIsVs) return -1;
      if (!aIsVs && bIsVs) return 1;
      return 0;
    });
    return Object.fromEntries(sorted);
  }, [filteredScreenshots, primaryGroup, vsGroups]);

  // Lookup helpers
  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of projects) m[p.id] = p.name;
    return m;
  }, [projects]);

  const flowMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of flows) m[f.id] = f.name;
    return m;
  }, [flows]);

  // Group config handlers
  async function handlePrimaryGroupChange(group: string | null) {
    if (!filterProject) return;
    await supabase.from('projects').update({ primary_group: group }).eq('id', filterProject);
    setProjects((prev) => prev.map((p) =>
      p.id === filterProject ? { ...p, primary_group: group } : p
    ));
    setToast({ message: group ? `Primary group set to "${group}"` : 'Primary group cleared', type: 'success' });
  }

  async function handleVsGroupsChange(groups: string[]) {
    if (!filterProject) return;
    await supabase.from('projects').update({ vs_groups: groups }).eq('id', filterProject);
    setProjects((prev) => prev.map((p) =>
      p.id === filterProject ? { ...p, vs_groups: groups } : p
    ));
  }

  // Platform handler
  async function handlePlatformChange(id: string, platform: 'mobile' | 'web' | null) {
    await supabase.from('screenshots').update({ platform }).eq('id', id);
    setScreenshots((prev) => prev.map((s) => (s.id === id ? { ...s, platform } : s)));
  }



  // CRUD handlers
  async function handleRename(id: string, name: string) {
    await supabase.from('screenshots').update({ name }).eq('id', id);
    setScreenshots((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }

  async function handleChangeGroup(id: string, group: string | null) {
    await supabase.from('screenshots').update({ group }).eq('id', id);
    setScreenshots((prev) => prev.map((s) => (s.id === id ? { ...s, group } : s)));
  }

  async function handleDelete(id: string) {
    const screenshot = screenshots.find((s) => s.id === id);
    if (!screenshot) return;

    // Delete connections referencing this screenshot
    await supabase
      .from('connections')
      .delete()
      .or(`source_id.eq.${id},target_id.eq.${id}`);

    // Delete from DB
    await supabase.from('screenshots').delete().eq('id', id);

    // Delete from storage
    if (screenshot.storage_path) {
      await supabase.storage.from('screenshots').remove([screenshot.storage_path]);
    }

    setScreenshots((prev) => prev.filter((s) => s.id !== id));
    setToast({ message: 'Screenshot deleted', type: 'success' });
  }

  async function handleReplaceImage(id: string, file: File) {
    const screenshot = screenshots.find((s) => s.id === id);
    if (!screenshot) return;

    // Save current image as a version before replacing
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

    // Upload new image
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

    setScreenshots((prev) => prev.map((s) =>
      s.id === id ? { ...s, storage_path: storagePath, file_name: file.name, image_url: imageUrl, version_count: nextVersion } : s
    ));
    setToast({ message: `Image replaced (v${nextVersion + 1})`, type: 'success' });
  }

  async function handleAssignFlow(screenshotId: string, flowId: string | null) {
    // Enforce primary-only assignment
    if (flowId) {
      const screenshot = screenshots.find((s) => s.id === screenshotId);
      if (screenshot && primaryGroup && screenshot.group !== primaryGroup) {
        setToast({ message: 'Only primary group screenshots can be assigned to flows', type: 'error' });
        setAssignModal(null);
        return;
      }
    }

    await supabase.from('screenshots').update({ flow_id: flowId }).eq('id', screenshotId);
    setScreenshots((prev) => prev.map((s) =>
      s.id === screenshotId ? { ...s, flow_id: flowId } : s
    ));
    setToast({
      message: flowId ? `Assigned to ${flowMap[flowId] || 'flow'}` : 'Unassigned from flow',
      type: 'success',
    });
  }

  // Upload handler
  function compressImage(file: File, maxWidth = 1600, quality = 0.82): Promise<File> {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        resolve(file);
        return;
      }
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        if (img.width <= maxWidth && file.size < 300_000) { resolve(file); return; }
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
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

  async function handleFilesSelected(files: File[], groupOverride?: string, themeOverride?: 'light' | 'dark' | null) {
    const groupToAssign = groupOverride || uploadGroup;
    const themeToAssign = themeOverride !== undefined ? themeOverride : uploadTheme;
    if (!uploadProjectId || !groupToAssign) return;
    setUploading(true);
    setShowUpload(false);

    // Upload reference image if provided
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

    setUploadGroup('');
    setNewGroupName('');
    setUploadTheme(null);
    setUploadRefFile(null);
    setUploadRefLabel('');
    if (uploadRefPreview) { URL.revokeObjectURL(uploadRefPreview); setUploadRefPreview(null); }

    const results = await Promise.allSettled(
      files.map(async (file) => {
        const compressed = await compressImage(file);
        const parsed = parseScreenshotName(file.name);
        const safeName = file.name.replace(/\s+/g, '-');
        const storagePath = `${user.id}/${uploadProjectId}/${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('screenshots')
          .upload(storagePath, compressed, { upsert: true });

        if (uploadError) throw uploadError;

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

        if (error || !data) throw error;
        return { ...data, image_url: imageUrl } as ScreenshotNode;
      }),
    );

    const newScreenshots = results
      .filter((r): r is PromiseFulfilledResult<ScreenshotNode> => r.status === 'fulfilled')
      .map((r) => r.value);

    const failed = results.filter((r) => r.status === 'rejected').length;

    if (newScreenshots.length > 0) {
      setScreenshots((prev) => [...newScreenshots, ...prev]);
      setToast({ message: `${newScreenshots.length} screenshot${newScreenshots.length > 1 ? 's' : ''} uploaded${failed ? `, ${failed} failed` : ''}`, type: failed ? 'info' : 'success' });
    } else if (failed) {
      setToast({ message: `Upload failed for ${failed} file${failed > 1 ? 's' : ''}`, type: 'error' });
    }

    setUploading(false);
    setUploadProjectId(null);
  }

  // Selection handlers
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    if (selected.size === filteredScreenshots.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredScreenshots.map((s) => s.id)));
    }
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkAction(null);
    setBulkGroupValue('');
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;

    const ids = Array.from(selected);
    const toDelete = screenshots.filter((s) => ids.includes(s.id));

    await supabase.from('connections').delete().or(ids.map((id) => `source_id.eq.${id},target_id.eq.${id}`).join(','));
    await supabase.from('screenshots').delete().in('id', ids);

    const paths = toDelete.map((s) => s.storage_path).filter(Boolean);
    if (paths.length) await supabase.storage.from('screenshots').remove(paths);

    setScreenshots((prev) => prev.filter((s) => !selected.has(s.id)));
    setToast({ message: `${selected.size} screenshot${selected.size > 1 ? 's' : ''} deleted`, type: 'success' });
    clearSelection();
  }

  async function handleBulkAssignFlow(flowId: string | null) {
    if (selected.size === 0) return;
    const ids = Array.from(selected);

    await supabase.from('screenshots').update({ flow_id: flowId }).in('id', ids);
    setScreenshots((prev) => prev.map((s) => selected.has(s.id) ? { ...s, flow_id: flowId } : s));
    setToast({
      message: flowId
        ? `${selected.size} assigned to ${flowMap[flowId] || 'flow'}`
        : `${selected.size} unassigned from flow`,
      type: 'success',
    });
    clearSelection();
  }

  async function handleBulkChangeGroup(group: string) {
    if (selected.size === 0 || !group.trim()) return;
    const ids = Array.from(selected);

    await supabase.from('screenshots').update({ group: group.trim() }).in('id', ids);
    setScreenshots((prev) => prev.map((s) => selected.has(s.id) ? { ...s, group: group.trim() } : s));
    setToast({ message: `${selected.size} moved to "${group.trim()}"`, type: 'success' });
    clearSelection();
  }

  async function handleBulkPlatform(platform: 'mobile' | 'web' | null) {
    if (selected.size === 0) return;
    const ids = Array.from(selected);

    await supabase.from('screenshots').update({ platform }).in('id', ids);
    setScreenshots((prev) => prev.map((s) => selected.has(s.id) ? { ...s, platform } : s));
    setToast({ message: `${selected.size} set to ${platform || 'no platform'}`, type: 'success' });
    clearSelection();
  }

  // Flows available for bulk assign (from selected screenshots' projects)
  const bulkFlows = useMemo(() => {
    if (selected.size === 0) return [];
    const projectIds = new Set(screenshots.filter((s) => selected.has(s.id)).map((s) => s.project_id));
    return flows.filter((f) => projectIds.has(f.project_id));
  }, [selected, screenshots, flows]);

  // Get flows for a specific screenshot's project
  async function handleQuickUpload(files: File[]) {
    if (!quickUploadProjectId) return;
    setUploading(true);
    setShowQuickUpload(false);

    const results = await Promise.allSettled(
      files.map(async (file) => {
        const compressed = await compressImage(file);
        const parsed = parseScreenshotName(file.name);
        const safeName = file.name.replace(/\s+/g, '-');
        const storagePath = `${user.id}/${quickUploadProjectId}/${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('screenshots')
          .upload(storagePath, compressed, { upsert: true });

        if (uploadError) throw uploadError;

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

        if (error || !data) throw error;
        return { ...data, image_url: imageUrl } as ScreenshotNode;
      }),
    );

    const newScreenshots = results
      .filter((r): r is PromiseFulfilledResult<ScreenshotNode> => r.status === 'fulfilled')
      .map((r) => r.value);

    const failed = results.filter((r) => r.status === 'rejected').length;

    if (newScreenshots.length > 0) {
      setScreenshots((prev) => [...newScreenshots, ...prev]);
      // Auto-select all newly uploaded screenshots
      setSelected(new Set(newScreenshots.map((s) => s.id)));
      setToast({ message: `${newScreenshots.length} uploaded${failed ? `, ${failed} failed` : ''} — now assign them`, type: 'success' });
    } else if (failed) {
      setToast({ message: `Upload failed for ${failed} file${failed > 1 ? 's' : ''}`, type: 'error' });
    }

    setUploading(false);
    setQuickUploadProjectId(null);
  }

  function getProjectFlows(screenshotId: string): Flow[] {
    const s = screenshots.find((ss) => ss.id === screenshotId);
    if (!s) return [];
    return flows.filter((f) => f.project_id === s.project_id);
  }

  const assigningScreenshot = assignModal ? screenshots.find((s) => s.id === assignModal) : null;

  return (
    <div className="catalogue-page">
      <header className="catalogue-header">
        <div className="header-left">
          <button className="catalogue-back" onClick={() => window.location.href = '/designer/'} title="Back to projects">
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
        <CatalogueToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterProject={filterProject}
          onFilterProjectChange={setFilterProject}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          filterGroup={filterGroup}
          onFilterGroupChange={setFilterGroup}
          groups={allGroups}
          filterPlatform={filterPlatform}
          onFilterPlatformChange={setFilterPlatform}
          filterTheme={filterTheme}
          onFilterThemeChange={setFilterTheme}
          primaryGroup={primaryGroup}
          vsGroups={vsGroups}
          onPrimaryGroupChange={handlePrimaryGroupChange}
          onVsGroupsChange={handleVsGroupsChange}
          showGroupConfig={!!filterProject}
          onUploadClick={() => setShowUpload(true)}
          onQuickUploadClick={() => setShowQuickUpload(true)}
          screenshotCount={filteredScreenshots.length}
        />

        {loading ? (
          <div className="empty-state">
            <div className="loading-spinner" />
            <p>Loading catalogue...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <h2>No projects yet</h2>
            <p>Create a project first to start uploading screenshots.</p>
            <button className="btn-primary" onClick={() => window.location.href = '/designer/'}>Go to Projects</button>
          </div>
        ) : filteredScreenshots.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <h2>{searchQuery || filterProject || filterGroup ? 'No matching screenshots' : 'No screenshots yet'}</h2>
            <p>{searchQuery || filterProject || filterGroup
              ? 'Try adjusting your search or filters.'
              : 'Upload screenshots to get started.'}
            </p>
          </div>
        ) : (
          <div className="catalogue-content">
            {Object.entries(groupedScreenshots).map(([groupName, items]) => (
              <section key={groupName} className="catalogue-section">
                <h3 className="catalogue-section-title">
                  <button
                    className="catalogue-section-select"
                    title={items.every((s) => selected.has(s.id)) ? 'Deselect group' : 'Select group'}
                    onClick={() => {
                      const allSelected = items.every((s) => selected.has(s.id));
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const s of items) {
                          if (allSelected) next.delete(s.id);
                          else next.add(s.id);
                        }
                        return next;
                      });
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {items.every((s) => selected.has(s.id))
                        ? <><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" /><polyline points="9 11 12 14 20 6" stroke="#0f0f10" strokeWidth="3" /></>
                        : <rect x="3" y="3" width="18" height="18" rx="2" />}
                    </svg>
                  </button>
                  {groupName}
                  <span className="catalogue-section-count">{items.length}</span>
                  {primaryGroup === groupName && (
                    <span className="catalogue-badge catalogue-badge-primary">Primary</span>
                  )}
                  {vsGroups.includes(groupName) && (
                    <span className="catalogue-badge catalogue-badge-vs">Vs</span>
                  )}
                </h3>
                <div className="catalogue-grid">
                  {items.map((s) => (
                    <CatalogueCard
                      key={s.id}
                      screenshot={s}
                      projectName={projectMap[s.project_id] || 'Unknown'}
                      flowName={s.flow_id ? (flowMap[s.flow_id] || null) : null}
                      isPrimary={!!primaryGroup && s.group === primaryGroup}
                      isVs={vsGroups.includes(s.group || '')}
                      isSelected={selected.has(s.id)}
                      onToggleSelect={toggleSelect}
                      onRename={handleRename}
                      onChangeGroup={handleChangeGroup}
                      onDelete={handleDelete}
                      onReplaceImage={handleReplaceImage}
                      onAssignFlow={setAssignModal}
                      onPlatformChange={handlePlatformChange}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      {showUpload && (
        <div className="catalogue-upload-overlay" onClick={() => { setShowUpload(false); setUploadProjectId(null); setUploadGroup(''); setNewGroupName(''); setUploadTheme(null); setUploadRefFile(null); setUploadRefLabel(''); if (uploadRefPreview) { URL.revokeObjectURL(uploadRefPreview); setUploadRefPreview(null); } }}>
          <div className="catalogue-upload-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Upload Screenshots</h3>
            <p className="catalogue-upload-subtitle">Choose a project and group, then upload your screenshots.</p>

            <Dropdown
              className="catalogue-upload-project-dropdown"
              value={uploadProjectId}
              placeholder="Select a project..."
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => { setUploadProjectId(v); setUploadGroup(''); setNewGroupName(''); }}
            />

            {uploadProjectId && (
              <>
                <label className="catalogue-upload-label">Select or create a group</label>
                <div className="catalogue-upload-groups">
                  {uploadProjectGroups.map((g) => (
                    <button
                      key={g}
                      className={`catalogue-upload-group-chip ${uploadGroup === g ? 'active' : ''}`}
                      onClick={() => { setUploadGroup(g); setNewGroupName(''); }}
                    >
                      {g}
                      {uploadProjectPrimary === g && <span className="catalogue-upload-group-primary">Primary</span>}
                    </button>
                  ))}
                  <button
                    className={`catalogue-upload-group-chip catalogue-upload-group-new ${uploadGroup === '__new__' ? 'active' : ''}`}
                    onClick={() => setUploadGroup('__new__')}
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
                    onChange={(e) => setNewGroupName(e.target.value)}
                    autoFocus
                  />
                )}

                <label className="catalogue-upload-label">Theme</label>
                <div className="catalogue-upload-groups">
                  {(['light', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      className={`catalogue-upload-group-chip ${uploadTheme === t ? 'active' : ''}`}
                      onClick={() => setUploadTheme(uploadTheme === t ? null : t)}
                    >
                      {t === 'light' ? '☀ Light' : '☾ Dark'}
                    </button>
                  ))}
                </div>

                <label className="catalogue-upload-label">Reference (optional)</label>
                <div className="catalogue-upload-ref">
                  {uploadRefPreview ? (
                    <div className="catalogue-upload-ref-preview">
                      <img src={uploadRefPreview} alt="Reference" />
                      <button
                        className="catalogue-upload-ref-remove"
                        onClick={() => {
                          URL.revokeObjectURL(uploadRefPreview);
                          setUploadRefFile(null);
                          setUploadRefPreview(null);
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <label className="catalogue-upload-ref-picker">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span>Add reference image</span>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && file.type.startsWith('image/')) {
                            setUploadRefFile(file);
                            setUploadRefPreview(URL.createObjectURL(file));
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                  <input
                    className="catalogue-upload-ref-label"
                    type="text"
                    placeholder="Label (e.g., Binance, Dribbble)"
                    value={uploadRefLabel}
                    onChange={(e) => setUploadRefLabel(e.target.value)}
                  />
                </div>

                {(uploadGroup && uploadGroup !== '__new__') || (uploadGroup === '__new__' && newGroupName.trim()) ? (
                  <UploadZone
                    onFilesSelected={(files) => {
                      const finalGroup = uploadGroup === '__new__' ? newGroupName.trim() : uploadGroup;
                      handleFilesSelected(files, finalGroup, uploadTheme);
                    }}
                    disabled={uploading}
                  />
                ) : (
                  <p className="catalogue-upload-hint">
                    {!uploadGroup ? 'Select a group above to enable upload.' : 'Enter a group name to continue.'}
                  </p>
                )}
              </>
            )}

            {!uploadProjectId && (
              <p className="catalogue-upload-hint">Select a project above to enable upload.</p>
            )}
          </div>
        </div>
      )}

      {/* Quick Upload Modal */}
      {showQuickUpload && (
        <div className="catalogue-upload-overlay" onClick={() => { setShowQuickUpload(false); setQuickUploadProjectId(null); }}>
          <div className="catalogue-upload-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Quick Upload</h3>
            <p className="catalogue-upload-subtitle">Select a project and drop files. Groups auto-assigned from filenames.</p>

            <Dropdown
              className="catalogue-upload-project-dropdown"
              value={quickUploadProjectId}
              placeholder="Select a project..."
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              onChange={setQuickUploadProjectId}
            />

            {quickUploadProjectId ? (
              <UploadZone onFilesSelected={handleQuickUpload} disabled={uploading} />
            ) : (
              <p className="catalogue-upload-hint">Select a project above to enable upload.</p>
            )}
          </div>
        </div>
      )}

      {/* Uploading indicator */}
      {uploading && (
        <div className="canvas-uploading">
          <div className="loading-spinner" />
          Uploading screenshots...
        </div>
      )}

      {/* Flow Assign Modal */}
      {assignModal && assigningScreenshot && (
        <FlowAssignModal
          screenshotName={assigningScreenshot.name}
          currentFlowId={assigningScreenshot.flow_id}
          flows={getProjectFlows(assignModal)}
          primaryGroup={primaryGroup}
          screenshotGroup={assigningScreenshot.group}
          onAssign={(flowId) => handleAssignFlow(assignModal, flowId)}
          onClose={() => setAssignModal(null)}
        />
      )}

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="catalogue-bulk-bar">
          <div className="catalogue-bulk-left">
            <button className="catalogue-bulk-check" onClick={selectAllVisible}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {selected.size === filteredScreenshots.length
                  ? <><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" /><polyline points="9 11 12 14 20 6" stroke="#0f0f10" strokeWidth="3" /></>
                  : <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="12" x2="16" y2="12" /></>}
              </svg>
            </button>
            <span className="catalogue-bulk-count">{selected.size} selected</span>
          </div>

          <div className="catalogue-bulk-actions">
            <button className="catalogue-bulk-btn" onClick={() => setBulkAction('group')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
              Change Group
            </button>
            <button className="catalogue-bulk-btn" onClick={() => setBulkAction('platform')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              Set Platform
            </button>
            <button className="catalogue-bulk-btn" onClick={() => setBulkAction('assign')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
              </svg>
              Assign to Flow
            </button>
            <button className="catalogue-bulk-btn catalogue-bulk-btn-danger" onClick={() => setConfirmDelete({ type: 'bulk' })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              Delete
            </button>
            <button className="catalogue-bulk-btn-close" onClick={clearSelection}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Bulk Assign to Flow Modal */}
      {bulkAction === 'assign' && (
        <div className="flow-assign-overlay" onClick={() => setBulkAction(null)}>
          <div className="flow-assign-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Assign {selected.size} to Flow</h3>
            <div className="flow-assign-options">
              <label className="flow-assign-option">
                <input type="radio" name="bulk-flow" defaultChecked onChange={() => {}} />
                <span>Unassigned</span>
              </label>
              {bulkFlows.map((f) => (
                <label key={f.id} className="flow-assign-option">
                  <input type="radio" name="bulk-flow" onChange={() => handleBulkAssignFlow(f.id)} />
                  <span>{f.name}</span>
                </label>
              ))}
            </div>
            {bulkFlows.length === 0 && (
              <p className="flow-assign-empty">No flows available for selected screenshots.</p>
            )}
            <div className="flow-assign-actions">
              <button className="btn-secondary" onClick={() => setBulkAction(null)}>Cancel</button>
              <button className="btn-primary" onClick={() => handleBulkAssignFlow(null)}>Unassign All</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Set Platform Modal */}
      {bulkAction === 'platform' && (
        <div className="flow-assign-overlay" onClick={() => setBulkAction(null)}>
          <div className="flow-assign-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Set Platform for {selected.size}</h3>
            <div className="flow-assign-options">
              <label className="flow-assign-option">
                <input type="radio" name="bulk-platform" onChange={() => handleBulkPlatform('mobile')} />
                <span>Mobile</span>
              </label>
              <label className="flow-assign-option">
                <input type="radio" name="bulk-platform" onChange={() => handleBulkPlatform('web')} />
                <span>Web</span>
              </label>
              <label className="flow-assign-option">
                <input type="radio" name="bulk-platform" onChange={() => handleBulkPlatform(null)} />
                <span>No platform</span>
              </label>
            </div>
            <div className="flow-assign-actions">
              <button className="btn-secondary" onClick={() => setBulkAction(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Change Group Modal */}
      {bulkAction === 'group' && (
        <div className="flow-assign-overlay" onClick={() => setBulkAction(null)}>
          <div className="flow-assign-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Move {selected.size} to Group</h3>
            <div className="catalogue-upload-groups" style={{ marginTop: 12 }}>
              {allGroups.map((g) => (
                <button
                  key={g}
                  className={`catalogue-upload-group-chip ${bulkGroupValue === g ? 'active' : ''}`}
                  onClick={() => setBulkGroupValue(g)}
                >
                  {g}
                  {primaryGroup === g && <span className="catalogue-upload-group-primary">Primary</span>}
                </button>
              ))}
            </div>
            <input
              className="catalogue-filter"
              style={{ width: '100%', marginTop: 12 }}
              type="text"
              placeholder="Or type a new group name..."
              value={bulkGroupValue}
              onChange={(e) => setBulkGroupValue(e.target.value)}
            />
            <div className="flow-assign-actions">
              <button className="btn-secondary" onClick={() => { setBulkAction(null); setBulkGroupValue(''); }}>Cancel</button>
              <button
                className="btn-primary"
                disabled={!bulkGroupValue.trim()}
                onClick={() => handleBulkChangeGroup(bulkGroupValue)}
              >
                Move to "{bulkGroupValue.trim() || '...'}"
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${selected.size} Screenshot${selected.size > 1 ? 's' : ''}`}
          message={`This will permanently delete ${selected.size} screenshot${selected.size > 1 ? 's' : ''} and remove them from any flows. This cannot be undone.`}
          onConfirm={() => { setConfirmDelete(null); handleBulkDelete(); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
