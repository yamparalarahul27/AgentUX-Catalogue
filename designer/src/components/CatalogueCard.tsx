import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ScreenshotNode, ScreenshotVersion, ScreenshotComment } from '../types';
import { ANNOTATION_METADATA_KEY, getLightboxAnnotationEntries } from '../lib/catalogue-activity';
import { supabase } from '../lib/supabase';
import { getGroupColor } from '../lib/naming';
import { Dropdown } from './Dropdown';
import { ConfirmModal } from './ConfirmModal';

interface LightboxAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  user_email: string;
  created_at: string;
}

interface ImageSize {
  width: number;
  height: number;
}

interface ImageLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getAnnotationId() {
  return globalThis.crypto?.randomUUID?.() ?? `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function parseAnnotations(metadata: Record<string, unknown> | undefined): LightboxAnnotation[] {
  const entries = getLightboxAnnotationEntries(metadata);
  return entries
    .map((entry) => ({
      id: String(entry.id || getAnnotationId()),
      x: Number(entry.x),
      y: Number(entry.y),
      text: String(entry.text || ''),
      user_email: String(entry.user_email || 'Unknown'),
      created_at: String(entry.created_at || entry.createdAt || new Date().toISOString()),
    }))
    .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y) && item.text.trim().length > 0);
}

function getContainLayout(container: ImageSize | null, image: ImageSize | null): ImageLayout | null {
  if (!container || !image || !container.width || !container.height || !image.width || !image.height) return null;
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    left: (container.width - width) / 2,
    top: (container.height - height) / 2,
    width,
    height,
  };
}

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
  const [editingLightboxName, setEditingLightboxName] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [lightboxPanel, setLightboxPanel] = useState<'comments' | 'annotations'>('comments');
  const [showRef, setShowRef] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [comments, setComments] = useState<ScreenshotComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [annotations, setAnnotations] = useState<LightboxAnnotation[]>([]);
  const [annotationMetadata, setAnnotationMetadata] = useState<Record<string, unknown>>(screenshot.metadata || {});
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationDraftText, setAnnotationDraftText] = useState('');
  const [annotationDraft, setAnnotationDraft] = useState<{ x: number; y: number } | null>(null);
  const [annotationError, setAnnotationError] = useState('');
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [mediaSize, setMediaSize] = useState<ImageSize | null>(null);
  const [versions, setVersions] = useState<ScreenshotVersion[]>([]);
  const [name, setName] = useState(screenshot.name);
  const [group, setGroup] = useState(screenshot.group || '');
  const nameRef = useRef<HTMLInputElement>(null);
  const lightboxNameRef = useRef<HTMLInputElement>(null);
  const annotationInputRef = useRef<HTMLInputElement>(null);
  const groupRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setName(screenshot.name); }, [screenshot.name]);
  useEffect(() => { setGroup(screenshot.group || ''); }, [screenshot.group]);
  useEffect(() => {
    setAnnotations(parseAnnotations(screenshot.metadata));
    setAnnotationMetadata(screenshot.metadata || {});
    setSelectedAnnotationId(null);
    setAnnotationDraft(null);
    setAnnotationDraftText('');
    setAnnotationMode(false);
    setAnnotationError('');
    setImageSize(null);
    setMediaSize(null);
    setLightboxPanel('comments');
  }, [screenshot.id]);

  useEffect(() => {
    if (editingName && nameRef.current) { nameRef.current.focus(); nameRef.current.select(); }
  }, [editingName]);

  useEffect(() => {
    if (editingLightboxName && lightboxNameRef.current) {
      lightboxNameRef.current.focus();
      lightboxNameRef.current.select();
    }
  }, [editingLightboxName]);

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
    let cancelled = false;
    setLoadingComments(true);
    supabase
      .from('screenshot_comments')
      .select('*')
      .eq('screenshot_id', screenshot.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        if (data) setComments(data);
        setLoadingComments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showLightbox, screenshot.id]);

  useEffect(() => {
    if (!showLightbox || !mediaRef.current) return;
    const update = () => {
      if (!mediaRef.current) return;
      setMediaSize({ width: mediaRef.current.clientWidth, height: mediaRef.current.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(mediaRef.current);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [showLightbox, screenshot.id]);

  useEffect(() => {
    if (annotationDraft) {
      annotationInputRef.current?.focus();
      annotationInputRef.current?.select();
    }
  }, [annotationDraft]);

  const mediaLayout = useMemo(() => getContainLayout(mediaSize, imageSize), [mediaSize, imageSize]);

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

  async function saveAnnotations(nextAnnotations: LightboxAnnotation[]) {
    const nextMetadata = { ...annotationMetadata, [ANNOTATION_METADATA_KEY]: JSON.stringify(nextAnnotations) };
    setAnnotations(nextAnnotations);
    setAnnotationMetadata(nextMetadata);
    setAnnotationError('');
    const { error } = await supabase.from('screenshots').update({ metadata: nextMetadata }).eq('id', screenshot.id);
    if (error) {
      setAnnotationMetadata(annotationMetadata);
      setAnnotations(annotations);
      setAnnotationError('Could not save annotations right now.');
      return false;
    }
    return true;
  }

  function handleMediaClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!annotationMode || !mediaLayout) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left - mediaLayout.left;
    const relativeY = event.clientY - rect.top - mediaLayout.top;
    if (relativeX < 0 || relativeY < 0 || relativeX > mediaLayout.width || relativeY > mediaLayout.height) return;
    setAnnotationDraft({
      x: (relativeX / mediaLayout.width) * 100,
      y: (relativeY / mediaLayout.height) * 100,
    });
    setLightboxPanel('annotations');
    setAnnotationError('');
  }

  async function addAnnotation() {
    const trimmed = annotationDraftText.trim();
    if (!annotationDraft || !trimmed) return;
    const item: LightboxAnnotation = {
      id: getAnnotationId(),
      x: annotationDraft.x,
      y: annotationDraft.y,
      text: trimmed,
      user_email: userEmail,
      created_at: new Date().toISOString(),
    };
    const nextAnnotations = [...annotations, item];
    const saved = await saveAnnotations(nextAnnotations);
    if (!saved) return;
    setSelectedAnnotationId(item.id);
    setAnnotationDraft(null);
    setAnnotationDraftText('');
  }

  async function deleteAnnotation(annotationId: string) {
    const nextAnnotations = annotations.filter((item) => item.id !== annotationId);
    const saved = await saveAnnotations(nextAnnotations);
    if (!saved) return;
    if (selectedAnnotationId === annotationId) setSelectedAnnotationId(null);
  }

  function selectAnnotation(annotationId: string) {
    setSelectedAnnotationId(annotationId);
    setLightboxPanel('annotations');
  }

  function toggleAnnotationMode() {
    setAnnotationError('');
    setAnnotationMode((current) => {
      const next = !current;
      if (!next) {
        setAnnotationDraft(null);
        setAnnotationDraftText('');
      }
      return next;
    });
  }

  function commitName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== screenshot.name) {
      onRename(screenshot.id, trimmed);
    } else {
      setName(screenshot.name);
    }
    setEditingName(false);
    setEditingLightboxName(false);
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

  function openCardNameEditor() {
    setEditingLightboxName(false);
    setEditingName(true);
  }

  function openLightboxNameEditor() {
    setName(screenshot.name);
    setEditingName(false);
    setEditingLightboxName(true);
  }

  function closeLightbox() {
    setShowLightbox(false);
    setEditingLightboxName(false);
    setAnnotationMode(false);
    setAnnotationDraft(null);
    setAnnotationDraftText('');
  }

  return (
    <div className={`catalogue-card ${isSelected ? 'catalogue-card--selected' : ''}`}>
      <div className="catalogue-card-image" onClick={() => setShowLightbox(true)} style={{ cursor: 'pointer' }}>
        {screenshot.image_url ? <img src={screenshot.image_url} alt={screenshot.name} draggable={false} /> : <div className="catalogue-card-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg></div>}
        <button className={`catalogue-card-select ${isSelected ? 'catalogue-card-select--checked' : ''}`} onClick={(e) => { e.stopPropagation(); onToggleSelect(screenshot.id); }} title="Select">{isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}</button>
        {(isPrimary || isVs) && <span className={`catalogue-card-badge ${isPrimary ? 'catalogue-card-badge-primary' : 'catalogue-card-badge-vs'}`}>{isPrimary ? 'Primary' : 'Vs'}</span>}
        <div className="catalogue-card-indicators">
          {screenshot.reference_url && <button className="catalogue-card-ref-btn" title={screenshot.reference_label ? `Ref: ${screenshot.reference_label}` : 'View reference'} onClick={(e) => { e.stopPropagation(); setShowRef(!showRef); }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>Ref</button>}
          {(screenshot.version_count ?? 0) > 0 && <button className="catalogue-card-version-btn" title="View version history" onClick={(e) => { e.stopPropagation(); setShowVersions(!showVersions); }}>v{(screenshot.version_count ?? 0) + 1}</button>}
          {(screenshot.comment_count ?? 0) > 0 && <span className="catalogue-card-comment-btn"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>{screenshot.comment_count}</span>}
        </div>
        <div className="catalogue-card-actions">
          <button className="catalogue-card-action" title="Replace image" onClick={() => fileRef.current?.click()}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg></button>
          <button className="catalogue-card-action catalogue-card-action-danger" title="Delete screenshot" onClick={() => setShowDeleteConfirm(true)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
      </div>

      <div className="catalogue-card-info">
        <div className="catalogue-card-name">
          {editingName ? <input ref={nameRef} className="catalogue-card-edit" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setName(screenshot.name); setEditingName(false); } }} /> : <span className="catalogue-card-label" onDoubleClick={openCardNameEditor} title="Double-click to rename">{screenshot.name}</span>}
        </div>
        <div className="catalogue-card-meta">
          <div className="catalogue-card-group">
            <span className="catalogue-card-dot" style={{ background: groupColor }} />
            {editingGroup ? <input ref={groupRef} className="catalogue-card-edit catalogue-card-edit-sm" value={group} onChange={(e) => setGroup(e.target.value)} onBlur={commitGroup} onKeyDown={(e) => { if (e.key === 'Enter') commitGroup(); if (e.key === 'Escape') { setGroup(screenshot.group || ''); setEditingGroup(false); } }} placeholder="Add group..." /> : <span className="catalogue-card-group-text" onDoubleClick={() => setEditingGroup(true)} title="Double-click to edit group">{screenshot.group || 'No group'}</span>}
          </div>
          <button className="catalogue-card-flow-pill" onClick={() => onAssignFlow(screenshot.id)} title="Assign to flow">{flowName || 'Unassigned'}</button>
        </div>
        <div className="catalogue-card-platform-row">
          <Dropdown className="catalogue-card-platform-dropdown" value={screenshot.platform || null} placeholder="No platform" options={[{ value: 'mobile', label: 'Mobile' }, { value: 'web', label: 'Web' }]} onChange={(v) => onPlatformChange(screenshot.id, (v || null) as 'mobile' | 'web' | null)} />
          <span className="catalogue-card-project">{projectName}</span>
        </div>
      </div>

      {showRef && screenshot.reference_url && <div className="catalogue-card-ref-popover"><div className="catalogue-card-ref-popover-header"><span>{screenshot.reference_label || 'Reference'}</span><button onClick={() => setShowRef(false)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button></div><img src={screenshot.reference_url} alt={screenshot.reference_label || 'Reference'} /></div>}

      {showVersions && <div className="catalogue-card-versions"><div className="catalogue-card-versions-header"><span>Version History</span><button onClick={() => setShowVersions(false)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button></div><div className="catalogue-card-versions-current"><img src={screenshot.image_url} alt="Current" /><span>Current</span></div>{versions.map((v) => <div key={v.id} className="catalogue-card-versions-item"><img src={v.image_url} alt={`v${v.version_number}`} /><span>v{v.version_number} · {new Date(v.created_at || '').toLocaleDateString()}</span></div>)}{versions.length === 0 && <p className="catalogue-card-versions-empty">Loading...</p>}</div>}

      {showDeleteConfirm && createPortal(<ConfirmModal title="Delete Screenshot" message={`Delete "${screenshot.name}"? This will also remove it from any flow.`} onConfirm={() => { setShowDeleteConfirm(false); onDelete(screenshot.id); }} onCancel={() => setShowDeleteConfirm(false)} />, document.body)}

      {showLightbox && screenshot.image_url && createPortal(
        <div className="catalogue-lightbox" onClick={closeLightbox}>
          <div className="catalogue-lightbox-header" onClick={(event) => event.stopPropagation()}>
            <div className="catalogue-lightbox-name-wrap">
              {editingLightboxName ? <input ref={lightboxNameRef} className="catalogue-lightbox-name-input" value={name} onChange={(event) => setName(event.target.value)} onBlur={commitName} onKeyDown={(event) => { if (event.key === 'Enter') commitName(); if (event.key === 'Escape') { setName(screenshot.name); setEditingLightboxName(false); } }} /> : <><span className="catalogue-lightbox-name">{screenshot.name}</span><button type="button" className="catalogue-lightbox-name-edit" title="Edit screenshot name" onClick={openLightboxNameEditor}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button></>}
            </div>
            {screenshot.group && <span className="catalogue-lightbox-group" style={{ borderColor: groupColor, color: groupColor }}>{screenshot.group}</span>}
            {screenshot.platform && <span className="catalogue-lightbox-tag">{screenshot.platform}</span>}
            {screenshot.theme && <span className="catalogue-lightbox-tag">{screenshot.theme}</span>}
            <button className="catalogue-lightbox-close" onClick={closeLightbox}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
          </div>
          <div className="catalogue-lightbox-body" onClick={(e) => e.stopPropagation()}>
            <div className="catalogue-lightbox-media" ref={mediaRef} onClick={handleMediaClick} style={{ cursor: annotationMode ? 'crosshair' : 'default' }}>
              <img src={screenshot.image_url} alt={screenshot.name} className="catalogue-lightbox-img" onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} draggable={false} />
              {mediaLayout && <div className="catalogue-lightbox-pin-layer" aria-hidden="true">{annotations.map((annotation, index) => <button key={annotation.id} type="button" className={`catalogue-lightbox-pin ${selectedAnnotationId === annotation.id ? 'is-active' : ''}`} style={{ left: `${mediaLayout.left + (annotation.x / 100) * mediaLayout.width}px`, top: `${mediaLayout.top + (annotation.y / 100) * mediaLayout.height}px` }} onClick={(event) => { event.stopPropagation(); selectAnnotation(annotation.id); }} title={annotation.text}><span>{index + 1}</span></button>)}{annotationDraft && <button type="button" className="catalogue-lightbox-pin catalogue-lightbox-pin-draft is-active" style={{ left: `${mediaLayout.left + (annotationDraft.x / 100) * mediaLayout.width}px`, top: `${mediaLayout.top + (annotationDraft.y / 100) * mediaLayout.height}px` }} title="Draft annotation"><span>+</span></button>}</div>}
              {annotationMode && <div className="catalogue-lightbox-media-hint">Click the image to place a pin</div>}
            </div>
            <div className="catalogue-lightbox-comments">
              <div className="catalogue-lightbox-panel-tabs" role="tablist" aria-label="Lightbox details"><button type="button" role="tab" aria-selected={lightboxPanel === 'comments'} className={`catalogue-lightbox-tab ${lightboxPanel === 'comments' ? 'is-active' : ''}`} onClick={() => setLightboxPanel('comments')}>Comments ({comments.length})</button><button type="button" role="tab" aria-selected={lightboxPanel === 'annotations'} className={`catalogue-lightbox-tab ${lightboxPanel === 'annotations' ? 'is-active' : ''}`} onClick={() => setLightboxPanel('annotations')}>Annotations ({annotations.length})</button></div>
              {lightboxPanel === 'comments' ? <>
                <div className="catalogue-lightbox-comments-list">{loadingComments ? <div className="catalogue-lightbox-comments-empty"><div className="loading-spinner" /></div> : comments.length === 0 ? <p className="catalogue-lightbox-comments-empty">No comments yet</p> : comments.map((c) => <div key={c.id} className="catalogue-lightbox-comment"><div className="catalogue-lightbox-comment-top"><span className="catalogue-lightbox-comment-email">{c.user_email}</span><span className="catalogue-lightbox-comment-time">{formatDateTime(c.created_at)}</span>{c.user_email === userEmail && <button className="catalogue-lightbox-comment-delete" onClick={() => deleteComment(c.id)} title="Delete comment"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>}</div><p className="catalogue-lightbox-comment-text">{c.text}</p></div>)}</div>
                <div className="catalogue-lightbox-comment-input"><input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} placeholder="Add a comment..." /><button onClick={addComment} disabled={!newComment.trim()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></button></div>
              </> : <>
                <div className="catalogue-lightbox-annotation-toolbar"><button type="button" className={`catalogue-lightbox-annotation-toggle ${annotationMode ? 'is-active' : ''}`} onClick={toggleAnnotationMode}>{annotationMode ? 'Placement mode on' : 'Add pin'}</button><span className="catalogue-lightbox-annotation-toolbar-copy">{annotationMode ? 'Click the image, then add a note.' : 'Select a pin to inspect it.'}</span></div>
                {annotationError && <p className="catalogue-lightbox-annotation-error">{annotationError}</p>}
                {annotationDraft && <div className="catalogue-lightbox-annotation-composer"><div className="catalogue-lightbox-annotation-composer-label">New pin at {annotationDraft.x.toFixed(1)}%, {annotationDraft.y.toFixed(1)}%</div><input ref={annotationInputRef} type="text" value={annotationDraftText} onChange={(event) => setAnnotationDraftText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addAnnotation(); if (event.key === 'Escape') { setAnnotationDraft(null); setAnnotationDraftText(''); } }} placeholder="Write annotation text..." /><div className="catalogue-lightbox-annotation-composer-actions"><button type="button" className="catalogue-lightbox-annotation-save" onClick={() => void addAnnotation()} disabled={!annotationDraftText.trim()}>Save pin</button><button type="button" className="catalogue-lightbox-annotation-cancel" onClick={() => { setAnnotationDraft(null); setAnnotationDraftText(''); }}>Cancel</button></div></div>}
                <div className="catalogue-lightbox-annotation-list">{annotations.length === 0 ? <p className="catalogue-lightbox-comments-empty">No annotations yet</p> : annotations.map((annotation, index) => <div key={annotation.id} role="button" tabIndex={0} className={`catalogue-lightbox-annotation-item ${selectedAnnotationId === annotation.id ? 'is-active' : ''}`} onClick={() => selectAnnotation(annotation.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectAnnotation(annotation.id); } }}><div className="catalogue-lightbox-annotation-item-top"><span className="catalogue-lightbox-annotation-badge">{index + 1}</span><span className="catalogue-lightbox-annotation-time">{formatDateTime(annotation.created_at)}</span>{annotation.user_email === userEmail && <button type="button" className="catalogue-lightbox-annotation-delete" title="Delete annotation" onClick={(event) => { event.stopPropagation(); void deleteAnnotation(annotation.id); }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>}</div><p className="catalogue-lightbox-annotation-text">{annotation.text}</p><span className="catalogue-lightbox-annotation-coords">{annotation.x.toFixed(1)}%, {annotation.y.toFixed(1)}%</span></div>)}</div>
              </>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
