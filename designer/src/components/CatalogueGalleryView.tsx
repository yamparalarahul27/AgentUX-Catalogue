import { useEffect, useMemo, useState } from 'react';

import type { ScreenshotNode } from '../types';
import { supabase } from '../lib/supabase';
import { Dropdown } from './Dropdown';

interface CatalogueGalleryViewProps {
  screenshots: ScreenshotNode[];
  flowMap: Record<string, string>;
  projectMap: Record<string, string>;
  userEmail: string;
  onCommentCountChange?: (screenshotId: string, delta: number) => void;
  onAssignFlow: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPlatformChange: (id: string, platform: 'mobile' | 'web' | null) => Promise<void>;
}

interface GalleryComment {
  id: string;
  user_email: string;
  text: string;
  created_at: string;
}

type GalleryPanel = 'comments' | 'annotations';

const GALLERY_ZOOM_MIN = 1;
const GALLERY_ZOOM_MAX = 3;
const GALLERY_ZOOM_STEP = 0.25;

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function CatalogueGalleryView({
  screenshots,
  flowMap,
  projectMap,
  userEmail,
  onCommentCountChange,
  onAssignFlow,
  onRename,
  onDelete,
  onPlatformChange,
}: CatalogueGalleryViewProps) {
  const [activeId, setActiveId] = useState<string | null>(screenshots[0]?.id ?? null);
  const [panel, setPanel] = useState<GalleryPanel>('comments');
  const [zoom, setZoom] = useState(GALLERY_ZOOM_MIN);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [comments, setComments] = useState<GalleryComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [savingComment, setSavingComment] = useState(false);

  useEffect(() => {
    if (screenshots.length === 0) {
      setActiveId(null);
      return;
    }

    if (!activeId || !screenshots.some((item) => item.id === activeId)) {
      setActiveId(screenshots[0].id);
    }
  }, [activeId, screenshots]);

  const activeIndex = useMemo(
    () => screenshots.findIndex((item) => item.id === activeId),
    [activeId, screenshots],
  );
  const active = activeIndex >= 0 ? screenshots[activeIndex] : null;
  const zoomPercent = Math.round(zoom * 100);
  const canZoomIn = zoom < GALLERY_ZOOM_MAX;
  const canZoomOut = zoom > GALLERY_ZOOM_MIN;

  useEffect(() => {
    if (!active) return;
    setNameDraft(active.name);
    setEditingName(false);
    setZoom(GALLERY_ZOOM_MIN);
  }, [active?.id, active?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active) {
      setComments([]);
      setNewComment('');
      setLoadingComments(false);
      return;
    }

    let cancelled = false;
    setLoadingComments(true);
    setCommentsError(null);
    setComments([]);
    setNewComment('');

    supabase
      .from('screenshot_comments')
      .select('id,user_email,text,created_at')
      .eq('screenshot_id', active.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingComments(false);
        if (error || !data) {
          setCommentsError('Unable to load comments right now.');
          setComments([]);
          return;
        }
        setComments(data as GalleryComment[]);
      });

    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!active || screenshots.length <= 1) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'ArrowLeft' && activeIndex > 0) {
        setActiveId(screenshots[activeIndex - 1].id);
      }
      if (event.key === 'ArrowRight' && activeIndex < screenshots.length - 1) {
        setActiveId(screenshots[activeIndex + 1].id);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, activeIndex, screenshots]);

  if (!active) return null;

  async function commitRename() {
    if (!active) return;
    const trimmed = nameDraft.trim();
    setEditingName(false);
    if (trimmed && trimmed !== active.name) {
      await onRename(active.id, trimmed);
    }
  }

  async function addComment() {
    if (!active || savingComment) return;
    const screenshotId = active.id;
    const trimmed = newComment.trim();
    if (!trimmed) return;

    setSavingComment(true);
    setCommentsError(null);

    const { data, error } = await supabase
      .from('screenshot_comments')
      .insert({ screenshot_id: active.id, user_email: userEmail, text: trimmed })
      .select('id,user_email,text,created_at')
      .single();

    setSavingComment(false);
    if (error || !data) {
      setCommentsError('Unable to add this comment.');
      return;
    }
    setComments((previous) => [...previous, data as GalleryComment]);
    setNewComment('');
    onCommentCountChange?.(screenshotId, 1);
  }

  async function deleteComment(comment: GalleryComment) {
    if (comment.user_email !== userEmail) return;
    const screenshotId = active?.id;

    const { error } = await supabase.from('screenshot_comments').delete().eq('id', comment.id);
    if (error) {
      setCommentsError('Unable to delete this comment.');
      return;
    }
    setComments((previous) => previous.filter((item) => item.id !== comment.id));
    if (screenshotId) {
      onCommentCountChange?.(screenshotId, -1);
    }
  }

  async function requestDeleteCurrent() {
    if (!active) return;
    const shouldDelete = window.confirm(`Delete "${active.name}"? This action cannot be undone.`);
    if (!shouldDelete) return;
    await onDelete(active.id);
  }

  function formatCommentTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function handleZoomIn() {
    setZoom((current) => Math.min(GALLERY_ZOOM_MAX, Number((current + GALLERY_ZOOM_STEP).toFixed(2))));
  }

  function handleZoomOut() {
    setZoom((current) => Math.max(GALLERY_ZOOM_MIN, Number((current - GALLERY_ZOOM_STEP).toFixed(2))));
  }

  function handleZoomReset() {
    setZoom(GALLERY_ZOOM_MIN);
  }

  return (
    <div className="catalogue-gallery">
      <div className="catalogue-gallery-main">
        <div className="catalogue-gallery-preview">
          {active.image_url && (
            <div className="catalogue-gallery-preview-toolbar">
              <button
                type="button"
                className="catalogue-gallery-preview-action"
                onClick={handleZoomOut}
                disabled={!canZoomOut}
                aria-label="Zoom out"
                title="Zoom out"
              >
                -
              </button>
              <span className="catalogue-gallery-preview-zoom">{zoomPercent}%</span>
              <button
                type="button"
                className="catalogue-gallery-preview-action"
                onClick={handleZoomIn}
                disabled={!canZoomIn}
                aria-label="Zoom in"
                title="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                className="catalogue-gallery-preview-reset"
                onClick={handleZoomReset}
                disabled={!canZoomOut}
              >
                Reset
              </button>
            </div>
          )}

          {active.image_url ? (
            <div className="catalogue-gallery-preview-stage">
              <img
                src={active.image_url}
                alt={active.name}
                style={{
                  width: zoom > GALLERY_ZOOM_MIN ? `${zoom * 100}%` : undefined,
                  maxWidth: zoom > GALLERY_ZOOM_MIN ? 'none' : undefined,
                  maxHeight: zoom > GALLERY_ZOOM_MIN ? 'none' : undefined,
                }}
              />
            </div>
          ) : (
            <div className="catalogue-gallery-preview-empty">No image available</div>
          )}
        </div>

        <div className="catalogue-gallery-strip">
          {screenshots.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`catalogue-gallery-thumb ${item.id === active.id ? 'is-active' : ''}`}
              onClick={() => setActiveId(item.id)}
            >
              {item.image_url ? <img src={item.image_url} alt={item.name} /> : <span>No image</span>}
            </button>
          ))}
        </div>
      </div>

      <aside className="catalogue-gallery-meta">
        <div className="catalogue-gallery-meta-head">
          <div className="catalogue-gallery-tabs" role="tablist" aria-label="Gallery details">
            <button
              type="button"
              role="tab"
              aria-selected={panel === 'comments'}
              className={`catalogue-gallery-tab ${panel === 'comments' ? 'is-active' : ''}`}
              onClick={() => setPanel('comments')}
            >
              Comments
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panel === 'annotations'}
              className={`catalogue-gallery-tab ${panel === 'annotations' ? 'is-active' : ''}`}
              onClick={() => setPanel('annotations')}
            >
              Annotations
            </button>
          </div>
        </div>

        <div className="catalogue-gallery-meta-head">
          {editingName ? (
            <input
              className="catalogue-gallery-name-input"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void commitRename();
                if (event.key === 'Escape') setEditingName(false);
              }}
              autoFocus
            />
          ) : (
            <button type="button" className="catalogue-gallery-name" onClick={() => setEditingName(true)}>
              {active.name}
            </button>
          )}
          <button type="button" className="catalogue-gallery-delete" onClick={() => void requestDeleteCurrent()}>
            Delete
          </button>
        </div>

        {panel === 'comments' ? (
          <>
            <div className="catalogue-gallery-meta-grid">
              <div className="catalogue-gallery-meta-row">
                <span>Group</span>
                <strong>{active.group || 'No group'}</strong>
              </div>
              <div className="catalogue-gallery-meta-row">
                <span>Flow</span>
                <button type="button" className="catalogue-gallery-flow" onClick={() => onAssignFlow(active.id)}>
                  {active.flow_id ? flowMap[active.flow_id] || 'Assigned' : 'Unassigned'}
                </button>
              </div>
              <div className="catalogue-gallery-meta-row">
                <span>Project</span>
                <strong>{projectMap[active.project_id] || 'Unknown'}</strong>
              </div>
              <div className="catalogue-gallery-meta-row">
                <span>Platform</span>
                <div className="catalogue-gallery-platform">
                  <Dropdown
                    value={active.platform || null}
                    placeholder="No platform"
                    options={[
                      { value: 'mobile', label: 'Mobile' },
                      { value: 'web', label: 'Web' },
                    ]}
                    onChange={(value) => void onPlatformChange(active.id, (value || null) as 'mobile' | 'web' | null)}
                  />
                </div>
              </div>
              <div className="catalogue-gallery-meta-row">
                <span>Theme</span>
                <strong>{active.theme || '—'}</strong>
              </div>
              <div className="catalogue-gallery-meta-row">
                <span>Created</span>
                <strong>{formatDateTime(active.created_at)}</strong>
              </div>
            </div>

            <div className="catalogue-gallery-comments">
              <div className="catalogue-gallery-comments-header">
                <span>Comments ({comments.length})</span>
              </div>
              <div className="catalogue-gallery-comments-list">
                {loadingComments ? (
                  <div className="catalogue-gallery-comments-empty catalogue-gallery-comments-state">
                    <div className="loading-spinner" />
                    <span>Loading comments...</span>
                  </div>
                ) : commentsError ? (
                  <p className="catalogue-gallery-comments-empty catalogue-gallery-comments-state">{commentsError}</p>
                ) : comments.length === 0 ? (
                  <p className="catalogue-gallery-comments-empty">No comments yet</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="catalogue-gallery-comment">
                      <div className="catalogue-gallery-comment-top">
                        <span className="catalogue-gallery-comment-email">{comment.user_email}</span>
                        <span className="catalogue-gallery-comment-time">{formatCommentTime(comment.created_at)}</span>
                        {comment.user_email === userEmail && (
                          <button
                            type="button"
                            className="catalogue-gallery-comment-delete"
                            title="Delete comment"
                            onClick={() => void deleteComment(comment)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <p className="catalogue-gallery-comment-text">{comment.text}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="catalogue-gallery-comment-input">
                <input
                  type="text"
                  value={newComment}
                  onChange={(event) => setNewComment(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void addComment();
                  }}
                  placeholder="Add a comment..."
                  disabled={savingComment}
                />
                <button type="button" onClick={() => void addComment()} disabled={!newComment.trim() || savingComment}>
                  {savingComment ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>

            <div className="catalogue-gallery-reference">
              <h4>Reference Image</h4>
              {active.reference_url ? (
                <>
                  <img src={active.reference_url} alt={active.reference_label || 'Reference'} />
                  <p>{active.reference_label || 'Reference'}</p>
                </>
              ) : (
                <p className="catalogue-gallery-reference-empty">No reference image</p>
              )}
            </div>
          </>
        ) : (
          <div className="catalogue-gallery-annotations">
            <p className="catalogue-gallery-annotations-empty">
              Annotations will appear here. This tab is ready for the next annotation workflow.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
