import { useEffect, useMemo, useState } from 'react';
import type { ScreenshotNode } from '../types';
import { supabase } from '../lib/supabase';
import { getGroupColor } from '../lib/naming';
import { Dropdown } from './Dropdown';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';

interface CataloguePickerProps {
  projectId: string;
  flowId: string;
  userId: string;
  onAdd: (screenshots: ScreenshotNode[]) => void;
  onClose: () => void;
}

export function CataloguePicker({ projectId, flowId, userId: _userId, onAdd, onClose }: CataloguePickerProps) {
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [primaryGroup, setPrimaryGroup] = useState<string | null>(null);

  useEffect(() => {
    loadScreenshots();
  }, []);

  async function loadScreenshots() {
    const { data: projectData } = await supabase
      .from('projects')
      .select('id, primary_group')
      .order('updated_at', { ascending: false });

    const pg = projectData?.find((p: { id: string }) => p.id === projectId)?.primary_group || null;
    setPrimaryGroup(pg);

    const projectIds = projectData?.map((p: { id: string }) => p.id) || [projectId];

    const { data } = await supabase
      .from('screenshots')
      .select('*')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false });

    if (data) {
      const withUrls = data.map((s: ScreenshotNode) => ({
        ...s,
        image_url: s.storage_path
          ? supabase.storage.from('screenshots').getPublicUrl(s.storage_path).data.publicUrl
          : undefined,
      }));
      setScreenshots(withUrls);
    }
    setLoading(false);
  }

  const allGroups = useMemo(() => {
    return [...new Set(screenshots.map((s) => s.group).filter(Boolean))] as string[];
  }, [screenshots]);

  const filtered = useMemo(() => {
    return screenshots.filter((s) => {
      const matchesSearch = !search.trim() ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.group && s.group.toLowerCase().includes(search.toLowerCase()));
      const matchesGroup = !filterGroup || s.group === filterGroup;
      const matchesPlatform = !filterPlatform || s.platform === filterPlatform;
      return matchesSearch && matchesGroup && matchesPlatform;
    });
  }, [screenshots, search, filterGroup, filterPlatform]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setAdding(true);

    const ids = Array.from(selected);
    await supabase
      .from('screenshots')
      .update({ flow_id: flowId })
      .in('id', ids);

    const added = screenshots
      .filter((s) => selected.has(s.id))
      .map((s) => ({ ...s, flow_id: flowId }));

    onAdd(added);
  }

  return (
    <div className="canvas-upload-overlay" onClick={onClose}>
      <div
        className="catalogue-picker-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="catalogue-picker-header">
          <h3>Add from Catalogue</h3>
          <button className="catalogue-picker-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="catalogue-picker-filters">
          <div className="catalogue-picker-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search screenshots..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Dropdown
            className="catalogue-picker-filter-dropdown"
            value={filterGroup}
            placeholder="All Groups"
            options={allGroups.map((g) => ({
              value: g,
              label: g,
              badge: g === primaryGroup ? 'Primary' : undefined,
            }))}
            onChange={setFilterGroup}
          />

          <Dropdown
            className="catalogue-picker-filter-dropdown"
            value={filterPlatform}
            placeholder="All Platforms"
            options={[
              { value: 'mobile', label: 'Mobile' },
              { value: 'web', label: 'Web' },
            ]}
            onChange={setFilterPlatform}
          />
        </div>

        {loading ? (
          <div className="catalogue-picker-loading">
            <div className="loading-spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="catalogue-picker-empty">
            {screenshots.length === 0
              ? 'No screenshots available. Upload some in the Catalogue first.'
              : 'No screenshots match your filters.'}
          </div>
        ) : (
          <div className="catalogue-picker-body">
            <div className="catalogue-picker-toolbar">
              <button className="catalogue-picker-select-all" onClick={selectAll}>
                {selected.size === filtered.length ? 'Deselect all' : 'Select all'}
              </button>
              <span className="catalogue-picker-count">
                {selected.size} selected
              </span>
            </div>

            <div className="catalogue-picker-grid">
              {filtered.map((s) => (
                <div
                  key={s.id}
                  className={`catalogue-picker-card ${selected.has(s.id) ? 'selected' : ''}`}
                  onClick={() => toggleSelect(s.id)}
                >
                  <div className="catalogue-picker-card-image">
                    {s.image_url ? (
                      <img src={s.image_url} alt={s.name} draggable={false} />
                    ) : (
                      <div className="catalogue-picker-card-placeholder">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                    )}
                    <div className={`catalogue-picker-check ${selected.has(s.id) ? 'checked' : ''}`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  </div>
                  <div className="catalogue-picker-card-info">
                    <span className="catalogue-picker-card-name">{s.name}</span>
                    {s.group && (
                      <span className="catalogue-picker-card-group">
                        <span className="catalogue-picker-dot" style={{ background: getGroupColor(s.group) }} />
                        <CatalogueGroupLabel group={s.group} projectId={s.project_id} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="catalogue-picker-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={selected.size === 0 || adding}
            onClick={handleAdd}
          >
            {adding ? 'Adding...' : `Add ${selected.size} to Flow`}
          </button>
        </div>
      </div>
    </div>
  );
}
