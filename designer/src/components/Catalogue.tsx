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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<string | null>(null);
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
      const withUrls = screenshotRes.data.map((s: ScreenshotNode) => ({
        ...s,
        image_url: s.storage_path
          ? supabase.storage.from('screenshots').getPublicUrl(s.storage_path).data.publicUrl
          : '',
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
      return matchesSearch && matchesProject && matchesGroup && matchesPlatform;
    });
  }, [screenshots, searchQuery, filterProject, filterGroup, filterPlatform]);

  const groupedScreenshots = useMemo(() => {
    const groups: Record<string, ScreenshotNode[]> = {};
    for (const s of filteredScreenshots) {
      const key = s.group || 'Ungrouped';
      (groups[key] ||= []).push(s);
    }
    return groups;
  }, [filteredScreenshots]);

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

    const safeName = file.name.replace(/\s+/g, '-');
    const storagePath = `${user.id}/${screenshot.project_id}/${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('screenshots')
      .upload(storagePath, file, { upsert: true });

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
      s.id === id ? { ...s, storage_path: storagePath, file_name: file.name, image_url: imageUrl } : s
    ));
    setToast({ message: 'Image replaced', type: 'success' });
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

  async function handleFilesSelected(files: File[], groupOverride?: string) {
    const groupToAssign = groupOverride || uploadGroup;
    if (!uploadProjectId || !groupToAssign) return;
    setUploading(true);
    setShowUpload(false);
    setUploadGroup('');
    setNewGroupName('');

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

  // Get flows for a specific screenshot's project
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
          primaryGroup={primaryGroup}
          vsGroups={vsGroups}
          onPrimaryGroupChange={handlePrimaryGroupChange}
          onVsGroupsChange={handleVsGroupsChange}
          showGroupConfig={!!filterProject}
          onUploadClick={() => setShowUpload(true)}
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
                  {groupName}
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
        <div className="catalogue-upload-overlay" onClick={() => { setShowUpload(false); setUploadProjectId(null); setUploadGroup(''); setNewGroupName(''); }}>
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

                {(uploadGroup && uploadGroup !== '__new__') || (uploadGroup === '__new__' && newGroupName.trim()) ? (
                  <UploadZone
                    onFilesSelected={(files) => {
                      const finalGroup = uploadGroup === '__new__' ? newGroupName.trim() : uploadGroup;
                      handleFilesSelected(files, finalGroup);
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
