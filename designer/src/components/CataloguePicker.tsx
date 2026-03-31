import { useEffect, useMemo, useState } from 'react';
import type { ScreenshotNode } from '../types';
import { supabase } from '../lib/supabase';
import { getGroupColor } from '../lib/naming';

interface CataloguePickerProps {
  projectId: string;
  flowId: string;
  onAdd: (screenshots: ScreenshotNode[]) => void;
  onClose: () => void;
}

export function CataloguePicker({ projectId, flowId, onAdd, onClose }: CataloguePickerProps) {
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [primaryGroup, setPrimaryGroup] = useState<string | null>(null);

  useEffect(() => {
    loadScreenshots();
  }, []);

  async function loadScreenshots() {
    // Load project's primary group
    const { data: projectData } = await supabase
      .from('projects')
      .select('primary_group')
      .eq('id', projectId)
      .single();

    const pg = projectData?.primary_group || null;
    setPrimaryGroup(pg);

    // Load screenshots not in current flow
    let query = supabase
      .from('screenshots')
      .select('*')
      .eq('project_id', projectId)
      .or(`flow_id.is.null,flow_id.neq.${flowId}`);

    // Filter to primary group only if set
    if (pg) {
      query = query.eq('group', pg);
    }

    const { data } = await query.order('created_at', { ascending: false });

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

  const filtered = useMemo(() => {
    if (!search.trim()) return screenshots;
    const q = search.toLowerCase();
    return screenshots.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.group && s.group.toLowerCase().includes(q)),
    );
  }, [screenshots, search]);

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

        {loading ? (
          <div className="catalogue-picker-loading">
            <div className="loading-spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="catalogue-picker-empty">
            {screenshots.length === 0
              ? primaryGroup
                ? `No screenshots in primary group "${primaryGroup}". Upload some in the Catalogue first.`
                : 'No screenshots available. Upload some in the Catalogue first.'
              : 'No screenshots match your search.'}
          </div>
        ) : (
          <>
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
                        {s.group}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
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
