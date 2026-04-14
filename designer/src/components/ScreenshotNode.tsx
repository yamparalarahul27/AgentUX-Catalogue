import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getGroupColor } from '../lib/naming';
import { ConfirmModal } from './ConfirmModal';

export interface ScreenshotNodeData {
  label: string;
  imageUrl: string;
  group: string | null;
  sequence: number | null;
  connectionType?: 'auto' | 'manual' | 'none';
  [key: string]: unknown;
}

export const ScreenshotNodeComponent = memo(({ data, id }: NodeProps) => {
  const nodeData = data as ScreenshotNodeData;
  const groupColor = getGroupColor(nodeData.group);
  const [editing, setEditing] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [name, setName] = useState(nodeData.label);
  const [group, setGroup] = useState(nodeData.group || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      window.dispatchEvent(new CustomEvent('attach-screenshot-image', { detail: { id, file } }));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [id]);

  useEffect(() => { setName(nodeData.label); }, [nodeData.label]);
  useEffect(() => { setGroup(nodeData.group || ''); }, [nodeData.group]);

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);

  useEffect(() => {
    if (editingGroup && groupInputRef.current) { groupInputRef.current.focus(); groupInputRef.current.select(); }
  }, [editingGroup]);

  function commitRename() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== nodeData.label) {
      window.dispatchEvent(new CustomEvent('rename-screenshot', { detail: { id, name: trimmed } }));
    } else {
      setName(nodeData.label);
    }
    setEditing(false);
  }

  function commitGroupRename() {
    const trimmed = group.trim();
    if (trimmed !== (nodeData.group || '')) {
      window.dispatchEvent(new CustomEvent('rename-screenshot-group', { detail: { id, group: trimmed || null } }));
    } else {
      setGroup(nodeData.group || '');
    }
    setEditingGroup(false);
  }

  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`screenshot-node ${expanded ? 'screenshot-node-expanded' : ''}`}>
      <Handle type="target" position={Position.Top} className="screenshot-handle" id="top-target" />
      <Handle type="source" position={Position.Top} className="screenshot-handle" id="top-source" />
      <Handle type="target" position={Position.Right} className="screenshot-handle" id="right-target" />
      <Handle type="source" position={Position.Right} className="screenshot-handle" id="right-source" />
      <Handle type="target" position={Position.Left} className="screenshot-handle" id="left-target" />
      <Handle type="source" position={Position.Left} className="screenshot-handle" id="left-source" />

      {nodeData.imageUrl && (
        <button
          className="screenshot-node-expand"
          title={expanded ? 'Collapse' : 'Expand'}
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {expanded ? (
              <>
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </>
            ) : (
              <>
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </>
            )}
          </svg>
        </button>
      )}

      <button
        className="screenshot-node-delete"
        title="Delete screenshot"
        onClick={(e) => {
          e.stopPropagation();
          setShowDeleteConfirm(true);
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="screenshot-node-image">
        {nodeData.imageUrl ? (
          <img
            src={nodeData.imageUrl}
            alt={nodeData.label}
            draggable={false}
          />
        ) : (
          <div
            className="screenshot-node-placeholder"
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            title="Click to add screenshot"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="screenshot-node-placeholder-text">Click to add image</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageAttach}
          style={{ display: 'none' }}
        />
      </div>

      <div className="screenshot-node-info">
        <div className="screenshot-node-header">
          {editing ? (
            <input
              ref={inputRef}
              className="screenshot-node-rename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setName(nodeData.label); setEditing(false); }
              }}
            />
          ) : (
            <span
              className="screenshot-node-label"
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
              title="Double-click to rename"
            >
              {nodeData.label}
            </span>
          )}
        </div>

        <div className="screenshot-node-group">
          <span className="screenshot-node-dot" style={{ background: groupColor }} />
          {editingGroup ? (
            <input
              ref={groupInputRef}
              className="screenshot-node-rename screenshot-node-rename-group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              onBlur={commitGroupRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitGroupRename();
                if (e.key === 'Escape') { setGroup(nodeData.group || ''); setEditingGroup(false); }
              }}
              placeholder="Add group..."
            />
          ) : (
            <span
              onDoubleClick={(e) => { e.stopPropagation(); setEditingGroup(true); }}
              title="Double-click to edit group"
            >
              {nodeData.group || 'No group'}
            </span>
          )}
        </div>
      </div>

      <Handle type="target" position={Position.Bottom} className="screenshot-handle" id="bottom-target" />
      <Handle type="source" position={Position.Bottom} className="screenshot-handle" id="bottom-source" />

      {showDeleteConfirm && createPortal(
        <ConfirmModal
          title="Delete Screenshot"
          message={`Delete "${nodeData.label}" from this flow?`}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            window.dispatchEvent(new CustomEvent('delete-screenshot', { detail: { id } }));
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />,
        document.body,
      )}
    </div>
  );
});

ScreenshotNodeComponent.displayName = 'ScreenshotNode';
