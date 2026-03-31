import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import type { Project, Flow, ScreenshotNode } from '../types';
import { supabase } from '../lib/supabase';
import { parseScreenshotName } from '../lib/naming';
import { CatalogueCard } from './CatalogueCard';
import { CatalogueToolbar } from './CatalogueToolbar';
import { FlowAssignModal } from './FlowAssignModal';
import { UploadZone } from './UploadZone';
import { Toast } from './Toast';

interface CatalogueProps {
  user: User;
}

export function Catalogue({ user }: CatalogueProps) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadProjectId, setUploadProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
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

  // Derived data
  const allGroups = useMemo(() => {
    return [...new Set(screenshots.map((s) => s.group).filter(Boolean))] as string[];
  }, [screenshots]);

  const filteredScreenshots = useMemo(() => {
    return screenshots.filter((s) => {
      const matchesSearch = !searchQuery ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.group || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.file_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesProject = !filterProject || s.project_id === filterProject;
      const matchesGroup = !filterGroup || s.group === filterGroup;
      return matchesSearch && matchesProject && matchesGroup;
    });
  }, [screenshots, searchQuery, filterProject, filterGroup]);

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
  async function handleFilesSelected(files: File[]) {
    if (!uploadProjectId) return;
    setUploading(true);
    setShowUpload(false);

    const newScreenshots: ScreenshotNode[] = [];

    for (const file of files) {
      const parsed = parseScreenshotName(file.name);
      const safeName = file.name.replace(/\s+/g, '-');
      const storagePath = `${user.id}/${uploadProjectId}/${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(storagePath, file, { upsert: true });

      if (uploadError) {
        setToast({ message: `Upload failed: ${uploadError.message}`, type: 'error' });
        continue;
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
          group: parsed.group,
        })
        .select()
        .single();

      if (data && !error) {
        newScreenshots.push({ ...data, image_url: imageUrl });
      }
    }

    if (newScreenshots.length > 0) {
      setScreenshots((prev) => [...newScreenshots, ...prev]);
      setToast({ message: `${newScreenshots.length} screenshot${newScreenshots.length > 1 ? 's' : ''} uploaded`, type: 'success' });
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
          <button className="catalogue-back" onClick={() => navigate('/')} title="Back to projects">
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
            <button className="btn-primary" onClick={() => navigate('/')}>Go to Projects</button>
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
                <h3 className="catalogue-section-title">{groupName}</h3>
                <div className="catalogue-grid">
                  {items.map((s) => (
                    <CatalogueCard
                      key={s.id}
                      screenshot={s}
                      projectName={projectMap[s.project_id] || 'Unknown'}
                      flowName={s.flow_id ? (flowMap[s.flow_id] || null) : null}
                      onRename={handleRename}
                      onChangeGroup={handleChangeGroup}
                      onDelete={handleDelete}
                      onReplaceImage={handleReplaceImage}
                      onAssignFlow={setAssignModal}
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
        <div className="catalogue-upload-overlay" onClick={() => { setShowUpload(false); setUploadProjectId(null); }}>
          <div className="catalogue-upload-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Upload Screenshots</h3>
            <p className="catalogue-upload-subtitle">Choose a project, then upload your screenshots.</p>

            <select
              className="catalogue-filter catalogue-upload-project-select"
              value={uploadProjectId || ''}
              onChange={(e) => setUploadProjectId(e.target.value || null)}
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {uploadProjectId && (
              <UploadZone onFilesSelected={handleFilesSelected} disabled={uploading} />
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
