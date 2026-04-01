import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ScreenshotNode, ScreenshotVersion, ScreenshotComment } from '../types';
import { supabase } from '../lib/supabase';
import { getGroupColor } from '../lib/naming';
import { Dropdown } from './Dropdown';
import { ConfirmModal } from './ConfirmModal';

interface CatalogueCardProps {
  screenshot: ScreenshotNode;
  projectName: string;
  flowName: string | null;
  isPrimary: boolean;
  isVs: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onChangeGroup: (id: string, group: string | null) => void;
  onDelete: (id: string) => void;
  onReplaceImage: (id: string, file: File) => void;
  onAssignFlow: (id: string) => void;
  onPlatformChange: (id: string, platform: 'mobile' | 'web' | null) => void;
  userEmail: string;
  onCommentCountChange?: (screenshotId: string, delta: number) => void;
}

export function CatalogueCard({
  screenshot,
  projectName,
  flowName,
  isPrimary,
  isVs,
  isSelected,
  onToggleSelect,
  onRename,
  onChangeGroup,
  onDelete,
  onReplaceImage,
  onAssignFlow,
  onPlatformChange,
  userEmail,
  onCommentCountChange,
}: CatalogueCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [showRef, setShowRef] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [comments, setComments] = useState<ScreenshotComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [versions, setVersions] = useState<ScreenshotVersion[]>([]);
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

  useEffect(() => {
    if (!showVersions) return;
    (async () => {
      const { data } = await supabase
        .from('screenshot_versions')
        .select('*')
        .eq('screenshot_id', screenshot.id)
        .order('version_number', { ascending: false });
      if (data) {
        setVersions(data.map((v: ScreenshotVersion) => ({
          ...v,
          image_url: v.storage_path
            ? supabase.storage.from('screenshots').getPublicUrl(v.storage_path).data.publicUrl
            : undefined,
        })));
      }
    })();
  }, [showVersions, screenshot.id]);

  useEffect(() => {
    if (!showLightbox) return;
    setLoadingComments(true);
    supabase
      .from('screenshot_comments')
      .select('*')
      .eq('screenshot_id', screenshot.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setComments(data);
        setLoadingComments(false);
      });
  }, [showLightbox, screenshot.id]);

  async function addComment() {
    const trimmed = newComment.trim();
    if (!trimmed) return;
    const { data } = await supabase
      .from('screenshot_comments')
      .insert({ screenshot_id: screenshot.id, user_email: userEmail, text: trimmed })
      .select()
      .single();
    if (data) {
      setComments((prev) => [...prev, data]);
      setNewComment('');
      onCommentCountChange?.(screenshot.id, 1);
    }
  }

  async function deleteComment(commentId: string) {
    await supabase.from('screenshot_comments').delete().eq('id', commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    onCommentCountChange?.(screenshot.id, -1);
  }

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
    <div className={`catalogue-card ${isSelected ? 'catalogue-card--selected' : ''}`}>
      <div className="catalogue-card-image" onClick={() => setShowLightbox(true)} style={{ cursor: 'pointer' }}>
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
        <button
          className={`catalogue-card-select ${isSelected ? 'catalogue-card-select--checked' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(screenshot.id); }}
          title="Select"
        >
          {isSelected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
        {(isPrimary || isVs) && (
          <span className={`catalogue-card-badge ${isPrimary ? 'catalogue-card-badge-primary' : 'catalogue-card-badge-vs'}`}>
            {isPrimary ? 'Primary' : 'Vs'}
          </span>
        )}
        <div className="catalogue-card-indicators">
          {screenshot.reference_url && (
            <button
              className="catalogue-card-ref-btn"
              title={screenshot.reference_label ? `Ref: ${screenshot.reference_label}` : 'View reference'}
              onClick={(e) => { e.stopPropagation(); setShowRef(!showRef); }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Ref
            </button>
          )}
          {(screenshot.version_count ?? 0) > 0 && (
            <button
              className="catalogue-card-version-btn"
              title="View version history"
              onClick={(e) => { e.stopPropagation(); setShowVersions(!showVersions); }}
            >
              v{(screenshot.version_count ?? 0) + 1}
            </button>
          )}
          {(screenshot.comment_count ?? 0) > 0 && (
            <span className="catalogue-card-comment-btn">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              {screenshot.comment_count}
            </span>
          )}
        </div>
        <div className="catalogue-card-actions">
          <button
            className="catalogue-card-action"
            title="Replace image"
            onClick={() => fileRef.current?.click()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </button>
          <button
            className="catalogue-card-action catalogue-card-action-danger"
            title="Delete screenshot"
            onClick={() => setShowDeleteConfirm(true)}
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

        <div className="catalogue-card-platform-row">
          <Dropdown
            className="catalogue-card-platform-dropdown"
            value={screenshot.platform || null}
            placeholder="No platform"
            options={[
              { value: 'mobile', label: 'Mobile' },
              { value: 'web', label: 'Web' },
            ]}
            onChange={(v) => onPlatformChange(screenshot.id, (v || null) as 'mobile' | 'web' | null)}
          />
          <span className="catalogue-card-project">{projectName}</span>
        </div>
      </div>

      {/* Reference Popover */}
      {showRef && screenshot.reference_url && (
        <div className="catalogue-card-ref-popover">
          <div className="catalogue-card-ref-popover-header">
            <span>{screenshot.reference_label || 'Reference'}</span>
            <button onClick={() => setShowRef(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <img src={screenshot.reference_url} alt={screenshot.reference_label || 'Reference'} />
        </div>
      )}

      {/* Version History */}
      {showVersions && (
        <div className="catalogue-card-versions">
          <div className="catalogue-card-versions-header">
            <span>Version History</span>
            <button onClick={() => setShowVersions(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="catalogue-card-versions-current">
            <img src={screenshot.image_url} alt="Current" />
            <span>Current</span>
          </div>
          {versions.map((v) => (
            <div key={v.id} className="catalogue-card-versions-item">
              <img src={v.image_url} alt={`v${v.version_number}`} />
              <span>v{v.version_number} · {new Date(v.created_at || '').toLocaleDateString()}</span>
            </div>
          ))}
          {versions.length === 0 && <p className="catalogue-card-versions-empty">Loading...</p>}
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && createPortal(
        <ConfirmModal
          title="Delete Screenshot"
          message={`Delete "${screenshot.name}"? This will also remove it from any flow.`}
          onConfirm={() => { setShowDeleteConfirm(false); onDelete(screenshot.id); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />,
        document.body,
      )}

      {/* Lightbox */}
      {showLightbox && screenshot.image_url && createPortal(
        <div className="catalogue-lightbox" onClick={() => setShowLightbox(false)}>
          <div className="catalogue-lightbox-header">
            <span className="catalogue-lightbox-name">{screenshot.name}</span>
            {screenshot.group && <span className="catalogue-lightbox-group" style={{ borderColor: groupColor, color: groupColor }}>{screenshot.group}</span>}
            {screenshot.platform && <span className="catalogue-lightbox-tag">{screenshot.platform}</span>}
            {screenshot.theme && <span className="catalogue-lightbox-tag">{screenshot.theme}</span>}
            <button className="catalogue-lightbox-close" onClick={() => setShowLightbox(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="catalogue-lightbox-body" onClick={(e) => e.stopPropagation()}>
            <img
              src={screenshot.image_url}
              alt={screenshot.name}
              className="catalogue-lightbox-img"
            />
            <div className="catalogue-lightbox-comments">
              <div className="catalogue-lightbox-comments-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Comments ({comments.length})
              </div>
              <div className="catalogue-lightbox-comments-list">
                {loadingComments ? (
                  <div className="catalogue-lightbox-comments-empty"><div className="loading-spinner" /></div>
                ) : comments.length === 0 ? (
                  <p className="catalogue-lightbox-comments-empty">No comments yet</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="catalogue-lightbox-comment">
                      <div className="catalogue-lightbox-comment-top">
                        <span className="catalogue-lightbox-comment-email">{c.user_email}</span>
                        <span className="catalogue-lightbox-comment-time">
                          {new Date(c.created_at).toLocaleDateString()} {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {c.user_email === userEmail && (
                          <button className="catalogue-lightbox-comment-delete" onClick={() => deleteComment(c.id)} title="Delete comment">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <p className="catalogue-lightbox-comment-text">{c.text}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="catalogue-lightbox-comment-input">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addComment()}
                  placeholder="Add a comment..."
                />
                <button onClick={addComment} disabled={!newComment.trim()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
