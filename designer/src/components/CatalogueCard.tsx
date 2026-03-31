import { useState, useRef, useEffect, useCallback } from 'react';
import type { ScreenshotNode } from '../types';
import { getGroupColor } from '../lib/naming';

interface CatalogueCardProps {
  screenshot: ScreenshotNode;
  projectName: string;
  flowName: string | null;
  onRename: (id: string, name: string) => void;
  onChangeGroup: (id: string, group: string | null) => void;
  onDelete: (id: string) => void;
  onReplaceImage: (id: string, file: File) => void;
  onAssignFlow: (id: string) => void;
}

export function CatalogueCard({
  screenshot,
  projectName,
  flowName,
  onRename,
  onChangeGroup,
  onDelete,
  onReplaceImage,
  onAssignFlow,
}: CatalogueCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [name, setName] = useState(screenshot.name);
  const [group, setGroup] = useState(screenshot.group || '');
  const nameRef = useRef<HTMLInputElement>(null);
  const groupRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setName(screenshot.name); }, [screenshot.name]);
  useEffect(() => { setGroup(screenshot.group || ''); }, [screenshot.group]);

  useEffect(() => {
    if (editingName && nameRef.current) { nameRef.current.focus(); nameRef.current.select(); }
  }, [editingName]);

  useEffect(() => {
    if (editingGroup && groupRef.current) { groupRef.current.focus(); groupRef.current.select(); }
  }, [editingGroup]);

  function commitName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== screenshot.name) {
      onRename(screenshot.id, trimmed);
    } else {
      setName(screenshot.name);
    }
    setEditingName(false);
  }

  function commitGroup() {
    const trimmed = group.trim();
    if (trimmed !== (screenshot.group || '')) {
      onChangeGroup(screenshot.id, trimmed || null);
    } else {
      setGroup(screenshot.group || '');
    }
    setEditingGroup(false);
  }

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onReplaceImage(screenshot.id, file);
    }
    if (fileRef.current) fileRef.current.value = '';
  }, [screenshot.id, onReplaceImage]);

  const groupColor = getGroupColor(screenshot.group);

  return (
    <div className="catalogue-card">
      <div className="catalogue-card-image">
        {screenshot.image_url ? (
          <img src={screenshot.image_url} alt={screenshot.name} draggable={false} />
        ) : (
          <div className="catalogue-card-placeholder">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}
        <div className="catalogue-card-actions">
          <button
            className="catalogue-card-action"
            title="Replace image"
            onClick={() => fileRef.current?.click()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
          <button
            className="catalogue-card-action catalogue-card-action-danger"
            title="Delete screenshot"
            onClick={() => {
              if (confirm('Delete this screenshot? This will also remove it from any flow.')) {
                onDelete(screenshot.id);
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      <div className="catalogue-card-info">
        <div className="catalogue-card-name">
          {editingName ? (
            <input
              ref={nameRef}
              className="catalogue-card-edit"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') { setName(screenshot.name); setEditingName(false); }
              }}
            />
          ) : (
            <span
              className="catalogue-card-label"
              onDoubleClick={() => setEditingName(true)}
              title="Double-click to rename"
            >
              {screenshot.name}
            </span>
          )}
        </div>

        <div className="catalogue-card-meta">
          <div className="catalogue-card-group">
            <span className="catalogue-card-dot" style={{ background: groupColor }} />
            {editingGroup ? (
              <input
                ref={groupRef}
                className="catalogue-card-edit catalogue-card-edit-sm"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                onBlur={commitGroup}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitGroup();
                  if (e.key === 'Escape') { setGroup(screenshot.group || ''); setEditingGroup(false); }
                }}
                placeholder="Add group..."
              />
            ) : (
              <span
                className="catalogue-card-group-text"
                onDoubleClick={() => setEditingGroup(true)}
                title="Double-click to edit group"
              >
                {screenshot.group || 'No group'}
              </span>
            )}
          </div>

          <button
            className="catalogue-card-flow-pill"
            onClick={() => onAssignFlow(screenshot.id)}
            title="Assign to flow"
          >
            {flowName || 'Unassigned'}
          </button>
        </div>

        <span className="catalogue-card-project">{projectName}</span>
      </div>
    </div>
  );
}
