import { useState } from 'react';
import { Check } from 'lucide-react';

import type { ScreenshotNode } from '../types';
import { Dropdown } from './Dropdown';

interface CatalogueListViewProps {
  screenshots: ScreenshotNode[];
  selected: Set<string>;
  flowMap: Record<string, string>;
  projectMap: Record<string, string>;
  onToggleSelect: (id: string) => void;
  onAssignFlow: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPlatformChange: (id: string, platform: 'mobile' | 'web' | null) => Promise<void>;
}

function formatCreatedAt(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export function CatalogueListView({
  screenshots,
  selected,
  flowMap,
  projectMap,
  onToggleSelect,
  onAssignFlow,
  onRename,
  onDelete,
  onPlatformChange,
}: CatalogueListViewProps) {
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  function startRename(item: ScreenshotNode) {
    setEditingNameId(item.id);
    setEditingNameValue(item.name);
  }

  async function commitRename(item: ScreenshotNode) {
    const trimmed = editingNameValue.trim();
    setEditingNameId(null);
    if (trimmed && trimmed !== item.name) {
      await onRename(item.id, trimmed);
    }
  }

  async function requestDelete(item: ScreenshotNode) {
    const shouldDelete = window.confirm(`Delete "${item.name}"? This action cannot be undone.`);
    if (!shouldDelete) return;
    await onDelete(item.id);
  }

  return (
    <div className="catalogue-list-view">
      <div className="catalogue-list-header">
        <span />
        <span>Preview</span>
        <span>Name</span>
        <span>Group</span>
        <span>Flow</span>
        <span>Platform</span>
        <span>Project</span>
        <span>Created</span>
        <span>Actions</span>
      </div>

      <div className="catalogue-list-body">
        {screenshots.map((item) => (
          <div key={item.id} className={`catalogue-list-row ${selected.has(item.id) ? 'is-selected' : ''}`}>
            <button
              type="button"
              className={`catalogue-list-check ${selected.has(item.id) ? 'is-selected' : ''}`}
              onClick={() => onToggleSelect(item.id)}
              title="Select screenshot"
            >
              {selected.has(item.id) && (
                <Check size={12} strokeWidth={3} />
              )}
            </button>

            <div className="catalogue-list-thumb">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} />
              ) : (
                <span className="catalogue-list-thumb-placeholder">No image</span>
              )}
            </div>

            <div className="catalogue-list-name">
              {editingNameId === item.id ? (
                <input
                  className="catalogue-list-name-input"
                  value={editingNameValue}
                  onChange={(event) => setEditingNameValue(event.target.value)}
                  onBlur={() => void commitRename(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void commitRename(item);
                    if (event.key === 'Escape') setEditingNameId(null);
                  }}
                  autoFocus
                />
              ) : (
                <button type="button" className="catalogue-list-name-btn" onClick={() => startRename(item)}>
                  {item.name}
                </button>
              )}
            </div>

            <span className="catalogue-list-group">{item.group || 'No group'}</span>
            <button type="button" className="catalogue-list-flow" onClick={() => onAssignFlow(item.id)}>
              {item.flow_id ? flowMap[item.flow_id] || 'Assigned' : 'Unassigned'}
            </button>

            <div className="catalogue-list-platform">
              <Dropdown
                value={item.platform || null}
                placeholder="No platform"
                options={[
                  { value: 'mobile', label: 'Mobile' },
                  { value: 'web', label: 'Web' },
                ]}
                onChange={(value) => void onPlatformChange(item.id, (value || null) as 'mobile' | 'web' | null)}
              />
            </div>

            <span className="catalogue-list-project">{projectMap[item.project_id] || 'Unknown'}</span>
            <span className="catalogue-list-created">{formatCreatedAt(item.created_at)}</span>

            <div className="catalogue-list-actions">
              <button type="button" className="catalogue-list-action" onClick={() => startRename(item)}>
                Rename
              </button>
              <button type="button" className="catalogue-list-action is-danger" onClick={() => void requestDelete(item)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
